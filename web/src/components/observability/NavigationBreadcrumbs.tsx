'use client';

// OB-230 Objective 3C — navigation breadcrumb events (diagnostic, NOT analytics).
// Logs navigation.route_change on each route transition so an admin can see the path a user took
// before an error. HALT-3: OPT-IN, default OFF — no-ops unless the platform setting
// `enable_navigation_tracking` is true. Same-route transitions within the dedup window collapse to one
// event (the dedupKey is keyed on the pathname). Renders nothing.

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { logAuthEventClient } from '@/lib/auth/auth-logger';

export function NavigationBreadcrumbs() {
  const pathname = usePathname();
  const previous = useRef<string | null>(null);
  const [enabled, setEnabled] = useState(false);

  // Read the opt-in flag once (public flags route; default OFF if absent).
  useEffect(() => {
    let alive = true;
    fetch('/api/platform/flags')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d || typeof d !== 'object') return;
        const flags = (d.flags ?? d) as Record<string, unknown>;
        if (flags.enable_navigation_tracking === true) setEnabled(true);
      })
      .catch(() => { /* default OFF */ });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!enabled) { previous.current = pathname; return; }
    const from = previous.current;
    previous.current = pathname;
    logAuthEventClient(
      'navigation.route_change',
      { pathname, from },
      `navigation.route_change:${pathname}`,
    );
  }, [pathname, enabled]);

  return null;
}
