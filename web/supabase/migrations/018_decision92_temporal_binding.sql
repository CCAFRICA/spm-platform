-- Decision 92: Temporal Binding + Reference Agent Foundation
-- OB-152 Phase 1: Schema Migration (ADDITIVE ONLY)
-- Date: 2026-03-04

-- ============================================================
-- 1. source_date column on committed_data
-- ============================================================

ALTER TABLE committed_data ADD COLUMN IF NOT EXISTS source_date DATE;

-- Index for date-range queries (engine hybrid path)
CREATE INDEX IF NOT EXISTS idx_committed_data_tenant_source_date
  ON committed_data (tenant_id, source_date)
  WHERE source_date IS NOT NULL;

-- Composite index for entity + date-range queries
CREATE INDEX IF NOT EXISTS idx_committed_data_tenant_entity_source_date
  ON committed_data (tenant_id, entity_id, source_date)
  WHERE entity_id IS NOT NULL AND source_date IS NOT NULL;

-- ============================================================
-- 2. reference_data table
-- ============================================================

CREATE TABLE IF NOT EXISTS reference_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  reference_type TEXT NOT NULL,           -- e.g. 'catalog', 'lookup', 'mapping'
  name TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active',
  key_field TEXT,                          -- which field is the primary key
  schema_definition JSONB DEFAULT '{}',   -- describes the expected structure
  import_batch_id UUID REFERENCES import_batches(id),
  metadata JSONB DEFAULT '{}',
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, name, version)
);

-- ============================================================
-- 3. reference_items table
-- ============================================================

CREATE TABLE IF NOT EXISTS reference_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  reference_data_id UUID NOT NULL REFERENCES reference_data(id) ON DELETE CASCADE,
  external_key TEXT NOT NULL,
  display_name TEXT,
  category TEXT,
  attributes JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (reference_data_id, external_key)
);

-- ============================================================
-- 4. alias_registry table
-- ============================================================

CREATE TABLE IF NOT EXISTS alias_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  reference_item_id UUID NOT NULL REFERENCES reference_items(id) ON DELETE CASCADE,
  alias_text TEXT NOT NULL,
  alias_normalized TEXT NOT NULL,          -- lowercase, trimmed, accent-folded
  confidence NUMERIC(5,4) NOT NULL DEFAULT 1.0,
  confirmation_count INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'import',   -- 'import', 'manual', 'ai'
  scope TEXT DEFAULT 'global',             -- 'global', 'tenant', 'import'
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, reference_item_id, alias_normalized)
);

-- ============================================================
-- 5. Indexes on reference tables
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_reference_data_tenant
  ON reference_data (tenant_id);

CREATE INDEX IF NOT EXISTS idx_reference_items_tenant
  ON reference_items (tenant_id);

CREATE INDEX IF NOT EXISTS idx_reference_items_ref_data
  ON reference_items (reference_data_id);

CREATE INDEX IF NOT EXISTS idx_alias_registry_tenant
  ON alias_registry (tenant_id);

CREATE INDEX IF NOT EXISTS idx_alias_registry_normalized
  ON alias_registry (tenant_id, alias_normalized);

-- ============================================================
-- 6. RLS Policies
-- ============================================================

ALTER TABLE reference_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE reference_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE alias_registry ENABLE ROW LEVEL SECURITY;

-- reference_data
CREATE POLICY "reference_data_select" ON reference_data
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "reference_data_insert" ON reference_data
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "reference_data_update" ON reference_data
  FOR UPDATE USING (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid())
  );

-- reference_items
CREATE POLICY "reference_items_select" ON reference_items
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "reference_items_insert" ON reference_items
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "reference_items_update" ON reference_items
  FOR UPDATE USING (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid())
  );

-- alias_registry
CREATE POLICY "alias_registry_select" ON alias_registry
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "alias_registry_insert" ON alias_registry
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "alias_registry_update" ON alias_registry
  FOR UPDATE USING (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid())
  );

-- Service role bypass for all three tables
CREATE POLICY "reference_data_service" ON reference_data
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "reference_items_service" ON reference_items
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "alias_registry_service" ON alias_registry
  FOR ALL USING (auth.role() = 'service_role');
