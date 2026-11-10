"""
SwingIQ — Trajectory Analysis Engine
======================================
Takes a list of TrackPoint objects from the BallTracker and computes:

  1.  SHOT CLASSIFICATION
      Looks at speed, arc shape, and bounce patterns to auto-detect:
        PUTT       — slow roll, nearly flat trajectory
        CHIP       — short flight, low arc, one or two bounces
        FULL_SWING — fast launch, significant arc, long flight

  2.  LAUNCH METRICS
      - Launch angle    (degrees above horizontal)
      - Launch direction (degrees left/right of target line)
      - Ball speed      (mph, estimated from pixel displacement + calibration)
      - Carry distance  (yards, estimated)
      - Max height      (relative to launch)
      - Apex frame      (frame index of highest point)

  3.  SHOT DISPERSION
      Stores landing point relative to a target so multiple shots can be
      visualised as a cluster (the dispersion map on the Track screen).

CALIBRATION
-----------
Real-world unit conversion uses the known golf ball diameter (42.67 mm)
as a reference IF the ball can be measured at address (when it is still).
If the ball is too small to measure reliably (far away), we fall back to
a rough pixels-per-yard estimate based on typical phone camera FOV.

COORDINATE SYSTEM
-----------------
  x increases left → right (lateral)
  y increases top → bottom (vertical — inverted vs physics)
  "up" in screen space = decreasing y

So launch angle = atan2(-(dy/dt), dx/dt) where dy/dt is negative for upward motion.
"""

import math
import numpy as np
from dataclasses import dataclass
from typing import Optional
from enum import Enum

from app.services.ball_detection import TrackPoint


# ── Shot type ────────────────────────────────────────────────────────────────

class ShotType(str, Enum):
    PUTT       = "putt"
    CHIP       = "chip"
    FULL_SWING = "full_swing"
    UNKNOWN    = "unknown"


# ── Result types ─────────────────────────────────────────────────────────────

@dataclass
class LaunchMetrics:
    shot_type:        ShotType
    launch_angle_deg: float        # positive = upward
    direction_deg:    float        # positive = right, negative = left
    ball_speed_mph:   float        # estimated
    carry_distance_yd: float       # estimated
    max_height_rel:   float        # as fraction of carry distance (ballpark)
    apex_frame:       int
    total_frames:     int
    confidence:       float        # 0–1, how reliable these estimates are

@dataclass
class LandingPoint:
    """Normalised offset from target (0,0).  Used for dispersion chart."""
    lateral_yd:  float   # left/right of target line (negative = left)
    carry_yd:    float   # distance toward target

@dataclass
class TrajectoryResult:
    metrics:       LaunchMetrics
    landing:       LandingPoint
    track_points:  list[TrackPoint]   # smoothed path for drawing
    raw_pixels_w:  int                # original frame width (for overlay scaling)
    raw_pixels_h:  int                # original frame height


# ── Trajectory fitter ─────────────────────────────────────────────────────────

class TrajectoryAnalyser:
    """
    Analyses a completed track (list of TrackPoints) and returns a TrajectoryResult.

    Usage:
        analyser = TrajectoryAnalyser(fps=30, frame_w=1920, frame_h=1080)
        result   = analyser.analyse(track_points)
    """

    # Rough pixels-per-yard calibration at 10 feet camera distance.
    # A better value is computed if we can measure the ball radius at address.
    _DEFAULT_PX_PER_YD = 120.0

    # Speed thresholds for shot classification (mph)
    _PUTT_MAX_SPEED  = 12.0
    _CHIP_MAX_SPEED  = 45.0

    # Arc height thresholds (as fraction of horizontal travel)
    _PUTT_MAX_ARC    = 0.03
    _CHIP_MAX_ARC    = 0.25

    def __init__(self, fps: float, frame_w: int, frame_h: int):
        self.fps     = fps
        self.frame_w = frame_w
        self.frame_h = frame_h

    def analyse(self, track: list[TrackPoint],
                address_radius_px: Optional[float] = None) -> Optional[TrajectoryResult]:
        """
        Main entry point.  Returns None if the track is too short to analyse.
        address_radius_px: radius of the ball in pixels at the address frame,
                           used for better distance calibration.
        """
        if len(track) < 5:
            return None

        # Build numpy arrays of x/y positions (in pixels, not normalised)
        xs = np.array([p.x * self.frame_w for p in track])
        ys = np.array([p.y * self.frame_h for p in track])
        ts = np.array([p.timestamp_ms / 1000.0 for p in track])  # seconds

        # Calibration: pixels per yard
        px_per_yd = self._calibrate(address_radius_px)

        # ── Launch vector ────────────────────────────────────────────────────
        # Use first 3–5 frames after the ball starts moving
        n_launch = min(5, len(track) - 1)
        dx = xs[n_launch] - xs[0]
        dy = ys[n_launch] - ys[0]
        dt = ts[n_launch] - ts[0]

        # Launch speed in pixels per second → mph
        px_per_sec  = math.hypot(dx, dy) / max(dt, 1e-6)
        speed_mph   = (px_per_sec / px_per_yd) * 0.000568182 * 3600  # yards/sec → mph

        # Launch angle: dy is inverted (positive y = down), so negate
        launch_angle = math.degrees(math.atan2(-dy, abs(dx)))
        launch_angle = max(-10.0, min(60.0, launch_angle))  # Clamp to physical range

        # Direction: positive = right of target line (left of frame = negative)
        # Camera is behind the ball looking toward target → dx > 0 means ball went right
        direction_deg = math.degrees(math.atan2(dx, -dy)) if abs(dy) > 1 else 0.0
        direction_deg = max(-30.0, min(30.0, direction_deg))

        # ── Arc analysis ─────────────────────────────────────────────────────
        y_min_idx = int(np.argmin(ys))  # Minimum y = highest point (inverted)
        y_range   = float(ys[0] - ys[y_min_idx])  # How high did it go (px)
        x_range   = float(abs(xs[-1] - xs[0]))     # Horizontal travel (px)
        arc_ratio = y_range / max(x_range, 1.0)

        # ── Shot type classification ──────────────────────────────────────────
        shot_type = self._classify(speed_mph, arc_ratio, launch_angle)

        # ── Carry distance ────────────────────────────────────────────────────
        carry_yd = x_range / px_per_yd

        # Scale carry by shot type (compensate for camera angle)
        if shot_type == ShotType.PUTT:
            carry_yd = min(carry_yd, 30.0)
        elif shot_type == ShotType.CHIP:
            carry_yd = min(carry_yd * 1.5, 60.0)
        else:
            carry_yd = min(carry_yd * 3.0, 350.0)

        # ── Max height ────────────────────────────────────────────────────────
        max_height_rel = arc_ratio * 0.5  # Rough: height ≈ 50% of horizontal arc ratio

        # ── Confidence ───────────────────────────────────────────────────────
        confidence = min(1.0, len(track) / 20.0)  # More frames = more confidence
        if address_radius_px: confidence = min(1.0, confidence + 0.2)

        metrics = LaunchMetrics(
            shot_type        = shot_type,
            launch_angle_deg = round(launch_angle, 1),
            direction_deg    = round(direction_deg, 1),
            ball_speed_mph   = round(speed_mph, 1),
            carry_distance_yd= round(carry_yd, 1),
            max_height_rel   = round(max_height_rel, 3),
            apex_frame       = track[y_min_idx].frame_idx,
            total_frames     = len(track),
            confidence       = round(confidence, 2),
        )

        # ── Landing point ─────────────────────────────────────────────────────
        # Landing x/y relative to the first point (address position)
        land_dx_px = float(xs[-1] - xs[0])
        land_dy_px = float(ys[-1] - ys[0])
        landing = LandingPoint(
            lateral_yd = round( land_dx_px / px_per_yd, 2),
            carry_yd   = round(-land_dy_px / px_per_yd, 2),  # negative = forward
        )

        return TrajectoryResult(
            metrics=metrics,
            landing=landing,
            track_points=track,
            raw_pixels_w=self.frame_w,
            raw_pixels_h=self.frame_h,
        )

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _calibrate(self, address_radius_px: Optional[float]) -> float:
        """Returns pixels per yard, using ball radius if available."""
        if address_radius_px and address_radius_px > 2:
            # Golf ball diameter = 42.67 mm = 0.04669 yards
            diameter_px = address_radius_px * 2
            px_per_mm   = diameter_px / 42.67
            px_per_yd   = px_per_mm * 914.4  # 1 yard = 914.4 mm
            # Sanity check
            if 20 < px_per_yd < 2000:
                return float(px_per_yd)
        return self._DEFAULT_PX_PER_YD

    def _classify(self, speed_mph: float, arc_ratio: float,
                  launch_angle: float) -> ShotType:
        """
        Classifies the shot using speed + arc shape.
        Priority: speed > arc (speed is more reliable from noisy tracking).
        """
        if speed_mph <= self._PUTT_MAX_SPEED or (arc_ratio <= self._PUTT_MAX_ARC and launch_angle <= 5):
            return ShotType.PUTT
        if speed_mph <= self._CHIP_MAX_SPEED or arc_ratio <= self._CHIP_MAX_ARC:
            return ShotType.CHIP
        return ShotType.FULL_SWING
