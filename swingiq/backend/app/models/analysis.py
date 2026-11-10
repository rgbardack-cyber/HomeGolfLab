"""
Data models for the swing analysis pipeline.
These define exactly what goes in and comes out of each API endpoint.
"""

from pydantic import BaseModel, Field
from typing import Optional


# ── Request ──────────────────────────────────────────────────────────────────

class AnalysisRequest(BaseModel):
    """Metadata sent alongside the video upload."""
    player_name: str = Field(..., example="Alex Rivera")
    skill_level: str = Field(
        ...,
        description="beginner | intermediate | advanced",
        example="intermediate",
    )
    club_used: str = Field(..., example="7-iron")
    # Optional: if the player has known recurring issues, pass them in
    # so the AI can prioritise feedback on those areas.
    known_issues: Optional[list[str]] = Field(
        default=None,
        example=["early extension", "weak grip"],
    )


# ── Core metrics produced by pose analysis ───────────────────────────────────

class SwingMetrics(BaseModel):
    """
    Raw numbers extracted from MediaPipe pose landmarks.
    All angles in degrees; tempo as back-to-down ratio (e.g. 3.0 = 3:1).
    """
    club_path_degrees: float = Field(
        ..., description="Positive = inside-out, negative = outside-in"
    )
    face_angle_degrees: float = Field(
        ..., description="Positive = open, negative = closed at impact frame"
    )
    spine_angle_address: float = Field(..., description="Spine tilt at setup")
    spine_angle_impact: float = Field(..., description="Spine tilt at impact")
    hip_turn_degrees: float = Field(..., description="Total hip rotation at top")
    shoulder_turn_degrees: float = Field(..., description="Total shoulder rotation at top")
    tempo_ratio: float = Field(..., description="Backswing frames / downswing frames")
    weight_transfer_pct: float = Field(
        ..., description="Estimated % weight on lead foot at impact (0–100)"
    )
    swing_plane_deviation: float = Field(
        ..., description="Degrees off ideal swing plane"
    )
    total_frames_analyzed: int
    frames_per_second: float


# ── AI coaching output ────────────────────────────────────────────────────────

class FeedbackItem(BaseModel):
    severity: str = Field(..., description="fix | improve | good")
    category: str = Field(
        ..., description="posture | grip | swing_path | tempo | impact | weight_transfer"
    )
    title: str
    detail: str
    drill: Optional[str] = Field(None, description="Specific drill to address this issue")


class AnalysisResponse(BaseModel):
    """Full response returned to the mobile app."""
    session_id: str
    player_name: str
    club_used: str
    overall_score: int = Field(..., ge=0, le=100)
    metrics: SwingMetrics
    feedback: list[FeedbackItem]
    # Plain-English summary suitable for display at the top of the results screen
    summary: str
    # Prioritised list of what to work on next session
    next_session_focus: list[str]
    processing_time_seconds: float
