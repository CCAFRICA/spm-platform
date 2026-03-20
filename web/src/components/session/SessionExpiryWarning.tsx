'use client';

/**
 * Session Expiry Monitor — OB-178 / DS-019 Section 4.5
 *
 * TWO STAGES:
 * 1. At 25 min idle: amber WARNING banner (advisory)
 * 2. At 30 min idle: FORCE redirect to /login + hide content (enforcement)
 *
 * The SERVER also enforces (middleware checks vialuce-last-activity).
 * This client-side monitor is defense-in-depth for idle tabs.
 *
 * HF-150: Now enforces redirect, not just warns. Content hidden on expiry.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { SESSION_LIMITS } from '@/lib/supabase/cookie-config';
import { logAuthEventClient } from '@/lib/auth/auth-logger';
import { AlertTriangle } from 'lucide-react';

const IDLE_WARN_MS = SESSION_LIMITS.IDLE_TIMEOUT_MS - SESSION_LIMITS.WARNING_BEFORE_IDLE_MS;
const IDLE_EXPIRE_MS = SESSION_LIMITS.IDLE_TIMEOUT_MS;

export function SessionExpiryWarning() {
  const [showWarning, setShowWarning] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const warnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expireTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetTimers = useCallback(() => {
    setShowWarning(false);

    if (warnTimerRef.current) clearTimeout(warnTimerRef.current);
    if (expireTimerRef.current) clearTimeout(expireTimerRef.current);

    // Warning at 25 min
    warnTimerRef.current = setTimeout(() => {
      setShowWarning(true);
    }, IDLE_WARN_MS);

    // HF-150: Force redirect at 30 min
    expireTimerRef.current = setTimeout(async () => {
      setSessionExpired(true); // Hide content immediately

      // Log the expiry event
      try {
        await logAuthEventClient('auth.session.expired.idle', {
          reason: 'idle_timeout',
        });
      } catch {
        // Don't block redirect
      }

      // Force redirect — replace prevents back button
      window.location.replace('/login?reason=idle_timeout');
    }, IDLE_EXPIRE_MS);
  }, []);

  useEffect(() => {
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'] as const;
    const handler = () => {
      if (!sessionExpired) resetTimers();
    };

    events.forEach(e => window.addEventListener(e, handler, { passive: true }));
    resetTimers(); // Start on mount

    return () => {
      events.forEach(e => window.removeEventListener(e, handler));
      if (warnTimerRef.current) clearTimeout(warnTimerRef.current);
      if (expireTimerRef.current) clearTimeout(expireTimerRef.current);
    };
  }, [resetTimers, sessionExpired]);

  // HF-150: Content hidden on session expiry
  if (sessionExpired) {
    return (
      <div className="fixed inset-0 z-[100] bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto mb-3" />
          <p className="text-sm text-zinc-300">Session expired. Redirecting to login...</p>
        </div>
      </div>
    );
  }

  if (!showWarning) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-amber-600 text-white px-4 py-2 text-center text-sm font-medium shadow-lg">
      <AlertTriangle className="inline-block w-4 h-4 mr-2 -mt-0.5" />
      Your session will expire in 5 minutes due to inactivity. Click anywhere to stay logged in.
    </div>
  );
}
