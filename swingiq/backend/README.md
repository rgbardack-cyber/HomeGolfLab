# SwingIQ — AI Swing Analysis Backend

A lean, production-ready REST API that accepts a golf swing video and returns
AI-generated coaching feedback. Built with FastAPI, MediaPipe, and Claude AI.

---

## How it works

```
Mobile App
    │
    │  POST /api/v1/analyze
    │  (multipart: video file + metadata)
    ▼
┌─────────────────────────────────────────┐
│          FastAPI Application            │
│                                         │
│  1. Validate file type & size           │
│                                         │
│  2. PoseAnalysisService                 │
│     • OpenCV reads video frame-by-frame │
│     • MediaPipe extracts 33 landmarks   │
│     • Identifies 4 key event frames:    │
│       ADDRESS → TOP → IMPACT → FOLLOW  │
│     • Computes 9 swing metrics          │
│                                         │
│  3. AICoachingService                   │
│     • Formats metrics into a prompt     │
│     • Calls Claude claude-sonnet-4-20250514         │
│     • Parses JSON response              │
│     • Maps to FeedbackItem models       │
│                                         │
│  4. Returns AnalysisResponse JSON       │
│     • session_id (for retrieval)        │
│     • overall_score (0–100)             │
│     • metrics (raw numbers)             │
│     • feedback (3–5 coaching items)     │
│     • summary + next_session_focus      │
└─────────────────────────────────────────┘
```

---

## Quick start (local)

### 1. Prerequisites

- Python 3.11+
- pip

### 2. Clone and install

```bash
git clone https://github.com/your-org/swingiq-backend.git
cd swingiq-backend

python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate

pip install -r requirements.txt
```

### 3. Set your API key

```bash
cp .env.example .env
# Open .env and set ANTHROPIC_API_KEY=sk-ant-your-key-here
```

Get your key at https://console.anthropic.com

### 4. Run the server

```bash
uvicorn app.main:app --reload --port 8000
```

The API is now live at http://localhost:8000

Interactive docs: http://localhost:8000/docs

### 5. Test with a real video

```bash
curl -X POST http://localhost:8000/api/v1/analyze \
  -F "video=@/path/to/swing.mp4" \
  -F "player_name=Alex Rivera" \
  -F "skill_level=intermediate" \
  -F "club_used=7-iron"
```

---

## API reference

### `POST /api/v1/analyze`

Analyse a swing video.

**Form fields**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `video` | file | ✅ | MP4, MOV, or AVI — max 100 MB |
| `player_name` | string | ✅ | Player's name |
| `skill_level` | string | ✅ | `beginner` / `intermediate` / `advanced` |
| `club_used` | string | ✅ | E.g. `7-iron`, `driver`, `wedge` |
| `known_issues` | string | ❌ | Comma-separated, e.g. `early extension,weak grip` |

**Response** — `AnalysisResponse`

```json
{
  "session_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "player_name": "Alex Rivera",
  "club_used": "7-iron",
  "overall_score": 74,
  "metrics": {
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
    "frames_per_second": 30.0
  },
  "feedback": [
    {
      "severity": "fix",
      "category": "posture",
      "title": "Early extension at impact",
      "detail": "Your hips are moving toward the ball through impact...",
      "drill": "Wall drill — stand 6 inches from a wall and practice hip hinge."
    }
  ],
  "summary": "Your tempo is a real strength...",
  "next_session_focus": ["Hip hinge drills", "Weight transfer", "Gate putting"],
  "processing_time_seconds": 9.4
}
```

### `GET /api/v1/sessions/{session_id}`

Retrieve a previously stored analysis. Use this to show history without re-processing.

### `GET /health/`

Returns `{"status": "ok"}`. Use for load balancer health checks.

---

## Running tests

```bash
pytest tests/ -v
```

The test suite includes:
- **Unit tests** for geometry helpers (no video needed)
- **Metric bound tests** with synthetic landmark data
- **Mocked AI tests** for the coaching service (no API key needed)
- **API integration tests** with both services mocked

---

## Project structure

```
swingiq-backend/
├── app/
│   ├── main.py                  # FastAPI app, CORS, routers
│   ├── api/
│   │   ├── analysis.py          # POST /analyze, GET /sessions
│   │   └── health.py            # GET /health
│   ├── models/
│   │   └── analysis.py          # Pydantic request/response schemas
│   └── services/
│       ├── pose_analysis.py     # MediaPipe video processing
│       └── ai_coaching.py       # Claude API integration
├── tests/
│   └── test_analysis.py         # Full test suite
├── requirements.txt
├── Dockerfile
├── .env.example
└── README.md
```

---

## Deployment

### Option A — Railway (easiest, ~5 minutes)

1. Push code to GitHub
2. Go to https://railway.app → New Project → Deploy from GitHub
3. Add environment variable: `ANTHROPIC_API_KEY`
4. Railway auto-detects the Dockerfile and deploys

Cost: ~$5–10/month for MVP traffic.

### Option B — Docker on any VPS (DigitalOcean, Hetzner, etc.)

```bash
docker build -t swingiq-backend .
docker run -d \
  -p 8000:8000 \
  --env-file .env \
  --restart unless-stopped \
  swingiq-backend
```

### Option C — AWS (production scale)

Use AWS App Runner or ECS Fargate with the Dockerfile.
Add an S3 bucket for video storage (see `.env.example`) and
RDS PostgreSQL to replace the local JSON session store.

---

## Improving accuracy over time

The MVP uses geometry-based approximations for metrics like club path and face
angle. To improve accuracy:

1. **Add shaft detection** — use a colour-threshold + Hough line detector on
   each frame to track the actual club shaft, not just wrist position.

2. **Fine-tune a custom model** — collect labelled swing videos and fine-tune
   a pose classification model for golfer-specific joint angles.

3. **Use a depth camera or multi-angle input** — MediaPipe gives 3-D landmark
   estimates but accuracy improves significantly with a second camera angle
   (face-on + down-the-line).

4. **Feedback loop** — store player ratings of the AI feedback, use thumbs-up/down
   data to prompt-engineer better coaching over time.

---

## Next modules to build

| Module | Effort | Notes |
|--------|--------|-------|
| Ball tracking service | Medium | OpenCV frame differencing + trajectory fitting |
| Space mapping service | Medium | ARKit/ARCore on-device; backend stores the map |
| Challenge system | Medium | Stripe Connect for entry fees + escrow |
| React Native app | Large | Expo + expo-camera for video capture |
| Auth + user profiles | Small | Supabase Auth is the fastest option |
| Push notifications | Small | Expo Notifications for daily practice reminders |
