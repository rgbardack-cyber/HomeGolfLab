"""
SwingIQ — AI Swing Analysis Backend
Entry point for the FastAPI application.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import analysis, health, tracking, space

app = FastAPI(
    title="SwingIQ API",
    description="AI-powered golf swing analysis backend",
    version="0.1.0",
)

# Allow requests from your mobile app and local dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Tighten this to your app domain before going live
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/health", tags=["health"])
app.include_router(analysis.router, prefix="/api/v1", tags=["analysis"])
app.include_router(tracking.router, prefix="/api/v1/track", tags=["tracking"])
app.include_router(space.router, prefix="/api/v1/space", tags=["space"])
