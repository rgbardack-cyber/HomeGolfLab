"""
SwingIQ — Pose Analysis Service
================================
Uses MediaPipe Pose to extract skeleton landmarks from every frame of a
golf swing video, then derives the key biomechanical metrics the AI coach
needs to give meaningful feedback.

HOW IT WORKS
------------
1.  We open the video with OpenCV and iterate frame-by-frame.
2.  MediaPipe returns 33 landmarks (x, y, z, visibility) per frame.
3.  We identify four key "event frames":
        ADDRESS  – first frame where the player is in a stable setup position
        TOP      – the frame with maximum wrist height (top of backswing)
        IMPACT   – the frame where wrist height is at its minimum after TOP
        FOLLOW   – 10 frames after IMPACT (follow-through check)
4.  We compute angles and ratios from those four frames.
5.  We return a SwingMetrics object that the AI coach can interpret.

LANDMARKS WE USE (MediaPipe indices)
-------------------------------------
    0  – nose (head position)
    11 – left shoulder
    12 – right shoulder
    13 – left elbow
    14 – right elbow
    15 – left wrist
    16 – right wrist
    23 – left hip
    24 – right hip
    25 – left knee
    26 – right knee
    27 – left ankle
    28 – right ankle
"""

import cv2
import math
import time
import numpy as np
from dataclasses import dataclass
from typing import Optional

# MediaPipe is imported lazily so the service still loads even if mp isn't
# installed yet — useful during CI / initial setup.
try:
    import mediapipe as mp
    MP_AVAILABLE = True
except ImportError:
    MP_AVAILABLE = False


# ── Landmark index aliases ────────────────────────────────────────────────────

L_SHOULDER, R_SHOULDER = 11, 12
L_ELBOW,    R_ELBOW    = 13, 14
L_WRIST,    R_WRIST    = 15, 16
L_HIP,      R_HIP      = 23, 24
L_KNEE,     R_KNEE     = 25, 26
L_ANKLE,    R_ANKLE    = 27, 28
NOSE                   = 0


# ── Helper geometry functions ─────────────────────────────────────────────────

def _angle_between(a: np.ndarray, b: np.ndarray, c: np.ndarray) -> float:
    """
    Returns the angle (degrees) at point B in the triangle A-B-C.
    All inputs are (x, y) or (x, y, z) numpy arrays.
    """
    ba = a - b
    bc = c - b
    cosine = np.dot(ba, bc) / (np.linalg.norm(ba) * np.linalg.norm(bc) + 1e-8)
    return math.degrees(math.acos(np.clip(cosine, -1.0, 1.0)))


def _midpoint(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    return (a + b) / 2.0


def _lm(landmarks, idx: int) -> np.ndarray:
    """Extract a landmark as a 2-D numpy array (x, y) — ignoring z for 2-D math."""
    lm = landmarks[idx]
    return np.array([lm.x, lm.y])


def _lm3(landmarks, idx: int) -> np.ndarray:
    """Extract a landmark as a 3-D numpy array (x, y, z)."""
    lm = landmarks[idx]
    return np.array([lm.x, lm.y, lm.z])


# ── Main service class ────────────────────────────────────────────────────────

class PoseAnalysisService:
    """
    Analyses a golf swing video and returns a SwingMetrics-compatible dict.

    Usage
    -----
        service = PoseAnalysisService()
        metrics = service.analyze(video_bytes)
    """

    # Minimum landmark visibility score (0–1) to trust a detection.
    VISIBILITY_THRESHOLD = 0.55

    def __init__(self):
        if not MP_AVAILABLE:
            raise RuntimeError(
                "mediapipe is not installed. Run: pip install mediapipe"
            )
        self._mp_pose = mp.solutions.pose

    # ── Public API ────────────────────────────────────────────────────────────

    def analyze(self, video_bytes: bytes) -> dict:
        """
        Main entry point.  Accepts raw video bytes, returns a dict that maps
        directly onto SwingMetrics fields.
        """
        t0 = time.time()

        # Write bytes to a temp file so OpenCV can open it
        import tempfile, os
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
            tmp.write(video_bytes)
            tmp_path = tmp.name

        try:
            frames_data, fps = self._extract_landmarks(tmp_path)
        finally:
            os.unlink(tmp_path)

        if len(frames_data) < 10:
            raise ValueError(
                f"Video too short — only {len(frames_data)} usable frames detected. "
                "Please upload a clip that shows the full swing."
            )

        metrics = self._compute_metrics(frames_data, fps)
        metrics["processing_time_seconds"] = round(time.time() - t0, 2)
        return metrics

    # ── Step 1: extract per-frame landmarks ──────────────────────────────────

    def _extract_landmarks(self, video_path: str) -> tuple[list[dict], float]:
        """
        Runs MediaPipe on every frame.  Returns:
            - list of per-frame dicts  { "landmarks": [...], "frame_idx": int }
            - video FPS (float)
        Only keeps frames where the key body landmarks are sufficiently visible.
        """
        cap = cv2.VideoCapture(video_path)
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        frames_data = []
        frame_idx = 0

        with self._mp_pose.Pose(
            static_image_mode=False,
            model_complexity=1,          # 0=fast, 1=balanced, 2=accurate
            smooth_landmarks=True,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        ) as pose:
            while cap.isOpened():
                success, frame = cap.read()
                if not success:
                    break

                # MediaPipe expects RGB
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                result = pose.process(rgb)

                if result.pose_landmarks:
                    lms = result.pose_landmarks.landmark
                    # Gate on visibility of the key landmarks we actually use
                    key_indices = [
                        L_SHOULDER, R_SHOULDER, L_HIP, R_HIP,
                        L_WRIST, R_WRIST, L_KNEE, R_KNEE
                    ]
                    avg_vis = sum(lms[i].visibility for i in key_indices) / len(key_indices)
                    if avg_vis >= self.VISIBILITY_THRESHOLD:
                        frames_data.append({
                            "landmarks": lms,
                            "frame_idx": frame_idx,
                        })

                frame_idx += 1

        cap.release()
        return frames_data, fps

    # ── Step 2: identify event frames ────────────────────────────────────────

    def _find_event_frames(self, frames_data: list[dict]) -> dict[str, int]:
        """
        Locates ADDRESS, TOP, IMPACT, and FOLLOW frame indices within
        frames_data (not the original video frame numbers).

        Strategy:
          - ADDRESS  = first 10% of frames (setup)
          - TOP      = frame with maximum average wrist Y (highest hand position)
                       Note: in image coords, smaller Y = higher up the screen
          - IMPACT   = frame with minimum wrist Y *after* TOP
          - FOLLOW   = min(TOP + len, TOP + some_offset) after IMPACT
        """
        n = len(frames_data)
        address_idx = max(0, int(n * 0.08))  # ~8% into the clip

        # Wrist heights (y coordinate; lower value = higher in frame)
        wrist_ys = []
        for fd in frames_data:
            lms = fd["landmarks"]
            lw_y = _lm(lms, L_WRIST)[1]
            rw_y = _lm(lms, R_WRIST)[1]
            wrist_ys.append((lw_y + rw_y) / 2.0)

        wrist_ys_arr = np.array(wrist_ys)

        # TOP = minimum y value (highest position) in the middle 20–80% of clip
        search_start = int(n * 0.20)
        search_end   = int(n * 0.80)
        top_offset = int(np.argmin(wrist_ys_arr[search_start:search_end]))
        top_idx = search_start + top_offset

        # IMPACT = maximum y value (hands back down) after TOP
        impact_offset = int(np.argmax(wrist_ys_arr[top_idx:]))
        impact_idx = top_idx + impact_offset

        follow_idx = min(impact_idx + 8, n - 1)

        return {
            "address": address_idx,
            "top":     top_idx,
            "impact":  impact_idx,
            "follow":  follow_idx,
        }

    # ── Step 3: compute metrics from event frames ─────────────────────────────

    def _compute_metrics(self, frames_data: list[dict], fps: float) -> dict:
        events = self._find_event_frames(frames_data)
        n = len(frames_data)

        def lms_at(event_name: str):
            return frames_data[events[event_name]]["landmarks"]

        addr = lms_at("address")
        top  = lms_at("top")
        imp  = lms_at("impact")

        # ── Spine angle ───────────────────────────────────────────────────────
        # Angle between mid-shoulder, mid-hip, and a vertical reference point
        spine_address = self._spine_angle(addr)
        spine_impact  = self._spine_angle(imp)

        # ── Hip & shoulder turn ───────────────────────────────────────────────
        hip_turn      = self._rotation_degrees(addr, top, L_HIP, R_HIP)
        shoulder_turn = self._rotation_degrees(addr, top, L_SHOULDER, R_SHOULDER)

        # ── Club path (simplified) ────────────────────────────────────────────
        # We approximate using the wrist trajectory from top to impact.
        # A true club path needs shaft tracking; this is a good proxy for MVP.
        club_path = self._club_path_estimate(frames_data, events)

        # ── Face angle (simplified) ───────────────────────────────────────────
        # Derived from wrist rotation between impact and a frame just before it.
        face_angle = self._face_angle_estimate(frames_data, events)

        # ── Tempo ratio ───────────────────────────────────────────────────────
        backswing_frames  = events["top"]     - events["address"]
        downswing_frames  = events["impact"]  - events["top"]
        tempo_ratio = (backswing_frames / max(downswing_frames, 1))

        # ── Weight transfer ───────────────────────────────────────────────────
        weight_pct = self._weight_transfer(addr, imp)

        # ── Swing plane deviation ─────────────────────────────────────────────
        plane_dev = self._swing_plane_deviation(frames_data, events)

        return {
            "club_path_degrees":     round(club_path, 1),
            "face_angle_degrees":    round(face_angle, 1),
            "spine_angle_address":   round(spine_address, 1),
            "spine_angle_impact":    round(spine_impact, 1),
            "hip_turn_degrees":      round(hip_turn, 1),
            "shoulder_turn_degrees": round(shoulder_turn, 1),
            "tempo_ratio":           round(tempo_ratio, 2),
            "weight_transfer_pct":   round(weight_pct, 1),
            "swing_plane_deviation": round(plane_dev, 1),
            "total_frames_analyzed": n,
            "frames_per_second":     round(fps, 1),
        }

    # ── Individual metric helpers ─────────────────────────────────────────────

    def _spine_angle(self, lms) -> float:
        """
        Spine tilt = angle between the mid-shoulder → mid-hip vector
        and a straight vertical line.
        """
        mid_shoulder = _midpoint(_lm(lms, L_SHOULDER), _lm(lms, R_SHOULDER))
        mid_hip      = _midpoint(_lm(lms, L_HIP),      _lm(lms, R_HIP))
        vertical_ref = mid_hip + np.array([0.0, -0.5])  # straight up
        return _angle_between(mid_shoulder, mid_hip, vertical_ref)

    def _rotation_degrees(self, lms_a, lms_b, left_idx: int, right_idx: int) -> float:
        """
        Estimates how many degrees a body segment (defined by left_idx → right_idx)
        rotated between two frames using the X-axis spread change.
        """
        ax = abs(_lm(lms_a, left_idx)[0] - _lm(lms_a, right_idx)[0])
        bx = abs(_lm(lms_b, left_idx)[0] - _lm(lms_b, right_idx)[0])
        # As the golfer rotates, the apparent width narrows; use acos ratio
        ratio = np.clip(bx / (ax + 1e-8), 0.0, 1.0)
        return math.degrees(math.acos(ratio))

    def _club_path_estimate(self, frames_data: list, events: dict) -> float:
        """
        Approximates club path by measuring the lateral (X) direction of the
        wrist movement through the impact zone.
        Positive = in-to-out, Negative = out-to-in.
        """
        pre_impact_idx  = max(0, events["impact"] - 3)
        post_impact_idx = min(len(frames_data) - 1, events["impact"] + 3)

        lms_pre  = frames_data[pre_impact_idx]["landmarks"]
        lms_post = frames_data[post_impact_idx]["landmarks"]

        wrist_pre  = _midpoint(_lm(lms_pre,  L_WRIST), _lm(lms_pre,  R_WRIST))
        wrist_post = _midpoint(_lm(lms_post, L_WRIST), _lm(lms_post, R_WRIST))

        delta_x = wrist_post[0] - wrist_pre[0]
        delta_y = wrist_post[1] - wrist_pre[1]
        # Convert to angle relative to the target line (vertical in camera view)
        return math.degrees(math.atan2(delta_x, -delta_y))

    def _face_angle_estimate(self, frames_data: list, events: dict) -> float:
        """
        Estimates club face angle by measuring the elbow-to-wrist forearm angle
        at impact vs. setup.  Positive = open, Negative = closed.
        """
        lms_addr = frames_data[events["address"]]["landmarks"]
        lms_imp  = frames_data[events["impact"]]["landmarks"]

        def forearm_angle(lms):
            elbow = _lm(lms, R_ELBOW)
            wrist = _lm(lms, R_WRIST)
            vec   = wrist - elbow
            return math.degrees(math.atan2(vec[0], -vec[1]))

        return forearm_angle(lms_imp) - forearm_angle(lms_addr)

    def _weight_transfer(self, lms_address, lms_impact) -> float:
        """
        Estimates lead-foot weight percentage at impact based on how far the
        hips have shifted laterally toward the target.
        Returns a value in [0, 100].
        """
        # In a face-on view, the lead hip (left for right-hander) should move
        # toward the target (typically left in the frame = smaller X).
        hip_addr   = _midpoint(_lm(lms_address, L_HIP), _lm(lms_address, R_HIP))
        hip_impact = _midpoint(_lm(lms_impact,  L_HIP), _lm(lms_impact,  R_HIP))

        shift = hip_addr[0] - hip_impact[0]  # positive = shifted toward camera-left
        # Map roughly: 0 shift → 50%, max plausible shift (0.10 normalized) → 90%
        pct = 50.0 + (shift / 0.10) * 40.0
        return float(np.clip(pct, 30.0, 95.0))

    def _swing_plane_deviation(self, frames_data: list, events: dict) -> float:
        """
        Computes how far the wrist path from address to top deviates from the
        ideal Hogan plane (roughly 60° from vertical for a mid-iron).
        """
        lms_addr = frames_data[events["address"]]["landmarks"]
        lms_top  = frames_data[events["top"]]["landmarks"]

        wrist_addr = _midpoint(_lm(lms_addr, L_WRIST), _lm(lms_addr, R_WRIST))
        wrist_top  = _midpoint(_lm(lms_top,  L_WRIST), _lm(lms_top,  R_WRIST))

        vec = wrist_top - wrist_addr
        actual_angle = math.degrees(math.atan2(abs(vec[0]), abs(vec[1])))
        ideal_plane  = 60.0  # degrees from vertical for a 7-iron
        return actual_angle - ideal_plane
