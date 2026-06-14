'use client';

// OB-204 A.7 (I-4) — first-login notice hook. On the first authenticated load of a session,
// fires the version-stamped privacy_notice.presented event (once; sessionStorage-deduped) and
// renders the notice link in the app-shell footer. No gate (Q-J: acknowledgment deferred).
import { useEffect } from 'react';

const SENT_KEY = 'vl_privacy_notice_presented';

export function PrivacyNoticeFooter() {
  useEffect(() => {
    try {
      if (sessionStorage.getItem(SENT_KEY)) return;
    } catch { return; }
    // Flag persists only on a successful (authenticated) emit, so an unauthenticated load
    // does not suppress the real first-login presentation after the user signs in.
    void fetch('/api/privacy-notice/presented', { method: 'POST' })
      .then(r => { if (r.ok) { try { sessionStorage.setItem(SENT_KEY, '1'); } catch { /* ignore */ } } })
      .catch(() => { /* best-effort */ });
  }, []);

  return (
    <footer className="px-4 py-2 text-center text-[11px] text-zinc-500">
      <a href="/legal/privacy" className="hover:text-zinc-300 underline-offset-2 hover:underline">Privacy notice</a>
    </footer>
  );
}
