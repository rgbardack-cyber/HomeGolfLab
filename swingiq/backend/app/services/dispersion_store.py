"""
SwingIQ — Shot Dispersion Store
================================
Persists landing points per user so the dispersion map can show
multiple sessions' worth of shots.

MVP: stores in a local JSON file per user.
Production: swap _load/_save for Supabase queries (table: ball_tracking_shots).

Schema (per shot):
{
  "session_id":  "uuid",
  "user_id":     "uuid",
  "shot_type":   "putt|chip|full_swing",
  "lateral_yd":  float,   (negative = left)
  "carry_yd":    float,
  "speed_mph":   float,
  "angle_deg":   float,
  "direction_deg": float,
  "recorded_at": "ISO-8601"
}
"""

import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

STORE_DIR = Path("/tmp/swingiq_tracking")
STORE_DIR.mkdir(exist_ok=True)


def save_shot(
    user_id: str,
    shot_type: str,
    lateral_yd: float,
    carry_yd: float,
    speed_mph: float,
    angle_deg: float,
    direction_deg: float,
) -> str:
    """Saves one shot and returns its ID."""
    shot_id = str(uuid.uuid4())
    shot = {
        "shot_id":      shot_id,
        "user_id":      user_id,
        "shot_type":    shot_type,
        "lateral_yd":   lateral_yd,
        "carry_yd":     carry_yd,
        "speed_mph":    speed_mph,
        "angle_deg":    angle_deg,
        "direction_deg": direction_deg,
        "recorded_at":  datetime.now(timezone.utc).isoformat(),
    }
    path = STORE_DIR / f"{user_id}_shots.json"
    shots = _load(path)
    shots.append(shot)
    # Keep last 200 shots
    if len(shots) > 200:
        shots = shots[-200:]
    _save(path, shots)
    return shot_id


def get_shots(
    user_id: str,
    shot_type: str = None,
    limit: int = 100,
) -> list[dict]:
    """Returns recent shots for a user, optionally filtered by type."""
    path = STORE_DIR / f"{user_id}_shots.json"
    shots = _load(path)
    if shot_type:
        shots = [s for s in shots if s.get("shot_type") == shot_type]
    return shots[-limit:]


def get_dispersion_stats(user_id: str, shot_type: str = None) -> dict:
    """Computes aggregate dispersion statistics for the dispersion map."""
    shots = get_shots(user_id, shot_type=shot_type)
    if not shots:
        return {"count": 0}

    laterals = [s["lateral_yd"] for s in shots]
    carrys   = [s["carry_yd"]   for s in shots]
    speeds   = [s["speed_mph"]  for s in shots]

    import statistics
    return {
        "count":              len(shots),
        "avg_carry_yd":       round(statistics.mean(carrys),   1),
        "avg_speed_mph":      round(statistics.mean(speeds),   1),
        "lateral_std_yd":     round(statistics.stdev(laterals) if len(laterals) > 1 else 0, 1),
        "carry_std_yd":       round(statistics.stdev(carrys)   if len(carrys)   > 1 else 0, 1),
        "max_carry_yd":       round(max(carrys),  1),
        "min_carry_yd":       round(min(carrys),  1),
        "consistency_pct":    _consistency(laterals, carrys),
    }


def _consistency(laterals: list[float], carrys: list[float]) -> int:
    """
    Returns a 0–100 consistency score.
    Tighter dispersion = higher score.
    Uses the ratio of std deviation to mean carry — lower is better.
    """
    if len(laterals) < 2:
        return 75  # default for single shot
    import statistics
    lat_std  = statistics.stdev(laterals)
    carr_std = statistics.stdev(carrys)
    carr_avg = abs(statistics.mean(carrys)) or 1.0
    ratio    = (lat_std + carr_std) / (2 * carr_avg)
    score    = max(0, min(100, int(100 - ratio * 200)))
    return score


def _load(path: Path) -> list[dict]:
    if not path.exists():
        return []
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        return []


def _save(path: Path, data: list[dict]):
    with open(path, "w") as f:
        json.dump(data, f)
