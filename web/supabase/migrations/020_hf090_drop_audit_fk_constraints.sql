-- HF-090: Drop FK constraints on audit attribution columns
-- These columns will store auth.uid() directly (verified JWT identity)
-- entities.profile_id FK is PRESERVED (different relationship — entity-to-user link)

-- rule_sets
ALTER TABLE rule_sets DROP CONSTRAINT IF EXISTS rule_sets_created_by_fkey;
ALTER TABLE rule_sets DROP CONSTRAINT IF EXISTS rule_sets_approved_by_fkey;

-- calculation_batches
ALTER TABLE calculation_batches DROP CONSTRAINT IF EXISTS calculation_batches_created_by_fkey;

-- import_batches
ALTER TABLE import_batches DROP CONSTRAINT IF EXISTS import_batches_uploaded_by_fkey;

-- disputes
ALTER TABLE disputes DROP CONSTRAINT IF EXISTS disputes_filed_by_fkey;
ALTER TABLE disputes DROP CONSTRAINT IF EXISTS disputes_resolved_by_fkey;

-- approval_requests
ALTER TABLE approval_requests DROP CONSTRAINT IF EXISTS approval_requests_requested_by_fkey;
ALTER TABLE approval_requests DROP CONSTRAINT IF EXISTS approval_requests_decided_by_fkey;

-- audit_logs
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_profile_id_fkey;

-- reconciliation_sessions (if exists)
ALTER TABLE IF EXISTS reconciliation_sessions DROP CONSTRAINT IF EXISTS reconciliation_sessions_created_by_fkey;

-- Add comments documenting the change
COMMENT ON COLUMN rule_sets.created_by IS 'auth.uid() — Supabase auth user ID (JWT-verified). NOT a profile ID.';
COMMENT ON COLUMN rule_sets.approved_by IS 'auth.uid() — Supabase auth user ID (JWT-verified). NOT a profile ID.';
COMMENT ON COLUMN calculation_batches.created_by IS 'auth.uid() — Supabase auth user ID (JWT-verified). NOT a profile ID.';
COMMENT ON COLUMN import_batches.uploaded_by IS 'auth.uid() — Supabase auth user ID (JWT-verified). NOT a profile ID.';
COMMENT ON COLUMN disputes.filed_by IS 'auth.uid() — Supabase auth user ID (JWT-verified). NOT a profile ID.';
COMMENT ON COLUMN disputes.resolved_by IS 'auth.uid() — Supabase auth user ID (JWT-verified). NOT a profile ID.';
