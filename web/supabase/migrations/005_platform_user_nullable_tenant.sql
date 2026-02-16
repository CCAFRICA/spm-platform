-- ============================================================
-- HF-027 Migration 005: Platform User Support
--
-- Makes tenant_id nullable for platform-level users (vl_admin)
-- and adds RLS policies for cross-tenant platform admin access.
--
-- Run this in the Supabase Dashboard SQL Editor if not applied
-- via migration push.
-- ============================================================

-- 1. Allow NULL tenant_id for platform users
ALTER TABLE profiles ALTER COLUMN tenant_id DROP NOT NULL;

-- 2. Platform users can always read their own profile (needed for login)
CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT USING (auth_user_id = auth.uid());

-- 3. Platform admins (vl_admin) can see all tenants
CREATE POLICY "tenants_select_vl_admin" ON tenants
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE auth_user_id = auth.uid()
        AND role = 'vl_admin'
    )
  );

-- 4. Platform admins can see all profiles across tenants
CREATE POLICY "profiles_select_vl_admin" ON profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE auth_user_id = auth.uid()
        AND role = 'vl_admin'
    )
  );
