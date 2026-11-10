-- ============================================================
-- SwingIQ — Supabase Database Schema
-- ============================================================
-- Run this in your Supabase project:
--   Dashboard → SQL Editor → New Query → paste & run
--
-- Tables:
--   profiles          — extends auth.users (one row per user)
--   swing_sessions    — every analysed swing
--   challenge_entries — monthly challenge registrations
--   daily_uploads     — per-day challenge video submissions
-- ============================================================


-- ── Enable UUID extension (already on in Supabase, just in case) ─────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ── profiles ─────────────────────────────────────────────────────────────────
-- One row per auth user. Created automatically via trigger on signup.

CREATE TABLE IF NOT EXISTS public.profiles (
    id              UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name    TEXT        NOT NULL DEFAULT '',
    skill_level     TEXT        NOT NULL DEFAULT 'intermediate'
                                CHECK (skill_level IN ('beginner','intermediate','advanced')),
    handicap        NUMERIC(4,1),               -- e.g. 14.2, NULL if unknown
    avatar_color    TEXT        NOT NULL DEFAULT '#1a6b3a',   -- hex for avatar background
    total_sessions  INTEGER     NOT NULL DEFAULT 0,
    best_score      INTEGER,
    practice_streak INTEGER     NOT NULL DEFAULT 0,
    last_active_at  TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger: auto-create a profile row whenever a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, display_name)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger: keep updated_at current
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ── swing_sessions ────────────────────────────────────────────────────────────
-- Every swing analysis result, including the full AI feedback JSON.

CREATE TABLE IF NOT EXISTS public.swing_sessions (
    id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    club_used           TEXT        NOT NULL,
    overall_score       INTEGER     NOT NULL CHECK (overall_score BETWEEN 0 AND 100),
    summary             TEXT        NOT NULL DEFAULT '',
    next_session_focus  TEXT[]      NOT NULL DEFAULT '{}',
    -- Metrics stored as flat columns for easy querying/charting
    club_path_degrees       NUMERIC(5,2),
    face_angle_degrees      NUMERIC(5,2),
    spine_angle_address     NUMERIC(5,2),
    spine_angle_impact      NUMERIC(5,2),
    hip_turn_degrees        NUMERIC(5,2),
    shoulder_turn_degrees   NUMERIC(5,2),
    tempo_ratio             NUMERIC(4,2),
    weight_transfer_pct     NUMERIC(5,2),
    swing_plane_deviation   NUMERIC(5,2),
    frames_analyzed         INTEGER,
    -- Full feedback JSON (array of FeedbackItem objects)
    feedback            JSONB       NOT NULL DEFAULT '[]',
    processing_time_sec NUMERIC(6,2),
    recorded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fetching a user's sessions chronologically
CREATE INDEX IF NOT EXISTS idx_swing_sessions_user_date
    ON public.swing_sessions (user_id, recorded_at DESC);

-- Trigger: update profile stats when a new session is saved
CREATE OR REPLACE FUNCTION public.update_profile_stats()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.profiles
    SET
        total_sessions = total_sessions + 1,
        best_score     = GREATEST(COALESCE(best_score, 0), NEW.overall_score),
        last_active_at = NOW()
    WHERE id = NEW.user_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER swing_session_inserted
    AFTER INSERT ON public.swing_sessions
    FOR EACH ROW EXECUTE FUNCTION public.update_profile_stats();


-- ── challenge_entries ─────────────────────────────────────────────────────────
-- One row per user per monthly challenge they entered.

CREATE TABLE IF NOT EXISTS public.challenge_entries (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    challenge_slug  TEXT        NOT NULL,   -- e.g. 'june-2025-short-game'
    challenge_name  TEXT        NOT NULL,
    entry_fee_cents INTEGER     NOT NULL DEFAULT 1500,
    total_points    INTEGER     NOT NULL DEFAULT 0,
    daily_streak    INTEGER     NOT NULL DEFAULT 0,
    rank            INTEGER,                -- computed nightly via cron
    paid_at         TIMESTAMPTZ,
    prize_paid_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, challenge_slug)
);

CREATE INDEX IF NOT EXISTS idx_challenge_entries_slug
    ON public.challenge_entries (challenge_slug, total_points DESC);


-- ── daily_uploads ─────────────────────────────────────────────────────────────
-- One row per daily video submission in a challenge.

CREATE TABLE IF NOT EXISTS public.daily_uploads (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    entry_id        UUID        NOT NULL REFERENCES public.challenge_entries(id) ON DELETE CASCADE,
    user_id         UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    upload_date     DATE        NOT NULL,
    video_url       TEXT,
    shots_made      INTEGER     NOT NULL DEFAULT 0 CHECK (shots_made BETWEEN 0 AND 10),
    points_earned   INTEGER     NOT NULL DEFAULT 0,
    bonus_earned    INTEGER     NOT NULL DEFAULT 0,
    reviewed_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (entry_id, upload_date)
);


-- ── Row Level Security ────────────────────────────────────────────────────────
-- Each user can only see and modify their own data.

ALTER TABLE public.profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.swing_sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_entries  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_uploads      ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "Users can read own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

-- swing_sessions
CREATE POLICY "Users can read own sessions"
    ON public.swing_sessions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sessions"
    ON public.swing_sessions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own sessions"
    ON public.swing_sessions FOR DELETE
    USING (auth.uid() = user_id);

-- challenge_entries — leaderboard is public, entries are private
CREATE POLICY "Anyone can view challenge leaderboard"
    ON public.challenge_entries FOR SELECT
    USING (true);

CREATE POLICY "Users can insert own entries"
    ON public.challenge_entries FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own entries"
    ON public.challenge_entries FOR UPDATE
    USING (auth.uid() = user_id);

-- daily_uploads
CREATE POLICY "Users can manage own uploads"
    ON public.daily_uploads FOR ALL
    USING (auth.uid() = user_id);
