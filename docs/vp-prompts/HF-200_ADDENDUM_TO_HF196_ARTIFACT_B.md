# HF-200 ADDENDUM TO HF-196 ARTIFACT B — Substrate-Promotion Evidence Update

**Companion artifact to:** `HF-196_ARTIFACT_B_ICA_MODE1_PROPOSAL.md` (canonical; 2026-05-03; 6 candidates)
**This artifact:** evidence-strengthening + 1 NEW candidate from VP HF-200 session
**NOT a replacement** for HF-196 Artifact B; reads alongside it
**Source session:** VP HF-200 diagnostic work (DIAG-HF-200 + DIAG-HF-200B) 2026-05-04
**ICA invocation Mode:** 1 (informal capture; architect dispositions Mode 1 → Mode 2 promotion in next VG session)
**Class:** A (operates on the NEED — pre-drafting; substrate-non-decidable elements left for architect judgment)
**Recusal posture:** Claude is design partner, not capture authority; this artifact surfaces evidence + new candidate, not authored substrate primitives
**Routing:** VG architect channel for review and disposition alongside HF-196 Artifact B + AUD-004 v3 §8 IRA invocation candidates

---

## Preamble

HF-196 Artifact B (2026-05-03) surfaced six substrate-promotion candidates pending VG session disposition per Open Question Q3 in the most recent VP handoff. AUD-004 v3 §8 (2026-04-27) drafted four IRA invocation candidates pending architect disposition. Both artifacts are canonical at their authoring point.

This addendum adds:

**Section 1 — Evidence strengthening for two HF-196 Artifact B candidates** (HF-200 session surfaced 4th instance of Adjacent-Arm Drift + 2nd instance of Decision-Implementation Gap)

**Section 2 — One NEW candidate** (Latent-Surface Tenant-Specific Korean Test Failure)

**Section 3 — Dependency analysis update** to reflect new candidate's interaction with HF-196 Artifact B candidates + existing T1-E910 / Decision 154 substrate

**Section 4 — IRA invocation prompt for new candidate only** (Section 6 of prior PROM artifact; preserved here for the new candidate's invocation)

**Section 5 — Architect disposition action** referencing both canonical artifacts + this addendum

This addendum does NOT:
- Restate HF-196 Artifact B's six candidates (canonical at HF-196_ARTIFACT_B_ICA_MODE1_PROPOSAL.md)
- Restate AUD-004 v3 §8's four invocation candidates (canonical at AUD_004_Remediation_Design_Document_v3_20260427.md)
- Surface VG-session candidates (Group B in prior PROM draft; those are VG governance authoring authority, not VP-side artifact territory)
- Author substrate primitives (Class A discipline; pre-drafting only)

---

## Section 1 — Evidence Strengthening for HF-196 Artifact B Candidates

### Candidate 1 (Adjacent-Arm Drift Discipline) — instance #4 strengthening

HF-196 Artifact B Section "Empirical evidence base" cited 3 instances closed within HF-196:
- isSequential consumer surface (Phase 1G Path α; 8 sites)
- Conditional gate metadata extraction (Phase 1G-14; visitor pattern)
- Boundary representation hygiene (Phase 1G-15; canonicalizer)

**HF-200 session adds 4th instance — Entity attribute capture across sibling write surfaces:**

- HF-190 fix (PR #337, 2026-04-05, LOCKED) at `web/src/lib/sci/execute-bulk/route.ts:441-446 + :491-509` — construction layer for fresh imports; spreads `meta.enrichment` into `entities.metadata` AND populates `entities.temporal_attributes`
- HF-199 implementation (PR #362, 2026-05-04, merged) at `web/src/lib/sci/entity-resolution.ts:259-264 + :341-347` — re-import / resolution layer; populates `entities.temporal_attributes` only (does NOT spread enrichment into metadata)
- Same defect class S: enrichment writes to `temporal_attributes` but not `metadata`
- HF-190 closed S at construction layer (verified intact per DIAG-HF-200 H1 NEGATIVE)
- HF-199 missed adjacent surface — Adjacent-Arm Drift confirmed per DIAG-HF-200 H2 CONFIRMED

**Empirical evidence (DIAG-HF-200B Section E):**
Silvia Pérez Rodríguez (entity 70028) carries:
- 4 lowercase keys with `source: 'import'` (HF-190 shape) AND
- 4 capital-case keys without `source` field (HF-199 shape)

Same column data, two key shapes coexisting on a single entity record. Two parallel writers; same defect class S manifesting at adjacent sibling surface; 4th instance.

This strengthens HF-196 Artifact B Candidate 1's evidence base and confirms the substrate primitive operates as predicted (defect class continues to manifest at sibling surfaces until structurally closed everywhere).

### Candidate 2 (Decision-Implementation Gap Pattern) — instance #2 strengthening

HF-196 Artifact B Section "Empirical evidence base" cited Decision 127 with ~7-week implementation gap (March 16 → May 3) closed at Phase 1G-15 canonicalizer.

**HF-200 session adds 2nd instance — `effective_from = system clock` across HF-190 + HF-199:**

- Stated semantic: `temporal_attributes.effective_from` encodes data validity time (when the attribute became valid for the entity)
- Operative implementation across both HF-190 and HF-199: writes `effective_from = new Date().toISOString()` (system clock at import time, not data validity time)
- OB-177 bridge filter at `web/src/app/api/calculate/run/route.ts:1316`: `if (attr.effective_from > asOfDate) continue` excludes future-dated entries
- For Meridian: import in May 2026; period asOfDate is January 31, 2025 (period.end_date); every temporal_attributes entry filtered out as future-dated relative to period
- BCL/CRP did not surface defect because their import dates fell within or before their calc period date ranges
- Latent since: OB-177 introduction March 2026
- Surfaced: May 2026 with Meridian's January 2025 period mismatch

**Diagnostic fingerprint match per HF-196 Artifact B Candidate 2:**
- Decision exists (temporal versioning encodes data validity ranges) but is implicit in design rather than locked-decision
- Implementation closes empirical case (BCL/CRP ran successfully)
- Defect class re-emerges under conditions decision's stated semantic would have prevented (period asOfDate < import date)

This widens the candidate's evidence base from one instance (Decision 127 boundary representation) to two instances (Decision 127 + temporal binding). The candidate's diagnostic fingerprint generalizes beyond locked decisions to architectural-design-time decisions.

---

## Section 2 — NEW Candidate (HF-200 Session)

### Candidate 7 — Latent-Surface Tenant-Specific Korean Test Failure

**Numbering note:** "Candidate 7" continues HF-196 Artifact B's numbering sequence (which has Candidates 1-6). Architect dispositions whether to merge into HF-196 Artifact B as Candidate 7 OR maintain as separate addendum-sourced candidate. Per IGF-T6-E910 (Sequence-Implying ID Anti-Pattern), this number is referential not authoritative; architect renumbers if substrate-promoted.

#### Structural pattern

A code surface enumerates specific identifiers (field names, key names, role names) at a dispatch boundary instead of iterating structurally. The defect is latent — it passes all tests grounded in tenants whose semantic uses the enumerated identifier — until a tenant arrives whose semantic uses a different identifier. The defect surfaces only at the tenant boundary that violates the implicit assumption.

**Diagnostic fingerprint:**
- Code surface contains enumerated key matching at a dispatch boundary (e.g., `if (meta.role && !resolved['role']) resolved['role'] = meta.role`)
- All existing tests pass because all tested tenants populate the enumerated key
- New tenant arrives whose variant attribute is NOT the enumerated key
- Defect surfaces empirically at the new tenant
- Test suite cannot have caught it because synthetic tests don't exercise tenant-semantic variation

**Distinction from existing T1-E910 (Korean Test) and Decision 154:**
- T1-E910 covers field identification at parse/import time (structural heuristics over field names)
- Decision 154 (LOCKED 2026-04-27) extends Korean Test to operation vocabulary (canonical declaration + round-trip closure + structured failure on unrecognized operation identifiers)
- This candidate covers a third surface: **dispatch-time key matching against in-memory metadata**
- The latency property is constitutional in shape — defects of this class don't surface until tenant-semantic variation is exercised

#### Empirical evidence base (HF-200 session)

**Instance:** OB-177 bridge fallback at `web/src/app/api/calculate/run/route.ts:1322`:

```typescript
// Also include metadata.role if present (backward compat)
const meta = (ent.metadata || {}) as Record<string, unknown>;
if (meta.role && !resolved['role']) resolved['role'] = meta.role;
```

- Latency: since OB-177 merge (~March 2026)
- Tested tenants: BCL (variant attribute = `role`) — passed; CRP (variant attribute = `role`) — passed
- Defect-surfacing tenant: Meridian (variant attribute = `tipo_coordinador`) — empirical failure 2026-05-04
- Empirical: Silvia Pérez Rodríguez carries `metadata: {region, hub_asignado, fecha_ingreso, tipo_coordinador}` populated by HF-190; bridge fallback at :1322 surfaces only `role` (not present in her metadata); `materializedState` empty for this entity; variant discrimination produces `tokens=[]`; entity excluded from calc with `no_qualifying_variant`
- Time-to-surface: ~7 weeks between OB-177 merge and Meridian re-import surfacing the latent failure
- Companion latent surface candidate: variant discriminant matcher in same file (per DIAG-HF-200B Section C.4 extraction; deferred to additional verification)

#### Candidate framing

**Latent-Surface Tenant-Specific Korean Test Failure as substrate primitive:**

> *Code surfaces that enumerate specific identifiers at dispatch boundaries are latent Korean Test failures until tenant-semantic variation surfaces them. Synthetic tests grounded in fewer tenants than the platform serves cannot detect this class of defect. The platform's per-tenant variation surface is the empirical Korean Test surface for dispatch boundaries; tests must exercise tenant-semantic variation, or the variation must be exercised structurally in production. Defect closure targets structural iteration at the dispatch boundary, not extension of the enumerated list.*

#### Why it fits IGF promotion criteria

- **Constitutional in shape:** describes a meta-property of how Korean Test failures surface at dispatch boundaries (vs at parse boundaries which T1-E910 covers, vs at operation vocabulary boundaries which Decision 154 covers)
- **Has measurable diagnostic fingerprint:** enumerated key matching at dispatch surfaces is grep-able
- **Operates pre-drafting and post-implementation:** discipline applies at both fix-design time AND test-design time
- **Not redundant with T1-E910:** T1-E910 governs field identification at parse boundaries; this governs dispatch-time key matching
- **Not redundant with Decision 154:** Decision 154 governs operation vocabulary canonical declaration; this governs metadata key matching at dispatch
- **Demonstrates evidence base across multiple tenants:** OB-177 latency since March; surfaced May for Meridian; companion latent surfaces likely

#### Suggested Tier landing

**Tier 1 candidate** — extension/companion to T1-E910. Could land as T2-derived if architect prefers (deriving from T1-E910's Korean Test principle). Not a separate principle from Korean Test; a third surface where Korean Test applies.

#### What IRA invocation would test

- Whether this candidate is genuinely orthogonal to T1-E910 + Decision 154 OR is a third instance/surface of the same Korean Test principle (in which case T1-E910 extension preferred over new entry)
- Whether the diagnostic fingerprint generalizes beyond metadata-key matching (e.g., switch statements over enum literals, hardcoded role checks in authorization middleware)
- Whether "synthetic tests cannot detect this class for tenant-semantic variation" is a separate substrate-class observation worth its own entry (T6 anti-pattern: Synthetic-Test-Inadequacy for Tenant-Variation-Surfaces)
- Cross-evaluation against AUD-004 v3 E2 (structured failure on unrecognized identifiers) — does E2 cover this surface or is dispatch-time metadata matching outside E2's scope?

---

## Section 3 — Dependency Analysis Update

Per IGF-T5-E1060 (Dependency Analysis Gate for Multi-Question IRA Invocations), candidates evaluated pairwise for dependency before any IRA invocation.

### New candidate (Section 2) interactions with existing canonical candidates

**Candidate 7 (Latent-Surface Tenant-Specific KT Failure) ↔ HF-196 Artifact B Candidate 1 (Adjacent-Arm Drift):**
- Candidate 1 governs scoping of fixes once decided (close at construction layer not instance)
- Candidate 7 governs the test surface that should detect such defects (tenant-semantic variation)
- Independent in territory; complementary in shape
- No dependency for IRA invocation order

**Candidate 7 ↔ HF-196 Artifact B Candidate 4 (Reconciliation-Channel Separation):**
- Independent territory

**Candidate 7 ↔ T1-E910 (Korean Test, AP-25):**
- Potential redundancy/overlap — Candidate 7 may be third instance/surface of Korean Test rather than orthogonal new principle
- IRA Advisory invocation (Section 4) tests this orthogonality

**Candidate 7 ↔ Decision 154 (Korean Test extends to operation vocabulary, LOCKED 2026-04-27):**
- Potential adjacency — Decision 154 covers operation/primitive vocabulary; Candidate 7 covers metadata key matching at dispatch
- IRA Advisory invocation (Section 4) tests whether Decision 154 already covers metadata-key dispatch boundaries OR if Candidate 7 is third surface

**Candidate 7 ↔ AUD-004 v3 §8 Inv 1 (substrate alignment for E1-E6):**
- Inv 1 evaluates E1-E6 against existing substrate; E6 (Decision 154 candidate) overlaps Candidate 7 in subject matter
- Architect dispositions: fold Candidate 7 into Inv 1 scope OR invoke separately
- Recommendation: separate invocations (per IRA single-axis discipline + MAX_TOKENS=4096 binding)

### Recommended IRA invocation order (architect dispositions)

If architect dispositions Mode 2 for Candidate 7 + multiple HF-196 Artifact B candidates simultaneously:

1. **Candidate 7 first** — clarifies whether new T1 entry needed OR T1-E910 extension preferred OR Decision 154 covers
2. **HF-196 Artifact B Candidate 1 next** — Adjacent-Arm Drift T1 placement vs T2-derived
3. **HF-196 Artifact B Candidate 2 next** — Decision-Implementation Gap T1 placement vs T2-derived
4. **HF-196 Artifact B Candidate 3 last** — Boundary Representation Hygiene depends on Candidate 1 disposition (redundant if Candidate 1 lands T1; standalone if dispositioned otherwise)
5. **HF-196 Artifact B Candidates 4-6** — independent of above; architect dispositions independently
6. **AUD-004 v3 §8 Inv 1-4** — independent of HF-196 Artifact B + Candidate 7; architect dispositions independently per AUD-004 §8 framing

---

## Section 4 — IRA Invocation Prompt (DRAFT — for Candidate 7 only)

Per `IRA_CLI_Operating_Instructions.md`:
- Single positional argument; whole-file-is-the-question
- File path: `prompts/IRA_Invocation_C7_Latent_Surface_KT_Failure_20260504.md`
- Response path: `docs/IRA-responses/IRA_C7_Latent_Surface_KT_Failure_20260504.md`
- Execution: architect locally from `vialuce-governance` repo root
- Single work_scope axis per invocation per IRA_INVOCATION_REFERENCE.md §4.5

### `prompts/IRA_Invocation_C7_Latent_Surface_KT_Failure_20260504.md`

```markdown
# IRA Invocation — Candidate 7: Latent-Surface Tenant-Specific Korean Test Failure

**work_scope:** single axis — substrate orthogonality of Candidate 7 vs T1-E910 + Decision 154
**output_class:** brief_only (applicable entries + coherence findings + supersession candidates; no options)
**task_class:** substrate_promotion_evaluation
**Mode:** Advisory (Class A; pre-promotion; operates on the NEED)
**Cost projection:** $0.50-$1.50

## Substrate binding hints

Expected applicable entries (architect verifies through IRA's substrate read):
- IGF-T1-E910 (Korean Test, AP-25) — field identification structural; Domain Agent prompts exempt
- IGF-Decision-154 (LOCKED 2026-04-27) — Korean Test extends to operation vocabulary
- IGF-T0-E18 v2 (Integration Model — Agent Invocation Points) — dispatch boundary integration
- IGF-T1-E912 (Principle-Rule Coherence) — coherence finding mechanism per Step 7 of IRA loop
- AUD-004 v3 E1-E6 audit findings (substrate-extension proposals)
- AUD-004 v3 F-005 (system-wide enumeration defect; closed by E1)
- AUD-004 v3 F-012 (variant selection layer positive control; reference pattern for E6)

Expected supersession candidates:
- T1-E910 may need extension to cover dispatch-time metadata key matching (third surface)
- Decision 154 may need clarification whether it covers metadata key matching at dispatch boundaries

## Concrete artifact under evaluation

### Candidate 7 framing (verbatim)

> Code surfaces that enumerate specific identifiers at dispatch boundaries are latent Korean Test failures until tenant-semantic variation surfaces them. Synthetic tests grounded in fewer tenants than the platform serves cannot detect this class of defect. The platform's per-tenant variation surface is the empirical Korean Test surface for dispatch boundaries; tests must exercise tenant-semantic variation, or the variation must be exercised structurally in production. Defect closure targets structural iteration at the dispatch boundary, not extension of the enumerated list.

### Empirical evidence

VP repository (`spm-platform`) at `origin/main` HEAD post-HF-199 merge:

```typescript
// web/src/app/api/calculate/run/route.ts:1320-1322 (OB-177 bridge metadata fallback)
// Also include metadata.role if present (backward compat)
const meta = (ent.metadata || {}) as Record<string, unknown>;
if (meta.role && !resolved['role']) resolved['role'] = meta.role;
```

- Pattern: enumerated key matching at dispatch surface
- Latent since: OB-177 merge (~March 2026)
- Tested tenants: BCL (variant attribute = `role`) — passed; CRP (variant attribute = `role`) — passed
- Defect-surfacing tenant: Meridian (variant attribute = `tipo_coordinador`) — empirical failure 2026-05-04
- Empirical: Silvia Pérez Rodríguez (entity 70028) carries `metadata: {region, hub_asignado, fecha_ingreso, tipo_coordinador}` populated by HF-190; bridge fallback at :1322 surfaces only `role` (not present in her metadata); `materializedState` empty; variant discrimination produces `tokens=[]`; entity excluded from calc
- Latency: ~7 weeks between OB-177 merge and Meridian re-import surfacing the latent failure

Distinction tested:
- T1-E910 covers field identification (parse/import time)
- Decision 154 covers operation vocabulary (canonical declaration + round-trip closure + structured failure)
- Candidate 7 covers metadata key matching at dispatch boundaries (third surface)

## Question (single axis)

> **Is Candidate 7 orthogonal to T1-E910 + Decision 154 (warranting new T1 entry), or is it a third instance/surface of the same Korean Test principle (warranting T1-E910 extension or Decision 154 clarification)?**

Per IGF-T1-E912 (Principle-Rule Coherence), surface coherence findings if existing rules under-serve the dispatch-boundary surface for tenant-semantic variation.

## Output instructions

Return brief with:
1. Applicable entries (1-5) with why_it_binds and full content
2. Coherence findings (per Step 7 of IRA loop) — does T1-E910 / Decision 154 / T0-E18 v2 under-serve the dispatch-boundary surface?
3. Supersession candidates — should T1-E910 extend or should Candidate 7 land as new T1 entry?
4. evaluation_status: 'did_not_fire' if substrate cleanly answers; 'fired_with_results' if substrate does not.

Do NOT provide option_recommendations (output_class is brief_only).
Do NOT invent substrate-named alternatives if substrate does not name them.
Per IRA_INVOCATION_REFERENCE.md §4.5, single work_scope axis discipline applies.
```

### Subsequent invocations (drafted separately if architect dispositions Mode 2)

For HF-196 Artifact B Candidates 1-6, drafted separately per HF-196 Artifact B's own "What IRA invocation would test" sections. Each as separate single-axis invocation file.

For AUD-004 v3 §8 Inv 1-4, drafted separately per AUD-004 §8's own framings.

Architect dispositions order; runs sequentially; reviews response before next invocation. MAX_TOKENS=4096 binding per `IRA_CLI_Operating_Instructions.md` §6.

---

## Section 5 — Architect Disposition Action

### Phase A — Comprehensive disposition (architect-only)

Architect reviews three canonical artifacts together:

1. **HF-196 Artifact B** at `HF-196_ARTIFACT_B_ICA_MODE1_PROPOSAL.md` — six candidates pending VG disposition
2. **AUD-004 v3 §8** at `AUD_004_Remediation_Design_Document_v3_20260427.md` — four IRA invocation candidates pending architect disposition
3. **This addendum** — evidence strengthening + 1 new Candidate 7

Per-candidate disposition options:

| Disposition | Meaning |
|---|---|
| Mode 1 only | Capture for future reference; no IRA invocation now |
| Mode 1 → Mode 2 | Promote to formal IRA review (architect invokes via CLI) |
| Reject | Not a substrate-promotion candidate; close |
| Defer | Accumulate evidence; revisit after N sessions |

Architect dispositions per candidate, then runs Phase B for Mode 2 candidates.

### Phase B — IRA Invocation (architect-only, runs CLI from vialuce-governance repo)

For each Mode 2 candidate (in dependency order per Section 3):

1. Create prompt file at `prompts/IRA_Invocation_<Name>_<YYYYMMDD>.md`
2. Verify single-axis scope per IRA_INVOCATION_REFERENCE.md §4
3. Verify substrate context size for MAX_TOKENS=4096 per `IRA_CLI_Operating_Instructions.md` §6
4. Run from `vialuce-governance` repo root:
   ```bash
   QUESTION=$(cat prompts/IRA_Invocation_<Name>_<YYYYMMDD>.md) && \
     npm run ira -- "$QUESTION" > docs/IRA-responses/IRA_<Name>_<YYYYMMDD>.md && \
     git add prompts/IRA_Invocation_<Name>_<YYYYMMDD>.md docs/IRA-responses/IRA_<Name>_<YYYYMMDD>.md && \
     git status
   ```
5. Review response file; confirm cost_usd within projected range; confirm no truncation error
6. Commit prompt + response together
7. Disposition IRA brief: substrate write needed? supersession? extension? defer?
8. Proceed to next candidate in dependency order

### Phase C — Substrate Write (CC directive dispatch — conditional on Mode 2 + IRA recommendation)

For each candidate IRA brief recommends as substrate write:

1. Architect drafts PROM-IGF-N two-file artifact (spec + CC directive) per IGF-T5-E970
2. Spec at `docs/specs/<Entry_ID>_<short_slug>_<YYYYMMDD>.md`; CC directive at `prompts/CC_Directive_<Entry_ID>_<YYYYMMDD>.md`
3. Architect dispatches CC directive
4. CC executes capture event → ICA capture → architect /disposition UI → SECURITY DEFINER function inserts entry
5. Verification SQL confirms substrate state advance

### Phase D — Carry-Forward Bookkeeping

1. Update `INF_GOVERNANCE_INDEX_<YYYYMMDD>.md` with new entries
2. Update `HANDOFF_TEMPLATE_CORRECTIONS.md` if discipline changes warrant correction (current corrections file is at 24 entries: 1-18 + 20-25)
3. Update memory if architect-channel discipline derives from new substrate entries
4. Close out remaining candidates not promoted (Reject + Defer dispositions logged)
5. Substrate state advances; HF-200 directive shape can now be drafted against post-substrate-update context

---

## Section 6 — Compliance Frame

This addendum follows:

- **Class A IRA discipline** — operates on the NEED pre-drafting; substrate-non-decidable elements left for architect
- **IGF-T5-E1060 Dependency Analysis Gate** — Section 3 documents pairwise dependencies; multi-question invocations require it (not used here; Section 4 invocation is single-axis)
- **IGF-T5-E970 Two-File Discipline** — for substrate-modification artifacts in Phase C; this addendum is a single-file proposal (not yet substrate-modification)
- **IGF-T5-E966 Per-Tier Monotonic ID Allocation** — no Tier-N or candidate-ID assignments locked here; substrate write phase assigns IDs
- **IGF-T6-E910 Sequence-Implying ID Anti-Pattern** — Candidate 7 numbering is referential to HF-196 Artifact B sequence, not authoritative
- **Standing Rule 34 (No Bypass)** — no candidate auto-promotes; each is architect-channel decision
- **Reconciliation-Channel Separation** — no GT values; substrate-class observations only
- **Procedural Theater Minimization** — addendum 200 lines; restates nothing already canonical; net-new content only
- **Companion artifact discipline** — references HF-196 Artifact B + AUD-004 v3 §8 by path; does not duplicate

---

## Section 7 — Closing Notes

**Read sequence:**
1. HF-196 Artifact B (canonical for Candidates 1-6)
2. AUD-004 v3 §8 (canonical for Inv 1-4)
3. This addendum (evidence strengthening for Candidates 1-2 + new Candidate 7)
4. Disposition table fill-in across all three artifacts

**Critical question:**
- Is Candidate 7 orthogonal to T1-E910 + Decision 154, or third surface of same principle? IRA Advisory invocation (Section 4) clarifies.

**HF-200 dependency on substrate disposition:**

HF-200 Shape disposition (per DIAG-HF-200B Options A/B/C/D/E/F) is downstream of substrate decision. If architect dispositions Candidate 7 + HF-196 Artifact B Candidate 1 to Mode 2, IRA briefs may shift HF-200's directive shape. If all dispositioned Mode 1 (defer), HF-200 proceeds against current substrate; substrate updates carry-forward to next governance session.

Without Candidate 7 promotion (or T1-E910 extension), HF-200 closes Meridian but substrate doesn't capture the Latent-Surface Tenant-Specific Korean Test Failure pattern; next tenant variation may surface analogous defect at sibling boundary (e.g., variant discriminant matcher in same file).

**End of addendum.**

**Status:** Companion artifact to HF-196 Artifact B + AUD-004 v3 §8. Three contributions: evidence strengthening for Candidates 1-2 (4th instance Adjacent-Arm Drift + 2nd instance Decision-Implementation Gap); 1 new Candidate 7 (Latent-Surface Tenant-Specific Korean Test Failure); IRA invocation prompt drafted for Candidate 7 only.

**Substrate citations verified body-fidelity:**
- IGF v0.2 LOCKED 2026-04-07
- ICA Modes 1-4 operational
- Class A IRA consultation discipline
- IGF-T5-E1060 Dependency Analysis Gate
- IGF-T1-E912 Principle-Rule Coherence
- IGF-T1-E910 Korean Test
- IGF-Decision-154 LOCKED 2026-04-27
- IGF-T1-E947 Reasoning-Scope Binding Specificity (verify status; promoted via PR; current via substrate SQL)
- IGF-T5-E1058 Silent-Cost-Leak (promoted via HF-IGF-11)
- IGF-T5-E1059 Validator Transparency Pattern (promoted via HF-IGF-11)
- Standing Rule 34 (No Bypass)
- IRA_CLI_Operating_Instructions.md
- IRA_INVOCATION_REFERENCE.md §4.5 single work_scope axis
- HF-196_ARTIFACT_B_ICA_MODE1_PROPOSAL.md (canonical six candidates)
- AUD_004_Remediation_Design_Document_v3_20260427.md §8 (canonical four invocation candidates)
- HANDOFF_TEMPLATE_CORRECTIONS.md Corrections 20-25
