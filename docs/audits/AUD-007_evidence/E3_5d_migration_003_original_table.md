# E3.5d — Migration 003 Original `classification_signals` Table Creation

**File:** `web/supabase/migrations/003_data_and_calculation.sql:312–338`

Initial table creation + RLS + indexes. Verbatim:

```sql
CREATE TABLE classification_signals (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_id       UUID REFERENCES entities(id) ON DELETE SET NULL,
  signal_type     TEXT NOT NULL,
  signal_value    JSONB NOT NULL DEFAULT '{}',
  confidence      NUMERIC(5,4),
  source          TEXT,
  context         JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE classification_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "classification_signals_select_tenant" ON classification_signals
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "classification_signals_insert" ON classification_signals
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid())
  );

CREATE INDEX idx_class_signals_tenant ON classification_signals(tenant_id);
CREATE INDEX idx_class_signals_entity ON classification_signals(entity_id);
CREATE INDEX idx_class_signals_type ON classification_signals(tenant_id, signal_type);
```

This is the FIRST migration touching `classification_signals`. Later migrations add columns (007 ingestion-facility added dedicated columns; 024 OB-197 last touched), policies, and indexes. The 9-column base shape (id, tenant_id, entity_id, signal_type, signal_value, confidence, source, context, created_at) here is the JSONB-only path the directive labels "JSONB path (signal-persistence.ts)".

CC has surfaced verbatim. Subsequent migration files (006, 007, 009, 024) add the additional 15 columns to reach the current 24-column total observed in E3.1. Full content of those migrations not surfaced inline (out of E3.5's literal "HF-092" scope) but listed at the start of E3.5 for architect cross-reference: `web/supabase/migrations/006_vl_admin_cross_tenant_read.sql`, `007_ingestion_facility.sql`, `009_vl_admin_write_access.sql`, `024_ob197_signal_surface_rebuild.sql` (this last surfaced verbatim at E3.5c).
