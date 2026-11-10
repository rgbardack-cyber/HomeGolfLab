"""
SwingIQ — Video Ball Tracking Service
=======================================
Orchestrates the full pipeline for an uploaded video:

  1.  Open video with OpenCV
  2.  Detect the ball in the first clear frame (address position)
  3.  Track the ball through every frame using BallTracker
  4.  Detect when the ball was struck (sudden acceleration)
  5.  Extract the post-strike track for analysis
  6.  Run TrajectoryAnalyser to compute launch metrics
  7.  Return TrajectoryResult + a frame-by-frame path for overlay rendering

USAGE IN THE API
----------------
    service = VideoTrackingService()
    result  = service.analyse(video_bytes)

MODES
-----
The service auto-detects the shot mode (putt/chip/full_swing) via the
TrajectoryAnalyser.  No configuration needed from the user.

PERFORMANCE
-----------
Processing is CPU-bound.  On a 30-fps 1080p video:
  - Hough + diff strategies:  ~8–15 ms/frame
  - 5-second video (150 frames):  ~1.5–3 seconds total
For production, consider running on a background worker with Redis queue.
"""

import cv2
import numpy as np
import math
import time
import tempfile
import os
from typing import Optional

from app.services.ball_detection import BallTracker, TrackPoint
from app.services.trajectory_analysis import TrajectoryAnalyser, TrajectoryResult


class VideoTrackingService:
    """
    Analyses a golf shot video and returns full tracking results.
    """

    # Minimum number of track points to attempt analysis
    MIN_TRACK_POINTS = 6

    # Maximum video length to process (seconds) — safety limit
    MAX_VIDEO_SECONDS = 15.0

    def analyse(self, video_bytes: bytes) -> TrajectoryResult:
        """
        Main entry point.  Accepts raw video bytes, returns TrajectoryResult.
        Raises ValueError if the video is too short or the ball can't be found.
        """
        t0 = time.time()

        # Write to temp file so OpenCV can open it
        with tempfile.NamedTemporaryFile(suffix='.mp4', delete=False) as tmp:
            tmp.write(video_bytes)
            tmp_path = tmp.name

        try:
            result = self._process_video(tmp_path)
        finally:
            os.unlink(tmp_path)

        print(f"[Tracking] Completed in {time.time() - t0:.2f}s")
        return result

    # ── Internal pipeline ─────────────────────────────────────────────────────

    def _process_video(self, video_path: str) -> TrajectoryResult:
        cap = cv2.VideoCapture(video_path)
        fps   = cap.get(cv2.CAP_PROP_FPS) or 30.0
        w     = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        h     = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        max_frames = int(fps * self.MAX_VIDEO_SECONDS)

        tracker   = BallTracker(fps=fps)
        analyser  = TrajectoryAnalyser(fps=fps, frame_w=w, frame_h=h)
        all_points: list[TrackPoint] = []
        address_radius_px: Optional[float] = None
        frame_idx = 0

        while cap.isOpened() and frame_idx < max_frames:
            ok, frame = cap.read()
            if not ok:
                break

            point = tracker.process_frame(frame, frame_idx)
            if point:
                all_points.append(point)
                # Capture ball radius at address (first 10 frames) for calibration
                if address_radius_px is None and frame_idx < 10:
                    address_radius_px = point.radius * w

            frame_idx += 1

        cap.release()

        if len(all_points) < self.MIN_TRACK_POINTS:
            raise ValueError(
                f"Ball not detected in enough frames "
                f"({len(all_points)}/{self.MIN_TRACK_POINTS} minimum). "
                "Tips: ensure good lighting, plain background, and ball in centre frame."
            )

        # ── Find the strike moment ────────────────────────────────────────────
        # The strike is the frame with the largest sudden jump in speed.
        # Before the strike: ball is stationary or slow (address/waggle).
        # After the strike: ball accelerates suddenly.
        strike_idx = self._find_strike_index(all_points, fps)

        # Use only post-strike track for analysis
        post_strike = all_points[strike_idx:]

        if len(post_strike) < self.MIN_TRACK_POINTS:
            # Couldn't find a clear strike — use the whole track
            post_strike = all_points

        result = analyser.analyse(post_strike, address_radius_px)
        if result is None:
            raise ValueError("Track too short to compute metrics. Try a longer clip.")

        return result

    # ── Strike detection ──────────────────────────────────────────────────────

    def _find_strike_index(self, points: list[TrackPoint], fps: float) -> int:
        """
        Finds the index in `points` where the ball was struck.

        Method: compute speed at each point (pixels/sec), find the frame
        where speed jumps most sharply (largest delta-speed).
        """
        if len(points) < 4:
            return 0

        speeds = []
        for i in range(1, len(points)):
            dx = (points[i].x - points[i-1].x)
            dy = (points[i].y - points[i-1].y)
            dt = max((points[i].timestamp_ms - points[i-1].timestamp_ms) / 1000.0, 1e-6)
            speed = math.hypot(dx, dy) / dt
            speeds.append(speed)

        # Find the index of the largest speed jump
        if len(speeds) < 2:
            return 0

        deltas = [abs(speeds[i] - speeds[i-1]) for i in range(1, len(speeds))]
        strike_speed_idx = int(np.argmax(deltas)) + 1  # +1 accounts for offset

        # Clamp to first 60% of track (strike shouldn't be in the last third)
        max_strike_idx = int(len(points) * 0.6)
        return min(strike_speed_idx, max_strike_idx)
