'use client';

/**
 * useFileObjects — ADAPTIVE poll of GET /api/prism/files for the live spine (HF-347).
 *
 * Realtime is not used in this stack, so the spine polls — but only when it needs to:
 *   - need-based: an interval runs ONLY while ≥1 file is non-terminal (still moving
 *     through the membrane). When every file is terminal (promoted / infected_held) or
 *     there are none, NO interval runs — zero requests (SR-2).
 *   - terminal-stop: terminal files are never re-polled.
 *   - visibility-pause: polling pauses on document.hidden, resumes (with one refetch)
 *     on focus (Page Visibility API).
 *   - sane cadence: ~2s while in flight, not sub-second.
 * A single fetch on mount establishes current state; callers trigger refresh() after a
 * submission to (re)start the poll. `enabled:false` makes the hook inert (for a child
 * that consumes a parent's poll — avoids a duplicate interval).
 *
 * This is the SHARED spine poller (SR-34): the CDA portal AND the operator Submit /
 * In-Progress surfaces all consume it, so the fix benefits every membrane surface.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { isTerminalState } from '@/lib/prism/types';
import type { FileRow } from './prism-status';

export function useFileObjects(intervalMs = 2000, opts?: { enabled?: boolean }) {
  const enabled = opts?.enabled ?? true;
  const [files, setFiles] = useState<FileRow[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await fetch('/api/prism/files', { cache: 'no-store' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const body = await res.json();
      if (mounted.current) {
        setFiles(body.files ?? []);
        setError(null);
      }
    } catch (e) {
      if (mounted.current) setError(String(e));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [enabled]);

  // Mount lifecycle.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Single initial fetch (and again if the hook is enabled later).
  useEffect(() => {
    if (enabled) void refresh();
  }, [enabled, refresh]);

  // In flight = at least one file still moving through the membrane.
  const inFlight = enabled && files.some((f) => !isTerminalState(f.state));

  // The interval exists ONLY while in flight AND the tab is visible.
  useEffect(() => {
    if (!inFlight) return; // all terminal / empty / disabled → no interval, zero requests

    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer === null) timer = setInterval(() => void refresh(), intervalMs);
    };
    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else {
        void refresh(); // catch up on what changed while hidden
        start();
      }
    };

    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [inFlight, refresh, intervalMs]);

  return { files, loading, error, refresh, inFlight };
}
