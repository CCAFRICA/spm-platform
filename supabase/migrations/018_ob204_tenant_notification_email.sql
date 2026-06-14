-- OB-204 Phase D.3 — tenant-level email routing (D.2 Layer 2). CC authors; ARCHITECT applies via
-- Dashboard SQL Editor (SR-44). When set by a platform admin, ALL system-generated emails for that
-- tenant's users route to notification_email (proof-tenant pattern). Operational config, not PII.
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS notification_email text NULL;
