'use client';

/**
 * useFileObjects — polls GET /api/prism/files for the live spine.
 * Supabase Realtime is not used in this stack, so the spine polls (the same
 * approach the import surface uses). Visibility is enforced server-side by the
 * file_objects RLS SELECT policy; this hook just renders what it is given.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FileRow } from './prism-status';

export function useFileObjects(intervalMs = 1500) {
  const [files, setFiles] = useState<FileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    mounted.current = true;
    refresh();
    const t = setInterval(refresh, intervalMs);
    return () => {
      mounted.current = false;
      clearInterval(t);
    };
  }, [refresh, intervalMs]);

  return { files, loading, error, refresh };
}
