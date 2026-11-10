"""
SwingIQ — Ball Detection Engine
=================================
Finds the golf ball in a single video frame using three strategies,
tried in order of reliability:

  STRATEGY 1 — Hough Circle Transform
    Best for: stationary or slow-moving ball (putting setup, chipping address)
    How: Detects circular shapes matching golf ball size range
    Fails when: ball is moving fast (motion blur destroys circular shape)

  STRATEGY 2 — Frame Differencing
    Best for: moving ball (all shot types during flight)
    How: Subtracts consecutive frames, finds bright moving regions
    Fails when: background is busy or camera is moving

  STRATEGY 3 — Colour + Contour (white/yellow blob)
    Best for: outdoor shots on dark backgrounds (fairway, mat)
    How: HSV colour threshold → find round white/yellow blobs
    Fails when: background has white objects (walls, ceiling, clothing)

The BallDetector tries all three and returns the most confident result.
For tracking across frames, BallTracker manages state, filters noise,
and hands off to the trajectory fitter.

COORDINATE SYSTEM
-----------------
All positions are normalised (0.0–1.0) relative to frame width/height
so they are resolution-independent.  The trajectory fitter converts
to real-world units using the known ball diameter (42.67 mm) as a
calibration reference.
"""

import cv2
import numpy as np
import math
from dataclasses import dataclass, field
from typing import Optional

# ── Data structures ───────────────────────────────────────────────────────────

@dataclass
class BallDetection:
    """A single ball detection in one frame."""
    x: float           # normalised 0–1 (left to right)
    y: float           # normalised 0–1 (top to bottom)
    radius: float      # normalised radius
    confidence: float  # 0–1
    strategy: str      # 'hough' | 'diff' | 'colour'
    frame_idx: int


@dataclass
class TrackPoint:
    """One point in a ball track, with timing."""
    x: float
    y: float
    radius: float
    frame_idx: int
    timestamp_ms: float


# ── Detector ──────────────────────────────────────────────────────────────────

class BallDetector:
    """
    Detects a golf ball in a single BGR frame.
    Maintains the previous frame for frame-differencing.
    """

    # Golf ball apparent size bounds (as fraction of frame width)
    # A ball 10 feet away on a phone camera fills ~0.5–2.5% of the width.
    MIN_RADIUS_FRAC = 0.003
    MAX_RADIUS_FRAC = 0.06

    def __init__(self):
        self._prev_gray: Optional[np.ndarray] = None

    def detect(self, frame: np.ndarray, frame_idx: int) -> Optional[BallDetection]:
        """
        Try all three strategies and return the most confident detection,
        or None if no confident detection is found.
        """
        h, w = frame.shape[:2]
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (9, 9), 2)

        candidates = []

        # Strategy 1: Hough circles
        hough = self._detect_hough(blurred, w, h, frame_idx)
        if hough: candidates.append(hough)

        # Strategy 2: Frame differencing
        diff = self._detect_diff(gray, w, h, frame_idx)
        if diff: candidates.append(diff)

        # Strategy 3: Colour blob (white/yellow)
        colour = self._detect_colour(frame, w, h, frame_idx)
        if colour: candidates.append(colour)

        self._prev_gray = gray

        if not candidates:
            return None

        # Return highest confidence detection
        return max(candidates, key=lambda d: d.confidence)

    # ── Strategy 1: Hough Circle Transform ───────────────────────────────────

    def _detect_hough(self, blurred_gray: np.ndarray, w: int, h: int,
                      frame_idx: int) -> Optional[BallDetection]:
        min_r = max(3,  int(w * self.MIN_RADIUS_FRAC))
        max_r = max(30, int(w * self.MAX_RADIUS_FRAC))

        circles = cv2.HoughCircles(
            blurred_gray,
            cv2.HOUGH_GRADIENT,
            dp=1.2,
            minDist=int(w * 0.04),    # Minimum distance between detected circles
            param1=60,                 # Canny edge threshold
            param2=25,                 # Accumulator threshold — lower = more detections
            minRadius=min_r,
            maxRadius=max_r,
        )

        if circles is None:
            return None

        circles = np.round(circles[0, :]).astype(int)
        # Pick the circle closest to the centre of the frame (most likely the ball)
        cx, cy = w / 2, h * 0.6   # Slightly below centre (ball tends to be in lower half)
        best = min(circles, key=lambda c: math.hypot(c[0] - cx, c[1] - cy))

        # Confidence based on how round and white the region is
        rx, ry, rr = int(best[0]), int(best[1]), int(best[2])
        roi = blurred_gray[
            max(0, ry - rr): min(h, ry + rr),
            max(0, rx - rr): min(w, rx + rr),
        ]
        whiteness = float(np.mean(roi)) / 255.0 if roi.size > 0 else 0.3
        confidence = min(0.9, 0.4 + whiteness * 0.5)

        return BallDetection(
            x=best[0] / w, y=best[1] / h, radius=best[2] / w,
            confidence=confidence, strategy='hough', frame_idx=frame_idx,
        )

    # ── Strategy 2: Frame Differencing ───────────────────────────────────────

    def _detect_diff(self, gray: np.ndarray, w: int, h: int,
                     frame_idx: int) -> Optional[BallDetection]:
        if self._prev_gray is None or self._prev_gray.shape != gray.shape:
            return None

        diff = cv2.absdiff(self._prev_gray, gray)
        _, thresh = cv2.threshold(diff, 25, 255, cv2.THRESH_BINARY)

        # Morphological cleanup
        kernel = np.ones((3, 3), np.uint8)
        thresh = cv2.dilate(thresh, kernel, iterations=2)
        thresh = cv2.erode(thresh,  kernel, iterations=1)

        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            return None

        min_area = math.pi * (w * self.MIN_RADIUS_FRAC) ** 2
        max_area = math.pi * (w * self.MAX_RADIUS_FRAC) ** 2

        ball_contours = []
        for cnt in contours:
            area = cv2.contourArea(cnt)
            if not (min_area <= area <= max_area):
                continue
            perimeter = cv2.arcLength(cnt, True)
            if perimeter == 0:
                continue
            circularity = 4 * math.pi * area / (perimeter ** 2)
            if circularity >= 0.45:  # Relaxed for motion blur
                ball_contours.append((cnt, circularity, area))

        if not ball_contours:
            return None

        # Best = most circular
        best_cnt, best_circ, _ = max(ball_contours, key=lambda t: t[1])
        (cx, cy), cr = cv2.minEnclosingCircle(best_cnt)
        confidence = min(0.85, 0.35 + best_circ * 0.5)

        return BallDetection(
            x=cx / w, y=cy / h, radius=cr / w,
            confidence=confidence, strategy='diff', frame_idx=frame_idx,
        )

    # ── Strategy 3: Colour Blob ───────────────────────────────────────────────

    def _detect_colour(self, frame: np.ndarray, w: int, h: int,
                       frame_idx: int) -> Optional[BallDetection]:
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)

        # White ball range in HSV
        white_lower = np.array([0,   0, 200])
        white_upper = np.array([180, 40, 255])
        # Yellow ball range (practice balls)
        yellow_lower = np.array([20,  80, 150])
        yellow_upper = np.array([35, 255, 255])

        mask_w = cv2.inRange(hsv, white_lower, white_upper)
        mask_y = cv2.inRange(hsv, yellow_lower, yellow_upper)
        mask   = cv2.bitwise_or(mask_w, mask_y)

        kernel = np.ones((5, 5), np.uint8)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN,  kernel)

        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            return None

        min_area = math.pi * (w * self.MIN_RADIUS_FRAC) ** 2
        max_area = math.pi * (w * self.MAX_RADIUS_FRAC) ** 2

        ball_cnts = []
        for cnt in contours:
            area = cv2.contourArea(cnt)
            if not (min_area <= area <= max_area):
                continue
            perimeter = cv2.arcLength(cnt, True)
            if perimeter == 0:
                continue
            circularity = 4 * math.pi * area / (perimeter ** 2)
            if circularity >= 0.55:
                ball_cnts.append((cnt, circularity))

        if not ball_cnts:
            return None

        best_cnt, best_circ = max(ball_cnts, key=lambda t: t[1])
        (cx, cy), cr = cv2.minEnclosingCircle(best_cnt)
        confidence = min(0.80, 0.30 + best_circ * 0.5)

        return BallDetection(
            x=cx / w, y=cy / h, radius=cr / w,
            confidence=confidence, strategy='colour', frame_idx=frame_idx,
        )


# ── Kalman filter for smooth tracking ────────────────────────────────────────

class BallTracker:
    """
    Wraps BallDetector with a Kalman filter for smooth, noise-resistant tracking.

    The Kalman filter:
      - State vector: [x, y, vx, vy]  (position + velocity, normalised)
      - Measurement: [x, y]
      - Prediction step: runs every frame (even when no detection)
      - Update step: runs when a detection is found

    This handles brief occlusions (ball behind a club or arm) and
    smooths out jittery single-frame detections.
    """

    def __init__(self, fps: float = 30.0):
        self.fps = fps
        self.detector = BallDetector()
        self.track: list[TrackPoint] = []
        self._kf: Optional[cv2.KalmanFilter] = None
        self._frames_since_detection = 0
        self._max_gap = int(fps * 0.3)  # Allow 300 ms gap before resetting

    def process_frame(self, frame: np.ndarray, frame_idx: int) -> Optional[TrackPoint]:
        h, w = frame.shape[:2]
        ts_ms = (frame_idx / self.fps) * 1000.0

        detection = self.detector.detect(frame, frame_idx)

        if detection and detection.confidence >= 0.35:
            self._frames_since_detection = 0

            if self._kf is None:
                self._init_kalman(detection.x, detection.y)

            # Kalman update
            measurement = np.array([[detection.x], [detection.y]], dtype=np.float32)
            self._kf.correct(measurement)
            state = self._kf.predict()
            sx, sy = float(state[0]), float(state[1])

        elif self._kf is not None and self._frames_since_detection < self._max_gap:
            # Predict forward without a measurement
            self._frames_since_detection += 1
            state = self._kf.predict()
            sx, sy = float(state[0]), float(state[1])
            if not (0.0 <= sx <= 1.0 and 0.0 <= sy <= 1.0):
                return None  # Prediction went off-screen
        else:
            self._kf = None
            return None

        point = TrackPoint(
            x=sx, y=sy,
            radius=detection.radius if detection else 0.01,
            frame_idx=frame_idx,
            timestamp_ms=ts_ms,
        )
        self.track.append(point)
        return point

    def reset(self):
        self.track = []
        self._kf = None
        self._frames_since_detection = 0
        self.detector._prev_gray = None

    def _init_kalman(self, x: float, y: float):
        kf = cv2.KalmanFilter(4, 2)  # 4 state vars, 2 measured vars
        dt = 1.0 / self.fps

        # Transition matrix [x, y, vx, vy]
        kf.transitionMatrix = np.array([
            [1, 0, dt, 0 ],
            [0, 1, 0,  dt],
            [0, 0, 1,  0 ],
            [0, 0, 0,  1 ],
        ], dtype=np.float32)

        kf.measurementMatrix = np.array([
            [1, 0, 0, 0],
            [0, 1, 0, 0],
        ], dtype=np.float32)

        kf.processNoiseCov     = np.eye(4, dtype=np.float32) * 1e-4
        kf.measurementNoiseCov = np.eye(2, dtype=np.float32) * 1e-3
        kf.errorCovPost        = np.eye(4, dtype=np.float32)

        kf.statePost = np.array([[x], [y], [0], [0]], dtype=np.float32)
        self._kf = kf
