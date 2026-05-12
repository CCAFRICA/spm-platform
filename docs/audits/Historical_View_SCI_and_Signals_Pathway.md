# Historical View — SCI Architecture and Signals Pathway

**Purpose:** Substrate baseline for AUD-007 OB-199 SCI Structural Preservation Audit evidence assessment.
**Drafted:** 2026-05-10 during AUD-007 pre-evidence-arrival window.
**Source:** Reconstruction from project conversation history surfaced via `conversation_search`, plus session-accumulated context (DS-023, AUD-006, IRA response, deletion-intent verification artifact, OB-199 commit summaries).
**Disclaimer:** This artifact is a CONSTRUCTED baseline from secondary sources (conversation excerpts). It is NOT a primary read of DS-021, Decision 30 v2, Decision 64 v2, HF-092 migration text, or the pre-OB-199 `writeClassificationSignal` source. AUD-007 E5 evidence will surface the primary documents; until then this artifact serves as a working baseline that AUD-007 evidence can confirm, refine, or correct.

---

## Section 1 — What "SCI" denotes (architectural identity)

**SCI = Synaptic Content Ingestion.** The first-class platform pipeline for ingesting external data (Excel files via Storage upload), classifying it, fingerprinting it, and producing the classification signals that feed downstream metric comprehension and convergence.

**Pipeline phases observed in conversation history:**

| Phase | What happens | Conversation evidence |
|---|---|---|
| Upload | File staged in Supabase Storage | `[SCI Bulk] Downloading from Storage` log marker |
| Fingerprint | Structural hash computed; matched against `sci_fingerprints` table by tier | `[SCI-FINGERPRINT] tier=3 match=false hash=...` |
| Header comprehension | AI-assisted role classification per column | `[SCI-HC-DIAG] llmCalled=true ... avgConf=0.92 cols=13 insights=3` |
| Profile | Volume/cardinality/temporal/numeric heuristics per sheet | `[SCI-PROFILE-DIAG] idRepeatRatio=1.70 volumePattern=few ...` |
| CRR (Classification Resolution & Routing) | Bayesian classification of sheets to types (transaction / entity / reference / target / plan) | `[SCI-CRR-DIAG] posteriors=[entity=33%, ...]` |
| Overlap analysis | Cross-sheet identifier overlap detection | `[SCI-OVERLAP] sheet=Datos column=ID_Empleado overlap=100% signal=high` |
| HC pattern | Pattern-based classification override / refinement | `[SCI-HC-PATTERN] classification=transaction@90% pattern=repeated_measures_over_time` |
| Scores | Final per-sheet classification winner | `[SCI-SCORES-DIAG] winner=entity@33% scores=[entity=33%, ...]` |
| Proposal | Content unit construction | `[SCI-PROPOSAL] 1 content units for 1 sheets` |
| Bulk commit | Rows committed via SCI bulk path | `[SCI Bulk] Chunk 1/1: 85/85 rows committed` |
| **Signal write (the surface DS-023 / OB-199 targets)** | Classification outcome persisted to `classification_signals` table | `[SCI Signal] Write failed:` markers observed in May 5 import logs |
| Entity Resolution | DS-009 §3.3 entity creation / back-linking | `[Entity Resolution] DS-009 3.3: 0 created, 85 rows linked across 3 batches` |
| Post-commit construction | SCI bulk back-linking finalization | `[PostCommitConstruction:sci-bulk] entities_created=0 rows_back_linked=85` |

**Logging marker convention:** `[SCI <descriptor>]` for SCI-internal phases; `[SCI Signal]` specifically for the classification-signal write surface — the surface OB-199 has touched.

**Operative observation from May 5 logs:** SCI Signal write failures were occurring in production (`[error] [SCI Signal] Write failed: TypeError: fetch failed` — six occurrences in rapid succession during a single import). This is empirical evidence that the signal-write surface had robustness issues pre-OB-199 — the surface OB-199 was designed to harden.

---

## Section 2 — Classification Signals as substrate

### Decision 30 v1 (terminology lock)

`IGF-T2-E29 v1` — Classification Signals Terminology.

**violation_patterns (high severity):**
- Classification signals stored or managed as model training data
- Downstream systems consuming classification signals as model training inputs

**violation_patterns (medium severity):**
- Documentation or code using "training signals" terminology for classification signals
- API or schema field names using "training" terminology

**does_not_apply_when:** "Contexts where the platform is explicitly discussing model training pipelines, which are a separate concern"

**false_positive_triggers:** "References to 'training' in the context of actual model training pipelines that are separate from the classification signals surface"

**cross_references:** Decision 153 (Deferred at v1 authoring), Decision 118, Decision 64

### Decision 30 v2 (extension authored 2026-04-22)

Three-layer framework added to v1's terminology precision:

**L1 — Classification:** Field-level classification of imported data. What a field IS (transaction_value / entity_identifier / period_marker / metric_output). Produced during ingestion by SCI agents. Per-field, per-import scope. Consumer: downstream SCI agents and field-semantic processing.

**L2 — Comprehension:** Plan-document-level comprehension of metric labels declared in a plan vs. raw data those metrics derive from. Wired by HF-193 Gate B/C.

**L3 — Convergence:** Final convergent classification — the system's "decided" classification after L1+L2 integration.

**Typed scoping vocabulary on classification_signals:** `rule_set_id` UUID, `metric_name` TEXT, `component_index` INTEGER — added as dedicated columns for L2 composite-key retrieval at calculation time.

**Composite partial index** specified for L2 query patterns.

### Decision 64 v2 (Dual Intelligence Architecture)

Located at `/mnt/project/DECISION_64_DUAL_INTELLIGENCE_SPECIFICATION_v2.md` in the prior session's context.

**Establishes:**
- Three-level signal capture (Classification / Comprehension / Convergence) as **three levels of the SAME signal capture infrastructure**, not three separate surfaces
- Each signal level feeds all three flywheel scopes (Tenant / Foundational / Domain)
- Signal capture must be wired from alpha per "Carry Everything, Express Contextually" (T1-E902)
- The word "training" does not appear in Decision 64 v2 body

**Does NOT specify:**
- Implementation storage table for signals
- Signal_type naming conventions
- Whether flywheel signals coexist with classification signals on the same surface

### The "shared substrate" empirical reality (April 2026 finding)

Conversation history (`VP SEEDS REMOVAL` thread, 2026-04-24) surfaced that `classification_signals` was already operating as a **shared multi-purpose substrate** since February 2026:

- **L1 SCI classification signals** (via direct inserts in `sci/classification-signal-service.ts`)
- **Training-surface signals** (12+ distinct `training:*` literals across 12 files; `TrainingSignalService` class at `web/src/lib/ai/training-signal-service.ts`; `persistSignal()` helper in `signal-persistence.ts` with docstring listing `training:*` as a known signal_type convention; template-literal generator emitting `training:${response.task}` per AITaskType enum)
- **L2 Comprehension signals** (added by HF-193 Gate B/C)
- **Convergence signals** (L3)

This was shipped deliberately Feb 20–22, 2026 via **HF-055 + OB-77 + OB-78 + OB-83**. Commit-message framing: "training signal capture — first flywheel writes," "Synaptic State foundation," "closed-loop learning."

**The IRA Phase 2 outcome:** Option A (no remediation required; logical separation via signal_type prefix discipline satisfies "separate surface" carve-out) was adopted; Decision 30 v2 extension preserved v1 terminology, added the three-layer framework, and did not declare the coexistence a violation.

---

## Section 3 — The signal-write surface as of pre-OB-199

### Writer-side architecture (from AUD-006 + IRA + OB-199 verification artifact)

Two writer-surface architectures coexisted:

**Architecture A — `signal-persistence.ts` path (JSONB-primary):**
- `persistSignal(signal, url, key): Promise<{success, error?}>` single-row
- `persistSignalBatch(signals[], url, key): Promise<{success, count, error?}>` batch
- Writes 9 columns: `tenant_id`, `entity_id`, `signal_type`, `signal_value`, `confidence`, `source`, `context`, `calculation_run_id`, `rule_set_id`
- HF-214 Phase 1 added per-row catch-block diagnostic on insert failure
- HF-214 Phase 2 added writer-side A clamp `Math.min(Math.max(c, 0), 0.9999)` — the clamp DS-023 §5.5 deletes
- HF-215 preserved clamp + B2 as defense-in-depth

**Architecture B — `writeClassificationSignal` SCI primitive (dedicated-columns):**
- Location: `web/src/lib/sci/classification-signal-service.ts:81-122` (pre-deletion)
- Signature: `writeClassificationSignal(payload, supabaseUrl, supabaseServiceKey): Promise<string | null>`
- **Hardcoded SCI markers:**
  - `signal_type: 'classification:outcome'` (one specific signal_type only — function was specialized)
  - `scope: 'tenant'`
  - `source: payload.humanCorrectionFrom ? 'user_corrected' : 'sci_agent'` — SCI-specific source vocabulary
  - `context: { sciVersion: '2.0', phase: 'E', schema: 'HF-092' }` — SCI emission identification metadata
- **Wrote to `classification_signals` with DEDICATED COLUMNS** (the HF-092 schema migration's typed-column path):
  - `source_file_name`
  - `sheet_name`
  - `structural_fingerprint`
  - `classification`
  - `decision_source`
  - `classification_trace`
  - `vocabulary_bindings`
  - `agent_scores`
  - `human_correction_from`
  - `scope`
- Returned the inserted row's `id` via `.select('id').single()`
- Log markers: `[SCI Signal] Write failed:` and `[SCI Signal] Write exception (non-blocking):`
- **Function-level structural commitment:** every SCI emission carried `sciVersion`/`phase`/`schema` markers as architectural guarantee

### The marker context — what it means

| Marker | Value (pre-OB-199) | Significance |
|---|---|---|
| `sciVersion` | `'2.0'` | SCI architectural version. SCI v1.0 markers surfaced separately in `signal-capture-service.ts` (per OB-199 verification artifact). The version distinguishes generations of the SCI architecture. |
| `phase` | `'E'` | SCI Phase E. Per OB-199 verification artifact: "post-execute classification signal emission." Phase E is the SCI lifecycle stage where the classification outcome is persisted (i.e., post-CRR, post-HC-pattern, post-decision). |
| `schema` | `'HF-092'` | References the HF-092 dedicated-columns migration. The dedicated columns (`source_file_name`, `sheet_name`, `structural_fingerprint`, `classification`, `decision_source`, `classification_trace`, `vocabulary_bindings`, `agent_scores`, `human_correction_from`, `scope`) were added to `classification_signals` by this migration. The schema marker records which migration's column set the signal was written against. |

**This is a versioned, phased, schema-tagged emission contract.** Every SCI outcome row is self-identifying with the SCI generation, lifecycle phase, and schema migration that produced it. The contract enables forward-compatible schema evolution and backward-trace of SCI evolution.

### Reader-side dependencies (from session context)

Readers consume the JSONB and dedicated columns:

- **`convergence-service.ts:loadMetricComprehensionSignals`** — reads L2 Comprehension signals
- **`ai-metrics-service.ts:fetchSignals`** — universal reader; consumes all signal types
- **Calibration metrics** (per AUD-006 reader-side risk-flag)
- **Persona queries** (per architect's prior naming in this session)
- **SCI lookupPriorSignals + vocabulary recall** — same file as `writeClassificationSignal` (preserved); reads via separate path

---

## Section 4 — What HF-092 represents

**HF-092 = the dedicated-columns migration on `classification_signals`.**

HF-092 introduced the typed columns that `writeClassificationSignal` populated:
- `source_file_name`, `sheet_name`, `structural_fingerprint` — provenance identifiers
- `classification` — the L1 classification outcome (typed column rather than JSONB nesting)
- `decision_source`, `classification_trace`, `vocabulary_bindings`, `agent_scores` — decision provenance
- `human_correction_from` — corrective-feedback linkage
- `scope` — partition discriminator

**Architectural significance:** HF-092 moved SCI outcome identification from JSONB-nested context fields into typed first-class columns. This enables direct SQL queries against the SCI surface without JSONB path expressions — substantially more efficient for reader-side flywheel queries.

**OB-199's relationship to HF-092:** OB-199 Phase 4 absorbed the dedicated-column write path into the canonical writer. The canonical writer must write both the JSONB path (9 columns from Architecture A) AND the dedicated columns (10 columns from HF-092 / Architecture B). AUD-007 E1.3 + E3.1 + E3.6 verify whether this absorption is complete and column-shape-coherent.

---

## Section 5 — Signal Pathway substrate composite picture

```
                  ┌─────────────────────────────────────┐
                  │     EXTERNAL DATA INGRESS           │
                  │   (Excel files via Storage upload)  │
                  └────────────────┬────────────────────┘
                                   ▼
                  ┌─────────────────────────────────────┐
                  │      SCI PIPELINE (lib/sci/)        │
                  │                                     │
                  │  Fingerprint → HC → Profile → CRR  │
                  │  → Overlap → HC-pattern → Scores   │
                  │  → Proposal → Bulk commit          │
                  │  → Signal write (SCI Phase E)      │
                  │                                     │
                  │  signal-capture-service.ts          │
                  │  classification-signal-service.ts   │
                  │  signal-fingerprint-service.ts      │
                  │  vocabulary-recall.ts               │
                  └────────────────┬────────────────────┘
                                   ▼
                  ┌─────────────────────────────────────┐
                  │  classification_signals (Dec 64 v2) │
                  │                                     │
                  │  L1 SCI classification signals      │
                  │  L2 Comprehension signals (HF-193)  │
                  │  L3 Convergence signals             │
                  │  training:* flywheel signals        │
                  │                                     │
                  │  Columns:                           │
                  │   - JSONB path (9 base columns)     │
                  │   - HF-092 dedicated (10 columns)   │
                  │   - Decision 30 v2 typed scoping    │
                  │     (rule_set_id, metric_name,      │
                  │      component_index)               │
                  └────────────────┬────────────────────┘
                                   ▼
              ┌────────────────────────────────────────┐
              │  READER / FLYWHEEL SURFACES            │
              │                                        │
              │  convergence-service.ts                │
              │   (loadMetricComprehensionSignals)     │
              │  ai-metrics-service.ts                 │
              │   (fetchSignals — universal reader)    │
              │  calibration metrics                   │
              │  persona queries                       │
              │  SCI vocabulary recall                 │
              │  Flywheel learning accumulation        │
              │                                        │
              │  AUD-004 v3 E5: read-before-derive    │
              │  T1-E906: closed-loop intelligence    │
              └────────────────────────────────────────┘
```

---

## Section 6 — Defect arc (April–May 2026) preceding OB-199

| When | Event | What it surfaced |
|---|---|---|
| Feb 2026 | HF-055 + OB-77/78/83 | Training-surface architecture shipped on shared `classification_signals` table |
| March 2026 | AUD-001 | F-001 (HF-161 closed); F-002 (dual-write architecture active); F-003 (fire-and-forget swallowed failures) |
| 2026-04-20 | Decision 153 LOCKED | Atomic cutover from `plan_agent_seeds` to signal-surface architecture |
| 2026-04-22 | Decision 30 v2 LOCKED | Three-layer framework + typed scoping vocabulary |
| 2026-04-24 | VP SEEDS REMOVAL session | Training-surface coexistence question dispositioned via IRA Option A |
| 2026-04-27 | AUD-004 v3 + Decisions 154/155 | E1–E6 substrate extensions; Korean Test (Dec 154); registry as canonical declaration surface (Dec 155) |
| 2026-04-30 | DS-021 | Substrate Architecture Biological Lineage |
| 2026-05-04 | DS-022 | (Per architect: legitimate DS on separate scope) |
| 2026-05-05 | Production logs | `[SCI Signal] Write failed: TypeError: fetch failed` — six failures during single import. Empirical evidence of write-surface fragility. |
| 2026-05-06 | DIAG-035–038 + HF-214 + HF-215 | Eight fragmented passes against Meridian magnitude defect. Per T1-E920, qualifies as pattern, not bug. |
| 2026-05-09 | AUD-006 (PR #384) | Empirical inventory of signal-write defect; 10 findings. |
| 2026-05-09 | IRA review (PR #54) | tier_3_novel review of DS-022 v2; substrate coherence confirmed; sequencing per `Sequence_A_modified_with_registry_gate`. |
| 2026-05-10 | DS-023 (this session) | Renumbered DS-022 v2 per architect; ratified. |
| 2026-05-10 | OB-199 Phases 1–4 | Producer normalization, registry consolidation, canonical writer, caller migration. |
| 2026-05-10 | Verification artifact + halt | Architect concern about SCI structural erosion. |
| 2026-05-10 | AUD-007 directive | Read-only empirical audit of OB-199 SCI preservation. |

---

## Section 7 — What this baseline lets me assess when AUD-007 returns

When CC returns AUD-007 evidence, I read against this baseline. Specifically:

**E1 — Canonical writer source:** Does `canonical-signal-writer.ts` write the HF-092 dedicated columns? Does it accept the `sciVersion`/`phase`/`schema` context block? Does it enforce SCI-marker presence for `signal_type: 'classification:outcome'`?

**E2 — Signal reader source:** Does the byte-identical claim hold? Are any reader-side semantics altered?

**E3 — `classification_signals` schema:** Does the live schema match what Decision 30 v2 + HF-092 jointly require (the 9 base + 10 dedicated + 3 typed scoping columns)? Are constraints/RLS preserved?

**E4 — The 5 SCI call sites:** Do the migrated calls preserve all SCI markers (not just `sciVersion: '2.0'` which CC's grep confirmed, but `phase`, `schema`, `source` vocabulary, `human_correction_from` semantics)? Does error-handling preserve the SCI-specific failure semantics?

**E5 — DS-021 + SCI substrate:** What does DS-021 say about the SCI lineage? What does the `lib/sci/` directory's current state look like (which functions remain SCI-native, which migrated to intelligence)? What does HF-092 specifically require of the columns?

**E6 — Reader-side surfaces:** Do convergence-service and ai-metrics-service read what the canonical writer writes? Are there reader-side queries that depended on Architecture B's specific column shape?

---

## Section 8 — Known unknowns this baseline cannot answer

- **DS-021 full body.** Not read this session; conversation excerpts do not reproduce DS-021 verbatim. E5.1 will surface it.
- **HF-092 migration body.** Conversation excerpts reference the migration's purpose but not its SQL. E3.5 will surface it.
- **`lib/sci/` directory current state.** Only files surfaced indirectly: `classification-signal-service.ts` (`writeClassificationSignal` deleted, `lookupPriorSignals` preserved per OB-199 verification artifact), `signal-capture-service.ts` (preserved with `sciVersion: '1.0'` per grep), `signal-fingerprint-service.ts` (referenced in May 5 logs), `vocabulary-recall.ts` (referenced). Other files unknown. E5.5 will surface the full directory.
- **AUD-004 v3 full body.** Cited as substrate; not read this session. Referenced fields (E1–E6, N3) understood from IRA quotes only.
- **The 5 migrated call site exact code.** Only grep-line-level confirmation of `sciVersion: '2.0'` preservation; E4.2/E4.3/E4.4 will surface full pre/post diffs.
- **Live `classification_signals` schema.** Inferred from Decision 30 v2 + HF-092 narrative; not read directly. E3.1 will surface.

---

## Section 9 — Assessment posture for AUD-007 evidence

The baseline above is what I bring into reading AUD-007. CC's evidence is what I read against it. The assessment runs:

1. **Confirmation tests** — does the canonical writer preserve the column shape, marker convention, source vocabulary, scope semantics this baseline describes?
2. **Erosion tests** — does the canonical writer's lack of function-level SCI-marker enforcement (per OB-199 verification artifact Row 8) constitute structural degradation versus the pre-deletion guarantee?
3. **Reader-coherence tests** — do reader-side surfaces (convergence-service, ai-metrics-service) read the column shape the canonical writer produces?
4. **Subset tests** — does anything in this baseline NOT have a corresponding surface in the post-OB-199 canonical writer? If yes, that is the structural erosion the architect's concern named.

The result of those four test classes against AUD-007 evidence is the empirical disposition basis. Recommendations come from the test outcomes, not from substrate-principle reasoning over CC's prior summaries.

---

*Historical View — SCI Architecture and Signals Pathway · Substrate baseline for AUD-007 evidence assessment · Reconstructed from project conversation history + session-accumulated context · NOT a primary substrate read (AUD-007 E5 will surface DS-021 + AUD-004 v3 + HF-092 + lib/sci/ directly) · Last updated 2026-05-10*
