# OB-195 INCOMPLETE — Layer 2 + Completion Report Required
## DO NOT MERGE PR #327 until this is complete

---

## INCLUDE AT TOP OF PROMPT
- CC_STANDING_ARCHITECTURE_RULES.md v2.0

---

## WHAT IS MISSING

PR #327 delivered Layers 1, 3, and 4. Two items are missing:

### 1. Layer 2: Target Agent scoring for quota/reference files

**Why this is required:** Without Layer 2, the SCI classifies quota files as "entity" data (proven — the CRP quota file was classified as entity and enriched entities instead of creating committed_data rows). Layer 1 fixed the reference pipeline to write to committed_data, but if files never reach the reference pipeline because classification is wrong, Layer 1 has zero effect.

**File:** `web/src/lib/sci/agents.ts`

**What to implement:**

The structural distinction between entity data and target/reference data:
- **Entity data:** Each row IS an entity definition. Rows are unique per entity. No temporal dimension. No numeric measure beyond attributes.
- **Target/reference data:** Each row ASSOCIATES a value WITH an entity. Has a temporal column (effective_date). Has a numeric measure (quota, target, rate). Entity identifiers reference EXISTING entities, not new ones.

Add scoring signals — all STRUCTURAL, no field name matching (Korean Test):

**Target Agent boost (in the HC-enhanced scoring section for the target agent):**
- If the file has an identifier column AND a temporal column AND at least one numeric column that is NOT an attribute → boost Target Agent by +0.15
- Signal name: `hc_reference_structure`
- Evidence: `"File has identifier + temporal + numeric measure — reference/target data pattern"`

**Entity Agent penalty (in the HC-enhanced scoring section for the entity agent):**
- If Header Comprehension identifies a temporal column (any column with HC role containing "temporal" or "date") AND the file has fewer than 5 text/attribute columns → penalize Entity Agent by -0.15
- Signal name: `hc_temporal_not_roster`
- Evidence: `"Temporal column present with few attributes — not a roster/entity definition"`

Note: there is already an `hc_temporal_not_roster` signal that penalizes entity when `temporalCount >= 2`. Extend this to also penalize when `temporalCount >= 1` AND the file has a numeric measure column AND few attribute columns (< 5 text columns excluding identifier and temporal).

**Korean Test compliance:** These signals use structural properties (column type ratios, presence of temporal columns, identifier cardinality). Zero field names. A file with columns `직원번호, 이름, 역할, 할당량, 시작일` (Korean: employee_id, name, role, quota, start_date) would score the same way.

**Verification:**
```bash
# Korean Test: zero domain vocabulary in scoring changes
grep -n "monthly_quota\|effective_date\|quota\|target\|consumable" web/src/lib/sci/agents.ts
# Must return 0 matches (comments excluded)

# Signal exists
grep -n "hc_reference_structure" web/src/lib/sci/agents.ts
# Must return matches
```

**Commit:** `OB-195 Layer 2: Target Agent scoring for reference/quota files`

---

### 2. Completion Report (Rule 25)

The completion report was not created. This is a standing rule violation (Rule 25: completion report is the first deliverable, not the last).

Create `OB-195_COMPLETION_REPORT.md` in PROJECT ROOT with the mandatory structure (Rule 26):

```markdown
# OB-195 COMPLETION REPORT
## Date

## COMMITS (in order)
| Hash | Phase | Description |

## FILES CREATED
| File | Purpose |

## FILES MODIFIED
| File | Change |

## PROOF GATES — HARD
| # | Criterion (VERBATIM from prompt) | PASS/FAIL | Evidence |

## PROOF GATES — SOFT
| # | Criterion (VERBATIM from prompt) | PASS/FAIL | Evidence |

## STANDING RULE COMPLIANCE
- Rule 1: PASS/FAIL
- Rule 2: PASS/FAIL
- etc.

## KNOWN ISSUES

## VERIFICATION SCRIPT OUTPUT
```

Evidence means PASTED code/output (Rule 27). Not descriptions.

Include ALL proof gates from the original OB-195 prompt, including:
- Gate 8: Korean Test on agents.ts (`grep -n "monthly_quota\|effective_date\|quota\|target" web/src/lib/sci/agents.ts` = 0 matches)
- Gate 10: Headless verification script runs and passes

**Commit:** `OB-195 Completion report`

---

## BUILD VERIFICATION

After Layer 2 is implemented:

```bash
cd ~/spm-platform/web
rm -rf .next
npm run build
# Must exit 0

cd ~/spm-platform
git stash
npx tsc --noEmit 2>&1 | head -20
npm run lint 2>&1 | head -20
git stash pop
```

**Commit:** `OB-195 Build verification`

---

## PR UPDATE

After all commits, push to the existing PR #327 branch:

```bash
cd ~/spm-platform
git push origin dev
```

Do NOT create a new PR. Push to the existing dev branch that PR #327 tracks.

---

## WHAT NOT TO DO

1. **DO NOT hardcode field names** in agents.ts. Korean Test. Signal scoring is structural.
2. **DO NOT skip the completion report.** Rule 25 — non-negotiable.
3. **DO NOT claim PASS without pasted evidence.** Rule 27.
4. **DO NOT modify any files other than agents.ts and the completion report** in this follow-up.

---

*"Layer 2 is in the OB because without it, files never reach the fixed pipeline. Classification is the front door."*
