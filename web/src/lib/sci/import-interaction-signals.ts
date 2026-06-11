// OB-203 Phase 4 (R3) — import-surface interaction capture (generalizes DS-015 stream_interaction).
// Buffered + batch-flushed per the stream-signals precedent, but flushed through the SR-39 server
// route (POST /api/import/sci/interaction), which authorizes the tenant against the session user's
// membership and derives the write tenant server-side. The client never writes signals directly.
//
// The Phase 5 resolution surface consumes the SAME capture API — no rework.

const BUFFER_SIZE = 10;
const FLUSH_INTERVAL_MS = 30_000;

export type ImportInteractionAction = 'view' | 'expand' | 'action_click' | 'correction' | 'dwell';
export interface ImportInteractionEvent {
  surface: string;
  action: ImportInteractionAction;
  unitId?: string;
  dwellMs?: number;
  metadata?: Record<string, unknown>;
  dedupKey?: string;   // when set, the event fires at most once per session (e.g. one `view` per unit)
}

let buffer: Omit<ImportInteractionEvent, 'dedupKey'>[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let ctx: { tenantId: string; importSessionId: string } | null = null;
const emittedKeys = new Set<string>();

/** Bind the active import session — required before captures flush (tenant is re-validated server-side). */
export function setImportInteractionContext(tenantId: string, importSessionId: string): void {
  ctx = { tenantId, importSessionId };
}

async function flush(): Promise<void> {
  if (buffer.length === 0 || !ctx) return;
  const events = [...buffer];
  buffer = [];
  try {
    await fetch('/api/import/sci/interaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId: ctx.tenantId, importSessionId: ctx.importSessionId, events }),
    });
  } catch (e) {
    // capture must never disrupt the UI
    console.warn('[ImportInteraction] flush failed (non-blocking):', e instanceof Error ? e.message : String(e));
  }
}

function schedule(): void {
  if (timer) return;
  timer = setTimeout(() => { timer = null; void flush(); }, FLUSH_INTERVAL_MS);
}

export function captureImportInteraction(ev: ImportInteractionEvent): void {
  if (ev.dedupKey) {
    if (emittedKeys.has(ev.dedupKey)) return;
    emittedKeys.add(ev.dedupKey);
  }
  const { dedupKey: _omit, ...event } = ev;
  void _omit;
  buffer.push(event);
  if (buffer.length >= BUFFER_SIZE) void flush();
  else schedule();
}

/** Flush pending captures immediately (call on unmount / navigation). */
export function flushPendingImportInteractions(): void {
  if (timer) { clearTimeout(timer); timer = null; }
  void flush();
}
