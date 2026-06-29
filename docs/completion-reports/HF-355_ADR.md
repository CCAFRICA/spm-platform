# HF-355 — Architecture Decision Record

**Work item:** HF-355 — Ingestion Safety · **Branch:** `hf-355-ingestion-safety` (from `main` `a33fc76a`) · **Mode:** ULTRACODE
**Date:** 2026-06-28 · CC owns the HOW. Committed BEFORE implementation code (Section B gate).

---

## Phase 0 — Inspection findings (live code + live schema, no prose assumptions)

### #1 — The fallback site(s) (SR-34 class scope)
**One site implements "async enqueue → on failure run synchronous path":** `web/src/app/operate/import/page.tsx`.
- `:266-290` — client-side loop inserts `processing_jobs`; on `jobErr` it `throw new Error('ASYNC_UNAVAILABLE')` (`:287`).
- `:307-313` — `catch (asyncErr)` logs `[OB-174] Falling back to synchronous analysis` (`:309`) / `[OB-174] Async path error, falling back` (`:311`) and **falls through** (no re-throw, no return) to the synchronous per-file dispatch at `:316+` (`analyzeTabular` → `/api/import/sci/analyze` → proposal → `execute-bulk`). **This is the I1 violation.**

The other repo hits for "falling back" are a different class (LLM→deterministic, service-role→auth client, server COUNT→length) — none implement async-enqueue→sync-materialize. So the SR-34 class here is exactly this one site. (grep evidence in the completion report PG-1.)

### #2 — The synchronous materialization path
- `web/src/components/sci/SCIExecution.tsx:36` `FETCH_TIMEOUT_MS = 300_000`; `:91` `AbortController` — the 300s held request to `/api/import/sci/execute-bulk`.
- `execute-bulk/route.ts` — the commit. Post-OB-251 + the OOM hotfix (`sheet-stream.ts`), its parse routes: **bytes ≥ 20MB → streamed** (`isLargeByBytes`/`STREAM_BYTES_THRESHOLD`), **cells > `CELL_CHUNK_THRESHOLD` → windowed** (`openSheetWindow`), **else → single-batch full `sheet_to_json`**. So the only full materialization left is the **single-batch branch, already guarded by `cells ≤ CELL_CHUNK_THRESHOLD`**.
- The OB-251 windowed path: `web/src/lib/sci/sheet-window.ts` / `windowed-commit.ts`; the single threshold constant is **`CELL_CHUNK_THRESHOLD = 5_000_000`** (`sheet-window.ts:147`) — HF-355 reuses it as the single source of truth for "oversized" (no second constant; `STREAM_BYTES_THRESHOLD` is a distinct byte-routing gate for the streaming-vs-XLSX.read decision, not the cell ceiling).
- `analyze/route.ts` does NOT full-materialize — the client sends a 50-row sample (`page.tsx` `rows.slice(0, ANALYSIS_SAMPLE_SIZE)`), so analyze classification reads a sample only (AP-23 honored).

### #3 — The async enqueue (the 403) + the locus decision
- `page.tsx:271-282` does a **client-side, browser-session** `from('processing_jobs').insert(...)`. A platform user (`tenant_id = null`) is denied by the member RLS policy → **403**. This is also **AP-3** (browser Supabase client for a write — anti-pattern).
- **Locus decision (chosen): a server-side enqueue route under service-role with its own capability check, AND a defense-in-depth RLS policy.** Rationale: (a) fixes AP-3 (write moves server-side); (b) audit-clean — the gate is an explicit `platform.data_operations` (or tenant-membership) check in code, not a structural proxy; (c) works for the platform operator because service-role bypasses RLS after the capability check passes; (d) the RLS policy still gets the capability-gated write rule as defense-in-depth (so the fire-and-forget client status updates at `page.tsx:462/507` also work for platform operators). New route: `web/src/app/api/import/sci/enqueue/route.ts`.

### #4 — `processing_jobs` RLS (LIVE, from the applied OB-251 reconcile migration)
`20260628_ob251_processing_jobs_reconcile.sql` (applied):
- `"Tenant members can manage processing jobs"` — FOR ALL — `tenant_id IN (SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid())` — **blocks platform users** (null ∉ any tenant).
- `"VL Admin read processing jobs"` — **FOR SELECT only** — `EXISTS (… auth_user_id = auth.uid() AND tenant_id IS NULL)` — confirms the directive: VL-Admin covers read, not write.
- `"Service role full access to processing jobs"` — FOR ALL — `auth.role() = 'service_role'`.
- `tenant_id` is `NOT NULL`. Chunk columns `batch_id`/`chunk_id`/`total_chunks` are **live** (introspected) — the static `SCHEMA_REFERENCE_LIVE.md` is stale here (FP-49 noted).

### #5 — `profiles.capabilities` shape (LIVE)
`capabilities` is a JSONB **array**. The **3 `role='platform'` profiles** — `platform@vialuce.com`, `eoadmin@vialuce.com`, `tdadmin@vialuce.com` — each `tenant_id = NULL`, each a **29-element array**, and **NONE holds `platform.data_operations`** (all hold `platform.system_config`, `platform.provision_tenant`, `platform.view_all_tenants`, `data.import`). Dotted-string convention confirmed (`platform.system_config`). The migration appends `platform.data_operations` to all three, idempotently, preserving array shape. The `@>` containment operator is valid against this array (FP-49).

### #6 — The error surface
`page.tsx` has `errorMessage` state (`:155`, `setErrorMessage` `:172`) rendered at `:634-639` (red banner), plus a `phase:'error'` state (`:401-403`, `canRetry`). The I1/I2 refuse/stop messages reach the operator via these — no new surface needed.

---

## ARCHITECTURE DECISION RECORD (Section B)

**Problem:** A failed async-ingestion enqueue (403, because RLS doesn't recognize platform operators) silently fell back to the synchronous full-materialization path, which OOM'd a 7.5M-cell file and took the production DB down.

**Option A — RLS-only fix:** add a capability-gated write policy; keep the client-side insert.
- Scale 10x: same. AI-first: n/a. Transport: **leaves AP-3** (browser write). Atomicity: the failed-enqueue fallback still exists. **Rejected — doesn't fix AP-3 or the fallback.**

**Option B (CHOSEN) — server enqueue route (service-role + capability check) + remove fallback + defense-in-depth RLS + cell ceiling:**
- Scale 10x: yes (enqueue is metadata only; processing is the bounded OB-251 worker). AI-first: zero LLM in auth/ceiling (Decision 158). Transport: write moves server-side (fixes AP-3). Atomicity: on enqueue failure the import STOPS with a clear error — no dangerous fallback.
- **CHOSEN because** it corrects all three root defects (fallback, ceiling, RLS), fixes AP-3, and is audit-clean (explicit capability gate in code + RLS).

**REJECTED:** Option A — partial; leaves the anti-pattern and the silent failure mode.

### Governing Principles (G1–G6)
- **G1 (standard):** SOC 2 CC6 (logical access), OWASP A01 (broken access control) / A04 (insecure design), DS-014 (capability-derived access). The enqueue gate is the access control.
- **G2 (architectural embodiment):** access is a **named capability** (`platform.data_operations`) checked server-side + an RLS policy keyed on that capability — not a `tenant_id IS NULL` structural proxy. Survives reimplementation (the capability is the durable grant).
- **G3 (traceability):** auditor answer to "why could this user enqueue cross-tenant ingestion" = "they hold `platform.data_operations`," a deliberate grant in `profiles.capabilities` + a policy that names it.
- **G4 (discipline):** access-control theory / principle of least privilege — an explicit capability is least-privilege; a structural `null` proxy over-grants to every platform row.
- **G5 (abstraction):** universal — capability-gated authorization applies in any domain.
- **G6:** grounded in OWASP/SOC, not speculation.

### The fix, per problem
1. **Fallback (I1):** `page.tsx` — on enqueue failure, set the error state and STOP. Remove the catch-fall-through. The sync per-file dispatch remains ONLY for document (PDF/PPTX/DOCX) imports, which never use `processing_jobs`.
2. **Ceiling (I2):** `exceedsCellCeiling(rows, cols)` in `sheet-window.ts` (`rows * cols > CELL_CHUNK_THRESHOLD` — the single constant). `execute-bulk`/`process-job` route oversized via the named helper to windowed/streamed; the single-batch full `sheet_to_json` is guarded so oversized input throws a clear refuse error (C2) rather than materializing.
3. **RLS + enqueue (I3/I4):** new `enqueue` route (service-role; authorizes member-of-tenant OR `platform.data_operations`); migration grants the capability + adds the capability-gated write policy (defense-in-depth).

### Invariants honored
I5 (HALT-CALC): zero engine/convergence/resolver files; no `committed_data` change; anchors unreachable. I6: ceiling + auth are pure sync arithmetic/boolean, zero LLM, zero domain literals. I7: the refuse path opens no DB handle (it returns before any insert) and returns promptly.

### FP-49 evidence (live)
`processing_jobs`: chunk cols live; member/VL-SELECT/service policies as above; `tenant_id NOT NULL`. `profiles.capabilities`: JSONB array; 3 platform profiles lack `platform.data_operations`. Pasted in the completion report PG-11.

**No structural conflict found. Proceeding to implementation.**
