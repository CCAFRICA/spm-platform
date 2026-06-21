'use client';

// HF-330 Defect A — route-scoped error boundary for the onboarding-critical import flow.
//
// The reported crash ("Something went wrong. A critical error occurred. Please refresh the page.")
// is the text of the ROOT-layout boundary src/app/global-error.tsx, not a fault in the import page
// itself: the import render path is sound, every import is resolved, and the root layout's awaited
// server functions (getServerAuthState / getResolvedTheme) are already try/catch'd with safe
// fallbacks, so the reported root-layout crash could not be reproduced and no code defect was found
// in the import path (see HF-330 completion report §Defect A).
//
// This boundary is defense-in-depth for the route that gates ALL data upload: any error thrown within
// the /operate/import subtree (the page or any child like SCIUpload / SCIProposal / SCIExecution) is
// now CAUGHT HERE and rendered as a recoverable, in-place retry — the rest of the app stays alive and
// the user is never dead-ended on a generic error screen with no way back into the import flow. Next's
// error boundaries do not catch errors in an ancestor layout, so a genuine root-layout fault still
// surfaces via global-error; this scopes and recovers everything from the page down.

import { useEffect } from 'react';

export default function ImportError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Surface for diagnostics without crashing — the digest correlates to the server log entry.
    console.error('[ImportRoute] boundary caught:', error);
  }, [error]);

  return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ maxWidth: 460, textAlign: 'center' }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Import couldn’t load</h2>
        <p style={{ fontSize: 14, opacity: 0.7, marginBottom: 20 }}>
          Something interrupted the import screen. Your data was not changed. Try again — if it keeps
          happening, reload the page.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button
            onClick={() => reset()}
            style={{ padding: '8px 16px', borderRadius: 8, background: '#4446B8', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            Try again
          </button>
          <button
            onClick={() => window.location.reload()}
            style={{ padding: '8px 16px', borderRadius: 8, background: 'transparent', border: '1px solid currentColor', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: 0.8 }}
          >
            Reload page
          </button>
        </div>
        {error?.digest && <p style={{ fontSize: 11, opacity: 0.4, marginTop: 16 }}>Ref: {error.digest}</p>}
      </div>
    </div>
  );
}
