# HF-355 — Ingestion Safety — COMPLETION REPORT

**Branch:** `hf-355-ingestion-safety` (from `main` `a33fc76a`) · **Mode:** ULTRACODE · **Date:** 2026-06-28
**ADR:** `docs/completion-reports/HF-355_ADR.md` (committed before code, Section B gate).
**CC does NOT merge** (SR-44). Built in an isolated git worktree off `origin/main` (the parallel OB-252 checkout untouched).

The incident: a platform user's 86,608×87 (7.5M-cell) import into Casa Diaz → async enqueue **403** (RLS doesn't recognize platform operators) → **silent fallback to the synchronous `execute-bulk` materialization** → OOM → connection-pool exhaustion → DB outage. Three root defects, all closed here: (a) the dangerous fallback, (b) no hard size ceiling, (c) the async path unavailable to platform operators.

---

## 1. Phase 0 ADR findings (6 inspections, file:line + live schema)

| # | Inspection | Finding (file:line) |
|---|---|---|
| 1 | Fallback site(s) — SR-34 class | **One** async-then-sync site: `operate/import/page.tsx:266-290` (client insert → `throw 'ASYNC_UNAVAILABLE'`) → `:307-313` catch logs "Falling back to synchronous analysis" and **falls through** to the sync dispatch at `:316+` (`analyzeTabular`→`execute-bulk`). Other repo "falling back" hits are a different class (LLM→deterministic, auth) — none async-enqueue→sync-materialize. |
| 2 | Sync materialization path | `SCIExecution.tsx:36` `FETCH_TIMEOUT_MS=300_000`; `:91` AbortController → `/api/import/sci/execute-bulk`. The single threshold constant is `CELL_CHUNK_THRESHOLD=5_000_000` (`sheet-window.ts:147`). `analyze` does NOT materialize (client sends a 50-row sample). |
| 3 | Async enqueue (the 403) + locus | `page.tsx:271` did a **client-side** `from('processing_jobs').insert()` (AP-3). **Chosen locus:** a server-side `enqueue` route under service-role + capability check (fixes AP-3, audit-clean) + RLS policy as defense-in-depth. |
| 4 | `processing_jobs` RLS (live) | Member policy `tenant_id IN (… profiles … auth_user_id)` (blocks platform `tenant_id=null`); "VL Admin read" **SELECT-only**; service-role FOR ALL; `tenant_id NOT NULL`; chunk cols `batch_id/chunk_id/total_chunks` **live** (static ref stale — FP-49 noted). |
| 5 | `profiles.capabilities` (live) | JSONB **array**. 3 `role='platform'` profiles (`platform@`,`eoadmin@`,`tdadmin@`), all `tenant_id=NULL`, 29-element arrays, **none holds `platform.data_operations`** (all hold `platform.system_config` — dotted convention). `@>` valid on the array. |
| 6 | Error surface | `page.tsx` `errorMessage` (`:155/172`) banner; `phase:'error'` (`:42`) renders `{state.error}` (`:742`) + conditional retry (`:743`). The I1/I2 stop messages reach the operator here. |

---

## 2. Proof gate evidence (pasted)

**PG-1 — sync fallback removed (SR-34 class).** `grep "ASYNC_UNAVAILABLE\|Falling back to synchronous"` in `page.tsx` → only one hit, a comment: `// NEVER fall back to the synchronous execute-bulk materialization path.` The failure branch is `setState({ phase:'error', … }); return;` (`page.tsx:259-260`, `:281-285`). The catch-fall-through is gone.

**PG-2 — failed enqueue → error, not execute-bulk.** `page.tsx:264` `fetch('/api/import/sci/enqueue')`; `:276` `if (!res.ok)` → `setState({phase:'error', error: detail.error ?? 'Could not start the import … The import was not performed.', canRetry: res.status>=500}); return;`. No `execute-bulk` is reached on this branch.

**PG-3 — one ceiling constant.**
```
sheet-window.ts:147  export const CELL_CHUNK_THRESHOLD = 5_000_000;
sheet-window.ts:154  export function exceedsCellCeiling(rows, columns) { return rows * columns > CELL_CHUNK_THRESHOLD; }
```
Callers reference the named helper only: `execute-bulk:272/283`, `process-job:145/153`. No second cell-count constant. (The pre-existing OB-251 `STREAM_BYTES_THRESHOLD` is a distinct *byte*-routing gate for the streaming-vs-XLSX.read decision — not the cell ceiling.)

**PG-4 — small file byte-identical.** The non-oversized branch in `execute-bulk` (`else`) is the EXACT prior path — `XLSX.utils.sheet_to_json(ws,{defval:''})` unchanged; the only addition is a no-op refuse guard that never fires for non-oversized input. 456/456 tests pass (no change to small-file behavior).

**PG-5 — oversized never full-materializes.** `execute-bulk:272-290`: `if (exceedsCellCeiling(...)) { windowed reader, full array NEVER built } else { if (exceedsCellCeiling(...)) throw 'HF-355 size ceiling …'; <full sheet_to_json> }`. The full `sheet_to_json` is structurally unreachable for oversized input — it either takes the windowed branch or throws (C2). Same shape in `process-job:145-155`.

**PG-6 — deterministic, zero LLM.** `grep -i "anthropic|callLLM|aiService|inference|llm"` over `sheet-window.ts` + `enqueue/route.ts` → only doc-comment mentions ("zero LLM", HF-350 history). The ceiling is `rows*columns > const`; the auth is `caps.includes(...)`/`@>` — pure sync boolean/arithmetic (Decision 158 / I6).

**PG-7 — migration grant (architect runs `_hf355_verify_migration.ts` post-apply).** Migration §1: `UPDATE profiles SET capabilities = capabilities || '["platform.data_operations"]'::jsonb … WHERE role='platform' AND NOT (capabilities @> '["platform.data_operations"]'::jsonb)` — idempotent, array-shape-preserving.

**PG-8 — policy keys on capability, not `tenant_id IS NULL`.**
```sql
CREATE POLICY "Platform operators can manage processing jobs" ON processing_jobs FOR ALL
  USING  (EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND capabilities @> '["platform.data_operations"]'::jsonb))
  WITH CHECK (… same …);
```
`grep "tenant_id IS NULL"` in the migration → only comments stating the predicate does NOT use it.

**PG-9 — service-role probe insert (architect runs verify script).** `_hf355_verify_migration.ts` (c): inserts a `processing_jobs` row for a tenant under service-role, asserts success, cleans up — proves the async enqueue path is open.

**PG-10 — HALT-CALC neutral.** `git diff --name-status origin/main..HEAD`: 8 files — `HF-355_ADR.md`, `_hf355_verify_migration.ts`, `enqueue/route.ts`, `execute-bulk/route.ts`, `process-job/route.ts`, `operate/import/page.tsx`, `sheet-window.ts`, the migration. **Zero** engine/convergence/resolver/`committed_data` files. Anchors (BCL $312,033 / Meridian $556,985) unreachable from this change.

**PG-11 — FP-49 (live).** `processing_jobs` columns referenced (tenant_id/status/file_storage_path/file_name/file_size_bytes/session_id/uploaded_by/batch_id/chunk_id/total_chunks) — selectable=YES. `profiles.capabilities` is array=true; `@>` valid; `platform.data_operations` present pre-migration=false (migration appends). Static `SCHEMA_REFERENCE_LIVE.md` stale on chunk columns — noted.

**PG-12 — refuse path leaks nothing (I7).** `enqueue/route.ts`: the 401/400/403 returns are at `:41/:48/:72`, all BEFORE the `.insert()` at `:96`. The only DB op before the 403 is a profile `.select()` (a read, released). The refuse opens no write handle and returns promptly.

**PG-13 — SR-39.** See §3.

**PG-14 — tsc/build/dev.** `tsc --noEmit` → 0 HF-355 errors. `rm -rf .next && npm run build` → **EXIT 0**, `✓ Compiled successfully`, `ƒ /api/import/sci/enqueue` in the manifest. `npm run dev` → `✓ Ready in 1200ms`; `curl localhost:3000` → **HTTP 307** (auth redirect = server healthy); `POST /api/import/sci/enqueue` unauthenticated → **HTTP 401** (auth enforced); dev log clean. 456/456 tests pass.

---

## 3. SR-39 compliance verification

- **SOC 2 CC6 (logical access).** Cross-tenant ingestion authorization is an EXPLICIT named capability (`platform.data_operations`) checked server-side AND embodied in an RLS policy — not application-only and not a structural `tenant_id IS NULL` proxy. Access is a deliberate grant in `profiles.capabilities`, auditable from the grant + the policy alone (GP-1).
- **OWASP A01 (broken access control).** The 403 root cause (the member policy denying platform operators) is fixed by a capability the operator actually holds; the enqueue write moved server-side (no client-trusted write — AP-3 closed). Least privilege: the capability is granted only to the 3 platform profiles, not implied for every `null`-tenant row.
- **OWASP A04 (insecure design).** The dangerous "async-fail → synchronous full-materialize" fallback is removed as a class; an oversized file is windowed or refused, never loaded — the failure mode that caused the outage is designed out, not patched.
- **DS-014 (capability-derived access).** Authorization is capability-derived (`platform.data_operations`), consistent with the platform's capability model (`platform.system_config`, `platform.provision_tenant`).

---

## 4. Files created / modified

| File | Δ |
|---|---|
| `web/src/app/api/import/sci/enqueue/route.ts` | **new** ~110 lines — server enqueue (service-role + capability gate) |
| `web/supabase/migrations/20260629_hf355_platform_data_operations.sql` | **new** ~70 lines — capability grant + write policy |
| `web/scripts/_hf355_verify_migration.ts` | **new** ~60 lines — post-apply verification |
| `web/src/app/operate/import/page.tsx` | **mod** — removed fallback; call enqueue; STOP-on-failure (~-25/+45) |
| `web/src/lib/sci/sheet-window.ts` | **mod** — `exceedsCellCeiling` helper (+8) |
| `web/src/app/api/import/sci/execute-bulk/route.ts` | **mod** — named ceiling + refuse guard (~+4) |
| `web/src/app/api/import/sci/process-job/route.ts` | **mod** — named ceiling + refuse guard (~+3) |
| `docs/completion-reports/HF-355_ADR.md`, `HF-355_COMPLETION_REPORT.md` | **new** — ADR + this report |

---

## 5. Architect-pending (SR-44 — named, not deferred)

1. Apply `web/supabase/migrations/20260629_hf355_platform_data_operations.sql` in the Supabase SQL Editor.
2. Run `cd web && npx tsx scripts/_hf355_verify_migration.ts` — expect: (a) all 3 platform profiles hold `platform.data_operations`; (c) service-role probe insert succeeds; (d) arrays intact. Confirm the policy in SQL Editor: `SELECT policyname FROM pg_policies WHERE tablename='processing_jobs';` (pg_policies is not PostgREST-exposed, so this one check is SQL-Editor-side).
3. Retry the 86,608×87 import **as the platform operator** — confirm it enqueues a `processing_jobs` row (async), the windowed worker processes it in bounded chunks, and `execute-bulk` synchronous materialization is never touched.
4. `gh pr` merge (architect-only).

---

## 6. ARTIFACT SYNC

```
ARTIFACT SYNC
MC: [HF-355 → implementation complete, migration architect-pending; discovered: the OB-251
    fire-and-forget client status updates (page.tsx:462/507) also relied on the member RLS — now
    covered by the capability-gated FOR ALL policy (defense-in-depth)]
REGISTRY: [no closed-vocabulary registry added or touched; capability strings are open dotted tokens,
    not a developer-maintained allow-set — AP-26 clean]
R1: [I1 removed-as-class → page.tsx grep 0 fallthrough; I2 ceiling → one constant + refuse guard;
    I3 capability-gated → migration + enqueue route; I4 → service-role probe (architect); I5 → diff
    scope 0 engine files; I6 → grep 0 LLM in ceiling/auth; I7 → refuse returns before any write]
BOARD: [now: code merged-ready + pushed; gap: migration apply + live platform-operator retry (architect);
    ev: PG-1..6,8,10,11,12,14 pasted; ef: server enqueue + capability RLS + cell ceiling; fl: none;
    lane: ingestion-safety]
SUBSTRATE: [candidate ICA captures: "a failed async enqueue must NEVER fall back to a full-
    materialization path — STOP with a clear error"; "oversized input (cells > CELL_CHUNK_THRESHOLD)
    is windowed or refused, never loaded"; "cross-tenant operations are gated by an explicit named
    capability, never a structural tenant_id IS NULL proxy"; "bulk writes mint server-side under
    service-role with an in-code capability check, never a browser Supabase insert (AP-3)"]
```

*HF-355 — ingestion safety. Implementation complete; migration + live verification architect-pending (SR-44).*
