# SwingIQ Backend — Dockerfile
# Build:   docker build -t swingiq-backend .
# Run:     docker run -p 8000:8000 --env-file .env swingiq-backend

FROM python:3.11-slim

# System deps needed by OpenCV and MediaPipe
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first (layer-cached unless requirements change)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source
COPY . .

# Create session storage dir
RUN mkdir -p /tmp/swingiq_sessions

EXPOSE 8000

# Run with 2 workers for MVP; increase for production
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
