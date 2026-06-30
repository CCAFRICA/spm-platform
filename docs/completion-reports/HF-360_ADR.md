# HF-360 — Architecture Decision Record + **FEASIBILITY HALT**

**Work item:** HF-360 — Hand-Off Load + Pulse Management + Truthful Import Surface
**Worktree base SHA:** `8002cac1` (origin/main — OB-255 continuation) · **Mode:** ULTRACODE · **Date:** 2026-06-29

> ## VERDICT: HALT at §3 gate 2 (feasibility of the database-side worker).
> The probe **cannot confirm** `pg_cron`/`pgmq` are enabled or reachable from the application, and the
> function **cannot reach `pgmq` to enqueue** (the public schema is not exposed). Per §3 gate 2 — *"do not
> build a mechanism whose availability you could not confirm"* — and §6 — *"Feasibility gate 2 fails → HALT;
> record the recommended alternative; do not build an unconfirmed mechanism"* — this ADR records the full
> design + the recommendation for architect decision, and **no Part A/B/C implementation is built.** Building
> the hand-off (function stages + enqueues + exits) onto a worker that does not yet exist would make **every
> import commit 0 rows** — strictly worse than today's recoverable 58/82 partial.

Committed before any implementation (§3 gate). This ADR is the deliverable; the build is gated on the
architect confirming the worker mechanism (architect-pending below).

---

## §3.1 — Gate 1: where the load time goes (code trace; live measurement is architect-side, SR-44)

The live run: 86,607 rows committed across **58 clean byte-budgeted batches** (~1,059 rows each) before the
Vercel ceiling killed the held invocation at pulse 58 of ~82 — committing **61,428 / 86,607**. The function
spent the whole load duration synchronously. Per pulse (~4s), from the code (`commit-content-unit.ts` per
`commitContentUnit` call, driven once per byte-pulse by `commitUnitStreamed`/`commitUnitWindowed`):

| Phase | Code (`commit-content-unit.ts`) | Off-clock candidate? |
|---|---|---|
| **Remediation CONSTRUCT** | `runRemediationConstruct` (`:608`) — reads prior signals (`dbRecall`, a DB round-trip per pulse) + applies the canonicalization **deterministically (no LLM** — `:597`); builds `correctedRows` | already deterministic; baked into the staged CSV at stage time → worker needs none |
| **CSV write to Storage** | `committedRowsCsvStream` → `supabase.storage.upload` (`:669`) | stays in the function (staging) |
| **FDW load wait** | `supabase.rpc('bulk_commit_from_storage')` (`:676`) — the DB reads the CSV via the S3 FDW + `INSERT…SELECT`; the function **awaits** this | **THIS is what must move off the serverless clock** |

**The exact split is architect-measured (SR-44 — CC does not run the live import).** Measurement plan: the
code already emits `[TRACE-SERVER]` phase timing (DIAG-070); add a temporary per-pulse `console.time` around
(a) `runRemediationConstruct`, (b) the `.upload`, (c) the `.rpc` in `commit-content-unit.ts:608/669/676`,
re-run the 86,607-row import once, read the Vercel logs for the per-pulse breakdown, then REMOVE the
instrumentation. Expectation from the code: the `.rpc` FDW-load wait dominates (the DB does
`INSERT…SELECT` of ~1,059 rows per pulse synchronously) — that is the time the function must hand off.

**Design consequence:** because remediation CONSTRUCT is already deterministic and the staged CSV is built
**with remediation applied** (`buildCommittedRow` uses `correctedRows`), the hand-off can stage fully-built
CSVs and the worker becomes a **pure FDW-load loop with no remediation and no LLM** (Decision 158 satisfied
by construction). Open risk the measurement must close: if remediation+CSV-build is itself a large fraction
of the 4s, even *staging-only* may approach the ceiling for a very large file — in which case staging must
also be chunked across invocations (a second hand-off layer). The measurement decides.

## §3.2 — Gate 2: feasibility of the database-side worker (THE LOAD-BEARING GATE → HALT)

Probe `scripts/_hf360_feasibility_probe.ts` (read-only, service-role), pasted verbatim:
```
— the existing load RPC (HF-356) the worker would call —
  rpc bulk_commit_from_storage (bad args)        → ERR HV000 request failed: service error   [RPC EXISTS; FDW err on bad path]
— pgmq (Supabase Queues): is the public RPC surface reachable? —
  pgmq_public.list_queues()                      → ERR PGRST106 Invalid schema: pgmq_public
  pgmq_public.send(queue_name,message)           → ERR PGRST106 Invalid schema: pgmq_public
  pgmq.list_queues() (raw schema)                → ERR PGRST106 Invalid schema: pgmq
— pg_cron: is the cron schema reachable from PostgREST? —
  cron.job (select)                              → ERR PGRST106 Invalid schema: cron
— pg_net: HTTP-from-DB —
  net.http_get                                   → ERR PGRST106 Invalid schema: net
— extension catalog via PostgREST —
  pg_extension / pg_available_extensions         → ERR PGRST205 (not exposed)
```
**Interpretation (honest):** `bulk_commit_from_storage` exists and the S3 FDW works (the worker's load
primitive is confirmed). But **every worker-mechanism surface — `pgmq_public`, `pgmq`, `cron`, `net` — is
unreachable** from PostgREST (`PGRST106`), and the extension catalog is not introspectable (`PGRST205`,
no `exec_sql` in this repo). This does NOT prove the extensions are absent (schema-not-exposed is normal for
`cron` even when installed), but it means:
1. **I cannot confirm** `pg_cron`/`pgmq` are enabled (no code-side path; confirmation requires the
   architect's SQL Editor — SR-44).
2. **The function cannot enqueue to `pgmq`** as-is — `pgmq_public` is not an exposed API schema, so the
   JS client cannot `send` to a queue. The pgmq hand-off is **not buildable from the app** without the
   architect first exposing the schema.

Per §3 gate 2 and §6: **HALT.** I do not build a worker mechanism whose availability I could not confirm.

## §3.3 — Gate 3-7: the design blueprint (for the architect to proceed once gate 2 is confirmed)

The HALT is on the *mechanism's confirmation*, not the design. The complete design:

**Hand-off contract (gate 3).** Commit phase becomes: parse → for each byte-pulse (HF-359 boundary
**unchanged**) build the CSV with deterministic remediation applied and `upload` it to a job-scoped Storage
prefix → append a manifest row (staged CSV path, expected row count, byte size, `import_batch_id`) → after
all pulses staged, INSERT one `pulse_load_jobs` row (status `enqueued`, the manifest, cursor=0) → **return**.
No FDW-load wait in the function. The worker, per cursor step: load `manifest[cursor]` via
`bulk_commit_from_storage(tenant, csv_path, batch_id)` → on success advance cursor + record the landed
pulse → at `cursor == len(manifest)` mark `complete`; on error mark `failed` (resumable from cursor). The
worker contains **no LLM and no remediation** (CSVs are pre-built) — the Decision-158 load-path boundary.

**Remediation (gate 4): ALREADY satisfied.** `runRemediationPropose` (EXPRESS, may-LLM) runs at proposal
time in `process-job` and persists proposals to the canonical signal surface; `runRemediationConstruct`
(commit) is **deterministic, no LLM** (`commit-content-unit.ts:597`). The hand-off bakes CONSTRUCT's output
into the staged CSV, so the worker re-applies nothing. No refactor of recognition-vs-application is needed.

**Pulse Management (gate 5), on existing primitives.** Each pulse is already its own `import_batch`
(`windowed-commit.ts:9`). **Rollback** = delete `committed_data` + `import_batches` for the job's
`import_batch_id`s (tenant-scoped, the HF-358 `deleteTenantScoped` pattern). **Resume** = continue the
worker from `cursor`, replaying the **persisted manifest** (not a recomputed pulse plan) — so a resumed
import is byte-identical to an uninterrupted one (the byte-budget + batch structure are frozen in the
manifest; re-pulsing could shift boundaries → different batches). **Audit** = every transition
(`enqueued→loading→pulse k landed→failed→resumed→rolled_back→complete`) recorded; the `(manifest, cursor)`
pair is the exact committed-vs-uncommitted snapshot (the 58-vs-24 case made precise). This **extends** the
existing import telemetry + audit — no parallel job concept.

**Schema/migration (gate 6, FP-49).** Live: `committed_data`/`import_batches`/`processing_jobs`/
`import_session_telemetry`/`audit_logs` confirmed (columns in the probe); `pulse_load_jobs`/`pulse_manifest`
are **ABSENT** (PGRST205) → NEW. Required migrations (authored on architect confirmation, NOT applied — SR-44):
(a) `pulse_load_jobs` (id, tenant_id, session_id, status, manifest jsonb [ordered pulses], cursor int,
total_pulses, total_rows, created/updated, error_detail) + RLS; (b) the worker `plpgsql` function +
`cron.schedule(...)` (sub-minute) — **gated on pg_cron**; (c) `create extension pg_cron`/the Queues
enablement — **architect, gate 2**.

**Anti-pattern + Decision 158 (gate 7).** No enumerated set; one path (hand-off replaces the synchronous
load inside the one commit; one job model; UI reads the one telemetry surface); the HF-359 byte-budget stays
the boundary; the load is deterministic; Σ(pulse rows)=total; rows byte-identical (the staged CSV is the
HF-358/359 output, untouched).

## §3.4 — Recommendation (architect decision)

1. **Confirm in the SQL Editor:** `select * from pg_available_extensions where name in ('pg_cron','pgmq');`
   and whether they are installed (`pg_extension`). 
2. **If `pg_cron` is available:** use a **regular `pulse_load_jobs` table polled by a `plpgsql` worker
   scheduled via `pg_cron`** — this avoids `pgmq` and the schema-exposure blocker entirely (the function
   enqueues with an ordinary `.insert()` into the public-schema table, which the probe confirms is
   reachable). `pgmq` is optional, not required. This is the recommended path; CC will author it next.
3. **If `pg_cron` is unavailable:** a **Supabase Edge Function worker** (Deno; longer ceiling than Vercel +
   `EdgeRuntime.waitUntil` background tasks) draining the same `pulse_load_jobs` table, triggered by a
   schedule or by the function's enqueue. CC will author it next.
4. Either way, the function-side hand-off + Part B + Part C are built **after** the worker mechanism is
   chosen + confirmed — because a hand-off to a non-existent worker commits 0 rows (a regression).

**This ADR is the HALT.** No implementation code is written. The feasibility probe is the evidence; the
architect's gate-2 confirmation unblocks the build.
