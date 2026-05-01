# Phase 4 Audit — Close Summary (Code-and-Schema Scope)

**Branch:** `ds021-substrate-audit`
**Date:** 2026-04-30
**Scope:** Code-and-Schema. Runtime probes deferred per environment scope.
**Authority artifacts:** DS-021 v1.0 LOCKED, DIAG-DS021-Phase4, Plan v1.1.

---

## Cluster commit log

| Cluster | Commit | Evidence files |
|---|---|---|
| Cluster A (Signal Surface Coherence) | `9aade49f` | cluster_a_evidence.md, cluster_a_signal_audit_output.txt, cluster_a_ira_prompt_as_drafted.txt, cluster_a_ira_raw.txt, cluster_a_ira_packet.json + audit_phase4_cluster_a.ts |
| Cluster B (Processing Boundary Discipline) | `ca436062` | cluster_b_evidence.md |
| Cluster C (Calculation Engine Discipline) | `6da9b3a2` | cluster_c_evidence.md |
| Cluster D (Schema Architectural Constraints) | `d953d7e1` | cluster_d_evidence.md |
| Remaining (G1, G2, G3, G4, G6 + P1–P11 + Arch-Trace) | `5840f128` | cluster_remaining_evidence.md |

All commits pushed to `origin/ds021-substrate-audit`.

---

## HALT events

**Total: 0.**

No HALT events occurred across any cluster. All in-scope code-and-schema probes either executed cleanly or were deferred under documented environment-scope reasons (per Section 0 discipline). No bypasses considered or rejected.

---

## Probes executed cleanly

**Total: 44 probes.**

### Cluster A (8 probes)
- S-CODE-G11-01a (within-run reads, convergence service)
- S-CODE-G11-01b (cross-run reads, convergence service)
- S-CODE-G11-02 (flywheel aggregation read-path)
- S-SIGNAL-G11-01 (run-scoping + signal distribution)
- S-CODE-G7-01 (SCI agent signal-write paths)
- S-CODE-G7-02 Step 1 + Step 2 (JSONB column inventory + per-column key vocabulary)
- S-SCHEMA-G7-01 (three-level signal_type support)
- S-SIGNAL-G7-01 (signal-type distribution across SCI agents)

### Cluster B (6 probes)
- S-CODE-G5-01 (dispatch sites)
- S-CODE-G5-02 (validation surfaces)
- S-SCHEMA-G5-01 (canonical registry table)
- S-CODE-G8-01 (foundational name literals)
- S-CODE-G8-02 (per-agent field-identification)
- S-CODE-G8-03 (AI prompt construction)

### Cluster C (2 probes)
- S-CODE-G9-01 (AI/math code organization)
- S-CODE-G9-02 (calculation engine plan-loading lifecycle)

### Cluster D (2 probes)
- S-CODE-G10-01 (DELETE-before-INSERT pattern)
- S-SCHEMA-G10-01 (UNIQUE constraint coverage)

### Remaining (26 probes)
- G1: S-CODE-G1-01, S-CODE-G1-02, S-SCHEMA-G1-01, S-SCHEMA-G1-02 (4)
- G2: S-CODE-G2-01, S-CODE-G2-02, S-CODE-G2-03, S-SCHEMA-G2-01 (4)
- G3: S-CODE-G3-01, S-CODE-G3-02, S-SCHEMA-G3-01 (3)
- G4: S-CODE-G4-01 (1)
- G6: S-CODE-G6-01, S-CODE-G6-02 (2)
- Property observability mechanism presence (P1–P11): 11
- Architecture-Trace static probe inventory: 1

---

## Probes deferred (environment scope)

**Categories: 9 named runtime probes + multi-table G7-02 Step 2 + 11 property runtime tests + 12 architecture-trace runtime probes + Calculation-Trace.**

### Runtime probes (named in DIAG)
| Probe ID | Reason |
|---|---|
| S-RUNTIME-G1-01 | Requires runnable import + UI/API surface |
| S-UI-G2-01 | No browser automation surface in this environment |
| S-RUNTIME-G3-01 | Requires populated rule_sets, committed_data, multiple periods |
| S-RUNTIME-G4-01 | Requires shuffled-import test fixtures + runnable end-to-end pipeline |
| S-RUNTIME-G4-02 | Single-file isolation test requires runnable end-to-end pipeline |
| S-RUNTIME-G9-01 | Mid-run plan-modification harness; requires runnable calculation |
| S-RUNTIME-G9-02 | CRP $566,728.97 reconciliation; requires CRP fixture + runnable calculation |
| S-RUNTIME-G10-01 | Duplicate-execution test; requires runnable calculation |
| S-RUNTIME-G11-01 | Cross-run learning observation; requires populated proof data + sequenced runs |

### Step 2 G7-02 key-vocabulary inspection on empty JSONB columns
- `rule_sets.input_bindings` (architect-named: `plan_agent_seeds`) — table empty (0 rows)
- `rule_sets.components`, `rule_sets.metadata` — table empty
- `committed_data.metadata` — table empty
- `calculation_results.{metrics, metadata}` — table empty
- `calculation_traces.{inputs, output, steps}` — table empty
- `entity_period_outcomes.metadata` — table empty
- `processing_jobs.{classification_result, proposal}` — table empty
- `ingestion_events.classification_result` / `validation_result` — column does not exist in live DB (out-of-band schema divergence; flagged as adjacent Cluster A finding)

### Property observability runtime portions (P1–P11)
All 11 property runtime tests deferred (mechanism presence verified in Remaining cluster; runtime population observation deferred).

### Architecture-Trace runtime portions
12 of 16 probes (probes 1–12 require populated tenant data: 0 rows in `committed_data`, `calculation_results`, `calculation_batches`, etc.). Probes 13–16 (Korean Test surfaces) partially substituted by Cluster B G8 evidence; full runtime invocation deferred.

### Calculation-Trace
Entirely deferred. Single-entity forensic execution (CRP / BCL / Meridian fixtures) not present in this environment.

---

## IRA invocation cost summary

| Cluster | Invocation | Cost (USD) |
|---|---|---|
| Cluster A | Cluster A signal surface coherence review | **$1.501725** |
| **Total** | | **$1.501725** |

IRA invocation: 1 (Cluster A only, per Plan v1.1 Section 5.bis deliverable-internal scope).

IRA outputs (Cluster A):
- 16 IP entries (binding entries, T0/T1 substrate)
- 2 option_recommendations: option_a (rank 2, NOT RECOMMENDED as framed); option_b (rank 1, RECOMMENDED with substrate-bounded-authority caveat)
- 3 supersession_candidates (T2-E29, T2-E01, T2-E28 — all flagged at identifier_only fidelity, escalation recommended)
- 2 substrate-bounded-authority flags: DS-021 v1.0 §12 + §14 FLI-1 not at full body fidelity
- Tier verdict: `tier_3_novel`
- Prompt version: `ira-v6.0-unified-2026-04-19`

CC did not disposition the IRA verdict. The IRAPacket is preserved verbatim at `docs/audit-evidence/phase4/cluster_a_ira_packet.json` for architect disposition.

---

## Verdict matrix readouts (CC reports cells; does NOT disposition)

**G11 aggregate (per Plan v1.1 R-2):**

| 11-01a | 11-01b | Aggregate magnitude per matrix |
|---|---|---|
| **ABSENT** | **ABSENT** | **blocking** |

**P5 (per Plan v1.1 R-3):** **PRESENT** — trajectory-engine.ts, trajectory-service.ts, state-reader.ts, next-action-engine.ts produce forward-looking output observable as code path (a) per R-3 thresholds.

---

## Adjacent findings flagged (substrate-coherence concerns distinct from named commitments)

1. **Schema vs migration divergence on `classification_signals`** (Cluster A): Live DB has 14 columns NOT in committed migrations (`classification, decision_source, structural_fingerprint, classification_trace, vocabulary_bindings, agent_scores, human_correction_from, scope, source_file_name, sheet_name, header_comprehension, rule_set_id, metric_name, component_index`). Conversely, `ingestion_events.classification_result/validation_result` exist in migration 007 but NOT in live DB. Implies out-of-band migration channel.

2. **Validator/executor source-vocabulary drift** (Cluster B G5-02): `intent-validator.ts` `VALID_SOURCES` private const has 6 entries; `intent-executor.ts` `resolveSource` switch has 8 entries. `cross_data` and `scope_aggregate` are handled by executor but rejected by validator.

3. **content-profile.ts Korean Test contradiction** (Cluster B G8-01): File header claims "Zero domain vocabulary. Korean Test applies." but lines 135 and 163 use multilingual SIGNAL substring matching to influence type-classification scoring. Line 163 short-circuits BEFORE structural value-distribution check.

4. **intent-transformer.ts decorative switch** (Cluster B G5-01 / G6-01): 5 named `case` branches all route to the same function as `default`; no behavioral differentiation; no structured-failure throw.

5. **`entity_period_outcomes` DELETE scope** (Cluster D): DELETE scope `(tenant_id, period_id)` matches its UNIQUE constraint (no rule_set_id). Means a calculation run for plan B on a period will wipe plan A's outcome rows. Disposition question.

6. **Mid-run plan mutation in API route** (Cluster C G9-02): Route conditionally mutates rule_set.input_bindings mid-run (lines 154 + 166) on first-run path when convergence runs. Subsequent runs honor plan-load-once-at-run-start. Disposition question.

CC reports findings. CC does NOT disposition magnitude.

---

## Audit close

CC's responsibilities per directive Section 12 are complete:
- ✓ All cluster evidence on `ds021-substrate-audit` (committed, pushed across 5 commits)
- ✓ Token-budget reporting dropped per architect direction at BEGIN_PHASE_4_A
- ✓ HALT events inventory: 0
- ✓ DEFERRED probes inventory: 9 named runtime + multi-table Step 2 + 11 property runtime + 12 architecture-trace runtime + Calculation-Trace
- ✓ Probes executed cleanly inventory: 44
- ✓ IRA invocation cost summary: $1.501725 (Cluster A only)
- → PR creation pending architect signal CLOSE_AUDIT (this file produced as part of close)

Awaiting architect direction.
