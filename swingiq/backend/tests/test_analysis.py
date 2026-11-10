"""
SwingIQ — Test Suite
=====================
Run with:  pytest tests/ -v

Tests are grouped into:
  - Unit tests for individual metric calculations (no video needed)
  - Integration tests for the full API pipeline (require ANTHROPIC_API_KEY)
  - Mock tests for the AI coaching service (no API key needed)
"""

import math
import json
import pytest
import numpy as np
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient

from app.main import app
from app.services.pose_analysis import PoseAnalysisService, _angle_between, _midpoint
from app.services.ai_coaching import AICoachingService
from app.models.analysis import FeedbackItem


client = TestClient(app)


# ── Unit: geometry helpers ────────────────────────────────────────────────────

class TestGeometryHelpers:

    def test_angle_between_90_degrees(self):
        """Classic right angle check."""
        a = np.array([0.0, 1.0])
        b = np.array([0.0, 0.0])
        c = np.array([1.0, 0.0])
        angle = _angle_between(a, b, c)
        assert abs(angle - 90.0) < 0.01

    def test_angle_between_180_degrees(self):
        """Straight line should be 180°."""
        a = np.array([-1.0, 0.0])
        b = np.array([0.0,  0.0])
        c = np.array([1.0,  0.0])
        angle = _angle_between(a, b, c)
        assert abs(angle - 180.0) < 0.01

    def test_midpoint(self):
        a = np.array([0.0, 0.0])
        b = np.array([2.0, 4.0])
        mid = _midpoint(a, b)
        assert list(mid) == [1.0, 2.0]


# ── Unit: pose analysis metric bounds ────────────────────────────────────────

class TestPoseMetricBounds:
    """
    Validate that each metric calculation returns a value within a physically
    plausible range, using synthetic landmark data.
    """

    def _make_landmark(self, x, y, z=0.0, vis=0.9):
        lm = MagicMock()
        lm.x, lm.y, lm.z, lm.visibility = x, y, z, vis
        return lm

    def _make_landmarks(self, overrides: dict = None):
        """
        Creates a plausible set of 33 pose landmarks for a standing person.
        overrides: {index: (x, y)} to customise specific points.
        """
        defaults = {
            0:  (0.50, 0.05),   # nose
            11: (0.42, 0.25),   # L shoulder
            12: (0.58, 0.25),   # R shoulder
            13: (0.38, 0.38),   # L elbow
            14: (0.62, 0.38),   # R elbow
            15: (0.40, 0.50),   # L wrist
            16: (0.60, 0.50),   # R wrist
            23: (0.44, 0.55),   # L hip
            24: (0.56, 0.55),   # R hip
            25: (0.43, 0.72),   # L knee
            26: (0.57, 0.72),   # R knee
            27: (0.43, 0.90),   # L ankle
            28: (0.57, 0.90),   # R ankle
        }
        if overrides:
            defaults.update(overrides)

        lms = [self._make_landmark(0.5, 0.5) for _ in range(33)]
        for idx, (x, y) in defaults.items():
            lms[idx] = self._make_landmark(x, y)
        return lms

    def test_spine_angle_upright(self):
        svc = PoseAnalysisService.__new__(PoseAnalysisService)
        lms = self._make_landmarks()
        angle = svc._spine_angle(lms)
        # An upright person should have spine angle close to 0° (vertical)
        assert 0 <= angle <= 30

    def test_weight_transfer_neutral(self):
        svc = PoseAnalysisService.__new__(PoseAnalysisService)
        lms = self._make_landmarks()
        pct = svc._weight_transfer(lms, lms)  # same frame = no shift
        assert 40 <= pct <= 60, f"Expected ~50% for no shift, got {pct}"

    def test_weight_transfer_shifted(self):
        svc = PoseAnalysisService.__new__(PoseAnalysisService)
        addr = self._make_landmarks()
        # Shift hips left (lower X) to simulate weight moving to lead side
        impact = self._make_landmarks({
            23: (0.38, 0.55),  # L hip moved left
            24: (0.50, 0.55),  # R hip moved left
        })
        pct = svc._weight_transfer(addr, impact)
        assert pct > 55, f"Expected >55% after lead shift, got {pct}"


# ── Unit: AI coaching service (mocked) ───────────────────────────────────────

MOCK_CLAUDE_RESPONSE = {
    "overall_score": 74,
    "summary": (
        "Your tempo is a real strength — keep that 3:1 ratio. "
        "The main area to address is early extension through impact, "
        "which is causing the open face and missing shots right."
    ),
    "next_session_focus": [
        "Hip hinge and spine angle drills",
        "Gate putting for face awareness",
        "Step drill for weight transfer",
    ],
    "feedback": [
        {
            "severity": "fix",
            "category": "posture",
            "title": "Early extension at impact",
            "detail": (
                "Your hips are moving toward the ball through impact, causing "
                "loss of spine angle.  This leads to thin strikes and an open face."
            ),
            "drill": "Wall drill — stand 6 inches from a wall and practice hip hinge without bumping it.",
        },
        {
            "severity": "improve",
            "category": "weight_transfer",
            "title": "Increase lead-foot loading",
            "detail": (
                "You're reaching 68% on the lead foot at impact; tour average is 80–85%. "
                "More weight forward improves compression and reduces slice spin."
            ),
            "drill": "Step drill — step toward target as you start downswing for 20 reps.",
        },
        {
            "severity": "good",
            "category": "tempo",
            "title": "Excellent 3:1 tempo ratio",
            "detail": "Your backswing-to-downswing timing is tour-quality.  This gives you a great foundation.",
            "drill": None,
        },
    ],
}


class TestAICoachingService:

    @patch("app.services.ai_coaching.anthropic.Anthropic")
    def test_generate_feedback_returns_valid_structure(self, mock_anthropic_cls):
        """Mock the Anthropic client and verify we parse the response correctly."""
        mock_message         = MagicMock()
        mock_message.content = [MagicMock(text=json.dumps(MOCK_CLAUDE_RESPONSE))]
        mock_client          = MagicMock()
        mock_client.messages.create.return_value = mock_message
        mock_anthropic_cls.return_value = mock_client

        with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "test-key"}):
            svc    = AICoachingService()
            result = svc.generate_feedback(
                metrics={
                    "club_path_degrees": 2.1,
                    "face_angle_degrees": 3.2,
                    "spine_angle_address": 25.0,
                    "spine_angle_impact": 18.0,
                    "hip_turn_degrees": 40.0,
                    "shoulder_turn_degrees": 85.0,
                    "tempo_ratio": 3.0,
                    "weight_transfer_pct": 68.0,
                    "swing_plane_deviation": 4.0,
                    "total_frames_analyzed": 90,
                    "frames_per_second": 30.0,
                },
                skill_level="intermediate",
                club="7-iron",
            )

        assert result["overall_score"] == 74
        assert len(result["feedback"]) == 3
        assert all(isinstance(f, FeedbackItem) for f in result["feedback"])
        assert result["feedback"][0].severity == "fix"
        assert result["feedback"][2].severity == "good"

    @patch("app.services.ai_coaching.anthropic.Anthropic")
    def test_handles_markdown_fenced_json(self, mock_anthropic_cls):
        """Claude sometimes wraps JSON in backticks despite instructions."""
        fenced = f"```json\n{json.dumps(MOCK_CLAUDE_RESPONSE)}\n```"
        mock_message         = MagicMock()
        mock_message.content = [MagicMock(text=fenced)]
        mock_client          = MagicMock()
        mock_client.messages.create.return_value = mock_message
        mock_anthropic_cls.return_value = mock_client

        with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "test-key"}):
            svc    = AICoachingService()
            result = svc.generate_feedback({}, "beginner", "driver")

        assert result["overall_score"] == 74


# ── API integration: health check ────────────────────────────────────────────

class TestHealthEndpoint:

    def test_health_returns_ok(self):
        response = client.get("/health/")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"


# ── API integration: /analyze validation ─────────────────────────────────────

class TestAnalyzeEndpoint:

    def test_rejects_non_video_file(self):
        """Uploading a text file should return 415."""
        response = client.post(
            "/api/v1/analyze",
            files={"video": ("test.txt", b"not a video", "text/plain")},
            data={
                "player_name":  "Test Player",
                "skill_level":  "beginner",
                "club_used":    "driver",
            },
        )
        assert response.status_code == 415

    def test_rejects_missing_fields(self):
        """Missing required form fields should return 422."""
        response = client.post(
            "/api/v1/analyze",
            files={"video": ("test.mp4", b"fake", "video/mp4")},
            data={"player_name": "Test"},  # missing skill_level, club_used
        )
        assert response.status_code == 422

    @patch("app.api.analysis.get_pose_service")
    @patch("app.api.analysis.get_coach_service")
    def test_full_pipeline_with_mocks(self, mock_get_coach, mock_get_pose):
        """End-to-end API test with both services mocked."""
        # Mock pose service
        mock_pose = MagicMock()
        mock_pose.analyze.return_value = {
            "club_path_degrees": 2.1,
            "face_angle_degrees": 3.2,
            "spine_angle_address": 25.0,
            "spine_angle_impact": 18.0,
            "hip_turn_degrees": 40.0,
            "shoulder_turn_degrees": 85.0,
            "tempo_ratio": 3.0,
            "weight_transfer_pct": 68.0,
            "swing_plane_deviation": 4.0,
            "total_frames_analyzed": 90,
            "frames_per_second": 30.0,
            "processing_time_seconds": 2.1,
        }
        mock_get_pose.return_value = mock_pose

        # Mock coaching service
        mock_coach = MagicMock()
        mock_coach.generate_feedback.return_value = {
            "overall_score": 74,
            "summary": "Good swing with room to improve.",
            "next_session_focus": ["Spine angle", "Weight transfer"],
            "feedback": [FeedbackItem(**MOCK_CLAUDE_RESPONSE["feedback"][0])],
        }
        mock_get_coach.return_value = mock_coach

        response = client.post(
            "/api/v1/analyze",
            files={"video": ("swing.mp4", b"fake_video_bytes", "video/mp4")},
            data={
                "player_name": "Alex Rivera",
                "skill_level": "intermediate",
                "club_used":   "7-iron",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["overall_score"] == 74
        assert data["player_name"] == "Alex Rivera"
        assert "session_id" in data
        assert len(data["feedback"]) == 1
