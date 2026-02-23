-- 016_flywheel_tables.sql
-- OB-80: Flywheel 2 (Foundational) + Flywheel 3 (Domain) tables
--
-- PRIVACY: No tenant_id in either table. No entity data. No raw values.
-- Pattern signatures + aggregated statistics only.

-- Flywheel 2: Cross-tenant structural intelligence
CREATE TABLE IF NOT EXISTS foundational_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_signature TEXT NOT NULL UNIQUE,
  confidence_mean NUMERIC DEFAULT 0.5,
  confidence_variance NUMERIC DEFAULT 0.0,
  total_executions BIGINT DEFAULT 0,
  tenant_count INTEGER DEFAULT 0,
  anomaly_rate_mean NUMERIC DEFAULT 0.0,
  learned_behaviors JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Flywheel 3: Domain vertical expertise
CREATE TABLE IF NOT EXISTS domain_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_signature TEXT NOT NULL,
  domain_id TEXT NOT NULL,
  vertical_hint TEXT,
  confidence_mean NUMERIC DEFAULT 0.5,
  total_executions BIGINT DEFAULT 0,
  tenant_count INTEGER DEFAULT 0,
  learned_behaviors JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(pattern_signature, domain_id, vertical_hint)
);

-- RLS: Read-only for authenticated users (structural priors).
-- Write access restricted to service role (aggregation pipeline only).
ALTER TABLE foundational_patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read foundational patterns"
  ON foundational_patterns FOR SELECT TO authenticated USING (true);

ALTER TABLE domain_patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read domain patterns"
  ON domain_patterns FOR SELECT TO authenticated USING (true);

-- Index for pattern signature lookups
CREATE INDEX IF NOT EXISTS idx_foundational_pattern_sig ON foundational_patterns(pattern_signature);
CREATE INDEX IF NOT EXISTS idx_domain_pattern_sig ON domain_patterns(pattern_signature, domain_id);
