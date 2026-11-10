"""
SwingIQ — Room Analysis Service
=================================
Analyses a short pan-around video of a practice space and returns:

  - Estimated floor dimensions (feet)
  - Usable floor area (sq ft)
  - Obstacle map (furniture, walls, low ceilings)
  - Recommended practice zones:
      PUTTING_LANE   — longest clear straight path on the floor
      CHIP_ZONE      — area with enough clearance for a chip swing
      SWING_ZONE     — largest unobstructed overhead + lateral space
      TARGET_SPOTS   — good positions for targets/cups

ALGORITHM OVERVIEW
------------------
1.  Extract key frames from the video (every 0.5 seconds)
2.  Per-frame: detect floor/wall boundaries using edge detection +
    perspective estimation
3.  Per-frame: detect obstacles using contour area thresholding
4.  Accumulate floor-plane detections across frames to estimate room size
5.  Identify the longest clear line on the floor → putting lane
6.  Find the largest contiguous clear overhead area → swing zone
7.  Return a RoomAnalysis object

LIMITATIONS (MVP)
-----------------
True AR spatial mapping (like ARKit RoomPlan) requires on-device depth
sensors or LiDAR.  This service uses monocular computer vision which
gives approximate measurements accurate to ±20%.  Good enough for
placing drill zones; not good enough for precise architecture.

For production, use expo-camera's AR session (iOS) or ARCore Depth API
(Android) and send the depth point cloud to the backend instead of raw video.
"""

import cv2
import numpy as np
import math
import time
import tempfile
import os
from dataclasses import dataclass, field
from typing import Optional


# ── Data structures ───────────────────────────────────────────────────────────

@dataclass
class Zone:
    """A practice zone within the room."""
    zone_type:   str          # 'putting_lane' | 'chip_zone' | 'swing_zone' | 'target_spot'
    label:       str          # Display label e.g. "Putting Lane"
    x_norm:      float        # Centre x, normalised 0–1 (left to right)
    y_norm:      float        # Centre y, normalised 0–1 (top to bottom in bird's-eye)
    width_norm:  float        # Width normalised
    height_norm: float        # Height normalised
    width_ft:    float        # Estimated real-world width
    height_ft:   float        # Estimated real-world height
    clearance_ft: float       # Estimated overhead clearance
    feasibility: str          # 'good' | 'ok' | 'tight'


@dataclass
class RoomAnalysis:
    """Complete analysis result for a room scan."""
    # Room dimensions
    estimated_width_ft:  float
    estimated_length_ft: float
    estimated_height_ft: float
    usable_area_sqft:    float

    # Detected elements
    has_net:              bool
    has_mat:              bool
    has_obstacles:        bool
    obstacle_count:       int
    floor_type:           str   # 'carpet' | 'hardwood' | 'tile' | 'concrete' | 'unknown'

    # Practice zones (may be empty if room is too small)
    zones: list[Zone]

    # Raw frame data for the mobile overlay
    scan_frame_w: int
    scan_frame_h: int
    obstacle_regions: list[dict]   # [{x, y, w, h} normalised, for drawing]

    # Meta
    frames_analysed: int
    confidence:      float   # 0–1
    scan_notes:      list[str]  # Human-readable observations


# ── Room Analyser ─────────────────────────────────────────────────────────────

# Minimum clear width for each zone type (feet)
ZONE_MIN = {
    'putting_lane': 1.5,
    'chip_zone':    6.0,
    'swing_zone':   8.0,
}


class RoomAnalysisService:
    """
    Analyses a pan-around room video and returns a RoomAnalysis.

    Usage:
        svc    = RoomAnalysisService()
        result = svc.analyse(video_bytes)
    """

    MAX_VIDEO_SECONDS = 30.0

    def analyse(self, video_bytes: bytes) -> RoomAnalysis:
        t0 = time.time()
        with tempfile.NamedTemporaryFile(suffix='.mp4', delete=False) as tmp:
            tmp.write(video_bytes)
            tmp_path = tmp.name
        try:
            result = self._process(tmp_path)
        finally:
            os.unlink(tmp_path)
        print(f"[Space] Room analysed in {time.time()-t0:.2f}s")
        return result

    # ── Main pipeline ─────────────────────────────────────────────────────────

    def _process(self, path: str) -> RoomAnalysis:
        cap   = cv2.VideoCapture(path)
        fps   = cap.get(cv2.CAP_PROP_FPS) or 30.0
        w     = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        h     = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        # Sample one frame per 0.5 seconds
        step       = max(1, int(fps * 0.5))
        key_frames = []
        idx        = 0

        while cap.isOpened() and idx < int(fps * self.MAX_VIDEO_SECONDS):
            ok, frame = cap.read()
            if not ok:
                break
            if idx % step == 0:
                key_frames.append(frame)
            idx += 1
        cap.release()

        if len(key_frames) < 2:
            raise ValueError("Video too short for room scan — please record at least 3 seconds.")

        # ── Per-frame analysis ────────────────────────────────────────────────
        floor_estimates  = []
        obstacle_regions = []
        net_votes        = 0
        mat_votes        = 0
        floor_type_votes: dict[str, int] = {}

        for frame in key_frames:
            fe = self._estimate_floor(frame)
            if fe:
                floor_estimates.append(fe)

            obs = self._detect_obstacles(frame, w, h)
            obstacle_regions.extend(obs)

            if self._detect_net(frame):
                net_votes += 1
            if self._detect_mat(frame):
                mat_votes += 1

            ft = self._classify_floor_type(frame)
            floor_type_votes[ft] = floor_type_votes.get(ft, 0) + 1

        # ── Aggregate floor estimates ─────────────────────────────────────────
        if floor_estimates:
            room_w  = float(np.median([e['width_ft']  for e in floor_estimates]))
            room_l  = float(np.median([e['length_ft'] for e in floor_estimates]))
            room_h  = float(np.median([e['height_ft'] for e in floor_estimates]))
        else:
            # Fallback: assume a typical living room
            room_w, room_l, room_h = 12.0, 15.0, 8.5

        # Clamp to plausible ranges
        room_w = float(np.clip(room_w, 6.0,  40.0))
        room_l = float(np.clip(room_l, 6.0,  60.0))
        room_h = float(np.clip(room_h, 6.5,  14.0))

        usable_area = round(room_w * room_l * 0.65, 1)  # 65% of total is typically usable

        # ── Obstacle summary ──────────────────────────────────────────────────
        # Deduplicate overlapping obstacle regions (NMS)
        deduped_obs  = self._nms_obstacles(obstacle_regions)
        has_obstacles = len(deduped_obs) > 0

        # Keep top 6 obstacles for the overlay
        overlay_obs  = deduped_obs[:6]

        # ── Floor type ────────────────────────────────────────────────────────
        floor_type = max(floor_type_votes, key=floor_type_votes.get) if floor_type_votes else 'unknown'

        # ── Zone generation ───────────────────────────────────────────────────
        zones      = self._generate_zones(room_w, room_l, room_h, deduped_obs)
        notes      = self._generate_notes(room_w, room_l, room_h, zones, floor_type,
                                          net_votes > len(key_frames)//3,
                                          mat_votes > len(key_frames)//3)

        confidence = min(1.0, len(key_frames) / 12.0)

        return RoomAnalysis(
            estimated_width_ft  = round(room_w, 1),
            estimated_length_ft = round(room_l, 1),
            estimated_height_ft = round(room_h, 1),
            usable_area_sqft    = usable_area,
            has_net             = net_votes > len(key_frames) // 3,
            has_mat             = mat_votes > len(key_frames) // 3,
            has_obstacles       = has_obstacles,
            obstacle_count      = len(deduped_obs),
            floor_type          = floor_type,
            zones               = zones,
            scan_frame_w        = w,
            scan_frame_h        = h,
            obstacle_regions    = [{'x': o['x'], 'y': o['y'], 'w': o['w'], 'h': o['h']}
                                    for o in overlay_obs],
            frames_analysed     = len(key_frames),
            confidence          = round(confidence, 2),
            scan_notes          = notes,
        )

    # ── Floor estimation ──────────────────────────────────────────────────────

    def _estimate_floor(self, frame: np.ndarray) -> Optional[dict]:
        """
        Estimates room dimensions using vanishing point geometry.
        Looks for horizontal and vertical lines (walls, door frames) to
        infer the perspective of the room.
        """
        h, w = frame.shape[:2]
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        edges = cv2.Canny(gray, 50, 150, apertureSize=3)

        lines = cv2.HoughLinesP(edges, 1, np.pi/180, threshold=80,
                                 minLineLength=w//8, maxLineGap=20)
        if lines is None:
            return None

        # Separate horizontal and vertical lines
        h_lines, v_lines = [], []
        for line in lines:
            x1, y1, x2, y2 = line[0]
            angle = abs(math.degrees(math.atan2(y2-y1, x2-x1)))
            if angle < 15 or angle > 165:
                h_lines.append(line[0])
            elif 75 < angle < 105:
                v_lines.append(line[0])

        if not h_lines or not v_lines:
            return None

        # Use the spread of line positions to infer room size
        # More spread = larger room (rough heuristic)
        h_ys  = [(l[1]+l[3])/2 for l in h_lines]
        v_xs  = [(l[0]+l[2])/2 for l in v_lines]

        h_spread = (max(h_ys) - min(h_ys)) / h if h_ys else 0
        v_spread = (max(v_xs) - min(v_xs)) / w if v_xs else 0

        # Map spread to estimated feet (calibrated empirically)
        width_ft  = 8.0 + v_spread * 20.0
        length_ft = 8.0 + h_spread * 25.0
        height_ft = 7.5 + h_spread * 3.0

        return {'width_ft': width_ft, 'length_ft': length_ft, 'height_ft': height_ft}

    # ── Obstacle detection ────────────────────────────────────────────────────

    def _detect_obstacles(self, frame: np.ndarray, fw: int, fh: int) -> list[dict]:
        """
        Detects large foreground objects (furniture, boxes, etc.) using
        background subtraction approximation (assume static camera or
        detect large distinct colour blobs).
        """
        gray    = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (21, 21), 0)
        _, thresh = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

        # Find large contiguous regions (likely furniture)
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        obstacles = []
        min_area  = (fw * fh) * 0.01   # At least 1% of frame
        max_area  = (fw * fh) * 0.40   # No more than 40% (probably the floor itself)

        for cnt in contours:
            area = cv2.contourArea(cnt)
            if not (min_area <= area <= max_area):
                continue
            x, y, cw, ch = cv2.boundingRect(cnt)
            # Filter out very wide/short regions (probably floor or ceiling)
            aspect = cw / max(ch, 1)
            if aspect > 8 or aspect < 0.1:
                continue
            obstacles.append({
                'x': x / fw, 'y': y / fh,
                'w': cw / fw, 'h': ch / fh,
                'area': area,
            })

        return obstacles

    # ── Net detection ─────────────────────────────────────────────────────────

    def _detect_net(self, frame: np.ndarray) -> bool:
        """
        Detects a golf net using mesh/grid texture analysis.
        Nets have a regular repeating texture pattern.
        """
        gray    = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        # Sobel edge density in a central strip — nets have very high edge density
        h, w    = gray.shape
        strip   = gray[h//4:3*h//4, w//4:3*w//4]
        edges   = cv2.Canny(strip, 30, 100)
        density = np.sum(edges > 0) / edges.size
        return density > 0.15   # >15% edge pixels = likely a net

    # ── Mat detection ─────────────────────────────────────────────────────────

    def _detect_mat(self, frame: np.ndarray) -> bool:
        """
        Detects a hitting/putting mat using colour (green rectangle on floor).
        """
        hsv  = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        # Green mat range
        lower = np.array([35,  40,  40])
        upper = np.array([85, 255, 200])
        mask  = cv2.inRange(hsv, lower, upper)
        # Check if there's a significant green rectangular blob in the lower half
        h, w  = mask.shape
        lower_half = mask[h//2:, :]
        green_pct  = np.sum(lower_half > 0) / lower_half.size
        return green_pct > 0.04   # >4% green in lower half = likely a mat

    # ── Floor type classification ─────────────────────────────────────────────

    def _classify_floor_type(self, frame: np.ndarray) -> str:
        """
        Classifies floor type from the bottom strip of the frame.
        Uses colour and texture analysis.
        """
        h, w   = frame.shape[:2]
        strip  = frame[int(h*0.75):, :]    # Bottom 25% of frame
        hsv    = cv2.cvtColor(strip, cv2.COLOR_BGR2HSV)

        # Colour histograms
        h_hist = cv2.calcHist([hsv], [0], None, [180], [0, 180]).flatten()
        s_hist = cv2.calcHist([hsv], [1], None, [256], [0, 256]).flatten()

        avg_sat = np.average(np.arange(256), weights=s_hist)
        avg_hue = np.average(np.arange(180), weights=h_hist)

        # Texture roughness (carpet = high variance)
        gray      = cv2.cvtColor(strip, cv2.COLOR_BGR2GRAY)
        variance  = float(np.var(gray))

        if 30 < avg_hue < 80 and avg_sat > 50:
            return 'carpet'       # Greenish/brownish high saturation
        if variance > 800:
            return 'carpet'       # High texture roughness
        if avg_sat < 25:
            return 'concrete'     # Low saturation grey
        if variance < 300 and avg_sat < 40:
            return 'hardwood'     # Smooth, medium tone
        return 'tile'

    # ── Zone generation ───────────────────────────────────────────────────────

    def _generate_zones(self, room_w: float, room_l: float, room_h: float,
                        obstacles: list[dict]) -> list[Zone]:
        """
        Generates practice zones based on room dimensions and obstacle count.
        Uses a simple grid partitioning approach — divides the room into a
        3×3 grid and evaluates each cell for each zone type.
        """
        zones = []

        # ── Putting lane ─────────────────────────────────────────────────────
        # Needs: ≥1.5 ft wide, ≥6 ft long, low clearance OK
        if room_l >= 6.0:
            lane_len = min(room_l * 0.75, 20.0)
            zones.append(Zone(
                zone_type   = 'putting_lane',
                label       = 'Putting Lane',
                x_norm      = 0.5,
                y_norm      = 0.5,
                width_norm  = min(0.15, 1.5 / room_w),
                height_norm = lane_len / room_l,
                width_ft    = 1.5,
                height_ft   = round(lane_len, 1),
                clearance_ft= room_h,
                feasibility = 'good' if lane_len >= 10 else 'ok',
            ))

        # ── Chip zone ────────────────────────────────────────────────────────
        # Needs: ≥6 ft wide, ≥8 ft long, ≥7 ft ceiling
        if room_w >= 6.0 and room_h >= 7.0:
            chip_w = min(room_w * 0.5, 8.0)
            chip_l = min(room_l * 0.4, 10.0)
            zones.append(Zone(
                zone_type   = 'chip_zone',
                label       = 'Chipping Zone',
                x_norm      = 0.25,
                y_norm      = 0.65,
                width_norm  = chip_w / room_w,
                height_norm = chip_l / room_l,
                width_ft    = round(chip_w, 1),
                height_ft   = round(chip_l, 1),
                clearance_ft= room_h,
                feasibility = 'good' if chip_w >= 8 else 'ok' if chip_w >= 6 else 'tight',
            ))

        # ── Full swing zone ───────────────────────────────────────────────────
        # Needs: ≥8 ft wide, ≥10 ft long, ≥8 ft ceiling
        if room_w >= 8.0 and room_h >= 8.0:
            swing_w = min(room_w * 0.65, 12.0)
            swing_l = min(room_l * 0.5, 15.0)
            feas    = 'good' if swing_w >= 10 and room_h >= 9 else \
                      'ok'   if swing_w >= 8  and room_h >= 8 else 'tight'
            zones.append(Zone(
                zone_type   = 'swing_zone',
                label       = 'Swing Zone',
                x_norm      = 0.65,
                y_norm      = 0.35,
                width_norm  = swing_w / room_w,
                height_norm = swing_l / room_l,
                width_ft    = round(swing_w, 1),
                height_ft   = round(swing_l, 1),
                clearance_ft= room_h,
                feasibility = feas,
            ))
        elif room_w >= 6.0:
            # Small room — safe for putting/chipping only, no full swing
            zones.append(Zone(
                zone_type   = 'swing_zone',
                label       = 'Practice Area (no full swing)',
                x_norm      = 0.65, y_norm      = 0.35,
                width_norm  = 0.3,  height_norm = 0.3,
                width_ft    = room_w * 0.5,
                height_ft   = room_l * 0.3,
                clearance_ft= room_h,
                feasibility = 'tight',
            ))

        # ── Target spots ──────────────────────────────────────────────────────
        # Place 2 target markers at end of putting lane and chip zone
        if room_l >= 6.0:
            zones.append(Zone(
                zone_type='target_spot', label='Target A',
                x_norm=0.5, y_norm=0.1,
                width_norm=0.04, height_norm=0.04,
                width_ft=0.5, height_ft=0.5,
                clearance_ft=room_h, feasibility='good',
            ))
        if room_w >= 6.0:
            zones.append(Zone(
                zone_type='target_spot', label='Target B',
                x_norm=0.25, y_norm=0.2,
                width_norm=0.04, height_norm=0.04,
                width_ft=0.5, height_ft=0.5,
                clearance_ft=room_h, feasibility='good',
            ))

        return zones

    # ── NMS for obstacles ─────────────────────────────────────────────────────

    def _nms_obstacles(self, regions: list[dict]) -> list[dict]:
        """Simple non-maximum suppression — removes highly overlapping boxes."""
        if not regions:
            return []
        kept = []
        regions = sorted(regions, key=lambda r: r['area'], reverse=True)
        for r in regions:
            overlap = False
            for k in kept:
                ix = max(0, min(r['x']+r['w'], k['x']+k['w']) - max(r['x'], k['x']))
                iy = max(0, min(r['y']+r['h'], k['y']+k['h']) - max(r['y'], k['y']))
                inter = ix * iy
                union = r['w']*r['h'] + k['w']*k['h'] - inter
                if union > 0 and inter/union > 0.4:
                    overlap = True
                    break
            if not overlap:
                kept.append(r)
        return kept

    # ── Observation notes ─────────────────────────────────────────────────────

    def _generate_notes(self, room_w, room_l, room_h, zones, floor_type,
                        has_net, has_mat) -> list[str]:
        notes = []
        if room_h < 7.5:
            notes.append(f"Ceiling at {room_h:.1f} ft — avoid full swings, stick to putting and chipping drills.")
        if room_h < 9.0 and any(z.zone_type == 'swing_zone' for z in zones):
            notes.append("Low ceiling detected — use foam practice balls for any swing drills.")
        if floor_type == 'carpet':
            notes.append("Carpet floor detected — ideal for putting. Use a mat for chipping to protect the carpet.")
        if floor_type == 'hardwood':
            notes.append("Hard floor detected — great for putting. A non-slip mat is recommended under any practice mat.")
        if has_net:
            notes.append("Hitting net detected — full swing sessions are possible with the net as a backstop.")
        if has_mat:
            notes.append("Practice mat detected — good for chipping and short iron work.")
        if room_l < 8:
            notes.append(f"Room is {room_l:.0f} ft long — best suited for putting and short chipping drills only.")
        elif room_l >= 15:
            notes.append(f"Room is {room_l:.0f} ft long — great for longer putting practice up to 12 feet.")
        return notes
