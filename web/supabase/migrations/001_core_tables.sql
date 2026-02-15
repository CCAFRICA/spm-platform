-- ============================================================
-- OB-42 Migration 001: Core Tables
-- Tables: tenants, profiles, entities, entity_relationships,
--         reassignment_events
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ──────────────────────────────────────────────
-- TABLE 1: tenants
-- Multi-tenant container with domain-agnostic labels
-- ──────────────────────────────────────────────
CREATE TABLE tenants (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  settings    JSONB NOT NULL DEFAULT '{}',
  hierarchy_labels   JSONB NOT NULL DEFAULT '{}',
  entity_type_labels JSONB NOT NULL DEFAULT '{}',
  features    JSONB NOT NULL DEFAULT '{}',
  locale      TEXT NOT NULL DEFAULT 'en',
  currency    TEXT NOT NULL DEFAULT 'USD',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- RLS: Users can only see tenants they belong to (via profiles)
CREATE POLICY "tenants_select_own" ON tenants
  FOR SELECT USING (
    id IN (SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "tenants_update_own" ON tenants
  FOR UPDATE USING (
    id IN (
      SELECT tenant_id FROM profiles
      WHERE auth_user_id = auth.uid()
        AND capabilities @> '["manage_tenants"]'
    )
  );

CREATE INDEX idx_tenants_slug ON tenants(slug);

-- ──────────────────────────────────────────────
-- TABLE 2: profiles
-- User profiles with capabilities array
-- ──────────────────────────────────────────────
CREATE TABLE profiles (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  auth_user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  TEXT NOT NULL,
  email         TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'viewer',
  capabilities  JSONB NOT NULL DEFAULT '[]',
  locale        TEXT,
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, auth_user_id)
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- RLS: Users see profiles in their tenant
CREATE POLICY "profiles_select_tenant" ON profiles
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM profiles p2 WHERE p2.auth_user_id = auth.uid())
  );

-- RLS: Users can update their own profile
CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (auth_user_id = auth.uid());

-- RLS: Admins can insert profiles
CREATE POLICY "profiles_insert_admin" ON profiles
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM profiles
      WHERE auth_user_id = auth.uid()
        AND capabilities @> '["manage_profiles"]'
    )
  );

CREATE INDEX idx_profiles_tenant ON profiles(tenant_id);
CREATE INDEX idx_profiles_auth_user ON profiles(auth_user_id);
CREATE INDEX idx_profiles_email ON profiles(tenant_id, email);

-- ──────────────────────────────────────────────
-- TABLE 3: entities
-- Domain-agnostic entity registry
-- temporal_attributes JSONB, entity_type, external_id, profile_id FK
-- ──────────────────────────────────────────────
CREATE TABLE entities (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id            UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type          TEXT NOT NULL DEFAULT 'individual'
    CHECK (entity_type IN ('individual', 'location', 'team', 'organization')),
  status               TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('proposed', 'active', 'suspended', 'terminated')),
  external_id          TEXT,
  display_name         TEXT NOT NULL,
  profile_id           UUID REFERENCES profiles(id) ON DELETE SET NULL,
  temporal_attributes  JSONB NOT NULL DEFAULT '[]',
  metadata             JSONB NOT NULL DEFAULT '{}',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, external_id)
);

ALTER TABLE entities ENABLE ROW LEVEL SECURITY;

-- RLS: Users see entities in their tenant
CREATE POLICY "entities_select_tenant" ON entities
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid())
  );

-- RLS: Users with manage capabilities can insert/update
CREATE POLICY "entities_insert" ON entities
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM profiles
      WHERE auth_user_id = auth.uid()
        AND (capabilities @> '["manage_assignments"]' OR capabilities @> '["import_data"]')
    )
  );

CREATE POLICY "entities_update" ON entities
  FOR UPDATE USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles
      WHERE auth_user_id = auth.uid()
        AND (capabilities @> '["manage_assignments"]' OR capabilities @> '["import_data"]')
    )
  );

CREATE INDEX idx_entities_tenant ON entities(tenant_id);
CREATE INDEX idx_entities_type ON entities(tenant_id, entity_type);
CREATE INDEX idx_entities_external ON entities(tenant_id, external_id);
CREATE INDEX idx_entities_profile ON entities(profile_id);
CREATE INDEX idx_entities_status ON entities(tenant_id, status);

-- ──────────────────────────────────────────────
-- TABLE 4: entity_relationships
-- Relationship graph with confidence, evidence, source
-- ──────────────────────────────────────────────
CREATE TABLE entity_relationships (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  target_entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL
    CHECK (relationship_type IN (
      'contains', 'manages', 'works_at', 'assigned_to',
      'member_of', 'participates_in', 'oversees', 'assists'
    )),
  source           TEXT NOT NULL DEFAULT 'imported_explicit'
    CHECK (source IN ('ai_inferred', 'human_confirmed', 'human_created', 'imported_explicit')),
  confidence       NUMERIC(5,4) NOT NULL DEFAULT 1.0
    CHECK (confidence >= 0 AND confidence <= 1),
  evidence         JSONB NOT NULL DEFAULT '{}',
  context          JSONB NOT NULL DEFAULT '{}',
  effective_from   DATE,
  effective_to     DATE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (source_entity_id != target_entity_id)
);

ALTER TABLE entity_relationships ENABLE ROW LEVEL SECURITY;

-- RLS: Users see relationships in their tenant
CREATE POLICY "entity_relationships_select_tenant" ON entity_relationships
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "entity_relationships_insert" ON entity_relationships
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM profiles
      WHERE auth_user_id = auth.uid()
        AND (capabilities @> '["manage_assignments"]' OR capabilities @> '["import_data"]')
    )
  );

CREATE POLICY "entity_relationships_update" ON entity_relationships
  FOR UPDATE USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles
      WHERE auth_user_id = auth.uid()
        AND capabilities @> '["manage_assignments"]'
    )
  );

CREATE INDEX idx_entity_rel_tenant ON entity_relationships(tenant_id);
CREATE INDEX idx_entity_rel_source ON entity_relationships(source_entity_id);
CREATE INDEX idx_entity_rel_target ON entity_relationships(target_entity_id);
CREATE INDEX idx_entity_rel_type ON entity_relationships(tenant_id, relationship_type);
CREATE INDEX idx_entity_rel_effective ON entity_relationships(effective_from, effective_to);

-- ──────────────────────────────────────────────
-- TABLE 5: reassignment_events
-- Entity reassignment tracking with credit model
-- ──────────────────────────────────────────────
CREATE TABLE reassignment_events (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_id         UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  from_entity_id    UUID REFERENCES entities(id) ON DELETE SET NULL,
  to_entity_id      UUID REFERENCES entities(id) ON DELETE SET NULL,
  effective_date    DATE NOT NULL,
  credit_model      JSONB NOT NULL DEFAULT '{}',
  transition_window JSONB NOT NULL DEFAULT '{}',
  impact_preview    JSONB NOT NULL DEFAULT '{}',
  reason            TEXT,
  created_by        UUID REFERENCES profiles(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE reassignment_events ENABLE ROW LEVEL SECURITY;

-- RLS: Users see reassignment events in their tenant
CREATE POLICY "reassignment_events_select_tenant" ON reassignment_events
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "reassignment_events_insert" ON reassignment_events
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM profiles
      WHERE auth_user_id = auth.uid()
        AND capabilities @> '["manage_assignments"]'
    )
  );

CREATE INDEX idx_reassignment_tenant ON reassignment_events(tenant_id);
CREATE INDEX idx_reassignment_entity ON reassignment_events(entity_id);
CREATE INDEX idx_reassignment_date ON reassignment_events(effective_date);

-- ──────────────────────────────────────────────
-- Trigger: auto-update updated_at
-- ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_entities_updated_at
  BEFORE UPDATE ON entities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_entity_relationships_updated_at
  BEFORE UPDATE ON entity_relationships
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
