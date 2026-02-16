#!/usr/bin/env npx tsx
/**
 * CLT-HF032 Verification Script
 *
 * Automated verification of HF-032 fixes:
 * - Middleware redirect (unauthenticated) does NOT carry sb- Set-Cookie headers
 * - Middleware redirect location is /login, NOT /
 * - Middleware clears stale sb- cookies on redirect
 * - Public path pass-through also clears stale cookies
 * - Authenticated pass-through carries cookie refresh
 * - All prior auth gates still intact
 *
 * Run: npx tsx web/scripts/clt-hf032-verify.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const WEB_SRC = path.resolve(__dirname, '../src');
let passed = 0;
let failed = 0;
const results: Array<{ gate: string; status: 'PASS' | 'FAIL'; detail: string }> = [];

function gate(name: string, ok: boolean, detail: string) {
  const status = ok ? 'PASS' : 'FAIL';
  if (ok) passed++;
  else failed++;
  results.push({ gate: name, status, detail });
  console.log(`  ${ok ? '✅' : '❌'} ${name}: ${detail}`);
}

function readFile(relPath: string): string {
  const full = path.resolve(WEB_SRC, relPath);
  if (!fs.existsSync(full)) return '';
  return fs.readFileSync(full, 'utf-8');
}

// ══════════════════════════════════════════════════
// SECTION 1: Middleware Cookie Handling
// ══════════════════════════════════════════════════

function verifyMiddleware() {
  console.log('\n═══ SECTION 1: Middleware Cookie Handling ═══\n');

  const content = readFile('middleware.ts');

  // 1. Middleware creates Supabase client
  gate('Middleware creates Supabase server client',
    content.includes('createServerClient'),
    'createServerClient from @supabase/ssr');

  // 2. clearSbCookies helper exists
  gate('clearSbCookies helper exists',
    content.includes('function clearSbCookies'),
    'Helper function to clear sb-* cookies');

  // 3. clearSbCookies checks cookie.name.startsWith("sb-")
  gate('clearSbCookies targets sb- prefix cookies',
    content.includes("cookie.name.startsWith('sb-')"),
    'Only clears Supabase auth cookies');

  // 4. clearSbCookies sets maxAge: 0
  gate('clearSbCookies sets maxAge: 0 to delete cookies',
    content.includes('maxAge: 0'),
    'Browser deletes cookies with maxAge=0');

  // 5. Unauthenticated redirect calls clearSbCookies
  const unauthedBlock = content.substring(
    content.indexOf('// ── NOT AUTHENTICATED'),
    content.indexOf('// ── AUTHENTICATED')
  );
  gate('Unauthenticated redirect clears sb- cookies',
    unauthedBlock.includes('clearSbCookies(request, redirectResponse)'),
    'Stale cookies cleared on redirect to /login');

  // 6. Redirect response is fresh NextResponse.redirect (not supabaseResponse)
  gate('Redirect response is fresh NextResponse.redirect()',
    unauthedBlock.includes('NextResponse.redirect(loginUrl)') &&
    !unauthedBlock.includes('return supabaseResponse'),
    'Fresh redirect — no cookie handlers from Supabase client');

  // 7. Public path pass-through also clears cookies when no user
  gate('Public path (no user) clears stale cookies',
    unauthedBlock.includes('clearSbCookies(request, passThrough)'),
    'GET /login with stale cookies → cookies cleared');

  // 8. Authenticated pass-through returns supabaseResponse (with cookie refresh)
  gate('Authenticated pass-through returns supabaseResponse',
    content.includes('return supabaseResponse;'),
    'Session refresh cookies preserved for authenticated users');

  // 9. Middleware has console.warn for missing env vars (from HF-031)
  gate('Middleware warns on missing env vars',
    content.includes('console.warn') && content.includes('auth enforcement disabled'),
    'Missing env vars are never silent');
}

// ══════════════════════════════════════════════════
// SECTION 2: Redirect Correctness
// ══════════════════════════════════════════════════

function verifyRedirects() {
  console.log('\n═══ SECTION 2: Redirect Correctness ═══\n');

  const content = readFile('middleware.ts');

  // 10. Unauthenticated redirect goes to /login (not /)
  gate('Unauth redirect target is /login',
    content.includes("new URL('/login', request.url)") &&
    content.includes("loginUrl.searchParams.set('redirect', pathname)"),
    'Redirect to /login?redirect=<path>');

  // 11. Authenticated on /login → redirect to / or /select-tenant
  gate('Auth on /login redirects to / or /select-tenant',
    content.includes("new URL('/', request.url)") &&
    content.includes("new URL('/select-tenant', request.url)"),
    'Platform admin → /select-tenant, others → /');

  // 12. PUBLIC_PATHS includes /login
  gate('PUBLIC_PATHS includes /login',
    content.includes("'/login'") && content.includes('PUBLIC_PATHS'),
    '/login is a public path');
}

// ══════════════════════════════════════════════════
// SECTION 3: Prior Auth Gates Intact
// ══════════════════════════════════════════════════

function verifyPriorGates() {
  console.log('\n═══ SECTION 3: Prior Auth Gates Intact ═══\n');

  // 13. logout() navigates with window.location.href (HF-031)
  const authCtx = readFile('contexts/auth-context.tsx');
  const logoutStart = authCtx.indexOf('const logout = useCallback');
  const logoutEnd = authCtx.indexOf('}, [])', logoutStart);
  const logoutBody = authCtx.substring(logoutStart, logoutEnd);
  gate('logout() navigates to /login (HF-031)',
    logoutBody.includes("window.location.href = '/login'"),
    'Primary logout redirect intact');

  // 14. AuthShell gate skips hooks on /login
  const authShell = readFile('components/layout/auth-shell.tsx');
  gate('AuthShell gate skips hooks on /login',
    authShell.includes("pathname === '/login'") && authShell.includes('return <>{children}</>'),
    'Gate bypasses auth hooks on /login');

  // 15. initAuth() guards with getSession+getAuthUser (HF-030)
  gate('initAuth() double-check guard (HF-030)',
    authCtx.includes('await getSession()') && authCtx.includes('await getAuthUser()'),
    'getSession + getAuthUser before fetchCurrentProfile');

  // 16. No console.log debug statements in middleware
  const middlewareContent = readFile('middleware.ts');
  const lines = middlewareContent.split('\n');
  const hasConsoleLog = lines.some(line =>
    line.includes('console.log') && !line.trim().startsWith('//') && !line.trim().startsWith('*')
  );
  gate('No console.log debug statements in middleware',
    !hasConsoleLog,
    hasConsoleLog ? 'FOUND console.log!' : 'Clean — only console.warn for env guard');
}

// ══════════════════════════════════════════════════
// SECTION 4: Live HTTP Tests
// ══════════════════════════════════════════════════

async function verifyHTTP() {
  console.log('\n═══ SECTION 4: Live HTTP Tests ═══\n');

  // 17. GET / returns 307 with location /login
  try {
    const resp = await fetch('http://localhost:3000/', { redirect: 'manual' });
    gate('GET / returns 307',
      resp.status === 307,
      `Status: ${resp.status}`);

    const location = resp.headers.get('location') || '';
    gate('GET / redirects to /login (not /)',
      location.includes('/login') && !location.endsWith('/'),
      `Location: ${location}`);

    // 19. Check for sb- Set-Cookie headers on redirect
    const setCookieHeaders: string[] = [];
    resp.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'set-cookie') {
        setCookieHeaders.push(value);
      }
    });
    // Check if any sb- cookies are being SET (not cleared)
    const hasSbCookieSet = setCookieHeaders.some(h =>
      h.includes('sb-') && !h.includes('Max-Age=0') && !h.includes('max-age=0')
    );
    gate('GET / redirect has zero sb- Set-Cookie (non-clearing)',
      !hasSbCookieSet,
      hasSbCookieSet ? 'FOUND sb- cookies being set!' : 'No sb- session cookies on redirect');
  } catch (e) {
    gate('GET / returns 307', false, `Fetch failed: ${(e as Error).message}`);
    gate('GET / redirects to /login (not /)', false, 'Fetch failed');
    gate('GET / redirect has zero sb- Set-Cookie (non-clearing)', false, 'Fetch failed');
  }

  // 20. GET /login returns 200
  try {
    const resp = await fetch('http://localhost:3000/login', { redirect: 'manual' });
    gate('GET /login returns 200',
      resp.status === 200,
      `Status: ${resp.status}`);
  } catch (e) {
    gate('GET /login returns 200', false, `Fetch failed: ${(e as Error).message}`);
  }

  // 21. Following redirect lands on /login (200)
  try {
    const resp = await fetch('http://localhost:3000/', { redirect: 'follow' });
    gate('Following redirect from / lands on login (200)',
      resp.status === 200 && resp.url.includes('/login'),
      `Final: ${resp.status} at ${resp.url}`);
  } catch (e) {
    gate('Following redirect from / lands on login (200)', false, `Fetch failed: ${(e as Error).message}`);
  }

  // 22. Build artifact exists
  const nextDir = path.resolve(__dirname, '../.next');
  gate('Build artifact exists',
    fs.existsSync(nextDir),
    fs.existsSync(nextDir) ? '.next directory present' : 'No .next directory');
}

// ══════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════

async function main() {
  console.log('══════════════════════════════════════════');
  console.log('  CLT-HF032: Middleware Cookie Leak Fix    ');
  console.log('══════════════════════════════════════════');

  verifyMiddleware();
  verifyRedirects();
  verifyPriorGates();
  await verifyHTTP();

  console.log('\n═══════════════════════════════════════');
  console.log(`  TOTAL: ${passed + failed} gates`);
  console.log(`  PASSED: ${passed}`);
  console.log(`  FAILED: ${failed}`);
  console.log(`  SCORE: ${Math.round((passed / (passed + failed)) * 100)}%`);
  console.log('═══════════════════════════════════════\n');

  if (failed > 0) {
    console.log('FAILED GATES:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  ❌ ${r.gate}: ${r.detail}`);
    });
    console.log('');
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
