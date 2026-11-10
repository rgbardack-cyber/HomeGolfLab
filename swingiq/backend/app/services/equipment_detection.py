"""
SwingIQ — Equipment Detection Service
========================================
Identifies golf practice equipment from a single photo using two methods:

METHOD 1 — OpenCV colour/shape heuristics (fast, no API call)
  - Putting mat: green rectangle on floor
  - Net: high edge-density mesh texture
  - Alignment sticks: long thin orange/red lines
  - Golf club: long thin dark object, possible shaft glint

METHOD 2 — Claude Vision (accurate, covers edge cases)
  Used as fallback when heuristics aren't confident enough.
  Sends the image as base64 and asks Claude to list detected equipment.

RESULT
------
Returns an EquipmentList with boolean flags for each equipment type,
plus a list of detected items with positions for the room overlay.

EQUIPMENT TYPES
---------------
  net              — full swing net / impact screen
  mat              — chipping or putting mat
  putter           — putter club
  irons            — iron clubs (any)
  driver_fairway   — driver or fairway wood
  alignment_sticks — orange/red alignment rods
  putting_cup      — hole cup / target
  foam_balls       — foam or plastic practice balls
  tee              — golf tee(s)
  chair            — chairs (can be used as targets / obstacles)
"""

import math
import cv2
import base64
import json
import os
import numpy as np
from dataclasses import dataclass, field
from typing import Optional
import anthropic


# ── Data structures ───────────────────────────────────────────────────────────

@dataclass
class DetectedItem:
    name:       str
    confidence: float        # 0–1
    x_norm:     float        # centre x, normalised
    y_norm:     float        # centre y, normalised
    method:     str          # 'cv' | 'ai'


@dataclass
class EquipmentList:
    # Boolean flags — what's present
    has_net:              bool = False
    has_mat:              bool = False
    has_putter:           bool = False
    has_irons:            bool = False
    has_driver:           bool = False
    has_alignment_sticks: bool = False
    has_putting_cup:      bool = False
    has_foam_balls:       bool = False
    has_tees:             bool = False
    has_chairs:           bool = False

    # Detected items with positions (for overlay)
    items: list[DetectedItem] = field(default_factory=list)

    # Practice modes this equipment enables
    enabled_drills: list[str] = field(default_factory=list)

    method_used: str = 'cv'  # 'cv' | 'ai' | 'combined'


# ── Prompt for Claude Vision ──────────────────────────────────────────────────

_VISION_SYSTEM = """You are a golf equipment recognition system.
Given a photo, identify all golf practice equipment visible.
Respond ONLY with a valid JSON object — no markdown, no explanation."""

_VISION_PROMPT = """List all golf practice equipment visible in this photo.

Respond ONLY with this JSON (no other text):
{
  "items": [
    {
      "name": "net|mat|putter|iron|driver|alignment_sticks|putting_cup|foam_balls|tee|chair|other",
      "confidence": 0.0-1.0,
      "x_norm": 0.0-1.0,
      "y_norm": 0.0-1.0
    }
  ],
  "notes": "brief observation about the practice space"
}

If nothing golf-related is visible, return {"items": [], "notes": "no golf equipment detected"}.
Do not include any text outside the JSON object."""


# ── Service ───────────────────────────────────────────────────────────────────

class EquipmentDetectionService:
    """
    Detects golf practice equipment in a photo.

    Usage:
        svc    = EquipmentDetectionService()
        result = svc.detect(image_bytes)
    """

    # Minimum confidence to consider a CV detection reliable
    CV_CONFIDENCE_THRESHOLD = 0.55

    def __init__(self):
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        self._claude = anthropic.Anthropic(api_key=api_key) if api_key else None

    def detect(self, image_bytes: bytes) -> EquipmentList:
        """
        Detects equipment using CV first; escalates to Claude Vision if needed.
        """
        # Decode image
        nparr  = np.frombuffer(image_bytes, np.uint8)
        frame  = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if frame is None:
            raise ValueError("Could not decode image. Supported formats: JPEG, PNG, HEIC.")

        h, w = frame.shape[:2]

        # ── Step 1: CV heuristics ─────────────────────────────────────────────
        cv_items = []
        cv_items += self._detect_net(frame, w, h)
        cv_items += self._detect_mat(frame, w, h)
        cv_items += self._detect_alignment_sticks(frame, w, h)
        cv_items += self._detect_clubs(frame, w, h)
        cv_items += self._detect_foam_balls(frame, w, h)

        # ── Step 2: Claude Vision (if available and CV confidence is low) ────
        ai_items = []
        cv_confident = sum(1 for i in cv_items if i.confidence >= self.CV_CONFIDENCE_THRESHOLD)

        if self._claude and cv_confident < 2:
            try:
                ai_items = self._detect_with_claude(image_bytes)
            except Exception as e:
                print(f"[Equipment] Claude Vision failed: {e}")

        # ── Merge ──────────────────────────────────────────────────────────────
        all_items = cv_items + ai_items
        method    = 'combined' if (cv_items and ai_items) else ('ai' if ai_items else 'cv')
        result    = self._build_result(all_items, method)
        return result

    # ── CV detection methods ──────────────────────────────────────────────────

    def _detect_net(self, frame, w, h) -> list[DetectedItem]:
        """High edge-density region in middle of frame = net."""
        gray    = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        edges   = cv2.Canny(gray, 30, 100)
        # Check upper-centre region (net is usually hanging at back)
        roi     = edges[0:h//2, w//4:3*w//4]
        density = np.sum(roi > 0) / roi.size
        if density > 0.12:
            return [DetectedItem('net', min(0.95, density * 5), 0.5, 0.3, 'cv')]
        return []

    def _detect_mat(self, frame, w, h) -> list[DetectedItem]:
        """Green rectangle in lower half = mat."""
        hsv   = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        lower = np.array([35, 40, 40])
        upper = np.array([85, 255, 200])
        mask  = cv2.inRange(hsv, lower, upper)
        lower_half = mask[h//2:, :]
        pct   = np.sum(lower_half > 0) / lower_half.size
        if pct > 0.03:
            # Find centroid of the green region
            M = cv2.moments(lower_half)
            if M['m00'] > 0:
                cx = M['m10'] / M['m00'] / w
                cy = 0.5 + (M['m01'] / M['m00']) / h / 2
                return [DetectedItem('mat', min(0.9, pct * 15), cx, cy, 'cv')]
        return []

    def _detect_alignment_sticks(self, frame, w, h) -> list[DetectedItem]:
        """Long thin orange/red lines = alignment sticks."""
        hsv    = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        # Orange range
        lower1 = np.array([5,  120, 120])
        upper1 = np.array([20, 255, 255])
        # Red range (wraps in HSV)
        lower2 = np.array([160, 100, 100])
        upper2 = np.array([180, 255, 255])
        mask   = cv2.bitwise_or(
            cv2.inRange(hsv, lower1, upper1),
            cv2.inRange(hsv, lower2, upper2),
        )
        # Find long thin contours
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        items = []
        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area < 50:
                continue
            rect    = cv2.minAreaRect(cnt)
            (cx,cy), (rw,rh), _ = rect
            aspect  = max(rw,rh) / max(min(rw,rh), 1)
            if aspect > 8:   # Long and thin
                items.append(DetectedItem('alignment_sticks', 0.75, cx/w, cy/h, 'cv'))
        return items[:2]  # At most 2 sticks

    def _detect_clubs(self, frame, w, h) -> list[DetectedItem]:
        """Long thin objects (potential clubs) using Hough lines."""
        gray  = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        edges = cv2.Canny(gray, 50, 150)
        lines = cv2.HoughLinesP(edges, 1, np.pi/180, threshold=60,
                                 minLineLength=h//5, maxLineGap=10)
        if lines is None:
            return []
        # Long lines that aren't walls (not perfectly H/V)
        clubs = []
        for line in lines:
            x1,y1,x2,y2 = line[0]
            length = math.hypot(x2-x1, y2-y1)
            angle  = abs(math.degrees(math.atan2(y2-y1, x2-x1)))
            if length > h * 0.3 and 10 < angle < 80:
                cx = (x1+x2)/2/w
                cy = (y1+y2)/2/h
                clubs.append(DetectedItem('putter', 0.55, cx, cy, 'cv'))
        return clubs[:1]

    def _detect_foam_balls(self, frame, w, h) -> list[DetectedItem]:
        """Bright orange/yellow small circles = foam practice balls."""
        hsv   = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        lower = np.array([10, 150, 150])
        upper = np.array([35, 255, 255])
        mask  = cv2.inRange(hsv, lower, upper)
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        items = []
        for cnt in contours:
            area = cv2.contourArea(cnt)
            if 20 < area < 2000:
                perim = cv2.arcLength(cnt, True)
                if perim == 0: continue
                circ = 4 * 3.14159 * area / (perim**2)
                if circ > 0.6:
                    (cx,cy),_ = cv2.minEnclosingCircle(cnt)
                    items.append(DetectedItem('foam_balls', 0.7, cx/w, cy/h, 'cv'))
        return items[:3]

    # ── Claude Vision ─────────────────────────────────────────────────────────

    def _detect_with_claude(self, image_bytes: bytes) -> list[DetectedItem]:
        """Sends the image to Claude for equipment recognition."""
        # Determine media type
        if image_bytes[:3] == b'\xff\xd8\xff':
            media_type = 'image/jpeg'
        elif image_bytes[:8] == b'\x89PNG\r\n\x1a\n':
            media_type = 'image/png'
        else:
            media_type = 'image/jpeg'

        b64 = base64.standard_b64encode(image_bytes).decode('utf-8')

        message = self._claude.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=500,
            system=_VISION_SYSTEM,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": b64}},
                    {"type": "text",  "text": _VISION_PROMPT},
                ],
            }],
        )

        raw = message.content[0].text.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1].lstrip("json").strip()

        parsed = json.loads(raw)
        items  = []
        for item in parsed.get("items", []):
            items.append(DetectedItem(
                name       = item.get("name", "unknown"),
                confidence = float(item.get("confidence", 0.7)),
                x_norm     = float(item.get("x_norm", 0.5)),
                y_norm     = float(item.get("y_norm", 0.5)),
                method     = 'ai',
            ))
        return items

    # ── Result builder ────────────────────────────────────────────────────────

    def _build_result(self, items: list[DetectedItem], method: str) -> EquipmentList:
        """Converts a list of DetectedItems into an EquipmentList."""
        names = {i.name for i in items if i.confidence >= 0.5}

        result = EquipmentList(
            has_net              = 'net'              in names,
            has_mat              = 'mat'              in names,
            has_putter           = 'putter'           in names,
            has_irons            = 'iron'             in names,
            has_driver           = 'driver'           in names,
            has_alignment_sticks = 'alignment_sticks' in names,
            has_putting_cup      = 'putting_cup'      in names,
            has_foam_balls       = 'foam_balls'       in names,
            has_tees             = 'tee'              in names,
            has_chairs           = 'chair'            in names,
            items                = items,
            method_used          = method,
        )

        # Derive enabled drills from equipment
        drills = ['putting']  # Always possible
        if result.has_mat or result.has_irons:
            drills.append('chipping')
        if result.has_net and (result.has_mat or result.has_irons):
            drills.append('full_swing')
        if result.has_alignment_sticks:
            drills.extend(['alignment_drill', 'path_drill'])
        if result.has_putting_cup:
            drills.append('holing_out')
        if result.has_foam_balls:
            drills.append('indoor_chipping')

        result.enabled_drills = list(set(drills))
        return result
