-- ============================================================
-- OB-201 Phase 3a (HALT-1) — seed the global app-UI theme setting.
--
-- FP-49 SQL Verification Gate (run 2026-06-18, service-role read):
--   platform_settings columns = [id, key, value, description, updated_by, updated_at, created_at]
--   active_ui_theme present = NO (seed needed)
--
-- Adds ONE row to the existing global platform_settings key/value store. `value` is a jsonb
-- string ("current" | "bliss"); the root layout reads it server-side and emits
-- <html data-theme="{value}">. Default "current" ⇒ the deploy is visually inert until an
-- operator flips it in the Observatory.
--
-- HALT-1: CC authors + commits this file ONLY. The ARCHITECT applies it in the Supabase SQL
-- Editor (VP standing rule: no psql/CLI/exec_sql RPC). CC then verifies via tsx service-role
-- read and resumes §5.3 (server-apply) + §5.4 (toggle). Idempotent (WHERE NOT EXISTS).
-- ============================================================

INSERT INTO platform_settings (key, value, description)
SELECT 'active_ui_theme', '"current"'::jsonb, 'Global app UI theme. "current" or "bliss". Controls [data-theme] on root <html>.'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_settings WHERE key = 'active_ui_theme'
);
