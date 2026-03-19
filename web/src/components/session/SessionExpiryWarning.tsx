'use client';

/**
 * Session Expiry Warning — OB-178 / DS-019 Section 4.5
 *
 * Shows a non-intrusive banner when the user has been idle for 25 minutes
 * (5 minutes before the 30-minute idle timeout).
 *
 * The SERVER enforces timeout (middleware checks vialuce-last-activity).
 * This component only WARNS — it does not enforce.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { SESSION_LIMITS } from '@/lib/supabase/cookie-config';
import { AlertTriangle } from 'lucide-react';

const IDLE_WARN_MS = SESSION_LIMITS.IDLE_TIMEOUT_MS - SESSION_LIMITS.WARNING_BEFORE_IDLE_MS;

export function SessionExpiryWarning() {
  const [showWarning, setShowWarning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetTimer = useCallback(() => {
    setShowWarning(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setShowWarning(true);
    }, IDLE_WARN_MS);
  }, []);

  useEffect(() => {
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'] as const;
    const handler = () => resetTimer();

    events.forEach(e => window.addEventListener(e, handler, { passive: true }));
    resetTimer(); // Start on mount

    return () => {
      events.forEach(e => window.removeEventListener(e, handler));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [resetTimer]);

  if (!showWarning) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-amber-600 text-white px-4 py-2 text-center text-sm font-medium shadow-lg">
      <AlertTriangle className="inline-block w-4 h-4 mr-2 -mt-0.5" />
      Your session will expire in 5 minutes due to inactivity. Click anywhere to stay logged in.
    </div>
  );
}
