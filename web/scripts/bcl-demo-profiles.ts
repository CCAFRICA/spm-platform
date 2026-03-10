#!/usr/bin/env npx tsx
/**
 * OB-163 Phase 10: BCL Demo Profiles
 *
 * Creates 3 demo users for the BCL tenant:
 *   1. Patricia Zambrano — Admin (admin@bancocumbre.ec) [already exists]
 *   2. Fernando Hidalgo — Manager (fernando@bancocumbre.ec)
 *   3. Valentina Salazar — Individual (valentina@bancocumbre.ec)
 *
 * Usage: cd web && set -a && source .env.local && set +a && npx tsx scripts/bcl-demo-profiles.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BCL_TENANT_ID = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
const DEFAULT_PASSWORD = 'demo-password-BCL1';

interface DemoProfile {
  email: string;
  displayName: string;
  role: string;
  capabilities: string[];
  entityExternalId?: string; // Link to entity
  linkType?: 'manages' | 'individual';
}

const DEMO_PROFILES: DemoProfile[] = [
  {
    email: 'fernando@bancocumbre.ec',
    displayName: 'Fernando Hidalgo',
    role: 'manager',
    capabilities: ['manage_team', 'view_outcomes', 'approve_outcomes'],
    entityExternalId: 'BCL-RM-COSTA',
    linkType: 'manages',
  },
  {
    email: 'valentina@bancocumbre.ec',
    displayName: 'Valentina Salazar',
    role: 'viewer',
    capabilities: ['view_outcomes'],
    entityExternalId: 'BCL-5012',
    linkType: 'individual',
  },
];

async function createDemoProfiles() {
  console.log('=== OB-163 Phase 10: BCL Demo Profiles ===\n');

  for (const demo of DEMO_PROFILES) {
    console.log(`--- ${demo.displayName} (${demo.email}) ---`);

    // Check if auth user exists
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existing = existingUsers?.users?.find(u => u.email === demo.email);

    let userId: string;
    if (existing) {
      userId = existing.id;
      console.log(`  Auth user exists: ${userId}`);
    } else {
      const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
        email: demo.email,
        password: DEFAULT_PASSWORD,
        email_confirm: true,
        user_metadata: { display_name: demo.displayName, role: demo.role },
      });
      if (authErr) {
        console.error(`  Auth create failed: ${authErr.message}`);
        continue;
      }
      userId = authUser.user.id;
      console.log(`  Auth user created: ${userId}`);
    }

    // Check if profile exists
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('auth_user_id', userId)
      .eq('tenant_id', BCL_TENANT_ID)
      .maybeSingle();

    let profileId: string;
    if (existingProfile) {
      profileId = existingProfile.id;
      console.log(`  Profile exists: ${profileId}`);
    } else {
      const { data: profile, error: profErr } = await supabase
        .from('profiles')
        .insert({
          tenant_id: BCL_TENANT_ID,
          auth_user_id: userId,
          display_name: demo.displayName,
          email: demo.email,
          role: demo.role,
          capabilities: demo.capabilities,
        })
        .select('id')
        .single();
      if (profErr) {
        console.error(`  Profile create failed: ${profErr.message}`);
        continue;
      }
      profileId = profile.id;
      console.log(`  Profile created: ${profileId}`);
    }

    // Link profile to entity
    if (demo.entityExternalId) {
      const { data: entity } = await supabase
        .from('entities')
        .select('id, display_name')
        .eq('tenant_id', BCL_TENANT_ID)
        .eq('external_id', demo.entityExternalId)
        .maybeSingle();

      if (entity) {
        // Set profile_id on entity
        const { error: linkErr } = await supabase
          .from('entities')
          .update({ profile_id: profileId })
          .eq('id', entity.id);

        if (linkErr) {
          console.log(`  Entity link failed: ${linkErr.message}`);
        } else {
          console.log(`  Linked to entity: ${entity.display_name} (${demo.entityExternalId})`);
        }
      } else {
        console.log(`  Entity not found: ${demo.entityExternalId}`);
      }
    }
  }

  console.log('\n=== BCL Demo Profiles Complete ===');
  console.log('\nLogin credentials:');
  console.log('  Admin:      admin@bancocumbre.ec / demo-password-BCL1');
  console.log('  Manager:    fernando@bancocumbre.ec / demo-password-BCL1');
  console.log('  Individual: valentina@bancocumbre.ec / demo-password-BCL1');
}

createDemoProfiles().catch(err => {
  console.error('FAILED:', err);
  process.exit(1);
});
