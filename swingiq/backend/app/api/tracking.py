"""
SwingIQ — Ball Tracking API Router
====================================
Endpoints:

  POST /api/v1/track/analyse
    Upload a short video clip of a shot.
    Returns launch metrics + track path for overlay rendering.

  POST /api/v1/track/shot
    Save a single shot result (called after analyse, to persist to history).

  GET  /api/v1/track/shots
    Returns the user's shot history (last 100), optionally filtered by type.

  GET  /api/v1/track/dispersion
    Returns dispersion statistics + all landing points for the map.
"""

import time
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, status, Depends
from pydantic import BaseModel
from typing import Optional

from app.services.video_tracking import VideoTrackingService
from app.services.trajectory_analysis import ShotType
from app.services.dispersion_store import save_shot, get_shots, get_dispersion_stats

# Import auth dependency — same one used by the analysis router
try:
    from app.api.auth_middleware import get_current_user
    AUTH_AVAILABLE = True
except ImportError:
    AUTH_AVAILABLE = False
    async def get_current_user():
        return {"id": "anonymous"}

router = APIRouter()

# Lazy singleton
_tracking_service: Optional[VideoTrackingService] = None

def get_tracking_service() -> VideoTrackingService:
    global _tracking_service
    if _tracking_service is None:
        _tracking_service = VideoTrackingService()
    return _tracking_service


# ── Response models ───────────────────────────────────────────────────────────

class TrackPoint(BaseModel):
    x: float   # normalised 0–1
    y: float
    frame_idx: int
    timestamp_ms: float

class LaunchMetricsResponse(BaseModel):
    shot_type:         str
    launch_angle_deg:  float
    direction_deg:     float
    ball_speed_mph:    float
    carry_distance_yd: float
    max_height_rel:    float
    apex_frame:        int
    total_frames:      int
    confidence:        float

class AnalyseResponse(BaseModel):
    shot_id:       str
    metrics:       LaunchMetricsResponse
    track_points:  list[TrackPoint]
    frame_width:   int
    frame_height:  int
    processing_time_sec: float


# ── POST /track/analyse ───────────────────────────────────────────────────────

@router.post(
    "/analyse",
    response_model=AnalyseResponse,
    summary="Analyse a golf shot video for ball tracking metrics",
)
async def analyse_shot(
    video: UploadFile = File(..., description="Short video clip (MP4/MOV, ≤15 seconds)"),
    user  = Depends(get_current_user),
):
    t0 = time.time()

    # Validate
    allowed_types = {"video/mp4", "video/quicktime", "video/x-msvideo", "video/avi"}
    if video.content_type not in allowed_types:
        raise HTTPException(415, f"Unsupported video type: {video.content_type}")

    video_bytes = await video.read()
    if len(video_bytes) > 50 * 1024 * 1024:
        raise HTTPException(413, "Video exceeds 50 MB limit for tracking. Trim to ≤15 seconds.")

    # Run tracking pipeline
    try:
        svc    = get_tracking_service()
        result = svc.analyse(video_bytes)
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    except Exception as exc:
        raise HTTPException(500, f"Tracking failed: {exc}")

    m = result.metrics

    # Auto-save the shot to the dispersion store
    shot_id = save_shot(
        user_id      = user["id"],
        shot_type    = m.shot_type.value,
        lateral_yd   = result.landing.lateral_yd,
        carry_yd     = result.landing.carry_yd,
        speed_mph    = m.ball_speed_mph,
        angle_deg    = m.launch_angle_deg,
        direction_deg= m.direction_deg,
    )

    # Downsample track points for the response (max 60 points)
    track = result.track_points
    if len(track) > 60:
        step  = len(track) // 60
        track = track[::step]

    return AnalyseResponse(
        shot_id = shot_id,
        metrics = LaunchMetricsResponse(
            shot_type         = m.shot_type.value,
            launch_angle_deg  = m.launch_angle_deg,
            direction_deg     = m.direction_deg,
            ball_speed_mph    = m.ball_speed_mph,
            carry_distance_yd = m.carry_distance_yd,
            max_height_rel    = m.max_height_rel,
            apex_frame        = m.apex_frame,
            total_frames      = m.total_frames,
            confidence        = m.confidence,
        ),
        track_points = [
            TrackPoint(x=p.x, y=p.y, frame_idx=p.frame_idx, timestamp_ms=p.timestamp_ms)
            for p in track
        ],
        frame_width  = result.raw_pixels_w,
        frame_height = result.raw_pixels_h,
        processing_time_sec = round(time.time() - t0, 2),
    )


# ── GET /track/shots ──────────────────────────────────────────────────────────

@router.get("/shots", summary="Get shot history for the current user")
async def list_shots(
    shot_type: Optional[str] = None,
    limit: int = 100,
    user = Depends(get_current_user),
):
    shots = get_shots(user["id"], shot_type=shot_type, limit=limit)
    return {"shots": shots, "count": len(shots)}


# ── GET /track/dispersion ─────────────────────────────────────────────────────

@router.get("/dispersion", summary="Get dispersion stats and all landing points")
async def get_dispersion(
    shot_type: Optional[str] = None,
    user = Depends(get_current_user),
):
    shots  = get_shots(user["id"], shot_type=shot_type, limit=200)
    stats  = get_dispersion_stats(user["id"], shot_type=shot_type)

    landing_points = [
        {"lateral_yd": s["lateral_yd"], "carry_yd": s["carry_yd"], "shot_type": s["shot_type"]}
        for s in shots
    ]

    return {
        "stats":          stats,
        "landing_points": landing_points,
    }
