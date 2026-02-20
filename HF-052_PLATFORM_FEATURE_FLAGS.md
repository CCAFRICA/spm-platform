# HF-052: PLATFORM FEATURE FLAGS — OBSERVATORY TOGGLE

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". Just act. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

**MANDATORY:** Read CC_STANDING_ARCHITECTURE_RULES.md FIRST. Evaluate every change against anti-pattern registry.

**CRITICAL RULE: Build EXACTLY what this prompt specifies. Do NOT substitute simpler alternatives. Do NOT skip deliverables because you found a "better" approach. Every item in this prompt was deliberately designed and must be implemented as described. If something seems unnecessary, implement it anyway — the architect made that decision for a reason.**

---

## THE PROBLEM

The platform needs toggleable feature flags controlled from the Observatory UI. Specifically:

1. **Landing page routing**: Toggle between showing the public marketing landing page vs going straight to `/login` for unauthenticated users. Currently hardcoded in middleware — needs to be database-driven and toggleable.
2. **GPV wizard**: Toggle whether the Guided Proof of Value wizard can appear for tenants. HF-051 added a `hasStarted` code-level gate, but the original requirement was a database-backed Observatory toggle.
3. **Public signup**: Toggle whether the signup page is active or shows "coming soon."

These flags must live in a **database table**, be readable by middleware and client code, and be toggleable from the **Observatory** UI.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → rm -rf .next → npm run build → npm run dev → confirm localhost:3000 responds
3. Final step: `gh pr create --base main --head dev`
4. Architecture Decision Gate before implementation
5. Anti-Pattern Registry check (AP-1 through AP-20)
6. **Supabase migrations MUST be executed live AND verified with DB query. File existence ≠ applied.**

---

## PHASE 0: DIAGNOSTIC

```bash
echo "=== CURRENT MIDDLEWARE ROUTING ==="
cat web/src/middleware.ts

echo ""
echo "=== CURRENT LANDING PAGE ==="
cat web/src/app/landing/page.tsx 2>/dev/null | head -30
cat web/src/app/page.tsx | head -30

echo ""
echo "=== GPV CURRENT GATING ==="
grep -rn "hasStarted\|gpvStarted\|gpv_enabled" web/src/hooks/useGPV.ts web/src/app/page.tsx --include="*.ts" --include="*.tsx" 2>/dev/null

echo ""
echo "=== OBSERVATORY COMPONENTS ==="
find web/src -path "*observatory*" -name "*.tsx" | sort

echo ""
echo "=== DOES platform_settings TABLE EXIST? ==="
# Check if it was created in a previous migration
grep -rn "platform_settings" web/supabase/migrations/ 2>/dev/null
```

**Commit:** `HF-052 Phase 0: Feature flags diagnostic`

---

## PHASE 1: ARCHITECTURE DECISION

```
ARCHITECTURE DECISION RECORD
============================
Problem: Feature flags are hardcoded in middleware and component logic.
         Need database-backed toggles controllable from Observatory UI.

Option A: Environment variables
  REJECTED — requires redeploy to change. Not toggleable at runtime.

Option B: platform_settings table in Supabase + API route + Observatory UI
  CHOSEN — runtime toggleable, persists across deploys, audit trail via
  updated_by/updated_at, extensible for future flags.
  Scale: O(1) read per request (cacheable). Works at 10x.
  AI-first: no hardcoding. Generic key-value pattern.
  Atomicity: single row update per toggle.

Option C: Third-party feature flag service (LaunchDarkly, etc.)
  REJECTED — unnecessary dependency for 3 flags. Can migrate later if needed.
```

**Commit:** `HF-052 Phase 1: Architecture decision — database-backed feature flags`

---

## PHASE 2: CREATE platform_settings TABLE

### 2A: Execute this SQL in Supabase SQL Editor

```sql
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
```

### 2B: VERIFY the table exists and has data

```sql
SELECT key, value, description FROM platform_settings ORDER BY key;
```

**Must return 3 rows with all three flags set to false.**

### 2C: Create the migration file for version control

Create `web/supabase/migrations/YYYYMMDDHHMMSS_create_platform_settings.sql` with the same SQL above. This ensures the schema is tracked in git even though you executed it manually.

**Commit:** `HF-052 Phase 2: platform_settings table — created + seeded + verified`

---

## PHASE 3: API ROUTE FOR SETTINGS

### 3A: Create GET/PATCH API route

Create `web/src/app/api/platform/settings/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// GET: Return all platform settings (platform admin only)
export async function GET(request: NextRequest) {
  // Verify caller is platform admin
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); } } }
  );
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  // Use service role to read settings
  const serviceClient = createServiceRoleClient();
  const { data: profile } = await serviceClient
    .from('profiles')
    .select('scope_level')
    .eq('id', user.id)
    .single();
  
  if (profile?.scope_level !== 'platform') {
    return NextResponse.json({ error: 'Forbidden — platform admin only' }, { status: 403 });
  }
  
  const { data: settings, error } = await serviceClient
    .from('platform_settings')
    .select('*')
    .order('key');
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  return NextResponse.json({ settings });
}

// PATCH: Update a single setting (platform admin only)
export async function PATCH(request: NextRequest) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); } } }
  );
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const serviceClient = createServiceRoleClient();
  const { data: profile } = await serviceClient
    .from('profiles')
    .select('scope_level')
    .eq('id', user.id)
    .single();
  
  if (profile?.scope_level !== 'platform') {
    return NextResponse.json({ error: 'Forbidden — platform admin only' }, { status: 403 });
  }
  
  const body = await request.json();
  const { key, value } = body;
  
  if (!key || value === undefined) {
    return NextResponse.json({ error: 'key and value required' }, { status: 400 });
  }
  
  const { data: updated, error } = await serviceClient
    .from('platform_settings')
    .update({
      value: JSON.stringify(value),
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq('key', key)
    .select()
    .single();
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  return NextResponse.json({ setting: updated });
}
```

### 3B: Create a public endpoint for middleware to read flags without auth

The middleware runs BEFORE auth, so it cannot use the authenticated route above. Create a lightweight read-only route:

Create `web/src/app/api/platform/flags/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

// GET: Return feature flags (public, read-only, no auth required)
// This is used by middleware to determine routing behavior
export async function GET() {
  const serviceClient = createServiceRoleClient();
  const { data: settings, error } = await serviceClient
    .from('platform_settings')
    .select('key, value');
  
  if (error || !settings) {
    // On error, return safe defaults (landing OFF, gpv OFF, signup OFF)
    return NextResponse.json({
      landing_page_enabled: false,
      gpv_enabled: false,
      public_signup_enabled: false,
    });
  }
  
  const flags: Record<string, boolean> = {};
  settings.forEach(s => {
    flags[s.key] = s.value === true || s.value === 'true';
  });
  
  return NextResponse.json(flags);
}
```

### 3C: Add routes to middleware PUBLIC_PATHS

In `web/src/middleware.ts`, add `/api/platform/flags` to the public paths array so the middleware can call it without auth.

**Commit:** `HF-052 Phase 3: Platform settings API — authenticated CRUD + public flags endpoint`

---

## PHASE 4: WIRE MIDDLEWARE TO USE FLAGS

### 4A: Update middleware to read landing_page_enabled flag

The middleware currently has a hardcoded redirect for unauthenticated users. Change it to:

```typescript
// In middleware, for unauthenticated users on non-public routes:

// Read the landing page flag
let landingEnabled = false;
try {
  const flagsResponse = await fetch(new URL('/api/platform/flags', request.url));
  if (flagsResponse.ok) {
    const flags = await flagsResponse.json();
    landingEnabled = flags.landing_page_enabled === true;
  }
} catch {
  // On error, default to login (safe default)
  landingEnabled = false;
}

// Route based on flag
if (!user && !isPublicPath) {
  if (landingEnabled) {
    return NextResponse.redirect(new URL('/landing', request.url));
  } else {
    return NextResponse.redirect(new URL('/login', request.url));
  }
}
```

**IMPORTANT:** The middleware calls the flags API on every request. This adds latency. To mitigate:
- The flags endpoint is lightweight (one small DB query)
- Consider adding a 60-second in-memory cache in the flags endpoint
- If this becomes a bottleneck, switch to reading directly from Supabase in middleware using service role client (no API call needed)

### 4B: Wire GPV flag

In `web/src/hooks/useGPV.ts` or wherever the GPV display decision is made, add a check for the `gpv_enabled` flag:

```typescript
// Fetch the GPV flag
const [gpvFlagEnabled, setGpvFlagEnabled] = useState(false);

useEffect(() => {
  fetch('/api/platform/flags')
    .then(r => r.json())
    .then(flags => setGpvFlagEnabled(flags.gpv_enabled === true))
    .catch(() => setGpvFlagEnabled(false));
}, []);

// GPV shows ONLY when:
// 1. gpv_enabled flag is ON in platform_settings
// 2. AND tenant has explicitly started the wizard (hasStarted from HF-051)
// 3. AND wizard is not complete
// 4. AND tenant has no calculation data
```

The `hasStarted` gate from HF-051 remains as defense-in-depth. The flag is the primary control.

### 4C: Wire signup flag

In the signup page, check the flag:

```typescript
const [signupEnabled, setSignupEnabled] = useState(false);

useEffect(() => {
  fetch('/api/platform/flags')
    .then(r => r.json())
    .then(flags => setSignupEnabled(flags.public_signup_enabled === true))
    .catch(() => setSignupEnabled(false));
}, []);

if (!signupEnabled) {
  return <ComingSoonPage />;
}
```

**Commit:** `HF-052 Phase 4: Wire feature flags — middleware routing + GPV gate + signup gate`

---

## PHASE 5: OBSERVATORY TOGGLE UI

### 5A: Find the Observatory component

```bash
find web/src -path "*observatory*" -name "*.tsx" | sort
```

### 5B: Add a Feature Flags section

In the Observatory (either in a new "Settings" tab or in the existing Billing tab), add a Feature Flags panel:

```typescript
// Feature Flags Panel
function FeatureFlagsPanel() {
  const [settings, setSettings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    fetch('/api/platform/settings')
      .then(r => r.json())
      .then(data => { setSettings(data.settings || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);
  
  const toggleFlag = async (key: string, currentValue: boolean) => {
    const res = await fetch('/api/platform/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value: !currentValue }),
    });
    if (res.ok) {
      setSettings(prev => prev.map(s => 
        s.key === key ? { ...s, value: !currentValue } : s
      ));
    }
  };
  
  const flagConfig: Record<string, { label: string; description: string }> = {
    landing_page_enabled: {
      label: 'Public Landing Page',
      description: 'When ON, unauthenticated visitors see the marketing landing page. When OFF, they go directly to login.',
    },
    gpv_enabled: {
      label: 'Guided Proof of Value',
      description: 'When ON, new tenants see the onboarding wizard. When OFF, all tenants see the normal dashboard.',
    },
    public_signup_enabled: {
      label: 'Public Signup',
      description: 'When ON, the signup page allows new account creation. When OFF, it shows "coming soon."',
    },
  };
  
  if (loading) return <div>Loading settings...</div>;
  
  return (
    <div className="space-y-1">
      <h3 className="text-sm font-semibold text-slate-200 mb-3">Feature Flags</h3>
      {settings.map(setting => {
        const config = flagConfig[setting.key];
        if (!config) return null;
        const isOn = setting.value === true || setting.value === 'true';
        return (
          <div key={setting.key} className="flex items-center justify-between py-3 px-4 rounded-lg bg-slate-800/50 border border-slate-700">
            <div className="flex-1 mr-4">
              <p className="text-sm font-medium text-slate-200">{config.label}</p>
              <p className="text-xs text-slate-400 mt-0.5">{config.description}</p>
            </div>
            <button
              onClick={() => toggleFlag(setting.key, isOn)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
                isOn ? 'bg-indigo-600' : 'bg-slate-600'
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                isOn ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
```

### 5C: Wire FeatureFlagsPanel into Observatory

Add the panel to the Observatory layout — either as a new tab called "Settings" or "Platform" or within the existing Billing tab.

**Commit:** `HF-052 Phase 5: Observatory feature flag toggles`

---

## PHASE 6: VERIFY + BUILD + PR

### 6A: Database verification

```sql
SELECT key, value, description FROM platform_settings ORDER BY key;
-- Must return 3 rows, all values = false
```

### 6B: API verification

```bash
echo "=== PUBLIC FLAGS ENDPOINT ==="
curl -s http://localhost:3000/api/platform/flags
echo ""
echo "(should return all flags as false)"
```

### 6C: Routing verification

```bash
echo "=== UNAUTHENTICATED ROOT (landing OFF = go to login) ==="
curl -s -o /dev/null -w "HTTP %{http_code} → %{redirect_url}" --max-redirs 0 http://localhost:3000/
echo ""
echo "(should redirect to /login, NOT /landing)"
```

### 6D: Build

```bash
cd web
npx tsc --noEmit
npm run build
npm run dev
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/
```

### 6E: Proof gates

| # | Gate | Pass Criteria | Method |
|---|------|--------------|--------|
| PG-1 | platform_settings table exists | DB query returns 3 rows | SQL |
| PG-2 | All flags default to false | DB query shows value=false | SQL |
| PG-3 | GET /api/platform/flags returns JSON | curl returns 3 flags | curl |
| PG-4 | GET /api/platform/settings returns settings (auth required) | curl with auth | curl |
| PG-5 | PATCH /api/platform/settings updates a flag | curl with auth | curl |
| PG-6 | Unauthenticated root → /login (when landing_page_enabled=false) | curl shows 307 → /login | curl |
| PG-7 | GPV wizard hidden (when gpv_enabled=false) | Browser shows dashboard, not wizard | Browser |
| PG-8 | Observatory shows Feature Flags panel | Browser — toggles visible | Browser |
| PG-9 | Toggle changes flag in database | Click toggle, verify DB | Browser + SQL |
| PG-10 | Turning landing_page_enabled ON changes routing to /landing | Toggle ON, curl shows 307 → /landing | curl |
| PG-11 | Build clean | npm run build exit 0 | Terminal |
| PG-12 | Zero new anti-pattern violations | AP-1 through AP-20 | Review |

### 6F: Completion report

Create `HF-052_COMPLETION_REPORT.md` at PROJECT ROOT.

### 6G: PR

```bash
git add -A && git commit -m "HF-052 Phase 6: Verification + completion report"
git push origin dev
gh pr create --base main --head dev \
  --title "HF-052: Platform feature flags — database-backed Observatory toggles" \
  --body "## What
Database-backed feature flags (platform_settings table) with Observatory UI toggles.

## Three Flags
1. landing_page_enabled (OFF): controls /landing vs /login routing
2. gpv_enabled (OFF): controls GPV wizard visibility
3. public_signup_enabled (OFF): controls signup page

## How
- Supabase table with RLS (platform admin read/write)
- API routes: /api/platform/flags (public read), /api/platform/settings (admin CRUD)
- Middleware reads flags to determine unauthenticated routing
- Observatory panel with toggle switches

## Proof Gates: 12 — see HF-052_COMPLETION_REPORT.md"
```

---

## ANTI-PATTERNS TO AVOID

| # | Don't | Do Instead |
|---|-------|-----------|
| 1 | Hardcode feature flags in code | Store in platform_settings, read at runtime |
| 2 | Skip building the Observatory UI | The toggle IS the deliverable — code-level flags without UI are useless |
| 3 | Skip the database table because "a code change is simpler" | The prompt specifies database-backed flags. Build what's specified. |
| 4 | Substitute a different approach than what's in the prompt | Implement EXACTLY what the prompt describes. Document concerns in the completion report if you disagree. |
| 5 | Create migration file without executing | Execute in SQL Editor AND verify with DB query |
| 6 | Make the flags endpoint authenticated | Middleware runs before auth — flags endpoint must be public |

---

*HF-052 — February 19, 2026*
*"A feature flag you can't toggle from the UI isn't a feature flag. It's a code comment."*
