"""
SwingIQ — AI Coaching Service
==============================
Takes the raw SwingMetrics dict produced by PoseAnalysisService and sends it
to the Anthropic Claude API to generate structured, personalised coaching
feedback.

WHY CLAUDE?
-----------
The pose analysis gives us *numbers* (e.g. tempo_ratio=2.1, face_angle=+3.2°).
Claude turns those numbers into *coaching* — explaining what they mean for this
specific player at their skill level, which issues to prioritise, and concrete
drills to fix each problem.  This is the layer that makes the app feel like a
real coach rather than a spreadsheet.

PROMPT DESIGN
-------------
We use a system prompt that primes Claude as a PGA-level golf instructor, then
a user prompt that passes:
  - the raw metrics as a structured block
  - the player's skill level and known issues
  - an instruction to return ONLY valid JSON (no markdown fences)

We parse the JSON response and map it to our FeedbackItem model list.
"""

import json
import os
import anthropic
from app.models.analysis import FeedbackItem


# The model to use. claude-sonnet gives the best balance of quality and speed.
CLAUDE_MODEL = "claude-sonnet-4-20250514"

# ── Prompt templates ──────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are an expert PGA-certified golf instructor with 20 years
of experience coaching players from beginner to tour level.

You will receive biomechanical data extracted from a golf swing video by a
computer vision system.  Your job is to:
1. Interpret what each metric means for the player's ball flight and consistency.
2. Prioritise the most impactful issues to fix first (max 5 feedback items).
3. Provide a specific, actionable drill for each issue.
4. Give an overall swing score from 0–100.
5. Write a short, encouraging plain-English summary (2–3 sentences).
6. List 2–3 focus areas for the next practice session.

IMPORTANT: Respond with ONLY a valid JSON object — no markdown fences, no
explanatory text before or after.  Use exactly the schema described by the user.
"""

def _build_user_prompt(metrics: dict, skill_level: str, club: str,
                       known_issues: list[str] | None) -> str:
    issues_str = (
        "None reported"
        if not known_issues
        else ", ".join(known_issues)
    )

    return f"""Analyse this golf swing and return a JSON coaching report.

PLAYER CONTEXT
--------------
Skill level : {skill_level}
Club used   : {club}
Known issues: {issues_str}

SWING METRICS (from computer vision)
--------------------------------------
Club path              : {metrics['club_path_degrees']:+.1f}°  (+ = in-to-out, - = out-to-in; ideal ≈ 0°)
Face angle at impact   : {metrics['face_angle_degrees']:+.1f}°  (+ = open, - = closed; ideal = 0°)
Spine angle at address : {metrics['spine_angle_address']:.1f}°
Spine angle at impact  : {metrics['spine_angle_impact']:.1f}°  (delta = {metrics['spine_angle_impact'] - metrics['spine_angle_address']:+.1f}°)
Hip turn (at top)      : {metrics['hip_turn_degrees']:.1f}°    (ideal = 45°)
Shoulder turn (at top) : {metrics['shoulder_turn_degrees']:.1f}°  (ideal = 90°)
Tempo ratio            : {metrics['tempo_ratio']:.2f}:1        (ideal ≈ 3.0:1)
Weight transfer        : {metrics['weight_transfer_pct']:.0f}% on lead foot at impact  (ideal = 80%+)
Swing plane deviation  : {metrics['swing_plane_deviation']:+.1f}°  (ideal = 0°)
Frames analysed        : {metrics['total_frames_analyzed']} @ {metrics['frames_per_second']:.0f} fps

REQUIRED JSON SCHEMA
---------------------
{{
  "overall_score": <integer 0–100>,
  "summary": "<2–3 sentence plain-English summary for the player>",
  "next_session_focus": ["<focus 1>", "<focus 2>", "<focus 3>"],
  "feedback": [
    {{
      "severity": "<fix | improve | good>",
      "category": "<posture | grip | swing_path | tempo | impact | weight_transfer>",
      "title": "<short title, max 8 words>",
      "detail": "<1–2 sentences explaining the issue and its effect on ball flight>",
      "drill": "<specific drill name and brief 1-sentence instruction>"
    }}
  ]
}}

Rules:
- Return 3–5 feedback items, ordered from most to least impactful.
- At least one item should be "good" (a genuine strength to reinforce).
- Tailor language complexity to the skill level ({skill_level}).
- Drills must be practicable indoors or in a small space.
- Do NOT include any text outside the JSON object.
"""


# ── Service class ─────────────────────────────────────────────────────────────

class AICoachingService:
    """
    Wraps the Anthropic API call and parses the response.

    Usage
    -----
        coach = AICoachingService()
        result = coach.generate_feedback(metrics, skill_level, club, known_issues)
    """

    def __init__(self):
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            raise EnvironmentError(
                "ANTHROPIC_API_KEY environment variable is not set. "
                "Add it to your .env file or deployment config."
            )
        self._client = anthropic.Anthropic(api_key=api_key)

    def generate_feedback(
        self,
        metrics: dict,
        skill_level: str,
        club: str,
        known_issues: list[str] | None = None,
    ) -> dict:
        """
        Calls Claude and returns a dict with keys:
            overall_score, summary, next_session_focus, feedback (list of FeedbackItem)
        """
        user_prompt = _build_user_prompt(metrics, skill_level, club, known_issues)

        message = self._client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
        )

        raw_text = message.content[0].text.strip()

        # Strip accidental markdown fences if the model adds them despite instructions
        if raw_text.startswith("```"):
            raw_text = raw_text.split("```")[1]
            if raw_text.startswith("json"):
                raw_text = raw_text[4:]

        try:
            parsed = json.loads(raw_text)
        except json.JSONDecodeError as exc:
            raise ValueError(
                f"Claude returned invalid JSON. Raw response:\n{raw_text}"
            ) from exc

        # Validate and coerce feedback items into FeedbackItem models
        feedback_items = [FeedbackItem(**item) for item in parsed["feedback"]]

        return {
            "overall_score":      int(parsed["overall_score"]),
            "summary":            parsed["summary"],
            "next_session_focus": parsed["next_session_focus"],
            "feedback":           feedback_items,
        }
