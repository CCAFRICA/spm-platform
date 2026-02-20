-- HF-052: Platform feature flags table
-- Create the platform settings table
CREATE TABLE IF NOT EXISTS platform_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL DEFAULT 'false'::jsonb,
  description TEXT,
  updated_by UUID REFERENCES profiles(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed initial feature flags
INSERT INTO platform_settings (key, value, description) VALUES
  ('landing_page_enabled', 'false'::jsonb, 'When ON: unauthenticated users see public landing page. When OFF: unauthenticated users go to /login.'),
  ('gpv_enabled', 'false'::jsonb, 'When ON: new tenants see the Guided Proof of Value wizard. When OFF: all tenants see normal dashboard.'),
  ('public_signup_enabled', 'false'::jsonb, 'When ON: /signup page allows new account creation. When OFF: shows coming soon.')
ON CONFLICT (key) DO NOTHING;

-- RLS policies
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

-- Platform admins can read all settings
CREATE POLICY "platform_read_settings" ON platform_settings
  FOR SELECT USING (
    (SELECT scope_level FROM profiles WHERE id = auth.uid()) = 'platform'
  );

-- Platform admins can update settings
CREATE POLICY "platform_update_settings" ON platform_settings
  FOR UPDATE USING (
    (SELECT scope_level FROM profiles WHERE id = auth.uid()) = 'platform'
  );

-- Service role can do everything (for middleware reads)
CREATE POLICY "service_role_all_settings" ON platform_settings
  FOR ALL USING (auth.role() = 'service_role');
