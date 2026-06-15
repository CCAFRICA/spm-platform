'use client';

/**
 * useDrillThrough — OB-211 Phase B: the shared drill-through mechanism (the WS-3 enabler).
 *
 * Unifies the repeated inline drill lifecycle that lived as ad-hoc `useState<T|null>` + open/close +
 * reset-on-dependency-change on /operate/results (the anomaly claim drill and the row drill). The hook
 * owns ONLY the surface-agnostic lifecycle: a nullable target, open/close, and an automatic reset when
 * a dependency (e.g. the selected batch) changes. The per-surface VIEW and any telemetry stay at the
 * call site (e.g. `captureResults(...)` before `open(...)` — the existing signal path, no new path).
 *
 * T is per-surface: anomaly = { claim, entityIds, claimedCount }; row = the entity id.
 * WS-3's dead-control dispositions consume this (every reusable drill prop opens through it).
 */

import { useState, useCallback, useEffect } from 'react';

export interface DrillThrough<T> {
  target: T | null;
  open: (t: T) => void;
  close: () => void;
  isOpen: boolean;
}

export function useDrillThrough<T>(resetKey?: unknown): DrillThrough<T> {
  const [target, setTarget] = useState<T | null>(null);

  const open = useCallback((t: T) => setTarget(t), []);
  const close = useCallback(() => setTarget(null), []);

  // Reset on dependency change (e.g. batch switch closes any open drill) — replaces the inline reset.
  useEffect(() => {
    setTarget(null);
  }, [resetKey]);

  return { target, open, close, isOpen: target !== null };
}
