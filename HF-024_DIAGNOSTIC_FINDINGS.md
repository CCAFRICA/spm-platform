# HF-024 Diagnostic Findings

## Root Cause: Wrong Anon Key in Vercel Environment Variables

### Evidence

**Local build** (correct):
```
e="https://bayqxeiltnpjrvflksfa.supabase.co"
t="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsIn..."
```

**Production build** (wrong):
```
e="https://bayqxeiltnpjrvflksfa.supabase.co"
t="eyJsb_publishable_u_1bHIyX35Tqu8K-7uy-fw_PgmNYx9I"
```

### Analysis

- The Supabase URL is correct in both environments (`bayqxeiltnpjrvflksfa`)
- The anon key in production is `eyJsb_publishable_u_1bHIyX35Tqu8K-7uy-fw_PgmNYx9I`
  - This is NOT a valid Supabase JWT anon key
  - The `_publishable_` substring suggests a Stripe key fragment or copy-paste error
  - A valid Supabase anon key is a JWT: `eyJhbGciOiJIUzI1NiIs...` (base64-encoded JSON)
- The production chunk `4126-2ab67e72c3d15d61.js` contains the `createBrowserClient()` call
  with the wrong key baked in at build time
- `NEXT_PUBLIC_*` variables are embedded at **build time** in Next.js, not runtime

### Why This Causes 401

1. User enters email + password on vialuce.ai
2. Login page calls `supabase.auth.signInWithPassword({ email, password })`
3. Supabase JS client sends `POST /auth/v1/token?grant_type=password` with `apikey: <wrong_key>`
4. Supabase rejects the request with 401 because the apikey is invalid
5. Login page shows "Invalid email or password" (misleading — the credentials are fine)

### Fix Required

1. **Vercel Dashboard**: Update `NEXT_PUBLIC_SUPABASE_ANON_KEY` to the correct JWT value
2. **Trigger rebuild**: Vercel must rebuild after the env var is corrected (since it's baked at build time)
3. **Add build-time validation**: Prevent future deploys with invalid env vars

### Verification Steps

After fix:
```bash
# Check production chunk has correct key
curl -s "https://vialuce.ai/_next/static/chunks/4126-*.js" | grep -oE 'eyJ[A-Za-z0-9_.=-]+' | head -1
# Should start with: eyJhbGciOiJIUzI1NiIs
```

### Checks Performed

| Check | Result |
|-------|--------|
| .env.local has correct key | YES |
| .env.production exists | NO (good) |
| .env committed to git | NO (good) |
| next.config overrides env | NO |
| Local build embeds correct key | YES |
| Production build embeds correct key | **NO — WRONG KEY** |
| Supabase URL correct in production | YES |
| Direct curl auth works | YES |
| Login code has transformations | NO (clean pass-through) |
| RLS blocks profile query | NO (works with anon key) |
