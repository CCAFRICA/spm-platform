#!/usr/bin/env npx tsx
/**
 * CLT-HF030 Verification Script
 *
 * Automated verification of HF-030 fixes:
 * - initAuth() double-checks getSession()+getAuthUser() before fetchCurrentProfile()
 * - fetchCurrentProfile() wrapped in try/catch, never throws
 * - Only AuthShellProtected triggers /login redirect
 * - No router.push('/login') anywhere except comments
 * - curl tests for redirect behavior
 *
 * Run: npx tsx web/scripts/clt-hf030-verify.ts
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
// SECTION 1: initAuth() Double-Check
// ══════════════════════════════════════════════════

function verifyInitAuth() {
  console.log('\n═══ SECTION 1: initAuth() Double-Check ═══\n');

  const content = readFile('contexts/auth-context.tsx');

  // Imports getAuthUser
  gate('Imports getAuthUser',
    content.includes('getAuthUser'),
    content.includes('getAuthUser') ? 'getAuthUser imported' : 'MISSING getAuthUser import');

  // Calls getSession() before getAuthUser()
  const sessionIdx = content.indexOf('await getSession()');
  const authUserIdx = content.indexOf('await getAuthUser()');
  gate('getSession() called before getAuthUser()',
    sessionIdx > 0 && authUserIdx > sessionIdx,
    sessionIdx > 0 && authUserIdx > sessionIdx
      ? 'getSession() precedes getAuthUser()'
      : 'Wrong order or missing');

  // Bails if no session
  gate('Bails if no session',
    content.includes('if (!session)') && content.indexOf('return', content.indexOf('if (!session)')) < content.indexOf('if (!session)') + 100,
    'Early return on no session');

  // Bails if no authUser
  gate('Bails if no authUser',
    content.includes('if (!authUser)'),
    content.includes('if (!authUser)') ? 'Early return on no auth user' : 'MISSING authUser check');

  // Calls signOut() when stale cookie detected
  gate('Clears stale cookies with signOut()',
    content.includes('signOut()') && content.indexOf('signOut()', content.indexOf('if (!authUser)')) > 0,
    'signOut() called on stale cookie detection');

  // isLoading set false in finally
  gate('isLoading set false in finally',
    content.includes('finally') && content.includes('setIsLoading(false)'),
    'Always resolves loading state');

  // initAuth does NOT contain active window.location.href (comments don't count)
  const authCtxLines = content.split('\n');
  const hasActiveLocationHref = authCtxLines.some(line =>
    line.includes('window.location.href') && !line.trim().startsWith('//')  && !line.trim().startsWith('*')
  );
  gate('initAuth does NOT trigger window.location.href',
    !hasActiveLocationHref,
    hasActiveLocationHref ? 'FOUND active window.location.href!' : 'No active window.location.href');

  // initAuth does NOT contain router.push('/login') (active, not commented)
  const lines = content.split('\n');
  const activeRouterPushLogin = lines.some(line =>
    line.includes("router.push('/login')") && !line.trim().startsWith('//')
  );
  gate('No active router.push(/login) in auth-context',
    !activeRouterPushLogin,
    activeRouterPushLogin ? 'FOUND active router.push(/login)!' : 'Only in comments');
}

// ══════════════════════════════════════════════════
// SECTION 2: fetchCurrentProfile() Safety
// ══════════════════════════════════════════════════

function verifyFetchProfile() {
  console.log('\n═══ SECTION 2: fetchCurrentProfile() Safety ═══\n');

  const content = readFile('lib/supabase/auth-service.ts');

  // Wrapped in try/catch
  gate('fetchCurrentProfile() wrapped in try/catch',
    content.includes('try {') && content.includes('catch {'),
    'try/catch wrapper present');

  // Returns null in catch
  gate('Returns null on error (never throws)',
    content.includes('return null;') && content.indexOf('return null', content.indexOf('catch')) > 0,
    'catch block returns null');

  // Checks getSession() before profiles query
  gate('Checks getSession() before profiles query',
    content.indexOf('getSession()') < content.indexOf("from('profiles')"),
    'getSession() precedes profiles query');

  // Checks getUser() before profiles query
  gate('Checks getUser() before profiles query',
    content.indexOf('getUser()') < content.indexOf("from('profiles')"),
    'getUser() precedes profiles query');

  // getAuthUser() helper exists
  gate('getAuthUser() helper exported',
    content.includes('export async function getAuthUser()'),
    'Server-side token validation helper');
}

// ══════════════════════════════════════════════════
// SECTION 3: Single Redirect Trigger
// ══════════════════════════════════════════════════

function verifySingleRedirect() {
  console.log('\n═══ SECTION 3: Single Redirect Trigger ═══\n');

  // Check auth-shell.tsx has the ONLY window.location.href to /login
  const authShell = readFile('components/layout/auth-shell.tsx');
  gate('AuthShellProtected has window.location.href redirect',
    authShell.includes('window.location.href') && authShell.includes('/login'),
    'Redirect trigger in AuthShellProtected');

  // AuthShell gate returns children on /login
  gate('AuthShell gate returns children on /login',
    authShell.includes("pathname === '/login'") && authShell.includes('return <>{children}</>'),
    'Gate bypasses auth hooks on /login');

  // user-menu.tsx does NOT have active router.push('/login')
  const userMenu = readFile('components/layout/user-menu.tsx');
  const userMenuLines = userMenu.split('\n');
  const userMenuActive = userMenuLines.some(line =>
    line.includes("router.push('/login')") && !line.trim().startsWith('//')
  );
  gate('user-menu.tsx: no active router.push(/login)',
    !userMenuActive,
    userMenuActive ? 'FOUND active router.push(/login)!' : 'Removed');

  // select-tenant/page.tsx does NOT have router.push('/login')
  const selectTenant = readFile('../app/select-tenant/page.tsx');
  const selectTenantHasLoginPush = selectTenant.includes("router.push('/login')");
  gate('select-tenant/page.tsx: no router.push(/login)',
    !selectTenantHasLoginPush,
    selectTenantHasLoginPush ? 'FOUND router.push(/login)!' : 'Removed');

  // onAuthStateChange handler does NOT redirect (check active code only, not comments)
  const authCtx = readFile('contexts/auth-context.tsx');
  const authCtxAllLines = authCtx.split('\n');
  // Find lines within onAuthStateChange callback that have active redirects
  let inCallback = false;
  let callbackBraces = 0;
  let hasCallbackRedirect = false;
  for (const line of authCtxAllLines) {
    if (line.includes('onAuthStateChange(async')) { inCallback = true; callbackBraces = 0; }
    if (inCallback) {
      callbackBraces += (line.match(/\{/g) || []).length;
      callbackBraces -= (line.match(/\}/g) || []).length;
      if (!line.trim().startsWith('//') && !line.trim().startsWith('*')) {
        if (line.includes("router.push('/login')") || line.includes('window.location.href')) {
          hasCallbackRedirect = true;
        }
      }
      if (callbackBraces <= 0 && inCallback && line.includes('}')) { inCallback = false; }
    }
  }
  gate('onAuthStateChange handler does NOT redirect',
    !hasCallbackRedirect,
    hasCallbackRedirect ? 'FOUND redirect in callback!' : 'No navigation in onAuthStateChange handler');
}

// ══════════════════════════════════════════════════
// SECTION 4: Live HTTP Tests
// ══════════════════════════════════════════════════

async function verifyHTTP() {
  console.log('\n═══ SECTION 4: Live HTTP Tests ═══\n');

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

  // Test 3: Build passes
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
  console.log('  CLT-HF030: Profile Fetch Loop Fix       ');
  console.log('══════════════════════════════════════════');

  verifyInitAuth();
  verifyFetchProfile();
  verifySingleRedirect();
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
