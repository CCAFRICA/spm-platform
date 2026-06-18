-- ============================================================
-- HF-309 §3.1 (HALT-1) — add profiles.preferences jsonb (per-user display preferences).
--
-- FP-49 schema check (2026-06-18, service-role read): `column profiles.preferences does not
-- exist` → this migration adds it. Stores UI display preferences only, e.g. {"theme":"bliss"}.
--
-- SR-39 disposition (per directive §2): does NOT fire. This column holds presentation-layer
-- data only — NO auth tokens, session ids, access-control data, or tenant-scoped sensitive
-- info. It is NOT an access-control/isolation surface. Existing profiles RLS is unchanged.
--
-- The theme preference is read as profiles.preferences->>'theme'; absent key / '{}' means
-- "no user preference" → the root layout falls through to platform_settings.active_ui_theme
-- (the OB-201 global default), then to 'current'. The column is extensible for future
-- non-auth preferences (locale override, dashboard layout, …) without further schema changes.
--
-- HALT-1: CC authors + commits this file ONLY. The ARCHITECT applies it in the Supabase SQL
-- Editor (VP standing rule: no psql/CLI/exec_sql RPC). CC then verifies via tsx service-role
-- read and resumes §3.2–§3.6. Idempotent (ADD COLUMN IF NOT EXISTS).
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS preferences jsonb NOT NULL DEFAULT '{}';

COMMENT ON COLUMN profiles.preferences IS
  'User display preferences (e.g. {"theme":"bliss"}). Presentation-layer only. No auth/access data.';
