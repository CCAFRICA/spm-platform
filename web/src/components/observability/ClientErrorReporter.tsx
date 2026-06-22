'use client';

// OB-230 Objective 3A — client-side error capture. Mounts global window.onerror + unhandledrejection
// handlers and reports them to platform_events as client.error.unhandled (via the existing
// /api/auth/log-event plumbing). Surfaces JS errors a user hits that they may never report. Renders nothing.

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { logAuthEventClient } from '@/lib/auth/auth-logger';

const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);

export function ClientErrorReporter() {
  const pathname = usePathname();

  useEffect(() => {
    const report = (message: string, stack: string, kind: string, extra: Record<string, unknown> = {}) => {
      const msg = truncate(message || 'unknown error', 500);
      // dedupKey on the message so distinct errors within the 5s window are each logged, while an error
      // firing repeatedly (render loop) collapses to one.
      logAuthEventClient(
        'client.error.unhandled',
        { message: msg, stack: truncate(stack || '', 2000), pathname, kind, ...extra },
        `client.error.unhandled:${truncate(msg, 80)}`,
      );
    };

    const onError = (event: ErrorEvent) => {
      report(
        String(event.message || ''),
        event.error?.stack ? String(event.error.stack) : '',
        'error',
        { source: event.filename || null, line: event.lineno ?? null, col: event.colno ?? null },
      );
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason as { message?: unknown; stack?: unknown } | undefined;
      const message = reason?.message ? String(reason.message) : String(event.reason);
      report(message, reason?.stack ? String(reason.stack) : '', 'unhandledrejection');
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, [pathname]);

  return null;
}
