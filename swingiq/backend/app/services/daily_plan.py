"""
SwingIQ — Daily Practice Plan Generator
=========================================
Uses Claude to generate a personalised 10–15 minute daily training session
based on:
  - Available space (room dimensions, zones)
  - Available equipment (from EquipmentDetectionService)
  - Player profile (skill level, handicap, known weaknesses)
  - Recent swing analysis feedback (from past sessions)
  - Day of the week (vary drills to prevent staleness)

OUTPUT FORMAT
-------------
Returns a DailyPlan with a list of DrillBlock objects, each containing:
  - Drill name + description
  - Duration (minutes)
  - Reps or distance target
  - Equipment needed
  - Coaching cue (one key tip)
  - Difficulty (1–5)
  - Zone it should be performed in

PROMPT DESIGN
-------------
We give Claude a structured context block (space data + player data) and
ask it to return only JSON following a strict schema.
The plan is adaptive:
  - Short room (< 8 ft) → no chipping, more putting variations
  - No equipment → bodyweight drills, mirror work, grip exercises
  - Low ceiling → foam ball swings only
  - Advanced player → more challenging targets and sequences
  - Beginner → fundamentals-heavy, shorter reps
"""

import json
import os
from dataclasses import dataclass, field
from datetime import datetime
import anthropic

from app.services.room_analysis import RoomAnalysis, Zone
from app.services.equipment_detection import EquipmentList


# ── Data structures ───────────────────────────────────────────────────────────

@dataclass
class DrillBlock:
    order:          int
    name:           str
    description:    str
    duration_min:   int
    reps_or_target: str        # e.g. "20 putts" or "10 consecutive"
    equipment:      list[str]  # e.g. ["putter", "cup"]
    coaching_cue:   str        # One key tip
    difficulty:     int        # 1–5
    zone_type:      str        # 'putting_lane' | 'chip_zone' | 'swing_zone' | 'anywhere'
    is_warm_up:     bool = False
    is_cool_down:   bool = False


@dataclass
class DailyPlan:
    plan_date:       str          # ISO date
    total_minutes:   int
    theme:           str          # e.g. "Putting Consistency Day"
    intro:           str          # 1–2 sentence motivational intro
    drills:          list[DrillBlock]
    equipment_needed: list[str]
    space_note:      str          # e.g. "Using your 12×15 ft living room"
    generated_by:    str = 'claude'


# ── Prompt builder ────────────────────────────────────────────────────────────

def _build_prompt(
    room:       RoomAnalysis,
    equipment:  EquipmentList,
    skill_level: str,
    handicap:   float | None,
    recent_feedback: list[str],
    day_of_week: str,
) -> str:
    zone_summary = []
    for z in room.zones:
        zone_summary.append(
            f"  - {z.label}: {z.width_ft}×{z.height_ft} ft, clearance {z.clearance_ft:.0f} ft, feasibility={z.feasibility}"
        )

    equip_flags = []
    if room.has_net:              equip_flags.append("hitting net")
    if room.has_mat:              equip_flags.append("practice mat")
    if equipment.has_putter:      equip_flags.append("putter")
    if equipment.has_irons:       equip_flags.append("irons")
    if equipment.has_driver:      equip_flags.append("driver")
    if equipment.has_alignment_sticks: equip_flags.append("alignment sticks")
    if equipment.has_putting_cup: equip_flags.append("putting cup/target")
    if equipment.has_foam_balls:  equip_flags.append("foam balls")
    if not equip_flags:           equip_flags.append("no equipment detected")

    feedback_str = "\n".join(f"  - {f}" for f in recent_feedback) if recent_feedback else "  - No recent analysis data"

    hcp_str = f"{handicap}" if handicap is not None else "unknown"

    return f"""Generate a personalised golf practice session for a player with the following setup.

PLAYER PROFILE
--------------
Skill level : {skill_level}
Handicap    : {hcp_str}
Day         : {day_of_week}

PRACTICE SPACE
--------------
Room size   : {room.estimated_width_ft} × {room.estimated_length_ft} ft
Ceiling     : {room.estimated_height_ft} ft
Floor type  : {room.floor_type}
Usable area : {room.usable_area_sqft} sq ft
Space notes : {'; '.join(room.scan_notes) if room.scan_notes else 'none'}

AVAILABLE ZONES
---------------
{chr(10).join(zone_summary) if zone_summary else '  - No zones identified'}

AVAILABLE EQUIPMENT
-------------------
{', '.join(equip_flags)}

RECENT AI COACHING FEEDBACK (areas to work on)
-----------------------------------------------
{feedback_str}

INSTRUCTIONS
------------
- Create a 10–15 minute practice session (5–7 drills)
- Include a 1–2 min warm-up and 1 min cool-down
- Vary drills based on the day ({day_of_week}) to prevent repetition
- ONLY include drills possible in this space with this equipment
- If ceiling < 7.5 ft, NO full swing drills (foam balls only for anything above a chip)
- If no mat and no net, NO chipping drills with real balls
- Tailor difficulty and coaching language to the skill level
- Each drill should address a specific weakness from the feedback if possible
- Make the plan feel fresh and engaging, not generic

REQUIRED JSON SCHEMA (return ONLY this, no other text):
{{
  "theme": "<3-5 word session theme>",
  "intro": "<1-2 motivational sentences for the player>",
  "total_minutes": <10-15>,
  "space_note": "<one sentence describing how the space is being used>",
  "equipment_needed": ["<item>", ...],
  "drills": [
    {{
      "order": 1,
      "name": "<drill name>",
      "description": "<2-3 sentence clear instruction>",
      "duration_min": <1-4>,
      "reps_or_target": "<e.g. '20 putts' or '3 sets of 10'>",
      "equipment": ["<item>", ...],
      "coaching_cue": "<one key tip, max 15 words>",
      "difficulty": <1-5>,
      "zone_type": "<putting_lane|chip_zone|swing_zone|anywhere>",
      "is_warm_up": false,
      "is_cool_down": false
    }}
  ]
}}

Return ONLY the JSON object. No markdown fences, no preamble."""


# ── Generator service ─────────────────────────────────────────────────────────

class DailyPlanGenerator:
    """
    Generates a personalised daily practice plan using Claude.

    Usage:
        gen  = DailyPlanGenerator()
        plan = gen.generate(room, equipment, skill_level='intermediate',
                            handicap=14.2, recent_feedback=[...])
    """

    def __init__(self):
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            raise EnvironmentError("ANTHROPIC_API_KEY not set")
        self._client = anthropic.Anthropic(api_key=api_key)

    def generate(
        self,
        room:            RoomAnalysis,
        equipment:       EquipmentList,
        skill_level:     str = 'intermediate',
        handicap:        float | None = None,
        recent_feedback: list[str] | None = None,
    ) -> DailyPlan:
        """Calls Claude and returns a fully structured DailyPlan."""
        day_of_week = datetime.now().strftime('%A')
        prompt      = _build_prompt(
            room, equipment, skill_level, handicap,
            recent_feedback or [], day_of_week,
        )

        message = self._client.messages.create(
            model      = "claude-sonnet-4-20250514",
            max_tokens = 2000,
            messages   = [{"role": "user", "content": prompt}],
        )

        raw = message.content[0].text.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1].lstrip("json").strip()

        try:
            data = json.loads(raw)
        except json.JSONDecodeError as e:
            raise ValueError(f"Claude returned invalid JSON: {e}\n\nRaw:\n{raw}")

        drills = [DrillBlock(**d) for d in data["drills"]]

        return DailyPlan(
            plan_date        = datetime.now().date().isoformat(),
            total_minutes    = int(data["total_minutes"]),
            theme            = data["theme"],
            intro            = data["intro"],
            drills           = drills,
            equipment_needed = data["equipment_needed"],
            space_note       = data["space_note"],
        )

    def generate_fallback(
        self,
        room: RoomAnalysis,
        equipment: EquipmentList,
        skill_level: str = 'intermediate',
    ) -> DailyPlan:
        """
        Returns a hardcoded plan when the Claude API is unavailable.
        Used as a safety net so the app never shows an empty plan.
        """
        has_space_for_chip = room.estimated_length_ft >= 8 and room.estimated_height_ft >= 7.0
        has_space_for_putt = room.estimated_length_ft >= 6

        drills = [
            DrillBlock(
                order=1, name="Grip & Setup Check", is_warm_up=True,
                description="Stand in front of a mirror. Check your grip pressure (should be 4/10), stance width (shoulder-width), and ball position. Hold your address position for 10 seconds.",
                duration_min=2, reps_or_target="3 × 10-second holds",
                equipment=[], coaching_cue="Grip pressure: light enough to hold a tube of toothpaste without squeezing it.",
                difficulty=1, zone_type='anywhere',
            ),
        ]

        if has_space_for_putt and equipment.has_putter:
            drills.append(DrillBlock(
                order=2, name="Gate Putting",
                description="Place two tees 1 inch wider than your putter head. Stroke 10 putts without touching the tees. Move back 1 foot each set.",
                duration_min=4, reps_or_target="3 sets of 10 putts",
                equipment=["putter", "tees"],
                coaching_cue="Eyes directly over the ball. Feel the pendulum.", difficulty=2,
                zone_type='putting_lane',
            ))

        if has_space_for_chip and (equipment.has_mat or equipment.has_foam_balls):
            drills.append(DrillBlock(
                order=3, name="Chip to Target",
                description="Set a target 6–8 feet away (a cup, towel, or tee). Hit 10 chips trying to land the ball within 1 foot of the target. Use a consistent setup.",
                duration_min=4, reps_or_target="10 chips, 3 rounds",
                equipment=["mat" if equipment.has_mat else "foam_balls", "target"],
                coaching_cue="Weight forward, shaft lean at impact — hands lead the clubhead.",
                difficulty=2, zone_type='chip_zone',
            ))

        drills.append(DrillBlock(
            order=len(drills)+1, name="Rotation Stretch", is_cool_down=True,
            description="Stand tall, cross arms over chest, and slowly rotate to 90° on each side. Feel your core and hips releasing.",
            duration_min=1, reps_or_target="10 slow rotations each side",
            equipment=[], coaching_cue="Breathe out on each rotation.",
            difficulty=1, zone_type='anywhere',
        ))

        total = sum(d.duration_min for d in drills)
        return DailyPlan(
            plan_date='today', total_minutes=total,
            theme="Fundamentals & Feel",
            intro=f"A solid {total}-minute session focusing on the basics that separate good golfers from great ones.",
            drills=drills,
            equipment_needed=[e for e in ['putter','mat','tees','foam_balls'] if getattr(equipment, f'has_{e}', False)],
            space_note=f"Using your {room.estimated_width_ft:.0f}×{room.estimated_length_ft:.0f} ft space.",
        )
