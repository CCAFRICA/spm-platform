'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // OB-230 3A: report the root-layout fault to platform_events (raw fetch — no deps that could
  // themselves fail inside the error boundary). Best-effort, never throws.
  useEffect(() => {
    try {
      fetch('/api/auth/log-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'client.error.unhandled',
          payload: {
            message: String(error?.message || 'root layout error').slice(0, 500),
            stack: String(error?.stack || '').slice(0, 2000),
            digest: error?.digest ?? null,
            pathname: typeof window !== 'undefined' ? window.location.pathname : null,
            kind: 'global-error-boundary',
          },
        }),
      }).catch(() => {});
    } catch { /* never block the error screen */ }
  }, [error]);

  return (
    <html>
      <body>
        <div className="min-h-screen flex items-center justify-center p-6" style={{ background: '#0a0e1a' }}>
          <div className="text-center max-w-md">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6" style={{ background: 'rgba(239, 68, 68, 0.15)' }}>
              <AlertTriangle className="h-8 w-8 text-red-400" />
            </div>
            <h2 className="text-2xl font-bold mb-2" style={{ color: '#e4e4e7' }}>
              Something went wrong
            </h2>
            <p className="mb-6" style={{ color: '#71717a' }}>
              A critical error occurred. Please refresh the page.
            </p>
            <Button onClick={reset}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          </div>
        </div>
      </body>
    </html>
  );
}
