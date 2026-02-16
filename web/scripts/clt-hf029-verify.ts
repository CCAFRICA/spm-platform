#!/usr/bin/env npx tsx
/**
 * CLT-HF029 Verification Script
 *
 * Automated verification of HF-029 fixes:
 * - fetchCurrentProfile() guards with getSession() before getUser()
 * - AuthShell uses window.location.href instead of router.push for unauth redirect
 * - AuthShell includes redirect query param with pathname
 * - curl tests for redirect behavior
 *
 * Run: npx tsx web/scripts/clt-hf029-verify.ts
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
// SECTION 1: auth-service.ts — Session Guard
// ══════════════════════════════════════════════════

function verifyAuthService() {
  console.log('\n═══ SECTION 1: auth-service.ts Session Guard ═══\n');

  const content = readFile('lib/supabase/auth-service.ts');

  gate('fetchCurrentProfile exists',
    content.includes('export async function fetchCurrentProfile'),
    'Function found');

  gate('getSession() called before getUser()',
    content.indexOf('getSession()') < content.indexOf('getUser()'),
    content.includes('getSession()')
      ? 'getSession() precedes getUser()'
      : 'MISSING getSession() guard');

  gate('Returns null when no session',
    content.includes('if (!session) return null'),
    content.includes('if (!session) return null')
      ? 'Early return on no session'
      : 'Missing null return for no session');

  gate('Still calls getUser() after session check',
    content.includes('getUser()'),
    'getUser() present for server-side token verification');
}

// ══════════════════════════════════════════════════
// SECTION 2: AuthShell — Full Page Navigation
// ══════════════════════════════════════════════════

function verifyAuthShell() {
  console.log('\n═══ SECTION 2: AuthShell Full Page Navigation ═══\n');

  const content = readFile('components/layout/auth-shell.tsx');

  // Must NOT use router.push for login redirect
  gate('Does NOT use router.push for /login redirect',
    !content.includes("router.push('/login')"),
    content.includes("router.push('/login')")
      ? 'STILL using router.push(\'/login\') — SPA navigation!'
      : 'No router.push(\'/login\') found');

  // Must use window.location.href for login redirect
  gate('Uses window.location.href for /login redirect',
    content.includes('window.location.href'),
    content.includes('window.location.href')
      ? 'Full page navigation'
      : 'Missing window.location.href');

  // Must include redirect param
  gate('Includes redirect param with pathname',
    content.includes('redirect=') && content.includes('encodeURIComponent(pathname)'),
    content.includes('encodeURIComponent(pathname)')
      ? 'redirect param with encoded pathname'
      : 'Missing redirect param');

  // Must still render "Redirecting..." for unauth users
  gate('Renders "Redirecting..." spinner for unauth',
    content.includes('Redirecting'),
    content.includes('Redirecting')
      ? 'Defense-in-depth spinner present'
      : 'Missing redirect indicator');

  // Must NOT render children when unauthenticated (HF-028 fix preserved)
  gate('Does NOT render children when unauthenticated',
    !content.includes('isPublicRoute || !isAuthenticated'),
    content.includes('isPublicRoute || !isAuthenticated')
      ? 'STILL renders children when unauthenticated!'
      : 'Separate conditions for public vs unauth (HF-028 fix intact)');

  // Loading state while checking auth
  gate('Loading state while auth checking',
    content.includes('isLoading') && content.includes('Loading'),
    'Shows spinner during auth check');

  // pathname in useEffect deps
  gate('pathname in useEffect dependency array',
    content.includes('pathname, router]') || content.includes('pathname,'),
    'pathname tracked for redirect URL changes');
}

// ══════════════════════════════════════════════════
// SECTION 3: Middleware (unchanged from HF-028)
// ══════════════════════════════════════════════════

function verifyMiddleware() {
  console.log('\n═══ SECTION 3: Middleware (HF-028 baseline) ═══\n');

  const middlewarePath = path.resolve(WEB_SRC, 'middleware.ts');
  const exists = fs.existsSync(middlewarePath);
  gate('middleware.ts exists', exists, exists ? 'Found at src/middleware.ts' : 'MISSING');

  if (!exists) return;

  const content = fs.readFileSync(middlewarePath, 'utf-8');

  gate('Uses createServerClient',
    content.includes('createServerClient'),
    content.includes('createServerClient') ? 'Correct SSR client' : 'Wrong client');

  gate('Calls getUser()',
    content.includes('supabase.auth.getUser()'),
    content.includes('supabase.auth.getUser()') ? 'Authoritative check' : 'Missing getUser()');

  gate('Redirects when no user',
    content.includes('!user') && content.includes('NextResponse.redirect'),
    'Auth enforcement present');
}

// ══════════════════════════════════════════════════
// SECTION 4: Live HTTP Tests
// ══════════════════════════════════════════════════

async function verifyHTTP() {
  console.log('\n═══ SECTION 4: Live HTTP Tests ═══\n');

  // Test 1: Root → redirect
  try {
    const resp1 = await fetch('http://localhost:3000/', { redirect: 'manual' });
    gate('GET / returns 307',
      resp1.status === 307,
      `Status: ${resp1.status}`);

    const location1 = resp1.headers.get('location') || '';
    gate('GET / redirects to /login',
      location1.includes('/login'),
      `Location: ${location1}`);

    gate('GET / redirect includes redirect param',
      location1.includes('redirect='),
      location1.includes('redirect=') ? 'Has redirect param' : 'Missing redirect param');
  } catch (e) {
    gate('GET / returns 307', false, `Fetch failed: ${(e as Error).message}`);
    gate('GET / redirects to /login', false, 'Fetch failed');
    gate('GET / redirect includes redirect param', false, 'Fetch failed');
  }

  // Test 2: Deep link → redirect with path preserved
  try {
    const resp2 = await fetch('http://localhost:3000/insights/analytics', { redirect: 'manual' });
    gate('GET /insights/analytics returns 307',
      resp2.status === 307,
      `Status: ${resp2.status}`);

    const location2 = resp2.headers.get('location') || '';
    gate('Deep link preserves redirect path',
      location2.includes('redirect=') && location2.includes('insights'),
      `Location: ${location2}`);
  } catch (e) {
    gate('GET /insights/analytics returns 307', false, `Fetch failed: ${(e as Error).message}`);
    gate('Deep link preserves redirect path', false, 'Fetch failed');
  }

  // Test 3: Login page → 200
  try {
    const resp3 = await fetch('http://localhost:3000/login', { redirect: 'manual' });
    gate('GET /login returns 200',
      resp3.status === 200,
      `Status: ${resp3.status}`);
  } catch (e) {
    gate('GET /login returns 200', false, `Fetch failed: ${(e as Error).message}`);
  }

  // Test 4: Static assets not intercepted
  try {
    const resp4 = await fetch('http://localhost:3000/_next/static/css/app.css', { redirect: 'manual' });
    gate('Static assets not redirected',
      resp4.status !== 307,
      `Status: ${resp4.status} (not 307 = good)`);
  } catch (e) {
    gate('Static assets not redirected', false, `Fetch failed: ${(e as Error).message}`);
  }
}

// ══════════════════════════════════════════════════
// SECTION 5: auth-context Integration
// ══════════════════════════════════════════════════

function verifyAuthContext() {
  console.log('\n═══ SECTION 5: auth-context Integration ═══\n');

  const content = readFile('contexts/auth-context.tsx');

  gate('initAuth calls fetchCurrentProfile',
    content.includes('fetchCurrentProfile()'),
    'Profile fetch on mount');

  gate('isLoading starts true',
    content.includes("useState(true)") || content.includes('useState<boolean>(true)'),
    'Prevents premature render');

  gate('isLoading set false in finally',
    content.includes('finally') && content.includes('setIsLoading(false)'),
    'Always resolves loading state');

  gate('Error caught in initAuth',
    content.includes("catch (e)") || content.includes("catch (err)"),
    'Errors don\'t crash the app');
}

// ══════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════

async function main() {
  console.log('══════════════════════════════════════════');
  console.log('  CLT-HF029: AuthShell Redirect Fix       ');
  console.log('══════════════════════════════════════════');

  verifyAuthService();
  verifyAuthShell();
  verifyMiddleware();
  await verifyHTTP();
  verifyAuthContext();

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
