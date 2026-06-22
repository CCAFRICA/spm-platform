/**
 * OB-230 — Lightweight, dependency-free user-agent parser.
 *
 * Raw user_agent strings are never shown to the admin (directive §2B). This turns a UA string into
 * "{Browser} {major} / {OS}" — e.g. "Chrome 149 / Windows 10".
 *
 * Named test case (§6A residual, from the VLADMIN investigation):
 *   "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)
 *    FxiOS/152.0 Mobile/15E148 Safari/604.1"  →  "Firefox iOS 152 / iPhone iOS 18.7"
 *
 * Structural detection only — no enumerated device registry. Unknown UAs degrade to "Unknown device".
 */

export interface ParsedUserAgent {
  browser: string;
  browserVersion: string; // major version only
  os: string;
  label: string;
}

const UNKNOWN: ParsedUserAgent = { browser: 'Unknown', browserVersion: '', os: 'Unknown', label: 'Unknown device' };

function major(version: string | undefined): string {
  if (!version) return '';
  return version.split('.')[0] || '';
}

function matchVersion(ua: string, token: string): string {
  // token like "FxiOS" → capture digits/dots after "FxiOS/"
  const m = ua.match(new RegExp(`${token}[/ ]([0-9._]+)`, 'i'));
  return m ? major(m[1].replace(/_/g, '.')) : '';
}

function detectBrowser(ua: string): { browser: string; browserVersion: string } {
  // Order matters: most specific tokens first (Edge/Opera/iOS-wrapped browsers before Chrome/Safari).
  if (/Edg(?:A|iOS)?\//i.test(ua)) return { browser: 'Edge', browserVersion: matchVersion(ua, 'Edg(?:A|iOS)?') };
  if (/OPR\/|Opera/i.test(ua)) return { browser: 'Opera', browserVersion: matchVersion(ua, 'OPR') || matchVersion(ua, 'Opera') };
  if (/FxiOS\//i.test(ua)) return { browser: 'Firefox iOS', browserVersion: matchVersion(ua, 'FxiOS') };
  if (/CriOS\//i.test(ua)) return { browser: 'Chrome iOS', browserVersion: matchVersion(ua, 'CriOS') };
  if (/Firefox\//i.test(ua)) return { browser: 'Firefox', browserVersion: matchVersion(ua, 'Firefox') };
  if (/SamsungBrowser\//i.test(ua)) return { browser: 'Samsung Internet', browserVersion: matchVersion(ua, 'SamsungBrowser') };
  if (/Chrome\//i.test(ua)) return { browser: 'Chrome', browserVersion: matchVersion(ua, 'Chrome') };
  // Safari reports its marketing version via "Version/"; the "Safari/" token is the WebKit build.
  if (/Safari\//i.test(ua) && /Version\//i.test(ua)) return { browser: 'Safari', browserVersion: matchVersion(ua, 'Version') };
  return { browser: 'Unknown', browserVersion: '' };
}

function detectOs(ua: string): string {
  // iOS family first — iPhone/iPad UAs also contain "like Mac OS X".
  let m = ua.match(/iPhone OS ([0-9_]+)/i);
  if (m) return `iPhone iOS ${m[1].replace(/_/g, '.')}`;
  m = ua.match(/iPad;.*?OS ([0-9_]+)/i) || ua.match(/iPad.*?CPU OS ([0-9_]+)/i);
  if (m) return `iPad iOS ${m[1].replace(/_/g, '.')}`;
  if (/iPad/i.test(ua)) return 'iPad iOS';

  m = ua.match(/Android ([0-9.]+)/i);
  if (m) return `Android ${m[1]}`;
  if (/Android/i.test(ua)) return 'Android';

  m = ua.match(/Windows NT ([0-9.]+)/i);
  if (m) {
    const WIN: Record<string, string> = { '10.0': '10', '6.3': '8.1', '6.2': '8', '6.1': '7' };
    return `Windows ${WIN[m[1]] ?? m[1]}`;
  }

  if (/CrOS/i.test(ua)) return 'ChromeOS';

  m = ua.match(/Mac OS X ([0-9_]+)/i);
  if (m) {
    const v = m[1].replace(/_/g, '.').split('.').slice(0, 2).join('.');
    return `macOS ${v}`;
  }
  if (/Macintosh|Mac OS X/i.test(ua)) return 'macOS';

  if (/Linux/i.test(ua)) return 'Linux';
  return 'Unknown';
}

export function parseUserAgent(ua: string | null | undefined): ParsedUserAgent {
  if (!ua || typeof ua !== 'string' || ua.trim() === '' || ua.toLowerCase() === 'unknown') return UNKNOWN;

  const { browser, browserVersion } = detectBrowser(ua);
  const os = detectOs(ua);

  if (browser === 'Unknown' && os === 'Unknown') return { ...UNKNOWN, label: 'Unknown device' };

  const browserPart = browserVersion ? `${browser} ${browserVersion}` : browser;
  const label = browser === 'Unknown' ? os : os === 'Unknown' ? browserPart : `${browserPart} / ${os}`;
  return { browser, browserVersion, os, label };
}
