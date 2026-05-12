# DIAG-025_TIPO_DRIFT — Korean Test Drift Audit at SCI Canonicalization

**Sequence number:** 025 (architect-assigned per VP DIAG counter)
**Authoring channel:** VP architect-channel session 2026-05-05
**Audit type:** Read-only forensic diagnostic
**Sequencing:** Pre-HF-200 (HF-200 closure path paused pending audit findings)
**Companion artifact:** Completion report template appended at end of this document

---

## ARCHITECT-CHANNEL FRAMING (NOT FOR CC PASTE)

### Purpose

Determine whether SCI canonicalization is leaking literal source field names (e.g., `tipo_coordinador`) into `entities.metadata` and/or `entities.temporal_attributes` as sibling keys to or instead of canonical surfaces (e.g., `meta.role`).

- **If yes** — Korean Test violation (T1-E910 + Decision 154) at SCI canonicalization, NOT at calc-time dispatch. HF-200 as currently scoped (Path 2 Structural, rewrite Bridge A as structural iteration) accommodates the drift instead of correcting it. SR-34 No Bypass operative.
- **If no** — `tipo_coordinador` is reaching `entities.metadata` through a different path; HF-200 framing may be appropriate.

### Hypothesis under test

HF-197 / HF-198 / HF-199 (or earlier — OB-177 candidate; HF-190 candidate) introduced drift away from singular `meta.role` canonical surface for entity variant attributes. The drift takes the form of preserving literal source field names as sibling keys.

### Why audit before remediation

Adjacent-Arm Drift Discipline (T1-E952): closing instance without closing structural class is provisional. If literal-field-name preservation is the structural class, fixing it requires identifying every surface where it manifests, not just the bridge fallback site that surfaced the visible failure.

### Substrate bindings

| Primitive / rule | Why it binds here |
|---|---|
| **T1-E910 Korean Test (AP-25)** | Field identification by structure, NEVER by language-specific string literals. `tipo_coordinador` as a literal metadata key is the canonical violation shape. |
| **Decision 154** | Korean Test extends to operation vocabulary; applies at every surface including SCI canonicalization. |
| **T1-E952 Adjacent-Arm Drift Discipline** | Fix at structural-class layer, not instance layer. |
| **T1-E953 Decision-Implementation Gap** | Empirical evidence required — no claims without verbatim code/git output. |
| **T1-E905 Prove Don't Describe** | Verbatim output for every dimension. |
| **T2-E46 Reconciliation-Channel Separation** | CC reports facts; architect interprets. |
| **T5-E1064 Procedural Theater Minimization** | Single statement of phase requirements; no per-step ceremony. |
| **SR-34 No Bypass** | Surface drift; do not propose accommodation. |

### Out of scope explicitly

- No code modifications during audit
- No commits during audit (report is `/tmp/` working artifact; architect dispositions commit after review)
- No SQL execution; no schema interaction
- No HF/OB directive drafting (architect work post-audit)
- No clean-slate planning (separate work item)
- No remediation recommendation beyond presenting empirical findings

### Verification anchors (architect-channel only; T2-E46 operative)

- Meridian variant attribute: `tipo_coordinador` (Spanish; visible failure surface)
- BCL/CRP variant attribute: `role` (English; non-failure surface — but possibly ALSO leaking under literal field-name keys)
- Architect reconciles audit findings against expected canonical surface in architect channel

### Sequencing relative to clean slate + HF-200

1. **DIAG-025_TIPO_DRIFT** (this audit) → architect dispositions findings
2. Revised HF-200 OR new HF reframing (per audit findings)
3. **CLT — Clean Slate** (separate work item; data-side; truncate tenant data + re-import)
4. Revised HF-200 / new HF ships into clean DB
5. Production verification establishes new GTs

---

## CC PASTE BLOCK (everything below this line is CC-pasteable; nothing follows per Rule 29)

```markdown
# DIAG-025_TIPO_DRIFT — Korean Test Drift Audit at SCI Canonicalization

**Repo:** `CCAFRICA/spm-platform` (VP)
**Working directory:** `~/spm-platform`
**Branch:** create new branch `diag-025-tipo-drift-audit` from main HEAD
**Operation type:** READ-ONLY DIAGNOSTIC — no code modifications, no commits during audit
**Inheritance:** `CC_STANDING_ARCHITECTURE_RULES.md` Rules 1-26+
**Bindings:**
- IGF-T1-E910 (Korean Test, AP-25) — what is being tested
- IGF-Decision-154 (Korean Test extends to operation vocabulary)
- IGF-T1-E952 (Adjacent-Arm Drift Discipline) — why audit before remediation
- IGF-T1-E953 (Decision-Implementation Gap Pattern) — empirical evidence required; no claims without paste
- IGF-T1-E905 (Prove Don't Describe) — verbatim output for every dimension
- IGF-T5-E1064 (Procedural Theater Minimization) — single statement of phase requirements
- SR-34 (No Bypass) — surface drift; do not propose accommodation

---

## AUTONOMY DIRECTIVE

NEVER ask yes/no. NEVER say "shall I". Just act. (Standing Rule 10)

Proceed through dimensions continuously. HALT only at:
- Dimension 1: ROLE_TARGETS constant cannot be located (file path mismatch or constant renamed)
- Dimension 3: git blame surfaces commits without HF/OB identifiers in commit messages (architect dispositions how to tag)
- Dimension 6: forensic timeline cannot resolve which HF introduced which pattern (architect dispositions further investigation)

If any HALT: paste empirical evidence verbatim; surface to architect.

NO code modifications during audit. NO commits during audit. Audit report written to `/tmp/DIAG_025_TIPO_DRIFT_REPORT_<YYYYMMDD>.md` as working artifact; architect dispositions commit after review.

---

## SETUP

```bash
cd ~/spm-platform
git checkout main
git pull origin main
git checkout -b diag-025-tipo-drift-audit
git rev-parse HEAD
```

PASTE output verbatim.

---

## DIMENSION 1 — CANONICAL SURFACE INVENTORY

**Objective:** Determine the original (pre-drift) canonical surface for "entity variant attribute."

### 1.1 Locate ROLE_TARGETS constant

```bash
grep -rn "ROLE_TARGETS" web/src/ --include="*.ts" --include="*.tsx"
```

PASTE verbatim output. Then read the file containing the constant declaration:

```bash
# (CC fills in file path from grep output)
grep -B 2 -A 10 "const ROLE_TARGETS" <file_path>
```

PASTE the full constant definition.

### 1.2 meta.role + metadata.role write/read inventory

```bash
grep -rn "meta\.role\|metadata\.role\|metadata\['role'\]\|metadata\[\"role\"\]" web/src/ --include="*.ts" --include="*.tsx"
```

PASTE verbatim output.

### 1.3 entities.temporal_attributes write site enumeration

```bash
grep -rn "temporal_attributes" web/src/ --include="*.ts" --include="*.tsx" | grep -v "\.select"
```

PASTE verbatim output.

### 1.4 entities.metadata write site enumeration

```bash
grep -rn "entities.*metadata\|\.metadata\s*=\|\.metadata:" web/src/ --include="*.ts" --include="*.tsx" | head -50
```

PASTE verbatim output.

### 1.5 DS-* documentation references

```bash
grep -rn "variant_attribute\|canonical.*role\|meta\.role" docs/ --include="*.md" 2>/dev/null
ls docs/ 2>/dev/null
```

If `docs/` exists at repo root, PASTE output. If not, note absence.

---

## DIMENSION 2 — DRIFT SURFACE ENUMERATION

**Objective:** Where in the codebase do non-canonical (source-field-name-derived) keys land in entity metadata or temporal_attributes?

### 2.1 meta.enrichment + buildTemporalAttrs sites

```bash
grep -rn "meta\.enrichment\|enrichment:" web/src/lib/sci/ web/src/app/api/import/ --include="*.ts"
```

PASTE verbatim output.

### 2.2 buildTemporalAttrs full function read

```bash
grep -rn "function buildTemporalAttrs\|buildTemporalAttrs\s*=" web/src/ --include="*.ts"
```

For each result, read the function definition with surrounding context:

```bash
# (CC fills in file path + line from grep output)
grep -B 2 -A 25 "buildTemporalAttrs" <file_path>
```

PASTE verbatim output for every site.

### 2.3 normalizedKey assignment block

```bash
grep -rn "normalizedKey\|sourceField.*toLowerCase\|fieldLower" web/src/lib/sci/ web/src/app/api/import/ --include="*.ts"
```

PASTE verbatim output.

### 2.4 Examine OB-177 enrichment loop verbatim

```bash
grep -B 5 -A 20 "OB-177" web/src/app/api/import/sci/execute-bulk/route.ts
```

PASTE verbatim output.

---

## DIMENSION 3 — GIT-BLAME TIMELINE

**Objective:** For each drift surface from Dimension 2, identify the commit that introduced the pattern.

### 3.1 entity-resolution.ts blame for temporal_attributes write

```bash
git log --oneline -- web/src/lib/sci/entity-resolution.ts | head -20
```

PASTE verbatim output.

### 3.2 entity-resolution.ts blame for buildTemporalAttrs function

```bash
git blame web/src/lib/sci/entity-resolution.ts | grep -E "buildTemporalAttrs|temporal_attributes" | head -30
```

PASTE verbatim output.

### 3.3 execute-bulk/route.ts blame for OB-177 enrichment block

```bash
git log --oneline -- web/src/app/api/import/sci/execute-bulk/route.ts | head -20
```

PASTE verbatim output.

```bash
git blame web/src/app/api/import/sci/execute-bulk/route.ts | grep -E "enrichment|meta\.role" | head -30
```

PASTE verbatim output.

### 3.4 Identify commits matching HF-190, HF-197, HF-198, HF-199, OB-177, HF-114

```bash
git log --oneline --all | grep -E "HF-190|HF-197|HF-198|HF-199|OB-177|HF-114" | head -30
```

PASTE verbatim output. For each commit identified, capture full commit message:

```bash
# (CC iterates per SHA found; substitute <SHA>)
git log -1 --format="%H%n%s%n%n%b" <SHA>
```

PASTE verbatim output for each.

---

## DIMENSION 4 — KOREAN TEST COMPLIANCE PER CANONICALIZATION SITE

**Objective:** For each canonicalization site (where source field name → canonical key happens), assess Korean Test compliance.

### 4.1 ROLE_TARGETS membership test

Given ROLE_TARGETS contents from Dimension 1.1, evaluate (CC writes evaluation; no code execution needed):

| Tenant variant column | fieldLower (lowercase + dashes/underscores stripped) | Does fieldLower.includes(t) match ANY t in ROLE_TARGETS? | If yes, which t? |
|---|---|---|---|
| BCL `Role` | `role` | (CC fills in: yes/no per ROLE_TARGETS membership) | (CC fills in) |
| CRP `Role` | `role` | (CC fills in) | (CC fills in) |
| Meridian `Tipo Coordinador` | `tipocoordinador` | (CC fills in) | (CC fills in) |
| Hypothetical Korean `역할` | `역할` (or normalized lowercase) | (CC fills in) | (CC fills in) |

PASTE the table with empirical results.

### 4.2 If meta.role IS set for Meridian, where does meta.tipo_coordinador come from?

If Dimension 4.1 shows `meta.role` IS set for Meridian's `tipo_coordinador`, then `meta.tipo_coordinador` must come from a DIFFERENT path. Investigate:

```bash
grep -rn "tipo_coordinador\|tipo coordinador\|tipocoordinador" web/src/ --include="*.ts" --include="*.tsx"
```

PASTE verbatim output. If results show literal Spanish string in code, that is a Korean Test violation requiring architect disposition. If no results, the literal key must be coming from data-side (committed_data.row_data → entity_data.set → meta.enrichment → entities.metadata pipeline).

### 4.3 Trace the dual-write hypothesis

If both `meta.role` AND `meta.enrichment[normalizedKey]` get written for the same input, the literal-field-name key persists alongside the canonical key. Read the relevant blocks:

```bash
grep -B 3 -A 8 "meta\.role = " web/src/app/api/import/sci/execute-bulk/route.ts
```

PASTE verbatim output.

```bash
grep -B 3 -A 15 "meta\.enrichment\[" web/src/app/api/import/sci/execute-bulk/route.ts
```

PASTE verbatim output.

---

## DIMENSION 5 — BRIDGE A + BRIDGE B AS ADJACENT-ARM DRIFT INSTANCES

**Objective:** Determine whether Bridge A (calc-time fallback) and Bridge B (SCI-time enrichment write) are downstream consequences of the SAME upstream canonicalization gap.

### 5.1 Bridge A verbatim

```bash
grep -B 5 -A 10 "Also include metadata.role\|backward compat" web/src/app/api/calculate/run/route.ts
```

PASTE verbatim output.

### 5.2 Bridge B verbatim

```bash
grep -B 5 -A 25 "Also update metadata.role\|metadata.role if detected" web/src/app/api/import/sci/execute-bulk/route.ts
```

PASTE verbatim output.

### 5.3 Common upstream: where does meta.role get its first value?

```bash
grep -B 3 -A 8 "meta\.role = " web/src/lib/sci/ web/src/app/api/import/ -r --include="*.ts"
```

PASTE verbatim output.

### 5.4 CC empirical assessment (facts only; no interpretation)

CC writes a single paragraph stating the empirical finding. NOT "is the audit hypothesis correct" — that is architect's call.

The paragraph reports:
- "ROLE_TARGETS contains [list]"
- "For Meridian's `Tipo Coordinador` column with fieldLower=`tipocoordinador`, ROLE_TARGETS membership matches: [yes/no]"
- "Therefore meta.role gets set to: [value or 'not set']"
- "Therefore entities.metadata.role contains: [value]"
- "Additionally, meta.enrichment[normalizedKey] preserves the literal key: [value]"
- "Therefore entities.metadata also contains the literal key alongside (or instead of) canonical role: [value]"

CC reports facts; architect interprets. T2-E46 reconciliation-channel separation operative.

---

## DIMENSION 6 — HF/OB FORENSIC TIMELINE

**Objective:** Correlate Dimensions 1-5 findings with specific HF/OB work items.

CC produces a markdown table:

| HF/OB | Date | What it touched | Drift introduced (yes/no, what shape) | Source: Dimension 3 SHA |
|---|---|---|---|---|
| OB-177 | (CC fills in from git log) | (CC fills in from commit body / file diffs) | (CC fills in) | (CC fills in SHA) |
| HF-190 | ... | ... | ... | ... |
| HF-114 | ... | ... | ... | ... |
| HF-197 | ... | ... | ... | ... |
| HF-198 | ... | ... | ... | ... |
| HF-199 | ... | ... | ... | ... |

PASTE the table with empirical entries from git log + git blame data gathered in Dimension 3.

For each row marked "Drift introduced: yes," append a paragraph immediately below the table identifying:
- Specific code lines the HF/OB modified (file:line range)
- Exact pattern introduced (e.g., "added meta.enrichment dual-write loop")
- Whether the modification REPLACED a prior canonical-only pattern (cite via `git show <SHA>^:<file>`) or whether the dual-write was always present

---

## REPORT ASSEMBLY

CC writes the audit report to:

```
/tmp/DIAG_025_TIPO_DRIFT_REPORT_<YYYYMMDD>.md
```

Report structure:

```
# DIAG-025_TIPO_DRIFT Audit Report — <date>

**Audit identifier:** DIAG-025_TIPO_DRIFT
**Audit branch:** diag-025-tipo-drift-audit
**Main HEAD baseline:** <SHA from setup>
**Audit date:** <YYYY-MM-DD>
**Audit type:** Read-only forensic diagnostic
**Bindings:** T1-E910, Decision 154, T1-E952, T1-E953, T1-E905

## DIMENSION 1 — CANONICAL SURFACE INVENTORY
[Verbatim outputs from 1.1, 1.2, 1.3, 1.4, 1.5]

## DIMENSION 2 — DRIFT SURFACE ENUMERATION
[Verbatim outputs from 2.1, 2.2, 2.3, 2.4]

## DIMENSION 3 — GIT-BLAME TIMELINE
[Verbatim outputs from 3.1, 3.2, 3.3, 3.4]

## DIMENSION 4 — KOREAN TEST COMPLIANCE
[Empirical table from 4.1; verbatim code from 4.2, 4.3]

## DIMENSION 5 — BRIDGE A + BRIDGE B ADJACENT-ARM DRIFT
[Verbatim code from 5.1, 5.2, 5.3; CC empirical paragraph from 5.4]

## DIMENSION 6 — HF/OB FORENSIC TIMELINE
[Empirical table; per-row drift paragraphs]

## EMPIRICAL FINDINGS SUMMARY (FACTS ONLY; NO INTERPRETATION)

CC writes 5-7 single-sentence facts derived from Dimensions 1-6. Examples:
- "ROLE_TARGETS contains the substrings [...]"
- "fieldLower.includes() match for `tipocoordinador` against ROLE_TARGETS returns: [yes/no]"
- "meta.role for Meridian's Tipo Coordinador column gets set to: [value or 'not set']"
- "entities.metadata for Meridian entities contains keys: [list]"
- "OB-177 introduced the meta.enrichment dual-write at <file>:<lines>"
- "HF-199 introduced the temporal_attributes write at entity-resolution.ts:<lines>"
- "Bridge A at calculate/run/route.ts:1322 fires only when resolved[key] is undefined"

NO recommendations. NO architectural conclusions. NO disposition options. Architect interprets.
```

PASTE final report content verbatim in CC chat output for architect verification.

---

## CC FINAL HANDOFF

After report written and pasted in chat:

1. CC reports: "DIAG-025_TIPO_DRIFT audit complete. Report at `/tmp/DIAG_025_TIPO_DRIFT_REPORT_<YYYYMMDD>.md`. Awaiting architect disposition."
2. CC takes NO further action. NO commits. NO branch close. NO HF/OB drafting. NO remediation suggestions.
3. Branch `diag-025-tipo-drift-audit` remains open with no commits — architect dispositions whether to close, archive, or commit the audit report.

END OF DIRECTIVE.
```

---

## COMPLETION REPORT TEMPLATE

After CC completes audit and architect reviews report, the following completion report template is filled in (architect-channel) for governance record:

```markdown
# DIAG-025_TIPO_DRIFT — Completion Report

**Audit identifier:** DIAG-025_TIPO_DRIFT
**Audit dispatched:** <YYYY-MM-DD>
**Audit completed:** <YYYY-MM-DD>
**CC session ID:** <if available>
**Architect disposition date:** <YYYY-MM-DD>

---

## SECTION 1 — AUDIT EXECUTION SUMMARY

**Branch created:** `diag-025-tipo-drift-audit` from main HEAD `<SHA>`
**Commits during audit:** 0 (read-only diagnostic)
**Audit report path:** `/tmp/DIAG_025_TIPO_DRIFT_REPORT_<YYYYMMDD>.md`
**HALTs encountered:** <count> — <if any, list with disposition>

---

## SECTION 2 — EMPIRICAL FINDINGS (CC-PRODUCED)

[Architect copies CC's "EMPIRICAL FINDINGS SUMMARY" section from the audit report verbatim. No interpretation added. T2-E46 channel separation operative.]

---

## SECTION 3 — ARCHITECT INTERPRETATION

[Architect-channel content. CC does NOT contribute to this section.]

### 3.1 Hypothesis disposition

The audit hypothesis was: "HF-197 / HF-198 / HF-199 (or earlier — OB-177 candidate; HF-190 candidate) introduced drift away from singular `meta.role` canonical surface for entity variant attributes. The drift takes the form of preserving literal source field names as sibling keys."

Hypothesis status post-audit: <CONFIRMED / PARTIALLY CONFIRMED / REFUTED>

Reasoning: [architect cites specific empirical findings from Section 2 supporting the disposition]

### 3.2 Drift introduction commit (if hypothesis confirmed)

Drift introduced by: <HF/OB identifier> at commit `<SHA>` on <date>
Pattern introduced: <short description>
Pre-drift baseline: <description of prior pattern, with `git show <SHA>^:<file>` reference>

### 3.3 Korean Test violation surfaces

Surfaces where literal-field-name preservation manifests:
- [List file:line ranges from Section 2 empirical findings]

### 3.4 Adjacent-Arm Drift class assessment

Bridge A (calc-time fallback) and Bridge B (SCI-time enrichment write) relationship to upstream canonicalization gap:
- Both downstream of same gap: <YES / NO>
- Independent gaps: <YES / NO>
- If independent: enumerate
- T1-E952 structural class: <description>

---

## SECTION 4 — REMEDIATION DISPOSITION

[Architect selects ONE of the four options below; expands selection with specific scope.]

### Option A — Reframe HF-200 entirely

**New work item:** <new HF/OB identifier; or "to be assigned">
**Scope:** Close SCI canonicalization gap upstream. Revert HF-190 / HF-197-199 metadata-spread pattern if those introduced the literal-key leak. Bridge A and Bridge B left untouched (they were always defensible fallback paths IF SCI canonicalizes correctly upstream).
**HF-200 disposition:** <CANCEL / SUPERSEDE-BY-NEW-HF / etc.>

### Option B — Reframe HF-200 with expanded scope

**HF-200 revised scope:** Close upstream canonicalization AND keep Bridge A structural iteration as defense-in-depth.
**Phase additions:** <list new phases or scope expansions>
**Existing phases retained:** <list>

### Option C — HF-200 as currently scoped is correct

**Reasoning:** Audit reveals SCI canonicalization is fine; `tipo_coordinador` leaking through some other path; current Path 2 Structural is appropriate.
**Specific finding supporting Option C:** [architect cites specific empirical findings]

### Option D — Mixed disposition

**Description:** [Architect describes hybrid disposition not covered by A/B/C]

---

## SECTION 5 — DEFECT CLASS REGISTRY UPDATE

If audit confirms a Korean Test violation pattern at SCI canonicalization, this becomes operative defect-class evidence for substrate consideration:

**Candidate substrate primitive:** <description, e.g., "Canonicalization-Layer Korean Test Failure" — distinct from T1-E910 instance at calc-time>
**Tier candidate:** <T1 / T2 / T5>
**Evidence chain:** <list audit findings supporting candidate>
**Action:** <surface to ICA at next governance session for substrate-promotion consideration>

If audit refutes the hypothesis, no substrate candidate is added; record audit closure as evidence of Korean Test compliance at SCI canonicalization layer.

---

## SECTION 6 — CARRY-FORWARD ITEMS

[Architect lists any follow-on items surfaced during audit:]

1. <item>
2. <item>

---

## SECTION 7 — SEQUENCING UPDATE

Pre-audit sequencing was:
1. DIAG-025_TIPO_DRIFT
2. Revised HF-200 OR new HF reframing
3. CLT — Clean Slate
4. Revised HF-200 / new HF ships into clean DB
5. Production verification

Post-audit revised sequencing:
1. <updated step>
2. <updated step>
3. <updated step>
4. <updated step>
5. <updated step>

---

## SECTION 8 — SUBSTRATE BINDINGS APPLIED DURING AUDIT

| Binding | How applied |
|---|---|
| T1-E910 Korean Test | Audit dimension 4 evaluated structural-vs-literal canonicalization |
| Decision 154 | Audit recognized canonicalization layer as Korean Test surface |
| T1-E952 Adjacent-Arm Drift | Audit dimension 5 assessed Bridge A + Bridge B as same-class instances |
| T1-E953 Decision-Implementation Gap | Audit required verbatim empirical evidence per dimension |
| T1-E905 Prove Don't Describe | Every CC claim cited verbatim code/git output |
| T2-E46 Reconciliation-Channel Separation | CC reported facts; architect interpreted |
| T5-E1064 Procedural Theater Minimization | Single statement of phase requirements; no per-step ceremony |
| SR-34 No Bypass | Audit pre-empted accommodation-style remediation |

---

## SECTION 9 — REPORT COMMIT DISPOSITION

[Architect dispositions whether the `/tmp/` audit report is committed to the repo:]

- [ ] COMMIT to `docs/audits/DIAG_025_TIPO_DRIFT_REPORT_<YYYYMMDD>.md` (governance record)
- [ ] DO NOT COMMIT (audit was internal investigation; no permanent artifact)
- [ ] COMMIT to `governance-inputs/` (VG repo cross-reference)

If COMMIT selected, CC dispatched for the commit-only operation in a separate one-line directive.

---

*vialuce.ai · Intelligence. Acceleration. Performance.*
*DIAG-025_TIPO_DRIFT_COMPLETION_REPORT_<YYYYMMDD>.md — Audit close <date>*
*<One-sentence audit summary. Hypothesis status. Remediation disposition.>*
```

---

## ARCHITECT-FACING NOTES (NOT FOR CC PASTE)

### Companion artifacts

- This audit prompt file (architect-channel reference; ready for CC dispatch)
- Audit report (CC-produced; `/tmp/` working artifact)
- Completion report (architect-produced; governance record)

### Substrate primitive candidates this audit may surface

If hypothesis is confirmed, candidate substrate primitive: **"Canonicalization-Layer Korean Test Failure"** — distinct from T1-E954 (Latent-Surface Tenant-Specific Korean Test Failure at dispatch boundary). Captures the structural class of literal-field-name preservation at canonicalization layer, regardless of which specific tenant surfaces it.

If hypothesis refuted, no substrate candidate; audit closure becomes evidence of Korean Test compliance at SCI canonicalization layer.

### Pre-dispatch checklist

- [ ] Verify branch name `diag-025-tipo-drift-audit` is not already taken on origin
- [ ] Confirm CC has clean working tree before dispatch
- [ ] Architect has bandwidth to disposition empirical findings within session
- [ ] No competing CC work on VP at time of dispatch

---

*vialuce.ai · Intelligence. Acceleration. Performance.*
*DIAG-025_TIPO_DRIFT_AUDIT_PROMPT_20260505.md — Korean Test drift audit at SCI canonicalization*
*Pre-HF-200 forensic diagnostic; sequence number 025 architect-assigned.*
