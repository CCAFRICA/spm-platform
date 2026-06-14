-- HF-288 Phase 2 — automate the OB-204 Q-I PII cleanse (migration 017 item 6) on a weekly schedule.
-- CC authors; ARCHITECT applies via Dashboard SQL Editor (SR-44). Idempotent: pg_cron's
-- cron.schedule(name, ...) replaces a job of the same name, so re-applying is safe.

-- Enable pg_cron if not already (idempotent).
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Weekly PII cleanse: Sunday 03:00 UTC. Strips email/ip/ip_address/user_agent from platform_events
-- payloads older than the 90-day retention window. Decays to a no-op (I-1 blocks new PII).
SELECT cron.schedule(
  'ob204-pii-cleanse-90d',
  '0 3 * * 0',
  $$UPDATE public.platform_events
    SET payload = payload - 'email' - 'ip_address' - 'ip' - 'user_agent'
    WHERE created_at < now() - interval '90 days'
      AND (payload ? 'email' OR payload ? 'ip_address' OR payload ? 'ip' OR payload ? 'user_agent')$$
);
