"""
SwingIQ — Updated Analysis Router (with Auth)
==============================================
Drop-in replacement for app/api/analysis.py in the backend.

Changes from the original:
  1.  All endpoints now require a valid Supabase JWT (Depends(get_current_user))
  2.  Sessions are saved to Supabase instead of local JSON files
  3.  GET /sessions returns only the authenticated user's sessions
  4.  session_id is the Supabase row UUID, not a random local UUID

HOW TO APPLY
------------
Copy auth_middleware.py into your swingiq-backend/app/api/ folder,
then replace app/api/analysis.py with this file.

Also add to swingiq-backend/.env:
    SUPABASE_URL=https://xxxx.supabase.co
    SUPABASE_SERVICE_ROLE_KEY=eyJ...
"""

import time
import os
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, status, Depends, Request
import httpx

from app.models.analysis import AnalysisResponse, SwingMetrics
from app.services.pose_analysis import PoseAnalysisService
from app.services.ai_coaching import AICoachingService
from app.api.auth_middleware import get_current_user, get_optional_user

router = APIRouter()

SUPABASE_URL              = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

# ── Supabase DB helpers ───────────────────────────────────────────────────────

async def _insert_session(user_id: str, response: AnalysisResponse) -> str:
    """Inserts a swing session row into Supabase and returns the new row ID."""
    url = f"{SUPABASE_URL}/rest/v1/swing_sessions"
    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    payload = {
        "user_id":               user_id,
        "club_used":             response.club_used,
        "overall_score":         response.overall_score,
        "summary":               response.summary,
        "next_session_focus":    response.next_session_focus,
        "feedback":              [f.model_dump() for f in response.feedback],
        "club_path_degrees":     response.metrics.club_path_degrees,
        "face_angle_degrees":    response.metrics.face_angle_degrees,
        "spine_angle_address":   response.metrics.spine_angle_address,
        "spine_angle_impact":    response.metrics.spine_angle_impact,
        "hip_turn_degrees":      response.metrics.hip_turn_degrees,
        "shoulder_turn_degrees": response.metrics.shoulder_turn_degrees,
        "tempo_ratio":           response.metrics.tempo_ratio,
        "weight_transfer_pct":   response.metrics.weight_transfer_pct,
        "swing_plane_deviation": response.metrics.swing_plane_deviation,
        "frames_analyzed":       response.metrics.total_frames_analyzed,
        "processing_time_sec":   response.processing_time_seconds,
    }
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.post(url, json=payload, headers=headers)
        if not res.is_success:
            raise HTTPException(500, f"Failed to save session: {res.text}")
        rows = res.json()
        return rows[0]["id"]


async def _fetch_sessions(user_id: str, limit: int = 20):
    """Fetches a user's sessions from Supabase ordered by date."""
    url = (
        f"{SUPABASE_URL}/rest/v1/swing_sessions"
        f"?user_id=eq.{user_id}&order=recorded_at.desc&limit={limit}"
        f"&select=id,club_used,overall_score,recorded_at"
    )
    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
    }
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(url, headers=headers)
        return res.json() if res.is_success else []


# ── Lazy service singletons ───────────────────────────────────────────────────

_pose_service: PoseAnalysisService | None = None
_coach_service: AICoachingService  | None = None

def get_pose_service():
    global _pose_service
    if _pose_service is None: _pose_service = PoseAnalysisService()
    return _pose_service

def get_coach_service():
    global _coach_service
    if _coach_service is None: _coach_service = AICoachingService()
    return _coach_service


# ── POST /analyze ─────────────────────────────────────────────────────────────

@router.post(
    "/analyze",
    response_model=AnalysisResponse,
    summary="Analyse a golf swing (authenticated)",
)
async def analyze_swing(
    video:        UploadFile = File(...),
    player_name:  str  = Form(...),
    skill_level:  str  = Form(...),
    club_used:    str  = Form(...),
    known_issues: str  = Form(default=""),
    user: dict = Depends(get_current_user),   # ← requires valid Supabase JWT
):
    t_start  = time.time()
    user_id  = user["id"]

    # Validate file type
    allowed = {"video/mp4","video/quicktime","video/x-msvideo","video/avi"}
    if video.content_type not in allowed:
        raise HTTPException(415, f"Unsupported file type: {video.content_type}")

    video_bytes = await video.read()
    if len(video_bytes) > 100 * 1024 * 1024:
        raise HTTPException(413, "Video exceeds 100 MB limit")

    issues_list = [i.strip() for i in known_issues.split(",") if i.strip()] or None

    # Pose analysis
    try:
        raw_metrics = get_pose_service().analyze(video_bytes)
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    except Exception as exc:
        raise HTTPException(500, f"Pose analysis failed: {exc}")

    # AI coaching
    try:
        coaching = get_coach_service().generate_feedback(
            metrics=raw_metrics, skill_level=skill_level,
            club=club_used, known_issues=issues_list,
        )
    except Exception as exc:
        raise HTTPException(500, f"AI coaching failed: {exc}")

    response = AnalysisResponse(
        session_id="pending",   # will be replaced with Supabase row ID
        player_name=player_name,
        club_used=club_used,
        overall_score=coaching["overall_score"],
        metrics=SwingMetrics(**raw_metrics),
        feedback=coaching["feedback"],
        summary=coaching["summary"],
        next_session_focus=coaching["next_session_focus"],
        processing_time_seconds=round(time.time() - t_start, 2),
    )

    # Save to Supabase
    if SUPABASE_URL:
        try:
            row_id = await _insert_session(user_id, response)
            response.session_id = row_id
        except Exception as exc:
            # Don't fail the request over a DB write error — return the analysis
            print(f"Warning: failed to save session to Supabase: {exc}")
            response.session_id = "local-unsaved"

    return response


# ── GET /sessions ─────────────────────────────────────────────────────────────

@router.get("/sessions", summary="List authenticated user's sessions")
async def list_sessions(
    limit: int = 20,
    user: dict = Depends(get_current_user),
):
    sessions = await _fetch_sessions(user["id"], limit)
    return {"sessions": sessions, "total": len(sessions)}


# ── GET /health (no auth required) ───────────────────────────────────────────

@router.get("/health-check")
async def health_check():
    return {"status": "ok"}
