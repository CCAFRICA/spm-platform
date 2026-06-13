# OB-203 — Warm-Witness Remediation Directive (Phase 6B)

**Date:** 2026-06-12
**Work item:** OB-203 (governing), Phase 6B — warm-witness post-mortem and remediation
**Repo:** `CCAFRICA/spm-platform`, branch `OB-203-phase-6`
**File location (commit before dispatch):** `docs/vp-prompts/OB-203_WARM_WITNESS_REMEDIATION_DIRECTIVE_20260612.md`
**Status:** Phase A executes immediately. Phases B–E are specified herein but execution is gated on HALT-1 (architect disposition of Phase A evidence).

---

## §0 — CC Standing Rules header

`CC_STANDING_ARCHITECTURE_RULES.md` binds throughout. Architecture Decision Gate before any implementation phase. Anti-Pattern Registry checked. Most-relevant standing rules: **AP-25 / Korean Test** (no enumerated shapes; structural invariants only), **SR-34** (no bypass — structural fixes only, no workarounds or reduced-scope tests), **SR-41** (revert discipline), **SR-43** (Ship Completes Work Item: merge + production verification + completion report with SHA), **Rules 25–28** (completion-report evidentiary discipline), **Rule on git** (operate from repo root `spm-platform`, not `web/`).

Drafting-discipline source: `docs/vp-prompts/../../INF_Structured_Compliant_Drafting_Reference_20260513.md` (project artifact `INF_Structured_Compliant_Drafting_Reference_20260513.md`), DD-1 through DD-12. This directive is the single source of truth; the file is the prompt; no execution summary exists or may be created elsewhere.

**Commit + push after every change. Before any completion report:** kill dev server → `rm -rf web/.next` → `cd web && npm run build` → `npm run dev` → confirm `localhost:3000` serves.

---

## §1 — Problem statement and evidence of record

### 1.1 Warm-witness result (2026-06-12, session `d8085364-72b1-4c6f-9d9e-20606fb14831`, tenant MX Restaurant `3d354bfa-b298-48dd-88a0-9f8c5a00be4e`, file `datos-cadena-restaurantes-mx.xlsx`)

**Engine: PASS, on the record.**
- 16/16 sheets Tier-1 fingerprint recognition; **zero LLM calls** (`llmCalled=false`, every sheet `bypassed-by-memory`); analyze ≈ 15s wall.
- fieldBindings injected from flywheel on all 16 sheets (30 into Ventas_Transaccional) per HF-254.
- Empleados classified **entity** — the Phase 6B-precursor fix (identifierRepeatRatio computed on HC-identified identifier column over `structure.sampleRowCount`; stored fingerprint `7707e8553823` corrected) held.
- Portada resolved **reference** via the zero-components guard (no broken-plan commit).
- All 321 Ventas pulses committed (160,443 rows), zero Supabase 502 on the Small tier — third consecutive proof of the D16 chunk sizing (500 rows / 200ms pacing / backoff).
- HF-213 supersede fired on every re-imported committed unit (`content_unit_hash_match_reimport`).

**Execute tail: FAIL.**
- `POST /api/import/sci/execute-bulk` response terminated at 299,811ms (the ~300s boundary).
- 11/16 units committed. The 5 never-committed units are **all entity-classified rosters**: Sucursales, Menus, Resumen_Sucursal, Resumen_Menu, Resumen_Empleado. No `[commitContentUnit]` line exists for any of them; no `import_batches` row exists for any of them (F1 below).
- Post-response, the UI's "COMMITTING — PULSES LANDING" panel displayed **"1 of 326 pulses / 0 of 162,830 rows committed"** while the header above it read "11 of 16 / 162,830 rows committed" — two panels on one screen in contradiction, the pulse panel cycling back to 1.
- Sustained DB saturation followed: telemetry polls (`session-state?telemetry=1`) at 9–23s each; repeated `[Middleware] getUser() failed or timed out`. Architect killed the dev server. **No data loss** (F3 below).

### 1.2 Architect SQL findings (Supabase Dashboard, project `bayqxeiltnpjrvflksfa`, schema-verified against `SCHEMA_REFERENCE_LIVE.md`)

- **F1 — batch linkage:** `import_batches.file_name` = `sci-bulk-{sessionId}` (not the xlsx name). The warm session has batches for exactly the 11 committed units, all `status='completed'`. Zero batches for the 5 rosters.
- **F2 — no jobs spine:** `processing_jobs` holds **zero rows** for the tenant. SCI bulk does not use it. The persistence surface of session unit-states, pulse counters, and the conclusion summary is unestablished — if any of it is process-memory-resident, response death explains the looping pulse panel completely.
- **F3 — census reconciles:** `committed_data` raw counts (entity 476 / reference 3,789 / transaction 321,492 across 26 batches, 325,757 rows total) reconcile exactly to the run-5 + warm-run commit history including both generations of superseded units. Physical retention of superseded generations is by design; visibility is the question (F4).
- **F4 — POTENTIALLY STOP-CLASS:** all 26 batches are `status='completed'`, **including the 10 the warm run's HF-213 events logged as superseded**. Supersession is not recorded in `import_batches.status`. The D16.1 visibility gate was ratified as "reads count only `status='completed'` batches." If that predicate is the operative read filter, both generations of Ventas (≈320,886 rows where 160,443 exist) are visible to every consumer including the calculation engine — a double-count on the fact table and a Decision 95 reconciliation-invariant hazard.

### 1.3 Defect class lineage

D19/D20/D21 are surfaced instances of classes already on the record: D14/D17 (render-side progress truth), D13/D18 (response-scoped state vs durable surface), D16/D16.1 (write-path atomicity and truthful batch state), DS-020 scale litmus (no per-entity synchronous writes). F4 sits on the HF-213/D16.1 seam. Per IGF-T1-E952 (Adjacent-Arm Drift), Phase A must establish the class layer of each before any fix ships.

---

## §2 — Substrate-bound discipline applications

- **IGF-T1-E905 (Prove, Don't Describe):** every Phase A claim ships with pasted code, pasted SQL output, or pasted grep output. PASS/FAIL self-attestation is not evidence.
- **DS-020 scale litmus (LOCKED, `Vialuce_Synaptic_State_Specification.md`):** *"no per-entity synchronous writes; pure data + batch I/O passes."* Phase A item A2 applies this test verbatim to the entity-resolution path. Bulk-write unit naming: **pulse** on all user-facing surfaces; "nanobatch" is reserved for the DS-020 learning innovation and never names physical I/O.
- **IGF-T1-E910 v2 / AP-25 (Korean Test):** all fixes express one structural invariant; no enumerated failure shapes; no cover-page/sheet-name/string-literal special-casing anywhere.
- **Decision 95 (reconciliation invariant):** F4's decisive check is a count equality, not proximity. 160,443 or it fails.
- **Decision 64 v3 / one-canonical-surface:** if Phase A finds session state split across surfaces (memory + DB), the fix consolidates to one durable surface; no parallel signal stores.
- **Reconciliation-channel separation:** no ground-truth payout values appear in this directive; none are required. Classification ground truth for the witness file is operative state, not GT, and may be referenced.
- **FP-49 (SQL Verification Gate):** every SQL statement authored under this directive is preceded, in the DIAG output or completion report, by the pasted table definition(s) from `SCHEMA_REFERENCE_LIVE.md` it touches. Where data lives in `metadata` jsonb, paste three live rows' actual keys before querying on them. VP database access is via Supabase service-role client (`npx tsx scripts/...`) for CC reads; migrations are architect-applied via Dashboard SQL Editor per SR-44.

---

## §3 — Phase A: DIAG (read-only post-mortem; no code ships)

**Numbering:** read `docs/diagnostics/` first; take the next DIAG-NNN in sequence. Output file: `docs/diagnostics/DIAG-NNN_WARM_WITNESS_POSTMORTEM_OUTPUT.md`. This phase ships zero code changes (lightweight read scripts under `scripts/` used for evidence capture are permitted and committed).

**A1 — Session-state persistence surface.** Identify where SCI-bulk session unit-states, pulse counters, and the conclusion summary persist. Paste the `session-state` route code and every store it reads (file: `web/src/app/api/import/sci/session-state/**`, plus whatever module holds the surface). State plainly, with code as proof: in-memory, database, or hybrid — and exactly which parts die with the process. Explain, against that evidence, the observed "1 of 326 / 0 rows" panel after 11 commits.

**A2 — Entity-resolution write-pattern audit (DS-020 litmus).** Paste the code path that processes entity-classified units in execute-bulk (entity resolve/upsert/enrich, the `Entity: N new, N existing, N enriched` emitter). Answer with evidence: (a) is it per-entity synchronous writes? (b) why do 6–50-row rosters take minutes while a 160,443-row transaction unit commits in seconds? (c) where exactly did the in-response loop stop relative to the 5 roster units — queue ordering, death of the response-scoped loop, or both? (d) why does the entity phase emit no pulses, no VERBOSE events, and no telemetry movement?

**A3 — D16.1 machinery against this failure shape.** The 5 rosters produced **no** `import_batches` rows. Paste the liveness-reconciliation and orphan-reclamation code and state whether "unit never created a batch" is inside or outside its detection surface. If outside, name it as a gap in the invariant (no fix in this phase).

**A4 — F4 supersede visibility (decisive).** Paste: (a) the HF-213 supersede write — exactly what it mutates on the prior batch; (b) the read-side visibility predicate used by every `committed_data` consumer (calculation engine read path, census/telemetry derives, any reporting read). Then run the decisive check via tsx script and paste output: the live-visible Ventas_Transaccional row count for tenant `3d354bfa-b298-48dd-88a0-9f8c5a00be4e` **as the engine would read it**. 160,443 → F4 closes functioning-as-designed; paste the predicate that achieves it. ≈320,886 → F4 is confirmed STOP-CLASS; halt per HALT-2.

**A5 — Telemetry-derive cost.** Paste the telemetry derivation query/queries behind `session-state?telemetry=1` and state, with timing evidence from the run log (9–23s observed), why it contends with the write path on the Small tier.

**Phase A ends at HALT-1** (architect disposition). Commit + push the DIAG output before halting.

---

## §4 — HALT conditions

- **HALT-1 (mandatory, end of Phase A):** DIAG output committed; architect dispositions A1–A5 findings and releases Phases B–E with any scope amendments. No fix code before this release.
- **HALT-2 (F4 STOP-CLASS):** if A4's engine-visible Ventas count ≠ 160,443, halt immediately after committing the DIAG output; F4's fix (Phase E) jumps to the front of the fix sequence and nothing else ships first. Per Decision 95, no other work proceeds on a double-counting fact table.
- **HALT-3 (locked-rule conflict, SR-42):** any fix that would require enumerating shapes, per-tenant logic, or language-literal matching halts for architect disposition.
- **HALT-4 (schema change):** any fix requiring a migration halts for architect application via Dashboard SQL Editor (SR-44); CC authors and commits the migration file and verifies post-application via tsx script.

---

## §5 — Phases B–E: fix specifications (execution gated on HALT-1 release)

Each phase expresses **one invariant**. Each lands as its own commit set with its own EPG evidence in the completion report. Behavior outside the named invariant is preserved exactly (DD-7).

**Phase B — D20: the durable session spine.** *Invariant: session unit-states, pulse progress, and the conclusion summary survive process and response death; any reader (settle, panel, telemetry) reconstructs identical truth from the durable surface at any time.* If A1 shows memory-resident state, persist the session surface (per Decision 64 v3, one surface — extend an existing table or session store per A1's evidence; HALT-4 if migration needed). The execute queue must either run detached from the HTTP response or be resumable from the durable spine such that response death at any point cannot orphan unprocessed units. `settleFromSurface` then settles against truth that cannot reset. EPG: kill the response mid-execute in a controlled test; paste evidence the queue completes (or resumes) and the panel never regresses.

**Phase C — D21: entity-phase scale and visibility.** *Invariant: entity resolution passes the DS-020 litmus — batch I/O, no per-entity synchronous writes — and emits the same observability as every other phase (pulses, VERBOSE events at decision time, telemetry movement).* Implement per A2's evidence. EPG: paste before/after timing for one roster unit and the pulse/VERBOSE trace from a live import.

**Phase D — D19: progress rendering source.** *Invariant: in-progress panels render from the streamed/cheap surface; the heavy telemetry derive never gates progress display and never contends with the write path; no two panels on one screen can disagree because both read the same spine.* Implement per A5's evidence (derive pulse progress from streamed unit-states; cap or cheapen the telemetry poll during execute). EPG: paste panel-state evidence from a live import showing continuous pulse movement and header/panel agreement.

**Phase E — F4: supersede visibility (scope per A4).** If A4 closed functioning-as-designed: document the predicate in the completion report; no code. If STOP-CLASS: *invariant — exactly one generation of a content unit is visible to any consumer; supersession is recorded on the batch surface that visibility predicates actually read.* HALT-4 likely applies (status vocabulary or metadata-key migration). EPG: the engine-visible Ventas count returns 160,443, pasted; plus one adjacent consumer (census/telemetry) pasted at the same count (E952: class layer, not instance).

**Witness re-run (architect, after B–E green):** same file, same tenant, no reset. The re-run additionally proves queue completion on the 5 roster units and supersede behavior on re-import — a stronger exit than the lost run. Success criteria: 16/16 Tier-1; all 16 units committed; pulse panel truthful throughout including the entity phase; designed completion with Saved/Learned/Cost; engine-visible Ventas = 160,443.

---

## §6 — Reporting discipline

- DIAG output: `docs/diagnostics/DIAG-NNN_WARM_WITNESS_POSTMORTEM_OUTPUT.md` (NNN read from directory). Every claim carries pasted code/SQL/terminal evidence (Rules 25–28; E905).
- Completion report (after Phases B–E): `docs/completion-reports/OB-203_PHASE-6B_COMPLETION_REPORT_<YYYYMMDD>.md` — per-phase EPG evidence pasted, build-restart evidence, commit SHAs, and the standard structure per `HANDOFF_TEMPLATE_CORRECTIONS.md` discipline. PASS/FAIL self-attestation is not accepted.
- Final step after architect witness sign-off: `gh pr create --base main --head OB-203-phase-6` with descriptive title and body (architect merges per SR-44). SR-43 governs closure: merge + production verification + completion report with SHA.

---

## §6 (continued) — Out of scope

- BL-004 full tenant-landing rework (the 2.3 scoped iteration from the prior consolidated directive remains queued and lands after the witness re-run).
- BL-006 derived-detection strengthening (aggregation under partial vocabulary overlap; double-counting stakes recorded).
- INF-001 Loading Dock architecture (queued jobs, bounded concurrency, generalized schedulers/queues) — only the session-spine durability needed for Phase B's invariant ships here; generalized infrastructure does not.
- Supabase tier changes (SR-34 ruling stands; Small is the discipline canary).
- OB-203 Phase 7 regression (existing plan at `docs/vp-prompts/OB-203_PHASE7_REGRESSION_PLAN.md`; follows PR merge).

---

## §6A — Residuals

- **Entity-phase silence as a class:** if A2 confirms the silent-phase pattern, sweep for other silent long-running phases (plan interpretation, signal capture) as a named follow-up — not in this directive's scope.
- **`import_batches` lacks supersede vocabulary in `status`** (if A4 confirms metadata-based or absent recording): candidate schema-vocabulary decision for architect, with HALT-4 migration path.
- **D16.1 invariant gap** (if A3 confirms): "unit never created a batch" detection — follow-on HF candidate, sequenced after this directive closes.
- **Auth middleware timeouts under DB saturation** (`getUser() failed or timed out`): observed symptom, not diagnosed here; candidate for the INF-001 arc where saturation control lives.
- **Telemetry-derive cost on Small tier:** Phase D caps contention; the structural cheap-derive (materialized counters on the durable spine) is an INF-001 item.
