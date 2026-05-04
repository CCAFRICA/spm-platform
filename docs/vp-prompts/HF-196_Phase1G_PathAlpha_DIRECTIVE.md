# HF-196 Phase 1G Path α (option ii) — Full HC-Primacy Architectural Realignment

**Continuation of HF-196 vertical slice**
**Branch:** `hf-196-platform-restoration-vertical-slice` (HEAD: `64235c41` Interim Completion Report)
**Date authored:** 2026-05-03
**Architect:** Andrew (vialuce founder)
**Phase scope:** Path α (option ii) — 8 isSequential sites + pipeline reordering + HF-203 SCALE ANOMALY architectural inversion absorbed

---

## 1. PHASE OBJECTIVE

Apply Decision 108 (HC Override Authority Hierarchy LOCKED) **uniformly** across all 8 isSequential consumer sites identified in Phase 1F-0 probe + close the architectural pipeline-ordering inversion that produces Adjacent-Arm Drift as a defect class + close HF-203 SCALE ANOMALY architectural inversion. Single phase, single commit, product-ready Decision 108 alignment.

**Empirical defect (Phase 5E October calc):** $82,551 against ground truth $44,590. Forensic root cause: `Cantidad_Productos_Cruzados` (count column, sample values 9, 2, distinct {1..10}) tagged `structuralType: 'identifier'` despite LLM HC tagging `measure@0.90`. Structural arm at `negotiation.ts:299` fired on `dataType === 'integer' && isSequential === true` and overrode HC. Convergence excluded the column from measureColumns pool; AI mapping fell back to `Depositos_Nuevos_Netos` for component_2 (Productos Cruzados); SCALE ANOMALY auto-correction applied `scale_factor=0.001` to mask the binding error; engine read deposits-magnitude values into Productos Cruzados scalar_multiply evaluator. Plausible-shaped wrong result.

**Scope per architect disposition (option ii):** Phase 1G is the unified architectural realignment covering all dependent and adjacent processes that contribute to the defect class. SR-34 (no bypass) discipline: "Achieving any reconciliation with known issues is failure. We are building a product not solving for a tenant."

**Path α (option ii) scope absorptions:**
- 3 role-binding sites (Sites 1+2+3 — including pipeline-ordering work for content-profile.ts)
- 5 affinity/signal sites (HF-202 candidate ABSORBED)
- HF-205 pipeline-ordering for HC primacy ABSORBED
- HF-203 SCALE ANOMALY architectural inversion ABSORBED

**Out of scope (logged for follow-on):**
- HF-198: calculation_batches audit-column gap
- HF-199: OB-50 surface restoration
- Plan-path data_type vocabulary (commit/route.ts + intelligence/wire/route.ts)

---

## 2. SUBSTRATE GROUNDING (BODY-FIDELITY VERIFIED)

### 2.1 Decision 108 (LOCKED) — HC Override Authority Hierarchy

> "When HC is confident and structural agents disagree, HC wins. Not a weight, not a floor, not a penalty. A binary authority rule for the cold start condition."

Memory entry on IP candidates: "the confidence-threshold authority hierarchy between LLM contextual understanding and structural heuristics. The Decision 108/109 history (proposed, evaluated, one locked, one withdrawn) is strong evidence of non-obvious inventive step."

Decision 108 is the operative substrate. Decision 109 was withdrawn ("empirically unfounded thresholds").

### 2.2 HF-095 Phase 2 (March 6, 2026) — Stated Intent vs Implementation Inversion

Commit `5351a1b4c` message:
> "Replace nameSignals with HC columnRole in semantic binding and field affinity
> - FIELD_AFFINITY_RULES: now HC-aware — uses HC columnRole when available, **falls back** to structural dataType detection
> - inferRoleForAgent: uses HC columnRole for identifier, name, temporal, measure, attribute, reference_key roles
> - Removed containsId/containsName/containsDate/containsAmount/containsTarget from scoring and binding logic"

Authorial intent: "HC primary, structural fallback." Implementation diverged: the `||` predicate construction encoded structural as **peer**, not as below-HC fallback. Phase 1G Path α restores HF-095 Phase 2's stated intent across the entire SCI classification surface.

### 2.3 Adjacent-Arm Drift Pattern (named this session)

Defect class: when a defect-class is diagnosed correctly but the fix targets only the diagnosed instance, leaving the same structural defect-class active in adjacent branches of the same predicate or in adjacent sites of the same pipeline.

Empirical instances (each closed an adjacent arm without addressing the defect-class root):
- HF-169 (March 23): cardinality discrimination *inside* OR-clause body
- HF-171 (March 24): LLM-primary path *inside* OR-clause body
- HF-186 (April 1): agent-aware `reference_key → entity_identifier` (separate predicate)
- HF-196 Phase 1B (May 2): ported HF-186 pattern to `agents.ts`

Each prior fix worked around the structural arm without addressing it. The `isSequential` arm survived intact across 4 fixes targeting the same defect-class principle.

**Phase 1G Path α addresses the defect at the architectural root: pipeline ordering.** The structural arms across all 8 sites have peer authority with HC because content-profile generation runs *before* HC. HC's only mechanism is additive override upward (`header-comprehension.ts:508-509,571-572` can set `hasEntityIdentifier` to true, never to false). This pre-HC profile generation produces structural signals that downstream consumers treat as authoritative.

The visionary fix per Decision 108 + HF-095 Phase 2 stated intent: **HC runs first; structural pattern detection runs second; structural arms gate uniformly on HC silence.** Adjacent-Arm Drift becomes structurally impossible because the structural arm only reaches the codepath when HC is genuinely silent.

### 2.4 8-Site isSequential Consumer Inventory (Phase 1F-0 probe)

| Site | File:Line | Predicate | Role | Phase 1G Action |
|---|---|---|---|---|
| 1 | `negotiation.ts:299` | `hcRole === 'identifier' \|\| (integer && isSequential)` | role-binding | Split predicate; HC-primary first; structural arm gated `(!hcRole \|\| hcRole === 'unknown')` |
| 2 | `agents.ts:536` | `dataType === 'integer' && isSequential` | role-binding | Gate by `(!hcRole \|\| hcRole === 'unknown')` |
| 3 | `content-profile.ts:218` | `integer && uniquenessRatio > 0.90` | role-binding (via hasEntityIdentifier) | Pipeline reordering: pass HC into `detectStructuralIdentifier` via signature change |
| 4 | `negotiation.ts:34` | `hcRole === 'identifier' \|\| (integer && isSequential)` | affinity scoring | Gate structural arm by HC silence |
| 5 | `negotiation.ts:79` | `dataType === 'integer' && isSequential` | affinity scoring | Gate by HC silence |
| 6 | `negotiation.ts:125` | `hcRole === 'identifier' \|\| (integer && isSequential)` | PARTIAL claim flag | Gate structural arm by HC silence |
| 7 | `content-profile.ts:217` | `integer && isSequential` | upstream signal (detectStructuralIdentifier) | Reordering: HC threaded through |
| 8 | `tenant-context.ts:146` | `integer && isSequential` | helper (cross-sheet idField finder) | Gate by HC silence |

Plus: `content-profile.ts:460` (`hasEntityIdentifier` OR-fold consumes detectStructuralIdentifier output) — closed transitively via Site 7's HC threading.

### 2.5 Pipeline Reordering Architecture (HF-205 absorbed)

**Current pipeline:**
1. `content-profile.ts` profile generation runs (8 sites consume isSequential as positive signal)
2. `header-comprehension.ts` runs LLM HC; can additively override hasEntityIdentifier upward only
3. `negotiation.ts` + `agents.ts` consume profile + HC for role binding (Sites 1-2 + 4-6 fire; structural arms have peer authority)
4. ROLE_MAP writes `field_identities.structuralType` in `committed_data.metadata`
5. Convergence reads `field_identities` for measureColumns pool

**Phase 1G Path α pipeline:**
1. `header-comprehension.ts` runs LLM HC FIRST — produces interpretations per column with structural roles
2. `content-profile.ts` profile generation runs SECOND — accepts optional `hcInterpretations` param; gates structural arms on HC silence
3. `negotiation.ts` + `agents.ts` consume HC-gated profile + HC; structural arms only fire when HC is silent
4. ROLE_MAP writes `field_identities.structuralType` honoring HC primacy
5. Convergence reads correctly-classified `field_identities`

**Backward-compatibility:** when HC is genuinely silent (cold-start tenant, LLM error, flywheel-roleMap-miss), structural arms still fire as fallback. The visionary intent (HC primary, structural fallback) is preserved; the prior implementation inversion (HC additive-only over already-fired structural arms) is corrected.

### 2.6 SCALE ANOMALY Architectural Inversion (HF-203 absorbed)

`convergence-service.ts:1558-1591 + 317-333`: when component result ratio>10 vs peer median, current logic interprets as magnitude error and patches `scale_factor` (line 325: `binding.scale_factor = pr.proposedCorrection.proposedScale`). Engine reads value × scale_factor at lines 1416-1417, 1429, 1443, 1483-1484.

**Architectural inversion:** ratio>10 vs peer median is **evidence the binding is wrong**, not evidence the right column has wrong units. Auto-correction masks binding misalignment as magnitude error → silent-failure mode. The Cantidad_Productos_Cruzados defect produced ratio=2636.4 → scale_factor=0.001 → engine read deposits values × 0.001 ≈ 24-33 → fed into scalar_multiply evaluator → plausible-shaped wrong result $82,551.

**Phase 1G Path α HF-203 absorption:** when ratio>10 detected, mark binding `match_pass: 'failed'`, surface a convergence gap, force AI re-mapping with the failed binding excluded from candidate pool. Do NOT patch scale_factor. Do NOT mask the misalignment.

### 2.7 Memory Entry 30 — Substrate-Applying + Substrate-Extending

Phase 1G Path α is **substrate-APPLYING** (Decision 108 to predicates that violated it) AND **substrate-EXTENDING** (pipeline reordering modifies SCI architecture). The substrate-extending portion requires explicit architect approval gate per memory entry 4 (CC standing rules — substrate amendments require T0-E08 bootstrap modification protocol). Architect approval has been granted (option ii dispositioned).

Memory entry 30 alignment honored: "Reconstruction restores what worked, not builds anew" — Phase 1G Path α restores the architectural intent (HC primacy) via pipeline ordering that was always implied by Decision 108 + HF-095 Phase 2 commit message but never operatively present in code.

### 2.8 Recusal Gate

**PASS.** Phase 1G amends VP code surfaces only. Does not amend IRA-governing substrate. Does not amend any T0/T1 IGF substrate.

### 2.9 Architect Approval Gate

**PASS.** Architect dispositioned 2026-05-03:
- Path α (option ii) — full unified comprehensive approach
- 8 isSequential sites + pipeline reordering + HF-203 SCALE ANOMALY architectural inversion
- Single phase, single commit, product-ready Decision 108 alignment
- SR-34 discipline: no known defects shipped
- Reconciliation criterion: $312,033 ± 0.5%

---

## 3. INVARIANTS

- **Decision 108 operative across all 8 sites + pipeline.** Structural arms fire only when `(!hcRole || hcRole === 'unknown')`.
- **HC pipeline-first.** HC runs before content-profile pattern detection (or content-profile accepts HC parameter and gates structural arms accordingly).
- **Korean Test (T1-E910).** All predicate gating uses structural primitives; zero domain literals.
- **Scale by Design.** HC primacy is tenant-agnostic; predicate change applies uniformly across all tenants.
- **Vertical Slice Rule.** Single phase covers HC primacy → profile generation → field_identities → convergence pool → calc → reconcile. Single PR, single commit.
- **Adjacent-Arm Drift defect-class structurally closed.** All 8 sites + pipeline = no unfixed adjacent arms remain.
- **HF-203 SCALE ANOMALY architectural inversion closed.** ratio>10 = reject binding (mark match_pass='failed'), not patch scale_factor.
- **Backward compatibility.** Genuine HC silence cases (cold-start tenant, LLM error, flywheel-roleMap-miss) continue to receive structural classification via gated fallback.
- **Completion report gating.** Phase 1G ships closure only when completion report is populated; reconciliation against $312,033 ± 0.5% empirically demonstrated.

---

## 4. CRITICAL HALT CONDITIONS

1. **Build fails** with structural defect not solvable in scope.
2. **Korean Test gate fails** — predicate change introduces domain literal.
3. **Pipeline reordering reveals architectural blocker** (e.g., HC depends on content-profile output for inputs; circular dependency surfaced). Surface; halt for architect.
4. **Existing test suite fails** (if test fixtures depend on isSequential structural classification of non-identifier columns).
5. **HF-203 absorption reveals architectural blocker** (e.g., AI re-mapping has no remaining valid candidate column when binding rejected; needs different fallback strategy). Surface; halt for architect.
6. **CC discovers additional unanticipated isSequential consumer site** (a 9th site beyond the 8 in §2.4 inventory). Surface; halt for architect re-scope.
7. **Working tree state collision** — CC's pre-existing Phase 1G Sites 1+2 work in working tree (per completion report §"Phase 1G Status at Report") conflicts with Path α scope. CC must integrate or reset and re-author per Path α specification; surface verdict before commit.

ALL OTHER ISSUES: CC resolves structurally and continues per autonomy directive.

---

## 5. AUTONOMY DIRECTIVE

NEVER ask yes/no. NEVER pause for confirmation between sub-phases. Execute every sub-phase sequentially through commit + push without architect intervention. HALT only on explicit Critical HALT Conditions or architect-signal-required points (Phase 5-RESET-7 verification: 5 architect signals).

---

## 6. CC FAILURE PATTERNS TO PREVENT

| # | Pattern | Prevention |
|---|---|---|
| Adjacent-Arm Drift | Closing only role-binding sites without pipeline reordering | Phase 1G Path α explicitly includes 8 sites + pipeline + HF-203 |
| FP-49 | Schema fabrication | N/A — no SQL in Phase 1G |
| Substrate citation drift | Citing Decision 108 without verifying body-fidelity | §2.1 + §2.2 substrate citations include verbatim commit messages |
| Bypass (SR-34) | Logging known defects for follow-on | Path α absorbs HF-202, HF-203, HF-205 — no defect deferral |
| Korean Test | Domain literal introduced via predicate change or pipeline reordering | All predicates use structural primitives only; verified per phase |
| Architect-as-courier | CC interpreting ambiguous empirical state | CC reports structural facts; halts on Critical HALT |
| Vertical Slice violation | Architectural change without empirical reconciliation | Phase 5-RESET-7 covers full pipeline (wipe → re-import → calc → reconcile) |
| FP-70 | Phase deferral as completion | Phase 1G ships single commit; closure requires Phase 5-RESET-7 PASS reconciling to $312,033 ± 0.5% |
| Completion report omission | Phase ships without populated completion report | §8 enforced as closure gate; Phase 1G CANNOT signal complete without populated report |
| Working tree state mishandling | CC's pre-existing Sites 1+2 work conflicts with Path α scope | §11.0 explicit handling instruction |

---

## 7. PHASE STRUCTURE OVERVIEW

| Sub-phase | Scope | Architect signal? |
|---|---|---|
| 1G-0 | Working-tree state reconciliation (CC's pre-existing Sites 1+2 work) | No |
| 1G-1 | Read-only verification of all 8 sites + pipeline-ordering call sites | No |
| 1G-2 | Edit `negotiation.ts:299` (Site 1: split + HC-primary; structural fallback gated) | No |
| 1G-3 | Edit `agents.ts:536` (Site 2: structural fallback gated) | No |
| 1G-4 | Pipeline reordering: thread HC into `content-profile.ts:detectStructuralIdentifier` (Sites 3, 7) | No |
| 1G-5 | Gate Site 8 (`tenant-context.ts:146`) by HC silence | No |
| 1G-6 | Gate affinity sites 4, 5, 6 (`negotiation.ts:34, 79, 125`) by HC silence | No |
| 1G-7 | Close `content-profile.ts:460` (`hasEntityIdentifier` OR-fold) transitively via Site 7's HC threading | No |
| 1G-8 | HF-203 SCALE ANOMALY architectural inversion (`convergence-service.ts:1558-1591` + `:317-333`) | No |
| 1G-9 | Build verification + Korean Test gate | No |
| 1G-10 | Self-test: re-grep all 8 sites + pipeline ordering; confirm changes applied | No |
| 1G-11 | Commit + push (single commit) | No |
| 1G-12 | Populate completion report scaffold; commit completion report | No |
| 5-RESET-7 | Empirical verification (wipe → 7 imports → plan → calc → reconcile) | **Yes** (5 architect signals) |
| 1G-13 | Final completion report; Phase 1G Path α closure verdict | No |

---

## 8. COMPLETION REPORT SCAFFOLD (CC POPULATES — GATING REQUIREMENT)

CC populates this scaffold during Phase 1G execution. Closure verdict requires populated report. No populated report = no Phase 1G closure.

```markdown
# HF-196 Phase 1G Path α (option ii) — Completion Report

**Phase:** 1G Path α (option ii) — Full HC-Primacy Architectural Realignment
**Branch:** hf-196-platform-restoration-vertical-slice
**Final commit:** <SHA>
**Date executed:** <YYYY-MM-DD>
**Architect:** Andrew (vialuce founder)

## Phase 1G-0: Working-Tree State Reconciliation
- Pre-existing working tree state (per interim completion report §"Phase 1G Status at Report"):
  - web/src/lib/sci/agents.ts modified (Site 2 gating applied)
  - web/src/lib/sci/negotiation.ts modified (Site 1 split + gating applied)
- Reconciliation action taken: <integrate / reset and re-author per Path α / hybrid>
- Diff vs prior working tree: <pasted>

## Phase 1G-1: Pre-Edit Verification
- Site 1 (negotiation.ts:299) current state: <pasted>
- Site 2 (agents.ts:536) current state: <pasted>
- Site 3 (content-profile.ts:218) current state: <pasted>
- Sites 4-6 (negotiation.ts:34, 79, 125) current state: <pasted>
- Site 7 (content-profile.ts:217) current state: <pasted>
- Site 8 (tenant-context.ts:146) current state: <pasted>
- content-profile.ts:460 hasEntityIdentifier OR-fold current state: <pasted>
- HF-203 site (convergence-service.ts:1558-1591 + 317-333) current state: <pasted>
- Pipeline ordering call sites identified: <count + paths>

## Phase 1G-2: Site 1 — negotiation.ts:299
- Pre-edit: hcRole === 'identifier' || (integer && isSequential)
- Post-edit: HC-primary branch (hcRole === 'identifier' only) + HC-silence-gated structural fallback
- Diff pasted: <yes/no>
- Confidence reduced 0.85 → 0.75 in HC-silence branch: <yes/no>

## Phase 1G-3: Site 2 — agents.ts:536
- Pre-edit: standalone if (integer && isSequential)
- Post-edit: gated by (!hcRole || hcRole === 'unknown')
- Diff pasted: <yes/no>

## Phase 1G-4: Pipeline Reordering — content-profile.ts (Sites 3, 7)
- detectStructuralIdentifier signature change: accepts hcRole or hcInterpretations parameter
- Caller chain updated: <list of call sites + how HC threaded through>
- Site 3 (uniquenessRatio > 0.90): gated by HC silence
- Site 7 (isSequential): gated by HC silence
- Architectural verdict: <pipeline reordered structurally / threaded as parameter / hybrid>

## Phase 1G-5: Site 8 — tenant-context.ts:146
- Pre-edit: integer && isSequential
- Post-edit: gated by (!hcRole || hcRole === 'unknown')
- Caller integration with HC: <pasted>

## Phase 1G-6: Affinity Sites — negotiation.ts:34, 79, 125
- Site 4 (line 34): gated
- Site 5 (line 79): gated
- Site 6 (line 125): gated
- Diff pasted: <yes/no>

## Phase 1G-7: hasEntityIdentifier OR-fold (content-profile.ts:460)
- Transitively closed via Site 7's HC threading: <yes/no — verification approach>

## Phase 1G-8: HF-203 SCALE ANOMALY Architectural Inversion
- Pre-edit (convergence-service.ts:1558-1591): ratio>10 → propose scale_factor correction → patch binding.scale_factor
- Post-edit: ratio>10 → mark binding match_pass='failed' → surface convergence gap → force AI re-mapping with failed binding excluded
- Logic chain pasted: <pasted>
- AI re-mapping fallback strategy: <pasted>

## Phase 1G-9: Build + Korean Test
- Build output (tail): <pasted>
- Build exit code: 0
- Korean Test verdict: PASS

## Phase 1G-10: Self-Test
- grep verification all 8 sites: <pasted>
- HF-203 site verification: <pasted>
- All sites show post-edit form: <yes/no>
- Pipeline reordering verification: <pasted — HC runs before profile generation OR threaded through profile generation>

## Phase 1G-11: Commit
- Commit SHA: <SHA>
- Push confirmation: <pasted>
- Files changed: <list — expected ≥4 files: negotiation.ts, agents.ts, content-profile.ts, tenant-context.ts, convergence-service.ts>

## Phase 1G-12: Completion Report Initial Commit
- Completion report path: docs/completion-reports/HF-196_Phase1G_PathAlpha_COMPLETION_REPORT.md
- Initial commit SHA (pre-Phase-5-RESET-7): <SHA>

## Phase 5-RESET-7: Empirical Verification

### Architect signal 1 — wipe applied
- import_batches count: 0 across all tenants
- NULL file_hash_sha256 enforcement: confirmed (NOT NULL constraint active)

### Architect signal 2 — 7 imports done (roster + 6 transactions)
- 7 operative batches: <list with SHAs>
- BCL field_identities verification (post-1G fix empirical confirmation):
  - Cantidad_Productos_Cruzados.structuralType: **'measure' (expected) / actual: <pasted>**
  - Depositos_Nuevos_Netos.structuralType: 'measure' (unchanged)
  - ID_Empleado.structuralType: 'identifier' (unchanged)
- DS-017 fingerprint flywheel: <match_count progression>
- HC primacy operative: <log emissions>

### Architect signal 3 — plan import done
- rule_set count: 1
- AI plan interpretation: 4 components, 2 variants, 8 component-variant lines
- Convergence binding for component_2 (Productos Cruzados): **column = 'Cantidad_Productos_Cruzados' (expected) / actual: <pasted>**
- ZERO seeds emissions: confirmed
- ZERO UnconvertibleComponentError: confirmed
- HF-203 verification: ZERO SCALE ANOMALY auto-correction emissions on this binding (architectural — was symptom of misbinding; with correct binding the anomaly does not surface)

### Architect signal 4 — calc done across 6 periods
- 6 calculation_batches
- entity_period_outcomes count: 510 (85 entities × 6 periods)
- Per-period totals:
  - Oct 2025: <calc> vs $44,590 (delta <pct>)
  - Nov 2025: <calc> vs $46,291 (delta <pct>)
  - Dic 2025: <calc> vs $61,986 (delta <pct>)
  - Ene 2026: <calc> vs $47,545 (delta <pct>)
  - Feb 2026: <calc> vs $53,215 (delta <pct>)
  - Mar 2026: <calc> vs $58,406 (delta <pct>)
- HF-203 verification: ZERO SCALE ANOMALY auto-correction emissions across all 6 periods × 4 components

### Architect signal 5 — 5G reconcile request
- Calculated grand total: <pasted>
- Expected grand total: $312,033
- Delta: <pasted>
- Within 0.5%?: <YES/NO>
- Component-level reconciliation against BCL_Resultados_Esperados.xlsx: <pasted table>

## Phase 1G Path α Verdict
- Operative defect closed: <YES/NO> (Cantidad_Productos_Cruzados.structuralType === 'measure')
- Architectural defect closed: <YES/NO> (HC primacy operative across all 8 sites + pipeline)
- HF-203 inversion closed: <YES/NO> (SCALE ANOMALY rejects binding; does not patch scale_factor)
- Reconciliation against $312,033 ± 0.5%: <YES/NO>
- Phase 1G Path α PASS / FAIL / PASS-WITH-DELTA

## Memory Entry 30 Closure Verification
- Progressive Performance constitutional commitment honored: <YES/NO>
- "Reconstruction restores what worked" — HC primacy now operative as Decision 108 + HF-095 Phase 2 stated intent always required: <YES/NO>
- Adjacent-Arm Drift defect-class structurally closed: <YES/NO> (no unfixed sites in inventory)

## Carry-Forward (Out-of-Scope confirmed unchanged)
- HF-198: calculation_batches audit-column gap (logged)
- HF-199: OB-50 surface restoration (logged)
- Plan-path data_type vocabulary (commit/route.ts + intelligence/wire/route.ts) — Phase 5D confirmed non-blocking
- HF-202: ABSORBED into Phase 1G (no longer carry-forward)
- HF-203: ABSORBED into Phase 1G (no longer carry-forward)
- HF-205: ABSORBED into Phase 1G (no longer carry-forward)

## HF-196 Closure
- All architectural breaks closed: <YES/NO>
- Phase 5G reconciliation PASS: <YES/NO>
- PR #359 ready for Ready-for-Review transition: <YES/NO>
```

---

## 9. OUT OF SCOPE (LOG; DO NOT FIX IN PHASE 1G)

**Logged for follow-on (post-HF-196 closure):**

- **HF-198 candidate:** `calculation_batches.superseded_at` + `supersession_reason` audit-column gap (parallel to Phase 1E `import_batches` columns; surfaced Phase 1E-1 audit). Independent vertical slice.

- **HF-199 candidate:** OB-50 surface restoration. 15 schema columns missing on `ingestion_events`; SCI flow currently bypasses. Independent vertical slice.

- **commit/route.ts + intelligence/wire/route.ts data_type vocabulary** (Phase 1D out-of-scope carry-forward). Phase 5D verified non-blocking; defects remain dormant for plan flow on this substrate. Independent vertical slice if/when surfaced live.

**ABSORBED into Phase 1G Path α (NOT carry-forward):**
- HF-202 (5 isSequential affinity/upstream-signal sites)
- HF-203 (SCALE ANOMALY architectural inversion)
- HF-205 (Pipeline-ordering for HC primacy)

---

## 10. END OF DIRECTIVE — NEXT SECTION IS CC PASTE BLOCK

Per Rule 29: nothing follows §11.

---

## 11. CC PASTE BLOCK

> CC: paste this section verbatim into operational context. Execute sequentially. HALT only at explicit Critical HALT Conditions or architect-signal-required points (Phase 5-RESET-7).

### 11.0 Working-Tree State Reconciliation

Pre-existing working tree state from prior session work (per interim completion report `64235c41`):
- `web/src/lib/sci/agents.ts` modified — Site 2 gating applied (Phase 1G Path β shape)
- `web/src/lib/sci/negotiation.ts` modified — Site 1 split + gating applied (Phase 1G Path β shape)

**Decision:** Path α (option ii) requires broader scope than Path β. The pre-existing Site 1 + Site 2 edits MAY be compatible with Path α (they apply HC-silence gating, which is a subset of Path α's intent). However, Path α requires:
- Site 1 + Site 2 + Site 3 (pipeline reorder) + Sites 4-8 + HF-203
- All edits must be coherent within single commit

**Action:**
```bash
cd ~/spm-platform
git status
git diff web/src/lib/sci/agents.ts web/src/lib/sci/negotiation.ts | head -100
```
Paste output. Surface to architect: **"Pre-existing working tree edits — proposed reconciliation: integrate as-is + extend to Path α scope (additive), OR git checkout HEAD to discard and re-author end-to-end per Path α."**

**HALT for architect disposition before proceeding to 11.1.**

### 11.1 Phase 1G-1 — Pre-Edit Verification (8 sites + pipeline + HF-203)

```bash
cd ~/spm-platform

echo "=== Site 1: negotiation.ts:295-320 (OR predicate role-binding) ==="
sed -n '295,320p' web/src/lib/sci/negotiation.ts 2>&1
echo "---"

echo "=== Site 2: agents.ts:533-545 (standalone structural arm role-binding) ==="
sed -n '533,545p' web/src/lib/sci/agents.ts 2>&1
echo "---"

echo "=== Site 3: content-profile.ts:213-228 (uniquenessRatio adjacent-arm) ==="
sed -n '213,228p' web/src/lib/sci/content-profile.ts 2>&1
echo "---"

echo "=== Site 4: negotiation.ts:30-45 (affinity rule) ==="
sed -n '30,45p' web/src/lib/sci/negotiation.ts 2>&1
echo "---"

echo "=== Site 5: negotiation.ts:75-90 (Sequential integers → IDs rule) ==="
sed -n '75,90p' web/src/lib/sci/negotiation.ts 2>&1
echo "---"

echo "=== Site 6: negotiation.ts:120-135 (PARTIAL claim flag) ==="
sed -n '120,135p' web/src/lib/sci/negotiation.ts 2>&1
echo "---"

echo "=== Site 7: content-profile.ts:210-220 (detectStructuralIdentifier) ==="
sed -n '210,220p' web/src/lib/sci/content-profile.ts 2>&1
echo "---"

echo "=== content-profile.ts:455-470 (hasEntityIdentifier OR-fold) ==="
sed -n '455,470p' web/src/lib/sci/content-profile.ts 2>&1
echo "---"

echo "=== Site 8: tenant-context.ts:140-155 (cross-sheet idField finder) ==="
sed -n '140,155p' web/src/lib/sci/tenant-context.ts 2>&1
echo "---"

echo "=== HF-203: convergence-service.ts:1555-1595 (SCALE ANOMALY detection + correction proposal) ==="
sed -n '1555,1595p' web/src/lib/intelligence/convergence-service.ts 2>&1
echo "---"

echo "=== HF-203: convergence-service.ts:315-340 (correction application — binding.scale_factor mutation) ==="
sed -n '315,340p' web/src/lib/intelligence/convergence-service.ts 2>&1
echo "---"

echo "=== HF-203: convergence-service.ts:1410-1490 (engine consumption of scale_factor) ==="
sed -n '1410,1490p' web/src/lib/intelligence/convergence-service.ts 2>&1
echo "---"

echo "=== Pipeline ordering: detectStructuralIdentifier call sites ==="
grep -rnE "detectStructuralIdentifier" web/src/ --include="*.ts" 2>&1
echo "---"

echo "=== Pipeline ordering: header-comprehension invocation order ==="
grep -rnE "headerComprehension|generateProfile|profileGeneration|runHeaderComprehension" web/src/lib/sci/ --include="*.ts" 2>&1 | head -20
echo "---"

echo "=== Pipeline ordering: where profile and HC are sequenced relative to each other ==="
grep -rnE "generateProfile|generateHeaderComprehension" web/src/app/api/import/sci/ web/src/lib/sci/ --include="*.ts" 2>&1 | head -20
echo "---"
```

Paste all output verbatim.

Synthesis required:
1. All 8 sites confirmed at expected line numbers (note any drift).
2. Pipeline ordering empirical state: HC runs before profile? After? Concurrent? Where in the call chain?
3. detectStructuralIdentifier all callers identified (must thread HC through each).
4. HF-203 SCALE ANOMALY logic chain confirmed at expected line ranges.

**HALT** for architect review of Phase 1G-1 synthesis before proceeding to 1G-2 if any drift surfaced or pipeline ordering reveals architectural blocker (Critical HALT #3).

### 11.2 Phase 1G-2 — Site 1: negotiation.ts:299

Replace OR predicate with split structure: HC-primary first, HC-silence-gated structural fallback second.

Reference shape (CC adjusts to actual file content):

```typescript
// HF-196 Phase 1G — HC-primary identifier branch (Decision 108)
if (hcRole === 'identifier') {
  // LLM-Primary
  if (identifiesWhat) {
    ... // PRESERVE existing body verbatim
  }
  // Deterministic Fallback: cardinality
  const uniquenessRatio = rowCount > 0 ? field.distinctCount / rowCount : 0;
  if (uniquenessRatio > 0.8) {
    return { role: 'transaction_identifier', context: `… per-row identifier (uniqueness ${...}%, no LLM context)`, confidence: 0.80 };
  }
  return { role: 'entity_identifier',
           context: `${field.fieldName} — identifier (cardinality fallback, uniqueness ${...}%)`,
           confidence: 0.85 };
}

// HF-196 Phase 1G — Structural fallback ONLY when HC is silent (Decision 108)
// Preserves classification capability for cold-start / flywheel-roleMap-miss / LLM-error scenarios
// while preventing structural override of HC-confident interpretations.
if ((!hcRole || hcRole === 'unknown') && field.dataType === 'integer' && !!field.distribution.isSequential) {
  const uniquenessRatio = rowCount > 0 ? field.distinctCount / rowCount : 0;
  if (uniquenessRatio > 0.8) {
    return { role: 'transaction_identifier', context: `${field.fieldName} — sequential per-row identifier (HC silent)`, confidence: 0.75 };
  }
  return { role: 'entity_identifier',
           context: `${field.fieldName} — sequential identifier (HC silent, cardinality ${...}%)`,
           confidence: 0.75 };
}
```

Notes:
- Confidence reduced 0.85 → 0.75 in HC-silence branch.
- LLM-primary path stays inside HC-primary branch.
- Body verbatim preservation: keep all log strings, return values, confidence numbers in HC-primary branch.

Build verification:
```bash
cd web && npx tsc --noEmit 2>&1 | head -10
```
Must exit 0. Continue.

### 11.3 Phase 1G-3 — Site 2: agents.ts:536

Replace standalone structural arm with HC-silence-gated form:

```typescript
// HF-196 Phase 1G — Structural fallback ONLY when HC is silent (Decision 108)
if ((!hcRole || hcRole === 'unknown') && field.dataType === 'integer' && field.distribution.isSequential) {
  const uniquenessRatio = rowCount > 0 ? field.distinctCount / rowCount : 0;
  if (uniquenessRatio > 0.8) {
    return { role: 'transaction_identifier', context: `${field.fieldName} — sequential per-row identifier (HC silent)`, confidence: 0.75 };
  }
  return { role: 'entity_identifier', context: `${field.fieldName} — sequential entity identifier (HC silent)`, confidence: 0.75 };
}
```

Build:
```bash
cd web && npx tsc --noEmit 2>&1 | head -10
```
Must exit 0.

### 11.4 Phase 1G-4 — Pipeline Reordering: content-profile.ts (Sites 3, 7)

**Architectural decision:** thread HC through `detectStructuralIdentifier` via signature change. CC dispositions implementation per actual call-chain shape surfaced in 11.1.

**Recommended approach:**

```typescript
// Modify detectStructuralIdentifier signature
function detectStructuralIdentifier(
  field: FieldProfile,
  rowCount: number,
  hcRole?: ColumnRole,  // HF-196 Phase 1G — HC primacy threading
): boolean {
  // HF-196 Phase 1G — HC primacy: if HC has any role, structural arm does not produce signal
  if (hcRole && hcRole !== 'unknown') {
    return false;  // HC speaks; structural arm yields
  }

  // Site 7: integer && isSequential — structural fallback when HC silent
  if (field.dataType === 'integer' && field.distribution.isSequential) {
    return true;
  }

  // Site 3: integer && uniquenessRatio > 0.90 — structural fallback when HC silent
  const uniquenessRatio = rowCount > 0 ? field.distinctCount / rowCount : 0;
  if (field.dataType === 'integer' && uniquenessRatio > 0.90) {
    return true;
  }

  return false;
}
```

**Caller chain modifications (CC identifies via 11.1 Probe and updates each):**
- Each call site to `detectStructuralIdentifier` must pass `hcRole` argument
- Where caller doesn't have hcRole in scope: thread it from upstream (typically from `header-comprehension.ts:interpretations`)
- If pipeline ordering blocks HC availability at a call site (HC hasn't run yet): surface; halt for architect (Critical HALT #3)

**For `hasEntityIdentifier` OR-fold at content-profile.ts:460:** Site 7's HC threading transitively closes this; the OR-fold reads `detectStructuralIdentifier`'s return, which now respects HC primacy. No separate edit needed.

Build:
```bash
cd web && npx tsc --noEmit 2>&1 | head -10
```
Must exit 0.

### 11.5 Phase 1G-5 — Site 8: tenant-context.ts:146

Apply HC-silence gating:

```typescript
// HF-196 Phase 1G — Cross-sheet idField finder gated by HC silence
if ((!hcRole || hcRole === 'unknown') && field.dataType === 'integer' && field.distribution.isSequential) {
  ...
}
```

CC: read actual file context; if `hcRole` not currently in scope at this site, thread from caller via signature change. If pipeline ordering blocks HC availability at this site, surface; halt for architect (Critical HALT #3).

Build:
```bash
cd web && npx tsc --noEmit 2>&1 | head -10
```
Must exit 0.

### 11.6 Phase 1G-6 — Affinity Sites: negotiation.ts:34, 79, 125

Apply HC-silence gating to all three predicates. Pattern (CC adjusts per actual file content):

```typescript
// Site 4 (line 34) — affinity rule
if (hcRole === 'identifier' || ((!hcRole || hcRole === 'unknown') && integer && isSequential)) {
  // affinity scoring
}

// Site 5 (line 79) — Sequential integers → likely IDs rule
if ((!hcRole || hcRole === 'unknown') && f.dataType === 'integer' && !!f.distribution.isSequential) {
  // scoring
}

// Site 6 (line 125) — PARTIAL claim flag
const isShared = hcRole === 'identifier' || ((!hcRole || hcRole === 'unknown') && integer && isSequential);
```

Build:
```bash
cd web && npx tsc --noEmit 2>&1 | head -10
```
Must exit 0.

### 11.7 Phase 1G-7 — content-profile.ts:460 hasEntityIdentifier OR-fold

Verify transitive closure via Site 7's HC threading. No direct edit; document closure in completion report.

```bash
sed -n '455,470p' web/src/lib/sci/content-profile.ts
```
Paste. Confirm OR-fold reads from detectStructuralIdentifier (now HC-gated).

### 11.8 Phase 1G-8 — HF-203 SCALE ANOMALY Architectural Inversion

**Pre-edit:** `convergence-service.ts:1558-1591` detects ratio>10, proposes scale_factor correction. Lines 317-333 apply correction by mutating `binding.scale_factor`.

**Post-edit:** ratio>10 marks binding `match_pass: 'failed'`, surfaces convergence gap, forces AI re-mapping with the failed binding excluded from candidate pool. No scale_factor mutation.

Reference shape (CC adjusts to actual file structure):

```typescript
// HF-196 Phase 1G — HF-203 SCALE ANOMALY architectural inversion
// ratio > 10 vs peer median = binding misalignment, NOT magnitude error.
// Reject binding; surface convergence gap; force AI re-mapping.
// Do NOT patch scale_factor (silent-failure-mode prevention).

for (const result of results) {
  result.medianPeerResult = medianResult;
  if (result.sampleResult > 0 && medianResult > 0) {
    result.ratioToMedian = result.sampleResult / medianResult;
    if (result.ratioToMedian > 10) {
      result.isAnomaly = true;
      result.anomalyType = 'binding_misalignment';

      const comp = components[result.componentIndex];
      const compKey = `component_${comp.index}`;
      const cb = componentBindings[compKey];

      // Reject binding instead of patching scale
      const bindingRole = cb.numerator ? 'numerator' : cb.actual ? 'actual' : 'row';
      const binding = cb[bindingRole];

      if (binding) {
        binding.match_pass = 'failed';
        binding.failure_reason = `ratio ${result.ratioToMedian.toFixed(1)}x peer median — binding misalignment`;

        result.proposedAction = {
          type: 'binding_rejection',
          rejectedColumn: binding.column,
          bindingRole,
          rationale: 'ratio>10 vs peer median indicates wrong column bound, not wrong scale',
        };

        // Surface convergence gap for AI re-mapping
        convergenceGaps.push({
          componentKey: compKey,
          role: bindingRole,
          rejectedColumn: binding.column,
          ratioToMedian: result.ratioToMedian,
        });
      }
    }
  }
}

// Application step (was lines 317-333) — replace scale_factor mutation with re-mapping invocation
for (const pr of plausibilityResults) {
  if (pr.isAnomaly && pr.proposedAction?.type === 'binding_rejection') {
    const compKey = `component_${pr.componentIndex}`;
    const cb = componentBindings[compKey];
    if (cb) {
      console.log(
        `[CONVERGENCE-VALIDATION]   Binding rejected for ${compKey}:${pr.proposedAction.bindingRole} ` +
        `(decision_source: binding_misalignment, rejected_column: ${pr.proposedAction.rejectedColumn}, ` +
        `ratio: ${pr.ratioToMedian.toFixed(1)}x)`
      );
      // AI re-mapping invoked via existing convergence flow with failed-binding column
      // excluded from candidate pool
      await invokeAIRemapping(compKey, pr.proposedAction.bindingRole, pr.proposedAction.rejectedColumn);
    }
  }
}
```

**Engine consumption changes (lines 1416-1417, 1429, 1443, 1483-1484):**

The `binding.scale_factor` consumption code remains as-is — it now operates only on bindings that have legitimate scale_factor values from the column mapping process (not from anomaly correction). Bindings rejected via Phase 1G HF-203 path either have a successful AI re-mapping result OR remain as convergence gaps (component cannot calculate without manual disposition).

**Critical HALT #5 condition:** if AI re-mapping has no remaining valid candidate column when binding rejected, surface for architect — fallback strategy needed (e.g., compute component as 0; mark calc_status='deferred'; surface to UI).

Build:
```bash
cd web && rm -rf .next && npm run build 2>&1 | tail -20
```
Must exit 0.

### 11.9 Phase 1G-9 — Build + Korean Test

```bash
cd ~/spm-platform/web
rm -rf .next && npm run build 2>&1 | tail -20
```
Must exit 0. Paste tail.

```bash
cd ~/spm-platform
bash scripts/verify-korean-test.sh 2>&1 | tail -20
```
Must PASS. Paste output. If FAIL → Critical HALT #2.

### 11.10 Phase 1G-10 — Self-Test

Verify all 8 sites + HF-203 + pipeline ordering:

```bash
cd ~/spm-platform

echo "=== Site 1 post-edit ==="
sed -n '295,335p' web/src/lib/sci/negotiation.ts | head -45
echo "---"

echo "=== Site 2 post-edit ==="
sed -n '533,548p' web/src/lib/sci/agents.ts
echo "---"

echo "=== Sites 3, 7: detectStructuralIdentifier signature + body ==="
sed -n '210,235p' web/src/lib/sci/content-profile.ts
echo "---"

echo "=== Sites 4, 5, 6 post-edit ==="
sed -n '30,45p' web/src/lib/sci/negotiation.ts
sed -n '75,90p' web/src/lib/sci/negotiation.ts
sed -n '120,135p' web/src/lib/sci/negotiation.ts
echo "---"

echo "=== Site 8 post-edit ==="
sed -n '140,155p' web/src/lib/sci/tenant-context.ts
echo "---"

echo "=== HF-203 post-edit ==="
sed -n '1555,1605p' web/src/lib/intelligence/convergence-service.ts
sed -n '315,345p' web/src/lib/intelligence/convergence-service.ts
echo "---"

echo "=== Verify zero unguarded structural-arm sites remaining ==="
grep -rnE "hcRole\s*===\s*['\"]identifier['\"]\s*\|\|\s*\(.*isSequential" web/src/lib/sci/ --include="*.ts"
echo "(expected: zero matches)"

grep -rnE "binding\.scale_factor\s*=" web/src/lib/intelligence/convergence-service.ts
echo "(expected: zero matches in HF-203 anomaly-correction context)"
```

Paste all output. Confirm:
- All 8 sites show post-edit form
- HF-203 logic shows binding.match_pass='failed' instead of binding.scale_factor mutation
- Pipeline ordering: detectStructuralIdentifier signature includes hcRole; all callers thread it

### 11.11 Phase 1G-11 — Commit

```bash
cd ~/spm-platform
git add -A
git status
```

Confirm scope (≥4 files):
- `web/src/lib/sci/negotiation.ts` (Sites 1, 4, 5, 6)
- `web/src/lib/sci/agents.ts` (Site 2)
- `web/src/lib/sci/content-profile.ts` (Sites 3, 7; pipeline reordering)
- `web/src/lib/sci/tenant-context.ts` (Site 8)
- `web/src/lib/intelligence/convergence-service.ts` (HF-203)
- + any caller files modified to thread hcRole through

```bash
git commit -m "HF-196 Phase 1G Path α (option ii): full HC-primacy architectural realignment per Decision 108

— 8 isSequential consumer sites: structural arms gated by HC silence (!hcRole || hcRole === 'unknown')
— Pipeline reordering: detectStructuralIdentifier accepts hcRole; HC primacy threaded
— HF-203 SCALE ANOMALY architectural inversion: ratio>10 marks binding match_pass='failed' and surfaces convergence gap; no scale_factor mutation
— Adjacent-Arm Drift defect-class structurally closed
— HF-202 + HF-203 + HF-205 ABSORBED (no carry-forward)
— Closes Cantidad_Productos_Cruzados misclassification surfaced by Phase 5E October calc 82,551 vs 44,590
— SR-34 discipline: product-ready Decision 108; no known defects shipped"
git push origin hf-196-platform-restoration-vertical-slice
git log --oneline -1
```

Paste commit SHA + push confirmation.

### 11.12 Phase 1G-12 — Completion Report Initial Commit

Populate §8 scaffold sections 1G-0 through 1G-11 (working-tree reconciliation through commit + push). Save to `docs/completion-reports/HF-196_Phase1G_PathAlpha_COMPLETION_REPORT.md`. Phase 5-RESET-7 + final verdict sections will be appended after empirical verification.

```bash
cd ~/spm-platform
git add docs/completion-reports/HF-196_Phase1G_PathAlpha_COMPLETION_REPORT.md
git commit -m "HF-196 Phase 1G Path α — Interim Completion Report (pre-Phase-5-RESET-7)"
git push origin hf-196-platform-restoration-vertical-slice
git log --oneline -1
```

Paste commit SHA + push confirmation.

### 11.13 Phase 5-RESET-7 — Empirical Verification

Restart dev server with Phase 1G code:

```bash
pkill -f "next dev" 2>&1; sleep 1
cd ~/spm-platform/web
rm -rf .next
set -a && source .env.local && set +a
npm run build 2>&1 | tail -20
> /tmp/hf196_dev.log
npm run dev > /tmp/hf196_dev.log 2>&1 &
sleep 8
curl -I http://localhost:3000/login
git log --oneline -1
```

Paste outputs.

**HALT — surface to architect:**

> Phase 1G Path α commit landed: `<SHA>`. Dev rebuilt. Awaiting architect signals for Phase 5-RESET-7 (5 architect signals):
>
> 1. **"wipe applied"** — full BCL clean slate via Supabase Dashboard SQL Editor
> 2. **"5-RESET-7 imports done"** — architect imports BCL_Plantilla_Personal + 6 monthly transactions (Oct/Nov/Dic/Ene/Feb/Mar) via http://localhost:3000
> 3. **"5-RESET-7 plan done"** — architect imports BCL_Plan_Comisiones_2025
> 4. **"5-RESET-7 calc done"** — architect triggers calc across 6 periods
> 5. **"5-RESET-7 reconcile request"** — architect signals reconciliation phase

#### On signal 1 (wipe applied)
Verify wipe via tsx-script (paste counts; all = 0).

#### On signal 2 (imports done) — CRITICAL Phase 1G empirical confirmation

After 7 imports complete, verify HC primacy operative:

```bash
cd ~/spm-platform/web
set -a && source .env.local && set +a
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const { data } = await sb
  .from('committed_data')
  .select('metadata')
  .eq('tenant_id', 'b1c2d3e4-aaaa-bbbb-cccc-111111111111')
  .eq('source_date', '2025-10-01')
  .limit(1);

const fi = data?.[0]?.metadata?.field_identities ?? {};
console.log('Cantidad_Productos_Cruzados field_identity:', fi.Cantidad_Productos_Cruzados);
console.log('Depositos_Nuevos_Netos field_identity:', fi.Depositos_Nuevos_Netos);
console.log('ID_Empleado field_identity:', fi.ID_Empleado);
" 2>&1
```

**REQUIRED:** `Cantidad_Productos_Cruzados.structuralType === 'measure'`. If `'identifier'`, Phase 1G failed; surface; HALT.

#### On signal 3 (plan done) — convergence binding verification

```bash
cd web && npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const { data: ruleSets } = await sb
  .from('rule_sets')
  .select('input_bindings')
  .eq('tenant_id', 'b1c2d3e4-aaaa-bbbb-cccc-111111111111');
const cb = ruleSets?.[0]?.input_bindings?.convergence_bindings;
console.log('component_2 binding (Productos Cruzados):', JSON.stringify(cb?.component_2, null, 2));
" 2>&1
cd ..
```

**REQUIRED:** `component_2.actual.column === 'Cantidad_Productos_Cruzados'`. If `'Depositos_Nuevos_Netos'` (Phase 5E state), Phase 1G failed; surface; HALT.

Also verify zero `[CONVERGENCE-VALIDATION] SCALE ANOMALY` emissions in dev log:

```bash
grep "SCALE ANOMALY" /tmp/hf196_dev.log | head -10
```

**REQUIRED:** Zero or near-zero emissions. SCALE ANOMALY was symptom of misbinding; with correct binding the anomaly does not surface.

#### On signal 4 (calc done) — 6-period calculation verification

```bash
cd web && npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const tenantId = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

const { data: results } = await sb
  .from('calculation_results')
  .select('period_id, payout_amount, period:periods(name, start_date)')
  .eq('tenant_id', tenantId);

const calcByPeriod = new Map();
for (const r of results ?? []) {
  const key = (r.period as any)?.start_date ?? 'unknown';
  calcByPeriod.set(key, (calcByPeriod.get(key) ?? 0) + Number(r.payout_amount ?? 0));
}
const calcSorted = Array.from(calcByPeriod.entries()).sort();
console.log('Per-period totals:', calcSorted);
const calcTotal = calcSorted.reduce((a, [_, v]) => a + v, 0);
console.log('Grand total:', calcTotal);

const expected = [
  ['2025-10-01', 44590],
  ['2025-11-01', 46291],
  ['2025-12-01', 61986],
  ['2026-01-01', 47545],
  ['2026-02-01', 53215],
  ['2026-03-01', 58406],
];
console.log('--- Per-period reconciliation ---');
for (const [date, exp] of expected) {
  const actual = calcByPeriod.get(date) ?? 0;
  const delta = actual - exp;
  const pct = (delta / exp * 100).toFixed(2);
  console.log(\`  \${date}: actual=\${actual.toFixed(2)} expected=\${exp} delta=\${delta.toFixed(2)} (\${pct}%)\`);
}
console.log('Grand total expected: 312033');
console.log('Grand total actual:', calcTotal.toFixed(2));
console.log('Within 0.5%?:', Math.abs(312033 - calcTotal) / 312033 < 0.005 ? 'YES' : 'NO');
" 2>&1
cd ..
```

Paste output.

```bash
grep "SCALE ANOMALY" /tmp/hf196_dev.log | head -10
echo "---"
grep "binding_misalignment\|binding rejected\|match_pass.*failed" /tmp/hf196_dev.log | head -10
```

**REQUIRED:** Zero or near-zero SCALE ANOMALY auto-correction emissions across all 6 periods × 4 components. If binding_misalignment emissions surface, document them — they are HF-203 architectural inversion operating correctly (rejecting bindings where ratio>10 instead of patching).

#### On signal 5 (5G reconcile request)

Phase 5G full component-level reconciliation against `BCL_Resultados_Esperados.xlsx`:

```bash
cd web && npx tsx -e "
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import * as fs from 'fs';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const tenantId = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

// Pull calculated results with component breakdown
const { data: results } = await sb
  .from('calculation_results')
  .select('period_id, entity_id, payout_amount, component_breakdown, period:periods(name, start_date)')
  .eq('tenant_id', tenantId);

console.log('--- Calculated component-level summary ---');
console.log('Total results:', results?.length);
console.log('Sample component breakdown:', JSON.stringify(results?.[0]?.component_breakdown, null, 2));

// Load ground truth
const buf = fs.readFileSync('/mnt/project/BCL_Resultados_Esperados.xlsx');
const wb = XLSX.read(buf, { type: 'buffer' });
console.log('Ground truth sheet names:', wb.SheetNames);
for (const name of wb.SheetNames) {
  const sheet = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(sheet);
  console.log(\`\\nSheet '\${name}' rows:\`, rows.length);
  console.log('Sample row:', JSON.stringify(rows[0]));
}
" 2>&1
cd ..
```

Paste full output. Architect dispositions reconciliation depth (entity-level / component-level / period-level / grand-total only).

**Phase 1G Path α PASS criteria (all must hold):**

| Check | Expected | Actual | Verdict |
|---|---|---|---|
| Cantidad_Productos_Cruzados structuralType (post-import) | 'measure' | <pasted> | |
| component_2 binding column (post-plan) | 'Cantidad_Productos_Cruzados' | <pasted> | |
| SCALE ANOMALY auto-correction emissions (post-calc) | 0 | <pasted> | |
| Per-period total Oct 2025 | $44,590 ± 0.5% | <pasted> | |
| Per-period total Nov 2025 | $46,291 ± 0.5% | <pasted> | |
| Per-period total Dic 2025 | $61,986 ± 0.5% | <pasted> | |
| Per-period total Ene 2026 | $47,545 ± 0.5% | <pasted> | |
| Per-period total Feb 2026 | $53,215 ± 0.5% | <pasted> | |
| Per-period total Mar 2026 | $58,406 ± 0.5% | <pasted> | |
| Grand total | $312,033 ± 0.5% | <pasted> | |

**If all PASS:** HF-196 closes architecturally complete. Proceed to 11.14.

**If grand total within 0.5% but specific period off:** PASS-WITH-DELTA; surface specific period defect; architect dispositions.

**If grand total >0.5% delta:** Phase 1G Path α insufficient; root cause unresolved; halt for architect.

### 11.14 Phase 1G-13 — Final Completion Report

Append Phase 5-RESET-7 verification evidence + final Phase 1G Path α verdict to `docs/completion-reports/HF-196_Phase1G_PathAlpha_COMPLETION_REPORT.md`. Update HF-196 closure section.

Update root completion report (`docs/completion-reports/HF-196_COMPLETION_REPORT.md`):
- Append Phase 1G Path α section
- Update "Defects Surfaced + Status" table: HF-202 / HF-203 / HF-205 → "ABSORBED into Phase 1G Path α"
- Update HF-196 status: "ARCHITECTURALLY COMPLETE; Phase 5G reconciliation PASS confirmed"

```bash
cd ~/spm-platform
git add docs/completion-reports/
git commit -m "HF-196 Phase 1G Path α — Final Completion Report; Phase 5-RESET-7 PASS; reconciliation $312,033 ± 0.5% verified; HF-196 architecturally complete"
git push origin hf-196-platform-restoration-vertical-slice
git log --oneline -1
```

Surface to architect channel:
> Phase 1G Path α PASS. HF-196 architecturally complete. PR #359 ready for Ready-for-Review transition.

**End of Phase 1G Path α directive.**
