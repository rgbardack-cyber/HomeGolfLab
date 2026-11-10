"""
SwingIQ — Space Mapping API Router
=====================================
Endpoints:

  POST /api/v1/space/scan
    Upload a pan-around room video.
    Returns RoomAnalysis: dimensions, zones, obstacle map.

  POST /api/v1/space/equipment
    Upload a photo of your practice gear.
    Returns EquipmentList: detected items + enabled drills.

  POST /api/v1/space/plan
    Send room + equipment JSON + player profile.
    Returns a Claude-generated DailyPlan.

  GET  /api/v1/space/plan/today
    Returns the cached plan for today (avoids re-generating on every app open).

  GET  /api/v1/space/setup/{user_id}
    Returns saved room + equipment config for a user.
"""

import json
import time
from datetime import date
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, status, Depends
from pydantic import BaseModel

from app.services.room_analysis import RoomAnalysisService, RoomAnalysis, Zone
from app.services.equipment_detection import EquipmentDetectionService, EquipmentList
from app.services.daily_plan import DailyPlanGenerator, DailyPlan, DrillBlock

try:
    from app.api.auth_middleware import get_current_user
except ImportError:
    async def get_current_user():
        return {"id": "anonymous"}

router   = APIRouter()
PLAN_DIR = Path("/tmp/swingiq_plans")
PLAN_DIR.mkdir(exist_ok=True)

# ── Lazy singletons ───────────────────────────────────────────────────────────

_room_svc: Optional[RoomAnalysisService]       = None
_equip_svc: Optional[EquipmentDetectionService] = None
_plan_gen: Optional[DailyPlanGenerator]         = None

def get_room_svc():
    global _room_svc
    if not _room_svc: _room_svc = RoomAnalysisService()
    return _room_svc

def get_equip_svc():
    global _equip_svc
    if not _equip_svc: _equip_svc = EquipmentDetectionService()
    return _equip_svc

def get_plan_gen():
    global _plan_gen
    if not _plan_gen: _plan_gen = DailyPlanGenerator()
    return _plan_gen


# ── Pydantic response models ──────────────────────────────────────────────────

class ZoneResponse(BaseModel):
    zone_type: str; label: str
    x_norm: float;  y_norm: float
    width_norm: float; height_norm: float
    width_ft: float;   height_ft: float
    clearance_ft: float; feasibility: str

class ScanResponse(BaseModel):
    estimated_width_ft:  float
    estimated_length_ft: float
    estimated_height_ft: float
    usable_area_sqft:    float
    has_net:  bool; has_mat: bool
    floor_type:    str
    zones:         list[ZoneResponse]
    obstacle_regions: list[dict]
    scan_notes:    list[str]
    frames_analysed: int
    confidence:    float
    processing_time_sec: float

class EquipmentItemResponse(BaseModel):
    name: str; confidence: float
    x_norm: float; y_norm: float; method: str

class EquipmentResponse(BaseModel):
    has_net: bool; has_mat: bool; has_putter: bool
    has_irons: bool; has_driver: bool
    has_alignment_sticks: bool; has_putting_cup: bool
    has_foam_balls: bool; has_tees: bool; has_chairs: bool
    items: list[EquipmentItemResponse]
    enabled_drills: list[str]
    method_used: str

class DrillResponse(BaseModel):
    order: int; name: str; description: str
    duration_min: int; reps_or_target: str
    equipment: list[str]; coaching_cue: str
    difficulty: int; zone_type: str
    is_warm_up: bool; is_cool_down: bool

class PlanResponse(BaseModel):
    plan_date: str; total_minutes: int
    theme: str; intro: str
    drills: list[DrillResponse]
    equipment_needed: list[str]
    space_note: str; generated_by: str
    processing_time_sec: float

class PlanRequest(BaseModel):
    room:            dict   # Serialised RoomAnalysis
    equipment:       dict   # Serialised EquipmentList
    skill_level:     str  = 'intermediate'
    handicap:        Optional[float] = None
    recent_feedback: list[str] = []


# ── POST /scan ────────────────────────────────────────────────────────────────

@router.post("/scan", response_model=ScanResponse,
             summary="Analyse a room scan video")
async def scan_room(
    video: UploadFile = File(..., description="Pan-around room video (MP4/MOV, ≤30s)"),
    user  = Depends(get_current_user),
):
    t0 = time.time()
    allowed = {"video/mp4","video/quicktime","video/x-msvideo","video/avi"}
    if video.content_type not in allowed:
        raise HTTPException(415, f"Unsupported type: {video.content_type}")

    video_bytes = await video.read()
    if len(video_bytes) > 200 * 1024 * 1024:
        raise HTTPException(413, "Video exceeds 200 MB")

    try:
        result = get_room_svc().analyse(video_bytes)
    except ValueError as e:
        raise HTTPException(422, str(e))
    except Exception as e:
        raise HTTPException(500, f"Room scan failed: {e}")

    # Cache the room data for this user
    _save_user_data(user["id"], "room", _room_to_dict(result))

    return ScanResponse(
        **{k: v for k, v in _room_to_dict(result).items()
           if k not in ('has_obstacles','obstacle_count','scan_frame_w','scan_frame_h')},
        processing_time_sec=round(time.time()-t0, 2),
    )


# ── POST /equipment ───────────────────────────────────────────────────────────

@router.post("/equipment", response_model=EquipmentResponse,
             summary="Detect equipment from a photo")
async def detect_equipment(
    photo: UploadFile = File(..., description="Photo of your practice setup"),
    user  = Depends(get_current_user),
):
    allowed_img = {"image/jpeg","image/png","image/heic","image/webp"}
    if photo.content_type not in allowed_img:
        pass  # Allow through — OpenCV will fail gracefully if format is unsupported

    image_bytes = await photo.read()
    if len(image_bytes) > 20 * 1024 * 1024:
        raise HTTPException(413, "Image exceeds 20 MB")

    try:
        result = get_equip_svc().detect(image_bytes)
    except ValueError as e:
        raise HTTPException(422, str(e))
    except Exception as e:
        raise HTTPException(500, f"Equipment detection failed: {e}")

    _save_user_data(user["id"], "equipment", _equip_to_dict(result))

    return EquipmentResponse(
        has_net=result.has_net, has_mat=result.has_mat,
        has_putter=result.has_putter, has_irons=result.has_irons,
        has_driver=result.has_driver,
        has_alignment_sticks=result.has_alignment_sticks,
        has_putting_cup=result.has_putting_cup,
        has_foam_balls=result.has_foam_balls,
        has_tees=result.has_tees, has_chairs=result.has_chairs,
        items=[EquipmentItemResponse(**vars(i)) for i in result.items],
        enabled_drills=result.enabled_drills,
        method_used=result.method_used,
    )


# ── POST /plan ────────────────────────────────────────────────────────────────

@router.post("/plan", response_model=PlanResponse,
             summary="Generate a Claude-powered daily practice plan")
async def generate_plan(
    req:  PlanRequest,
    user = Depends(get_current_user),
):
    t0 = time.time()

    # Reconstruct objects from dicts
    room  = _dict_to_room(req.room)
    equip = _dict_to_equip(req.equipment)

    try:
        gen  = get_plan_gen()
        plan = gen.generate(
            room=room, equipment=equip,
            skill_level=req.skill_level,
            handicap=req.handicap,
            recent_feedback=req.recent_feedback,
        )
    except Exception as e:
        # Fall back to hardcoded plan rather than failing
        print(f"[Plan] Claude generation failed: {e}. Using fallback.")
        gen  = DailyPlanGenerator.__new__(DailyPlanGenerator)
        plan = gen.generate_fallback(room, equip, req.skill_level)

    # Cache plan for today
    _save_user_data(user["id"], f"plan_{date.today().isoformat()}", _plan_to_dict(plan))

    return PlanResponse(
        **_plan_to_dict(plan),
        processing_time_sec=round(time.time()-t0, 2),
    )


# ── GET /plan/today ───────────────────────────────────────────────────────────

@router.get("/plan/today", response_model=PlanResponse,
            summary="Get today's cached plan (avoids re-generating)")
async def get_today_plan(user = Depends(get_current_user)):
    key  = f"plan_{date.today().isoformat()}"
    data = _load_user_data(user["id"], key)
    if not data:
        raise HTTPException(404, "No plan generated for today yet. Call POST /plan first.")
    return PlanResponse(**data, processing_time_sec=0)


# ── GET /setup ────────────────────────────────────────────────────────────────

@router.get("/setup", summary="Get saved room + equipment config")
async def get_setup(user = Depends(get_current_user)):
    room  = _load_user_data(user["id"], "room")
    equip = _load_user_data(user["id"], "equipment")
    return {
        "has_room_scan":  room  is not None,
        "has_equipment":  equip is not None,
        "room":           room,
        "equipment":      equip,
    }


# ── Storage helpers ───────────────────────────────────────────────────────────

def _save_user_data(uid: str, key: str, data: dict):
    path = PLAN_DIR / f"{uid}_{key}.json"
    with open(path, "w") as f:
        json.dump(data, f)

def _load_user_data(uid: str, key: str) -> Optional[dict]:
    path = PLAN_DIR / f"{uid}_{key}.json"
    if not path.exists(): return None
    with open(path) as f: return json.load(f)


# ── Serialisation helpers ─────────────────────────────────────────────────────

def _room_to_dict(r: RoomAnalysis) -> dict:
    d = vars(r).copy()
    d['zones'] = [vars(z) for z in r.zones]
    return d

def _dict_to_room(d: dict) -> RoomAnalysis:
    from app.services.room_analysis import Zone
    zones = [Zone(**z) for z in d.pop('zones', [])]
    r = RoomAnalysis(**{k: v for k, v in d.items() if k != 'zones'})  # type: ignore
    r.zones = zones
    return r

def _equip_to_dict(e: EquipmentList) -> dict:
    d = vars(e).copy()
    d['items'] = [vars(i) for i in e.items]
    return d

def _dict_to_equip(d: dict) -> EquipmentList:
    from app.services.equipment_detection import DetectedItem
    items = [DetectedItem(**i) for i in d.pop('items', [])]
    e = EquipmentList(**{k: v for k, v in d.items() if k != 'items'})  # type: ignore
    e.items = items
    return e

def _plan_to_dict(p: DailyPlan) -> dict:
    d = vars(p).copy()
    d['drills'] = [vars(dr) for dr in p.drills]
    return d
