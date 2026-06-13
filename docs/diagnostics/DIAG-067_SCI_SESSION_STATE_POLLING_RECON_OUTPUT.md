# DIAG-067 — SCI Session-State Polling Reconnaissance — OUTPUT

**Repo:** `CCAFRICA/spm-platform` (VP)
**Authored:** 2026-06-13 (CC, against directive `docs/diagnostics/DIAG-067_SCI_SESSION_STATE_POLLING_RECON_20260613.md`)
**Type:** DIAG — read-only reconnaissance. Ships no code, makes no mutation, asserts no cause, proposes no fix.
**HEAD at recon:** `1400fb9e`
**Governing rule:** Rule 7 (Prove, Don't Describe) — every finding below is pasted real code / real grep output with file path + line range. Negative findings paste the confirming command.

---

## 1 — Sequence numbers (Phase 0)

### 1.1 DIAG-067 collision gate — verdict: **CLEAR**

```
$ ls docs/diagnostics/DIAG-067*
docs/diagnostics/DIAG-067_SCI_SESSION_STATE_POLLING_RECON_20260613.md
```

The single match is **the directive itself** (the file the architect authored at that path). The output filename this report claims does not pre-exist:

```
$ ls docs/diagnostics/DIAG-067*OUTPUT*
zsh: no matches found: docs/diagnostics/DIAG-067*OUTPUT*
```

No prior DIAG-067 *output* or competing claim exists. DIAG-067 is unclaimed beyond the directive. **Collision gate: CLEAR.** (No HALT.)

### 1.2 Forthcoming fix-HF number — **next-free is HF-286**

Highest `HF-` on record across filenames, full git history, and `docs/`:

```
$ find . -not -path "*/node_modules/*" -not -path "*/.git/*" \( -iname "*HF-*" -o -iname "*HF_*" \) | grep -oiE "HF[-_]?[0-9]+" | grep -oE "[0-9]+" | sort -n | uniq | tail -3
283
284
285

$ git log --oneline --all | grep -oiE "HF[-_ ]?[0-9]+" | grep -oE "[0-9]+" | sort -n | uniq | tail -3
283
284
285
```

Nothing at 286 or above, in either filenames or full git history:

```
$ find . ... \( -iname "*HF-*" -o -iname "*HF_*" \) | grep -oiE "HF[-_]?[0-9]+" | grep -oE "[0-9]+" | sort -n | uniq | awk '$1>=286'
(empty)
$ git log --oneline --all | grep -oiE "HF[-_ ]?[0-9]+" | grep -oE "[0-9]+" | sort -n | uniq | awk '$1>=286'
(empty)
```

HF-285 is real (directive + completion report + commits `8f04b7e7`/`be0bdc49`/`9688cdbb`/`fdf751e9`/`1047d979`).

> **Highest HF on record is HF-285; next-free is HF-286.**

This independently confirms the handoff's recalled "HF-286" — but the number above is read from the repo, not recalled. (No HALT-3: numbering is clean and contiguous at the top.)

---

## 2 — The session-state poller (Phase 1)

### 2.0 Route path — confirmed, no HALT-2

The literal route the client polls is exactly what the handoff named:

```
$ find web/src/app/api -ipath "*session-state*"
web/src/app/api/import/sci/session-state
web/src/app/api/import/sci/session-state/route.ts
```

→ `/api/import/sci/session-state`. **No path mismatch. HALT-2 does not fire.**

### 2.1 The closed set of session-state callers (no hook-based poller exists)

There is **no `useSWR` / `useQuery` / `usePolling` / `useImportSession` hook** — every poller is a hand-rolled `setInterval` (or `while`/`sleep`) inline in a component. Confirming grep returns empty:

```
$ grep -rnE "useImportSession|usePolling|useSWR|useQuery|refreshInterval|refetchInterval" web/src --include="*.ts" --include="*.tsx"
(empty)
```

The complete set of client `fetch()` calls against the route (7 sites, 5 files — this set is closed):

```
$ grep -rn "import/sci/session-state" web/src --include="*.ts" --include="*.tsx" | grep "fetch("
web/src/app/operate/import/page.tsx:72:        const r = await fetch(`/api/import/sci/session-state?...&importSessionId=...`);
web/src/app/operate/import/page.tsx:114:       const r = await fetch(`/api/import/sci/session-state?...&importSessionId=...`);
web/src/components/sci/SCIProposal.tsx:361:     const res = await fetch(`/api/import/sci/session-state?...&importSessionId=...`);
web/src/components/sci/ImportReadyState.tsx:71:  const res = await fetch(`/api/import/sci/session-state?...&telemetry=1`);
web/src/components/sci/ImportTelemetryPanel.tsx:61: const r = await fetch(`/api/import/sci/session-state?...&telemetry=1`);
web/src/components/sci/SCIExecution.tsx:170:       const r = await fetch(`/api/import/sci/session-state?...&telemetry=1`);
web/src/components/sci/SCIExecution.tsx:210:       const r = await fetch(`/api/import/sci/session-state?...`);
```

Mapped to the client `phase` machine (`web/src/app/operate/import/page.tsx:32-39`) and its render gates (`page.tsx:578-667`):

| Poller | File:lines | Phase mounted | Cadence | Terminal/awaiting stop? |
|---|---|---|---|---|
| `analyzeTabular` interval + recovery loop | `page.tsx:69-91`, `108-122` | `analyzing` | 2000 ms | **Self-terminating** (cleared in `finally`; stall-abort) |
| `SCIProposalView` poll | `SCIProposal.tsx:358-376` | `proposal` | **1500 ms** | **NONE** ← primary offender |
| `ImportReadyState` read | `ImportReadyState.tsx:61-81` | `complete` | one-shot | N/A (fires once, not an interval) |
| `ImportTelemetryPanel` poll | `ImportTelemetryPanel.tsx:56-70` | `analyzing` **and** `executing` | **2000 ms** | **NONE** ← telemetry-variant offender (Phase 2) |
| `SCIExecution.settleFromSurface` | `SCIExecution.tsx:163-197` | `executing` | 2000 ms | **YES** (returns on all-terminal; STALL_MS bound) |
| `SCIExecution` execute-progress | `SCIExecution.tsx:203-223` | `executing` | 2000 ms | **YES** (`if (executionDone) return; if (!hasActive) return;`) |

> Separately, `ImportProgress.tsx` (`processing` phase) polls the **`processing_jobs` Supabase table directly** — a different surface, not this route — and **does** stop (`setPolling(false)` at all-done). Listed in §7 for completeness; out of the route's polling set.

### 2.2 Terminal-state handling — verdict: **NO TERMINAL-STATE STOP in the proposal poller**

The proposal-phase poller (`web/src/components/sci/SCIProposal.tsx:356-376`) verbatim:

```tsx
  // ── D7: ONE durable state read drives every card (poll SessionStateView) ──
  const [liveStates, setLiveStates] = useState<Map<string, UnitStateView>>(new Map());
  const poll = useCallback(async () => {
    if (!tenantId || !importSessionId) return;
    try {
      const res = await fetch(`/api/import/sci/session-state?tenantId=${encodeURIComponent(tenantId)}&importSessionId=${encodeURIComponent(importSessionId)}`);
      if (res.ok) {
        const view = await res.json() as SessionStateView;
        setLiveStates(new Map(view.units.map(u => [u.unitId, u])));
      }
    } catch { /* transient */ }
  }, [tenantId, importSessionId]);

  useEffect(() => {
    if (!importSessionId) return;
    setImportInteractionContext(tenantId, importSessionId);
    captureImportInteraction({ surface: 'sci_proposal', action: 'view', dedupKey: `view:${importSessionId}` });
    void poll();
    const id = setInterval(() => void poll(), 1500);
    return () => { clearInterval(id); flushPendingImportInteractions(); };
  }, [poll, tenantId, importSessionId]);
```

There is **no condition that inspects `view.units[*].state` or `view.isOpen` to decide whether to keep polling.** The `setInterval` fires every 1500 ms unconditionally; `clearInterval` runs **only on unmount** (the cleanup return). While the proposal sits on screen — every unit already `bound`/`resolved`/`failed_interpretation` — it keeps polling. The response even carries the authoritative stop signal (`view.isOpen`, §4 below) and it is read for `setLiveStates` but **never consulted to stop**.

> **Verdict (1.2): NO TERMINAL-STATE STOP CONDITION FOUND in the proposal poller.** Confirming grep for any stop-on-status logic in the file (real, full output):
> ```
> $ grep -nE "clearInterval|isOpen|completed|failed|cancelled|\.state ===|terminal" web/src/components/sci/SCIProposal.tsx | grep -iv "failedInterpretation\|isFailed\|failed_interpretation'"
> 5:// SessionStateView read (poll). A failed_interpretation unit HOLDS on its card with the four
> 7:// listing (D7). Import proceeds with any non-empty selection; failed/excluded units simply don't
> 44:  failed_interpretation: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
> 49:  failed_interpretation: 'Failed', resolved: 'Resolved', bound: 'Imported',
> 123:        {/* Checkbox — only confirmable (non-failed, non-excluded) units */}
> 193:      {/* Resolution action set — HOLDS on the failed card (DS-027 §4.4) */}
> 375:    return () => { clearInterval(id); flushPendingImportInteractions(); };
> 402:  // live failed-ness: the durable state overrides the analyze-time marker (retry/assign can clear it)
> 452:  // D8: import the CONFIRMED subset (≥1); failed/excluded units never commit.
> 465:          {failedCount > 0 && <span className="text-rose-400">{' '}· {failedCount} holding at failed interpretation</span>}
> 469:      {/* ONE list — every unit is a card; failed units hold here with their action set (D7) */}
> ```
> Every match is a CSS-class map, a status label, a comment, or the unmount cleanup (line 375). **None** inspects the live `view.isOpen` / `view.units[*].state` to stop the 1500 ms interval — the only `clearInterval` is the unmount return.

### 2.3 Analyze-proposal-pending handling — verdict: **POLLS CONTINUOUSLY while the proposal awaits user action**

"Analyze proposal displayed awaiting user action" = client `phase: 'proposal'` (`page.tsx:36`), whose render gate mounts the poller above (`page.tsx:616-619`):

```tsx
          {state.phase === 'proposal' && (
            ...
            <SCIProposalView
              proposal={state.proposal}
              ...
```

The poller's `useEffect` deps are `[poll, tenantId, importSessionId]` — none of which change while the user reviews the proposal — so the 1500 ms interval runs for the entire duration the proposal is displayed, with no awaiting-state gate. **This is the §1 symptom: hundreds of polls while one proposal sits awaiting a click.**

### 2.4 Authoritative state vocabulary (Phase 1.4)

The canonical union — `web/src/lib/sci/comprehension-state-service.ts:32-40` (verbatim):

```ts
export type UnitComprehensionState =
  | 'persisted'
  | 'profiled'
  | 'recognized'
  | 'comprehended'
  | 'classified'
  | 'bound'
  | 'failed_interpretation'
  | 'resolved';
```

Rank + terminality — same file, `:42-59`:

```ts
export const STATE_RANK: Record<UnitComprehensionState, number> = {
  persisted: 0,
  profiled: 1,
  recognized: 2,
  comprehended: 3,
  classified: 4,
  bound: 5,
  failed_interpretation: -1,
  resolved: 100,
};

/** A spine state is one of the monotonic progression states (not failed/resolved). */
export function isSpineState(s: UnitComprehensionState): boolean {
  return STATE_RANK[s] >= 0 && s !== 'resolved';
}
```

**The authoritative per-unit terminal/awaiting states for the fix:**
- `bound` (rank 5) — terminal success on the spine.
- `resolved` (rank 100) — terminal; supersedes everything (human correction or successful retry). `isForwardTransition` confirms "Nothing leaves `resolved`" (`:70`).
- `failed_interpretation` (rank −1, off-spine) — terminal-but-**awaiting** (retryable; `UnitStateView.retryable === (state === 'failed_interpretation')`).

**The session-level terminal signal already projected to every poller** — `comprehension-state-service.ts:187-196`:

```ts
export interface SessionStateView {
  importSessionId: string;
  tenantId: string;
  units: UnitStateView[];
  isOpen: boolean;                  // any unit not yet in {bound, resolved} (no completion gate on comprehension)
  progressTick?: number;
}
```

And computed server-side — `session-telemetry-accumulator.ts:311`:

```ts
const isOpen = units.some(u => u.state !== 'bound' && u.state !== 'resolved');
```

> So `view.isOpen === false` ⇔ every unit is `bound`/`resolved` (session closed). Note `failed_interpretation` keeps `isOpen === true` — i.e. the "awaiting user action" proposal case is NOT covered by `isOpen` alone; the fix's awaiting-stop must also treat a units-all-in-{bound,resolved,failed_interpretation} set as a stop, since `failed_interpretation` is terminal-pending-human, not in-flight. The fix needs both the per-unit union and `isOpen`; both are already on the wire.

---

## 3 — The telemetry-variant poller (Phase 2)

Located: `web/src/components/sci/ImportTelemetryPanel.tsx:56-70` (verbatim):

```tsx
  useEffect(() => {
    if (!tenantId || !sessionId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const r = await fetch(`/api/import/sci/session-state?tenantId=${encodeURIComponent(tenantId)}&importSessionId=${encodeURIComponent(sessionId)}&telemetry=1`);
        if (!r.ok || cancelled) return;
        const data = await r.json();
        if (data?.telemetry) setT(data.telemetry as ImportTelemetry);
      } catch { /* best-effort — durable record is the source; a missed poll self-corrects next tick */ }
    };
    const id = setInterval(poll, 2000);
    void poll();
    return () => { cancelled = true; clearInterval(id); };
  }, [tenantId, sessionId]);
```

- **Interval:** 2000 ms (`setInterval(poll, 2000)`).
- **Variant:** same route, `?telemetry=1` (reads `data.telemetry`, ignores `data.units`).
- **Mounted:** during `phase: 'analyzing'` (`page.tsx:600-601`) **and** `phase: 'executing'` (`page.tsx:645`) — `<ImportTelemetryPanel ... phase="analyzing"|"executing" />`.
- **Terminal-state handling:** **NO TERMINAL-STATE STOP.** Deps `[tenantId, sessionId]` never change mid-phase; `clearInterval` runs only on unmount (phase transition). It does not read `data.telemetry`'s completeness or `data.units` state to stop. It keeps polling for the whole analyzing/executing window even after the underlying work has settled (e.g. while `SCIExecution` has already detected all-terminal but the panel is still mounted).

> **Verdict (Phase 2): DISTINCT TELEMETRY POLLER FOUND — `ImportTelemetryPanel.tsx`, 2000 ms, NO TERMINAL-STATE STOP.** Confirming grep that nothing in the file gates the interval on state (real, full output):
> ```
> $ grep -nE "clearInterval|completed|failed|cancelled|isOpen|terminal|\.state" web/src/components/sci/ImportTelemetryPanel.tsx
> 58:    let cancelled = false;
> 62:        if (!r.ok || cancelled) return;
> 69:    return () => { cancelled = true; clearInterval(id); };
> ```
> The three matches are the `cancelled` race-guard (set on unmount at `:69`, read at `:62`) and the unmount `clearInterval` (`:69`). `cancelled` is an unmount/in-flight guard, **not** a terminal-*state* stop — it never reads `data.telemetry` completeness or `data.units` state. The interval stops only when the panel unmounts (phase change).

---

## 4 — The server route + SQL determination (Phase 3)

### 4.1 Route handler — `web/src/app/api/import/sci/session-state/route.ts:35-69` (verbatim):

```ts
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get('tenantId');
  const importSessionId = searchParams.get('importSessionId');

  if (!tenantId || !importSessionId) {
    return NextResponse.json({ error: 'tenantId and importSessionId required' }, { status: 400 });
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const record = await fetchSessionTelemetryRecord(tenantId, importSessionId, supabase);
    const view = projectSessionStateView(record, tenantId, importSessionId);
    if (searchParams.get('telemetry') === '1') {
      return NextResponse.json({
        ...view,
        telemetry: projectImportTelemetry(record),
        audit: record?.audit ?? null,
      });
    }
    return NextResponse.json(view);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'session-state read failed' },
      { status: 500 },
    );
  }
}
```

The route delegates its single read to `fetchSessionTelemetryRecord`, whose DB call — `web/src/lib/sci/session-telemetry-accumulator.ts:235-250` (verbatim):

```ts
export async function fetchSessionTelemetryRecord(
  tenantId: string,
  importSessionId: string,
  supabase: SupabaseClient,
): Promise<ImportSessionTelemetryRecord | null> {
  const { data, error } = await supabase
    .from('import_session_telemetry')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('import_session_id', importSessionId)
    .maybeSingle();
  if (error) {
    throw new Error(`[OB-203][telemetry] record fetch failed for session ${importSessionId}: ${error.message}`);
  }
  return (data as ImportSessionTelemetryRecord | null) ?? null;
}
```

`projectSessionStateView` and `projectImportTelemetry` are **pure** projections over the already-fetched row (`accumulator.ts:282-313`, `:322+`) — no further DB access. The route's entire DB surface is the **one** `maybeSingle()` PK read above (O(1); the route header at `:9-16` documents this as the deliberate Phase-D re-point away from table scans).

### 4.2 SQL-path determination — verdict for the route, and FP-49 verdict for the fix HF

- **Does the route execute a DB query?** **YES — exactly one:** a single-row PostgREST read on `import_session_telemetry` filtered by `(tenant_id, import_session_id)` (`.select('*').eq(...).eq(...).maybeSingle()`). It is *existing* code, reached via `fetchSessionTelemetryRecord`. No raw SQL string; no schema authored here.

- **What FP-49 actually guards:** per `CC_STANDING_ARCHITECTURE_RULES.md:209-210` (AP-18/AP-19), FP-49 is the **SQL *Schema-Fabrication* gate** — it requires `information_schema`/`SCHEMA_REFERENCE_LIVE.md` verification **before *authoring* SQL or referencing column/table names against an assumed schema.** It is triggered by *writing new* schema-coupled SQL, not by a route merely reading the DB.

- **What the fix HF does:** stop client-side `setInterval` pollers at terminal/awaiting state. It authors **no SQL**, references **no new columns/tables**, and (per the directive's own scope) does **not** modify this route or its query. The existing `maybeSingle()` read is untouched.

> **FP-49 SQL Verification Gate: NOT REQUIRED for the fix HF — because the fix authors no SQL and references no schema; it adds client-side terminal-stop conditions to existing `setInterval` pollers, leaving the route and its single `import_session_telemetry` read unchanged.** (The route *does* query the DB, but FP-49 binds the *authoring* of SQL/schema references, of which the fix has none.)

---

## 5 — Scope-boundary confirmation (Phase 4)

The fix stops polling at terminal/awaiting state but must **not** alter active-processing cadence. Cadence is, in every poller, a **literal interval argument** physically separate from any stop condition:

- Proposal poller: `const id = setInterval(() => void poll(), 1500);` (`SCIProposal.tsx:374`). The cadence is the literal `1500`; a terminal-stop would be a new guard / `clearInterval` keyed on `view.isOpen` (and the awaiting set), with the `1500` untouched.
- Telemetry poller: `const id = setInterval(poll, 2000);` (`ImportTelemetryPanel.tsx:67`). Cadence = literal `2000`; stop = a new completeness gate, `2000` untouched.
- The already-terminal-aware pollers prove separability by example — `SCIExecution` execute-progress gates with `if (executionDone) return; if (!hasActive) return;` (`SCIExecution.tsx:204-206`) **before** `setInterval(() => { void poll(); }, 2000);` (`:220`): the stop guard and the `2000` cadence are independent lines.

> **Terminal-state stop is separable from active cadence: YES** — in every poller the cadence is a standalone numeric literal in the `setInterval(...)`/`sleep(...)` call, and the stop is (or would be) a separate guard or `clearInterval`. The fix can add terminal/awaiting stops without editing any interval value.

---

## 6 — Files in scope for the fix (inventory only — no proposed edits)

Derived from §2–§5. The two pollers that hit `/api/import/sci/session-state` and **never stop at terminal/awaiting state**:

1. **`web/src/components/sci/SCIProposal.tsx`** — proposal-phase poller, 1500 ms, no stop (`:356-376`). **Primary offender** (the §1 "hundreds of polls while a proposal awaits a click" case).
2. **`web/src/components/sci/ImportTelemetryPanel.tsx`** — telemetry-variant poller, 2000 ms, no stop (`:56-70`); mounted in both `analyzing` and `executing`.

Pollers already terminal-aware (review-only; likely no change, but the fix author should confirm the boundary):

3. **`web/src/components/sci/SCIExecution.tsx`** — `settleFromSurface` (`:163-197`) and execute-progress effect (`:203-223`); both already stop on all-terminal / `executionDone`.
4. **`web/src/app/operate/import/page.tsx`** — `analyzeTabular` interval + D13 recovery loop (`:69-91`, `:108-122`); self-terminating in `finally` + stall-abort.
5. **`web/src/components/sci/ImportReadyState.tsx`** — one-shot read (`:61-81`), not an interval; no change expected.

Authoritative state contract the fix will read (no edit expected — source of the stop predicate):

6. **`web/src/lib/sci/comprehension-state-service.ts`** — `UnitComprehensionState` union (`:32-40`), `SessionStateView.isOpen` (`:187-196`).
7. **`web/src/lib/sci/session-telemetry-accumulator.ts`** — `isOpen` computation (`:311`); read-only reference.

Out of the route's polling set (flagged for the architect per §5A residual — a **separate, different-surface** poller that already stops):

8. **`web/src/components/sci/ImportProgress.tsx`** — polls the **`processing_jobs` Supabase table directly** (not this route), 2000 ms, **already stops** via `setPolling(false)` at all-done (`:58-101`). No terminal-non-stopping defect; listed only to confirm the route's poller set is closed at the two offenders above.

> **§5A residual flag for the architect:** Phase 1 confirms exactly **two** terminal-non-stopping pollers against `/api/import/sci/session-state` (items 1 & 2). No *third* never-stopping session-state poller exists (the caller set is closed at 7 fetch sites / 5 files, §2.1). The fix HF's scope is therefore bounded to items 1 & 2; items 3–5 are terminal-aware already and need confirmation only, not change. Whether to widen scope is an architect decision — this DIAG asserts only the inventory.

---

## 7 — HALT status

- HALT-1 (mutation-to-find): **not reached** — every finding came from read-only `grep`/`find`/`Read`. No edit, no API write, no schema touch was needed.
- HALT-2 (route path mismatch): **not reached** — code path `/api/import/sci/session-state` equals the handoff path (§2.0).
- HALT-3 (HF-number ambiguity): **not reached** — numbering contiguous to 285; 286 free in both filenames and full git history (§1.2).
- HALT-4 (forbidden-mutation temptation): **not reached** — no gate bypass attempted or required; the route is an unauthenticated `GET` read and all callers are read-only `fetch`es.

*End DIAG-067 OUTPUT. Findings only — the fix is HF-286, authored separately against this surface.*
