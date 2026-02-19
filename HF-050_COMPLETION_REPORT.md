# HF-050 Completion Report: LocalStorage Auth Bypass Fix

## 1. Problem Statement

**CLT-65 Evidence**: Fresh Firefox browser with zero cookies rendered the platform as fully authenticated. Root cause: Supabase auth tokens persisting in localStorage survive cookie cleanup, allowing session resurrection.

## 2. Diagnostic Findings

- `@supabase/ssr`'s `createBrowserClient` uses cookie-backed storage (primary)
- `persistSession: true` is hardcoded in `createBrowserClient` (cannot disable)
- GoTrueClient has a localStorage fallback chain for edge cases
- `signOut(scope: 'local')` clears Supabase internal state but NOT localStorage
- Logout (HF-043) cleared cookies but NOT localStorage sb-* keys
- Login page did NOT clear stale auth state on mount
- AuthProvider ran `initAuth()` on ALL routes including /login
- Login page created a SEPARATE Supabase client for Google OAuth

## 3. Architecture Decision

**Option B: Defense-in-depth cleanup at every auth boundary**
- Clear localStorage sb-* keys at: signOut, logout, login mount
- Skip initAuth on public routes
- Use singleton client everywhere

Rejected: A (can't modify hardcoded persistSession), C (overkill — server validation is correct)

## 4. Fixes Applied

### Fix F1: Logout clears localStorage (auth-context.tsx)
```typescript
// HF-050: Clear ALL Supabase keys from localStorage.
clearSupabaseLocalStorage();
```
Belt-and-suspenders call after signOut() in logout callback.

### Fix F2: Login page clears stale auth on mount (login/page.tsx)
```typescript
useEffect(() => {
  clearSupabaseLocalStorage();
}, []);
```
Arriving at /login from ANY path guarantees a clean slate.

### Fix F3: AuthProvider skips initAuth on public routes (auth-context.tsx)
```typescript
const AUTH_SKIP_ROUTES = ['/login', '/landing', '/signup'];
if (AUTH_SKIP_ROUTES.includes(pathname)) {
  return; // Don't resurrect stale tokens on public pages
}
```
Prevents `getSession()` from finding stale localStorage data on public routes.

### Fix F4: signOut service clears localStorage (auth-service.ts)
```typescript
export async function signOut() {
  const supabase = createClient();
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  clearSupabaseLocalStorage(); // ← NEW
  if (error) throw error;
}
```
Defense-in-depth at the lowest level.

### Fix F5: Login page uses singleton client (login/page.tsx)
```typescript
// Before: createBrowserClient(url, key)  ← separate client
// After:  createClient()                 ← singleton from client.ts
```
Single client = single storage location = single cleanup path.

### New Utility: clearSupabaseLocalStorage (auth-service.ts)
```typescript
export function clearSupabaseLocalStorage(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('sb-')) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(key => localStorage.removeItem(key));
}
```
SSR-safe, iterates localStorage, removes all `sb-*` prefixed keys.

## 5. Verification

### Server-Side (curl)
| Test | Expected | Result |
|------|----------|--------|
| GET /login (no auth) | 200 | **PASS** (200) |
| GET / (no auth) | 307 → /landing | **PASS** (307) |
| GET /insights (no auth) | 307 → /login | **PASS** (307 → /login?redirect=%2Finsights) |

### Build
- `npm run build` → exit 0, zero errors

### Code Coverage
`clearSupabaseLocalStorage()` called in 3 defense-in-depth locations:
1. `auth-service.ts:signOut()` — always runs on sign out
2. `auth-context.tsx:logout()` — belt-and-suspenders after signOut
3. `login/page.tsx:useEffect` — on login page mount (recovery path)

## 6. Browser Proof Gates (Manual Testing)

### Gate 1: Logout clears localStorage
1. Login to platform
2. Open DevTools → Application → Local Storage
3. Verify sb-* keys exist
4. Click Logout
5. **Verify**: sb-* keys are GONE from localStorage

### Gate 2: Login page clears stale state
1. Login to platform
2. Copy any sb-* localStorage key value
3. Logout
4. Manually add sb-* key back to localStorage via console
5. Navigate to /login
6. **Verify**: sb-* keys are GONE (cleared on mount)

### Gate 3: Fresh browser cannot authenticate
1. Login to platform in Chrome
2. Open Firefox (fresh profile, zero cookies)
3. Navigate to platform URL
4. **Verify**: Redirected to /login, NOT to dashboard

### Gate 4: Auth skip on public routes
1. Clear ALL browser data (cookies + localStorage)
2. Navigate directly to /login
3. Open DevTools → Console
4. **Verify**: No "Auth init" or session-related network requests

## 7. Files Modified

| File | Change |
|------|--------|
| `web/src/lib/supabase/auth-service.ts` | Added `clearSupabaseLocalStorage()`, called in `signOut()` |
| `web/src/contexts/auth-context.tsx` | Skip initAuth on public routes, clear localStorage in logout |
| `web/src/app/login/page.tsx` | Clear stale auth on mount, use singleton client for OAuth |

## 8. Proof Gates Summary

| # | Gate | Pass Criteria | Result |
|---|------|--------------|--------|
| PG-1 | Diagnostic complete | All auth paths documented | **PASS** |
| PG-2 | Architecture decision committed | Before implementation | **PASS** |
| PG-3 | 5 fixes implemented | F1-F5 all applied | **PASS** |
| PG-4 | Build clean | npm run build exit 0 | **PASS** |
| PG-5 | Server-side auth gates work | curl tests pass | **PASS** |
| PG-6 | clearSupabaseLocalStorage 3 locations | Defense-in-depth | **PASS** |
| PG-7 | Zero new anti-pattern violations | AP-1 through AP-17 | **PASS** |

## Section F Quick Checklist

- [x] Architecture Decision committed before implementation
- [x] Anti-Pattern Registry checked — zero violations
- [x] Scale test: works for 10x (no performance impact, O(n) localStorage scan)
- [x] AI-first: zero hardcoded values (generic sb-* prefix matching)
- [x] Defense-in-depth: 3 cleanup locations, any one sufficient
- [x] SSR-safe: typeof window checks on all browser APIs
- [x] Single client pattern: login page no longer creates separate client
- [x] Build clean: exit 0
