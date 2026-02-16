#!/usr/bin/env npx tsx
/**
 * CLT-HF031 Verification Script
 *
 * Automated verification of HF-031 fixes:
 * - logout() navigates immediately with window.location.href = '/login'
 * - AuthShellProtected still has backup redirect
 * - No router.push('/login') anywhere (active code only)
 * - Middleware env var guard has warning log
 * - Defense-in-depth: exactly 2 redirect triggers
 * - curl tests for redirect behavior
 *
 * Run: npx tsx web/scripts/clt-hf031-verify.ts
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

function readFileFromRoot(relPath: string): string {
  const full = path.resolve(__dirname, '..', relPath);
  if (!fs.existsSync(full)) return '';
  return fs.readFileSync(full, 'utf-8');
}

// ══════════════════════════════════════════════════
// SECTION 1: logout() Navigation
// ══════════════════════════════════════════════════

function verifyLogout() {
  console.log('\n═══ SECTION 1: logout() Navigation ═══\n');

  const content = readFile('contexts/auth-context.tsx');

  // logout() calls signOut()
  gate('logout() calls signOut()',
    content.includes('await signOut()'),
    'signOut() called before cleanup');

  // logout() sets user to null
  gate('logout() clears user state',
    content.includes('setUser(null)') && content.includes('setCapabilities([])'),
    'setUser(null) + setCapabilities([])');

  // logout() navigates with window.location.href
  const logoutStart = content.indexOf('const logout = useCallback');
  const logoutEnd = content.indexOf('}, [])', logoutStart);
  const logoutBody = content.substring(logoutStart, logoutEnd);

  gate('logout() navigates to /login',
    logoutBody.includes("window.location.href = '/login'"),
    logoutBody.includes("window.location.href = '/login'")
      ? 'window.location.href = /login in logout()'
      : 'MISSING navigation in logout()');

  // logout() does NOT use router.push
  gate('logout() does NOT use router.push',
    !logoutBody.includes('router.push'),
    'No router.push in logout()');
}

// ══════════════════════════════════════════════════
// SECTION 2: AuthShellProtected Backup Redirect
// ══════════════════════════════════════════════════

function verifyAuthShell() {
  console.log('\n═══ SECTION 2: AuthShellProtected Backup Redirect ═══\n');

  const content = readFile('components/layout/auth-shell.tsx');

  // AuthShell gate on /login
  gate('AuthShell gate returns children on /login',
    content.includes("pathname === '/login'") && content.includes('return <>{children}</>'),
    'Gate bypasses auth hooks on /login');

  // AuthShellProtected has window.location.href redirect
  gate('AuthShellProtected has backup redirect',
    content.includes('window.location.href') && content.includes('/login'),
    'Backup redirect in AuthShellProtected');

  // AuthShellProtected shows "Loading..." spinner
  gate('AuthShellProtected shows Loading spinner',
    content.includes('Loading...'),
    'Loading spinner while checking auth');

  // AuthShellProtected shows "Redirecting..." spinner
  gate('AuthShellProtected shows Redirecting spinner',
    content.includes('Redirecting...'),
    'Redirecting spinner while redirect fires');
}

// ══════════════════════════════════════════════════
// SECTION 3: No Rogue Redirects
// ══════════════════════════════════════════════════

function verifyNoRogueRedirects() {
  console.log('\n═══ SECTION 3: No Rogue Redirects ═══\n');

  // No router.push('/login') anywhere in active code
  const filesToCheck = [
    'contexts/auth-context.tsx',
    'components/layout/user-menu.tsx',
    'components/layout/auth-shell.tsx',
  ];

  for (const file of filesToCheck) {
    const content = readFile(file);
    const lines = content.split('\n');
    const activeRouterPush = lines.some(line =>
      line.includes("router.push('/login')") && !line.trim().startsWith('//') && !line.trim().startsWith('*')
    );
    gate(`${file.split('/').pop()}: no active router.push(/login)`,
      !activeRouterPush,
      activeRouterPush ? 'FOUND active router.push(/login)!' : 'Clean');
  }

  // select-tenant does NOT have router.push('/login')
  const selectTenant = readFile('../app/select-tenant/page.tsx');
  gate('select-tenant: no router.push(/login)',
    !selectTenant.includes("router.push('/login')"),
    'Clean');

  // Count window.location.href = '/login' triggers (should be exactly 2)
  const allFiles = [
    'contexts/auth-context.tsx',
    'components/layout/auth-shell.tsx',
    'components/layout/user-menu.tsx',
  ];
  let activeLocationHrefCount = 0;
  for (const file of allFiles) {
    const content = readFile(file);
    const lines = content.split('\n');
    for (const line of lines) {
      if (
        line.includes('window.location.href') &&
        line.includes('/login') &&
        !line.trim().startsWith('//') &&
        !line.trim().startsWith('*')
      ) {
        activeLocationHrefCount++;
      }
    }
  }
  gate('Exactly 2 active window.location.href=/login triggers',
    activeLocationHrefCount === 2,
    `Found ${activeLocationHrefCount} (expected 2: logout + AuthShellProtected)`);
}

// ══════════════════════════════════════════════════
// SECTION 4: Middleware Hardening
// ══════════════════════════════════════════════════

function verifyMiddleware() {
  console.log('\n═══ SECTION 4: Middleware Hardening ═══\n');

  const content = readFileFromRoot('src/middleware.ts');

  // Middleware has console.warn for missing env vars
  gate('Middleware logs warning on missing env vars',
    content.includes('console.warn') && content.includes('auth enforcement disabled'),
    'Warning logged when env vars missing');

  // Middleware calls getUser() for server-side validation
  gate('Middleware calls getUser()',
    content.includes('supabase.auth.getUser()'),
    'Server-side auth validation');

  // Middleware redirects unauth to /login
  gate('Middleware redirects unauth to /login',
    content.includes("'/login'") && content.includes('NextResponse.redirect'),
    'Redirect to /login for unauth users');

  // Middleware has PUBLIC_PATHS
  gate('Middleware has PUBLIC_PATHS',
    content.includes('PUBLIC_PATHS') && content.includes('/login') && content.includes('/api/auth'),
    'Public paths configured');
}

// ══════════════════════════════════════════════════
// SECTION 5: initAuth() Defense
// ══════════════════════════════════════════════════

function verifyInitAuth() {
  console.log('\n═══ SECTION 5: initAuth() Defense ═══\n');

  const content = readFile('contexts/auth-context.tsx');

  // getSession() called before getAuthUser()
  const sessionIdx = content.indexOf('await getSession()');
  const authUserIdx = content.indexOf('await getAuthUser()');
  gate('initAuth: getSession() before getAuthUser()',
    sessionIdx > 0 && authUserIdx > sessionIdx,
    'Double-check order correct');

  // Bails if no session
  gate('initAuth: bails if no session',
    content.includes('if (!session)'),
    'Early return on no session');

  // Bails if no authUser + calls signOut
  gate('initAuth: bails if no authUser + clears stale cookies',
    content.includes('if (!authUser)') && content.indexOf('signOut()', content.indexOf('if (!authUser)')) > 0,
    'signOut() on stale cookie detection');

  // isLoading set false in finally
  gate('initAuth: isLoading set false in finally',
    content.includes('finally') && content.includes('setIsLoading(false)'),
    'Always resolves loading state');
}

// ══════════════════════════════════════════════════
// SECTION 6: Live HTTP Tests
// ══════════════════════════════════════════════════

async function verifyHTTP() {
  console.log('\n═══ SECTION 6: Live HTTP Tests ═══\n');

  // Test 1: Root → 307 redirect
  try {
    const resp1 = await fetch('http://localhost:3000/', { redirect: 'manual' });
    gate('GET / returns 307',
      resp1.status === 307,
      `Status: ${resp1.status}`);

    const location1 = resp1.headers.get('location') || '';
    gate('GET / redirects to /login with redirect param',
      location1.includes('/login') && location1.includes('redirect='),
      `Location: ${location1}`);
  } catch (e) {
    gate('GET / returns 307', false, `Fetch failed: ${(e as Error).message}`);
    gate('GET / redirects to /login with redirect param', false, 'Fetch failed');
  }

  // Test 2: Login page → 200
  try {
    const resp2 = await fetch('http://localhost:3000/login', { redirect: 'manual' });
    gate('GET /login returns 200',
      resp2.status === 200,
      `Status: ${resp2.status}`);
  } catch (e) {
    gate('GET /login returns 200', false, `Fetch failed: ${(e as Error).message}`);
  }

  // Test 3: /login HTML does NOT contain "Redirecting"
  try {
    const resp3 = await fetch('http://localhost:3000/login');
    const html = await resp3.text();
    const hasRedirecting = html.toLowerCase().includes('redirecting');
    gate('GET /login HTML has no "Redirecting"',
      !hasRedirecting,
      hasRedirecting ? 'FOUND "Redirecting" in HTML!' : 'Clean login page');
  } catch (e) {
    gate('GET /login HTML has no "Redirecting"', false, `Fetch failed: ${(e as Error).message}`);
  }

  // Test 4: /insights → 307
  try {
    const resp4 = await fetch('http://localhost:3000/insights', { redirect: 'manual' });
    gate('GET /insights returns 307',
      resp4.status === 307,
      `Status: ${resp4.status}`);
  } catch (e) {
    gate('GET /insights returns 307', false, `Fetch failed: ${(e as Error).message}`);
  }

  // Test 5: Build artifact exists
  const nextDir = path.resolve(__dirname, '../.next');
  const buildExists = fs.existsSync(nextDir);
  gate('Build artifact exists',
    buildExists,
    buildExists ? '.next directory present' : 'No .next directory');
}

// ══════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════

async function main() {
  console.log('══════════════════════════════════════════');
  console.log('  CLT-HF031: Authentication Gate Fix      ');
  console.log('══════════════════════════════════════════');

  verifyLogout();
  verifyAuthShell();
  verifyNoRogueRedirects();
  verifyMiddleware();
  verifyInitAuth();
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
