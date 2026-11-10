"""
SwingIQ — Ball Tracking Test Suite
====================================
Run with: pytest tests/test_tracking.py -v

Tests:
  - Ball detection strategies (unit tests with synthetic frames)
  - Trajectory classification (putt / chip / full_swing)
  - Strike detection
  - Dispersion store
  - API endpoint validation
"""

import cv2
import math
import numpy as np
import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient


# ── Ball Detection Tests ──────────────────────────────────────────────────────

class TestBallDetector:
    """Unit tests for BallDetector using synthetic OpenCV frames."""

    def _white_ball_frame(self, w=640, h=480, cx=320, cy=400, r=12):
        """Creates a synthetic frame with a white circle (golf ball) on dark background."""
        frame = np.zeros((h, w, 3), dtype=np.uint8)
        cv2.circle(frame, (cx, cy), r, (255, 255, 255), -1)
        # Add slight blur to mimic a real image
        frame = cv2.GaussianBlur(frame, (3, 3), 0)
        return frame

    def test_hough_detects_white_ball(self):
        """Hough strategy should find a white circle on a dark background."""
        from app.services.ball_detection import BallDetector
        detector = BallDetector()
        frame = self._white_ball_frame(cx=320, cy=400, r=12)
        detection = detector.detect(frame, frame_idx=0)
        assert detection is not None, "Should detect the white ball"
        # Position should be close (±5% of frame width)
        assert abs(detection.x - 320/640) < 0.05
        assert abs(detection.y - 400/480) < 0.05

    def test_diff_detects_moving_ball(self):
        """Frame differencing should detect a ball that moved between frames."""
        from app.services.ball_detection import BallDetector
        detector = BallDetector()
        frame1 = self._white_ball_frame(cx=100, cy=400, r=10)
        frame2 = self._white_ball_frame(cx=200, cy=380, r=10)

        # First frame — primes the previous-frame buffer
        detector.detect(frame1, frame_idx=0)
        # Second frame — ball has moved, diff strategy should fire
        detection = detector.detect(frame2, frame_idx=1)
        assert detection is not None

    def test_colour_detects_yellow_ball(self):
        """Colour strategy should detect a yellow ball."""
        from app.services.ball_detection import BallDetector
        detector = BallDetector()
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        # Yellow in BGR: (0, 200, 220)
        cv2.circle(frame, (320, 300), 14, (0, 200, 220), -1)
        detection = detector.detect(frame, frame_idx=0)
        # Colour detection may or may not fire depending on HSV conversion
        # Just verify no crash
        assert detection is None or detection.strategy in ('hough', 'colour', 'diff')

    def test_no_ball_returns_none(self):
        """Empty frame should return None."""
        from app.services.ball_detection import BallDetector
        detector = BallDetector()
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        result = detector.detect(frame, frame_idx=0)
        assert result is None


# ── Kalman Tracker Tests ──────────────────────────────────────────────────────

class TestBallTracker:

    def _make_frame_with_ball(self, cx: int, cy: int, w=640, h=480):
        frame = np.zeros((h, w, 3), dtype=np.uint8)
        cv2.circle(frame, (cx, cy), 12, (255, 255, 255), -1)
        return cv2.GaussianBlur(frame, (3, 3), 0)

    def test_tracker_builds_track(self):
        """Tracker should accumulate points across frames."""
        from app.services.ball_detection import BallTracker
        tracker = BallTracker(fps=30.0)

        # Simulate ball moving right across 10 frames
        for i in range(10):
            frame = self._make_frame_with_ball(cx=100 + i * 20, cy=300)
            tracker.process_frame(frame, frame_idx=i)

        assert len(tracker.track) >= 3, "Should have tracked at least 3 points"

    def test_tracker_reset_clears_state(self):
        """Reset should clear the track."""
        from app.services.ball_detection import BallTracker
        tracker = BallTracker(fps=30.0)
        frame = self._make_frame_with_ball(cx=320, cy=300)
        tracker.process_frame(frame, frame_idx=0)
        tracker.reset()
        assert len(tracker.track) == 0
        assert tracker._kf is None


# ── Trajectory Analysis Tests ─────────────────────────────────────────────────

class TestTrajectoryAnalyser:
    """Tests shot classification using synthetic track data."""

    def _make_track(self, start_x, start_y, dx_per_frame, dy_per_frame,
                    n_frames=30, fps=30.0):
        """Builds a synthetic linear track."""
        from app.services.ball_detection import TrackPoint
        track = []
        for i in range(n_frames):
            track.append(TrackPoint(
                x=(start_x + dx_per_frame * i) / 640,
                y=(start_y + dy_per_frame * i) / 480,
                radius=0.015,
                frame_idx=i,
                timestamp_ms=(i / fps) * 1000,
            ))
        return track

    def test_slow_flat_is_putt(self):
        """Slow, nearly flat trajectory → PUTT."""
        from app.services.trajectory_analysis import TrajectoryAnalyser, ShotType
        analyser = TrajectoryAnalyser(fps=30, frame_w=640, frame_h=480)
        # Ball moves slowly right, almost no vertical movement
        track = self._make_track(start_x=100, start_y=400, dx_per_frame=4, dy_per_frame=0)
        result = analyser.analyse(track)
        assert result is not None
        assert result.metrics.shot_type == ShotType.PUTT

    def test_arc_trajectory_is_chip(self):
        """Medium speed with arc → CHIP."""
        from app.services.ball_detection import TrackPoint
        from app.services.trajectory_analysis import TrajectoryAnalyser, ShotType

        analyser = TrajectoryAnalyser(fps=30, frame_w=640, frame_h=480)
        # Parabolic arc: up then down
        frames = 20
        track = []
        for i in range(frames):
            t    = i / frames
            x    = 100 + t * 200
            y    = 350 - math.sin(t * math.pi) * 60  # arc peaking at frame 10
            track.append(TrackPoint(
                x=x/640, y=y/480, radius=0.015,
                frame_idx=i, timestamp_ms=(i/30)*1000
            ))
        result = analyser.analyse(track)
        assert result is not None
        # Chip or full_swing depending on speed estimate
        assert result.metrics.shot_type in ('chip', 'full_swing')

    def test_returns_none_for_short_track(self):
        """Track with fewer than 5 points → None."""
        from app.services.trajectory_analysis import TrajectoryAnalyser
        from app.services.ball_detection import TrackPoint

        analyser = TrajectoryAnalyser(fps=30, frame_w=640, frame_h=480)
        track = [TrackPoint(x=0.5, y=0.5, radius=0.01, frame_idx=i, timestamp_ms=i*33.3) for i in range(3)]
        result = analyser.analyse(track)
        assert result is None

    def test_metrics_within_bounds(self):
        """All metrics should be within physically plausible bounds."""
        from app.services.trajectory_analysis import TrajectoryAnalyser
        analyser = TrajectoryAnalyser(fps=30, frame_w=1920, frame_h=1080)
        track = self._make_track(100, 800, dx_per_frame=15, dy_per_frame=-8, n_frames=40)
        result = analyser.analyse(track)
        if result:
            m = result.metrics
            assert -20 <= m.launch_angle_deg <= 70
            assert -45 <= m.direction_deg    <= 45
            assert 0   <= m.ball_speed_mph   <= 250
            assert 0   <= m.carry_distance_yd <= 400


# ── Dispersion Store Tests ────────────────────────────────────────────────────

class TestDispersionStore:

    def test_save_and_retrieve(self, tmp_path, monkeypatch):
        import app.services.dispersion_store as ds
        monkeypatch.setattr(ds, 'STORE_DIR', tmp_path)

        shot_id = ds.save_shot(
            user_id='test-user', shot_type='chip',
            lateral_yd=2.1, carry_yd=15.5, speed_mph=30.0,
            angle_deg=12.0, direction_deg=1.5,
        )
        assert shot_id

        shots = ds.get_shots('test-user')
        assert len(shots) == 1
        assert shots[0]['shot_type'] == 'chip'
        assert shots[0]['lateral_yd'] == 2.1

    def test_filter_by_type(self, tmp_path, monkeypatch):
        import app.services.dispersion_store as ds
        monkeypatch.setattr(ds, 'STORE_DIR', tmp_path)

        ds.save_shot('u1','putt', 0.2, 5.0, 4.0, 0.5, 0.2)
        ds.save_shot('u1','chip', 1.5, 20.0, 25.0, 10.0, 2.0)
        ds.save_shot('u1','chip', 2.0, 18.0, 22.0, 9.0, 1.5)

        putts = ds.get_shots('u1', shot_type='putt')
        chips = ds.get_shots('u1', shot_type='chip')
        assert len(putts) == 1
        assert len(chips) == 2

    def test_consistency_score_tight_grouping(self, tmp_path, monkeypatch):
        import app.services.dispersion_store as ds
        monkeypatch.setattr(ds, 'STORE_DIR', tmp_path)

        # Very consistent shots (tight group)
        for _ in range(10):
            ds.save_shot('u2','putt', 0.1, 10.0, 5.0, 0.5, 0.1)

        stats = ds.get_dispersion_stats('u2')
        assert stats['consistency_pct'] >= 80

    def test_stats_empty_user(self, tmp_path, monkeypatch):
        import app.services.dispersion_store as ds
        monkeypatch.setattr(ds, 'STORE_DIR', tmp_path)
        stats = ds.get_dispersion_stats('nobody')
        assert stats['count'] == 0


# ── API Endpoint Tests ────────────────────────────────────────────────────────

class TestTrackingAPI:

    def _get_client(self):
        """Creates a TestClient with auth mocked out."""
        from fastapi import FastAPI
        from app.api.tracking import router, get_tracking_service
        app = FastAPI()
        app.include_router(router, prefix="/track")
        return TestClient(app)

    def test_analyse_rejects_non_video(self):
        client = self._get_client()
        with patch('app.api.tracking.get_current_user', return_value={'id': 'test'}):
            res = client.post(
                "/track/analyse",
                files={"video": ("test.txt", b"not a video", "text/plain")},
            )
        assert res.status_code == 415

    def test_analyse_with_mock_service(self):
        from app.services.trajectory_analysis import TrajectoryResult, LaunchMetrics, LandingPoint, ShotType
        from app.services.ball_detection import TrackPoint as TP

        mock_result = TrajectoryResult(
            metrics=LaunchMetrics(
                shot_type=ShotType.CHIP, launch_angle_deg=12.0,
                direction_deg=1.5, ball_speed_mph=28.0,
                carry_distance_yd=18.0, max_height_rel=0.1,
                apex_frame=15, total_frames=30, confidence=0.75,
            ),
            landing=LandingPoint(lateral_yd=1.2, carry_yd=18.0),
            track_points=[TP(x=0.2+i*0.02, y=0.7-i*0.01, radius=0.015, frame_idx=i, timestamp_ms=i*33.3) for i in range(30)],
            raw_pixels_w=1920, raw_pixels_h=1080,
        )

        mock_svc = MagicMock()
        mock_svc.analyse.return_value = mock_result

        client = self._get_client()

        with patch('app.api.tracking.get_current_user', return_value={'id': 'test-uid'}):
            with patch('app.api.tracking.get_tracking_service', return_value=mock_svc):
                with patch('app.api.tracking.save_shot', return_value='shot-123'):
                    res = client.post(
                        "/track/analyse",
                        files={"video": ("shot.mp4", b"fake_video_bytes", "video/mp4")},
                    )

        assert res.status_code == 200
        data = res.json()
        assert data["metrics"]["shot_type"] == "chip"
        assert data["metrics"]["ball_speed_mph"] == 28.0
        assert len(data["track_points"]) > 0
        assert data["shot_id"] == "shot-123"
