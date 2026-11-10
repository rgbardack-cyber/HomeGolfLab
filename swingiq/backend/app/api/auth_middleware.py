"""
SwingIQ Backend — Supabase JWT Auth Middleware
===============================================
Verifies the Supabase JWT token on every protected API endpoint.

HOW IT WORKS
------------
1.  The mobile app includes the Supabase access token in every request header:
        Authorization: Bearer <supabase_access_token>

2.  This middleware calls Supabase's /auth/v1/user endpoint to validate the
    token and extract the user's ID.

3.  The user_id is injected into the FastAPI request state so any endpoint
    can call:
        user_id = request.state.user_id

4.  If the token is missing or invalid, a 401 is returned immediately.

PROTECTED ROUTES
----------------
Use the get_current_user dependency on any endpoint you want to protect:

    @router.post("/analyze")
    async def analyze_swing(
        request: Request,
        video: UploadFile = File(...),
        user = Depends(get_current_user),   # <-- add this
    ):
        user_id = user["id"]

SETUP
-----
Add to your .env file:
    SUPABASE_URL=https://xxxx.supabase.co
    SUPABASE_SERVICE_ROLE_KEY=eyJ...    # from Supabase Dashboard → Settings → API
"""

import os
import httpx
from functools import lru_cache
from fastapi import Request, HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

# ── Config ────────────────────────────────────────────────────────────────────

SUPABASE_URL              = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

if not SUPABASE_URL:
    import warnings
    warnings.warn("SUPABASE_URL not set — auth middleware will not work")

# ── Bearer token extractor ────────────────────────────────────────────────────

_bearer_scheme = HTTPBearer(auto_error=False)

# ── Token verification ────────────────────────────────────────────────────────

async def verify_supabase_token(token: str) -> dict:
    """
    Calls Supabase's /auth/v1/user endpoint with the user's Bearer token.
    Returns the user dict { id, email, ... } if valid.
    Raises HTTPException 401 if invalid.

    We use httpx.AsyncClient for non-blocking I/O (important in async FastAPI).
    """
    url = f"{SUPABASE_URL}/auth/v1/user"
    headers = {
        "Authorization": f"Bearer {token}",
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
    }

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.get(url, headers=headers)
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Could not reach Supabase auth service: {exc}",
        )

    if response.status_code == 200:
        return response.json()

    if response.status_code == 401:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session. Please sign in again.",
        )

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=f"Auth verification failed ({response.status_code})",
    )


# ── FastAPI dependency ────────────────────────────────────────────────────────

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
) -> dict:
    """
    FastAPI dependency — inject on any endpoint to require authentication.

    Returns the Supabase user dict:
        { "id": "uuid", "email": "...", "role": "authenticated", ... }

    Usage:
        @router.post("/analyze")
        async def analyze(user = Depends(get_current_user)):
            user_id = user["id"]
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No authorization token provided.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return await verify_supabase_token(credentials.credentials)


# ── Optional auth (doesn't fail if no token) ─────────────────────────────────

async def get_optional_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
) -> dict | None:
    """
    Like get_current_user but returns None instead of raising 401.
    Use for endpoints that work for both authenticated and anonymous users.
    """
    if credentials is None:
        return None
    try:
        return await verify_supabase_token(credentials.credentials)
    except HTTPException:
        return None
