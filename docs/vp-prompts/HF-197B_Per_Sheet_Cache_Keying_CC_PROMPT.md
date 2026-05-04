# HF-197B — Per-Sheet Cache Keying (Amendment of HF-197) — CC Implementation Prompt

**Architect-channel content above CC paste block. CC paste block is LAST (Rule 29). Nothing follows.**

---

## Architect context (NOT part of CC prompt)

**Sequence:** HF-197B (amendment of in-flight HF-197; preserves sequence integrity)

**Why HF-197B not HF-198:** HF-197 was originally drafted around the workbook composition signature mechanism. DIAG-021 (committed locally on `hf-196-platform-restoration-vertical-slice`) disambiguated the actual defect mechanism: per-sheet keying defect at two route files (`analyze/route.ts` and `process-job/route.ts`). The HF-197 *intent* (fix wrong-sheet binding injection at the cache layer) is correct; the *mechanism* shifts from "composition signature" to "per-sheet keying at caller surface." Same HF identity, corrected mechanism.

**Defect class:** Cross-sheet binding injection at fingerprint flywheel caller surface

**Conclusive evidence (DIAG-021 verdicts):**
- H1 (algorithm collision): NOT SUPPORTED — algorithm at `structural-fingerprint.ts:156-162` includes column-list + types + ratios; different sheets produce different hashes
- H2 (lookup wider than per-sheet): NOT SUPPORTED — Tier 1 query is strict `eq(tenant_id).eq(fingerprint_hash).maybeSingle()`
- H3 (read path uses wrong sheet): SUPPORTED — `analyze/route.ts:109` and `process-job/route.ts:115` bind `primarySheet = sheets[0]` and lookup at `H(sheets[0])` regardless of which sheet's classification is needed
- H4 (write path stores under wrong sheet's metadata): SUPPORTED — `analyze/route.ts:392-421` and `process-job/route.ts:293-304` iterate per content unit but reuse `H(sheets[0])` for every unit's write; last-write-wins

**Defect mechanism (DIAG-021 Phase 6.2):** Both reads and writes key on `(tenantId, H(sheets[0]))`. Multi-sheet writes converge on a single row whose `classification_result` reflects whichever unit was processed last. On re-encounter, that single row's `fieldBindings` get injected into the new file's `sheets[0]` regardless of which sheet they originally described. Phase 5 SQL confirms: exactly ONE Meridian-tenant cache row, source `Meridian_Logistics_Benchmark.xlsx`, `tabName=Datos_Flota_Hub`, match_count=5.

**Architect operational context:**
- Architect performing CLEAN SLATE on Meridian tenant before this HF lands
- Imports will be fresh post-merge
- HF-197B does NOT include substrate cleanup migration (architect's clean slate handles it)
- This means HF-197B is code-only — no schema migration, no SQL Editor application

**Continuous processing discipline:** CC proceeds through phases without architect re-confirmation EXCEPT at critical HALT conditions:
- Branch state ambiguity (CC determines path; if ambiguous, HALT for architect disposition)
- Build failure or lint failure (HALT — defect class signal)
- Test failure (HALT — regression signal)
- Schema discovery diverges from assumption (HALT — FP-49 guard)
- Mid-implementation discovery that scope was wrong (HALT — Reasoning-Scope Binding Specificity guard)

**Routing per capability-first:**
- CC executes: branch probe, code edits, schema verify (read-only), build/lint/test, commit/push, PR creation
- Architect executes: clean slate (already in progress), browser verification post-merge, `gh pr merge`, production sign-off

**Verification anchor (architect-channel only — NOT in CC prompt):** Meridian Q1 2025 ground truth is the reconciliation reference; CC reports calculated values verbatim only.

**Out of scope (carry forward):**
- Plan tier extraction defect
- `Resultados_Esperados` ingested as transaction data
- Period auto-detect failure (CLT-197 finding)
- Storage object orphan cleanup
- `field_identities` substrate question
- Tier 2 (cross-tenant) composition awareness
- Self-correction cycle audit (DS-017 §4.3 — confidence climbing despite 0% binding success). Worth flagging post-HF-197B as separate diagnostic; possibly resolved by per-sheet signal coherence.

---

## Version Control representation

**Branch model (Pattern B — Modified Git Flow):**

```
main (protected; auto-deploy to vialuce.ai production)
 └── hf-197-fingerprint-composition-drift (in-flight HF-197 branch from prior session)
      OR (if branch doesn't exist)
 └── hf-197b-per-sheet-cache-keying (new branch from main HEAD = 73d52791)
```

**Commit-per-phase discipline (Standing Rules):**

```
phase α — schema verify probe (no commit; read-only)
phase β — code amendments to structural-fingerprint.ts (commit)
phase γ — code amendments to fingerprint-flywheel.ts (commit)
phase δ — code amendments to analyze/route.ts (commit)
phase ε — code amendments to process-job/route.ts (commit)
phase ζ — verification probe (commit script; runs in-memory; no DB writes)
phase η — completion report (commit; Rule 25 first-deliverable enforcement)
phase θ — push + PR
```

**Tag discipline:** No tag at HF-197B merge. Architect dispositions tag at next version-anchor session (Path 4 from prior handoff Section 20).

**PR linkage:** PR description references DIAG-021 report path verbatim for substrate citation.

---

## Pre-paste readiness (architect performs before paste)

- [ ] Architect has performed clean slate on Meridian tenant (`5035b1e8-0754-4527-b7ec-9f93f85e4c79`) — `structural_fingerprints`, `committed_data`, `entities`, `entity_relationships`, `classification_signals`, `import_batches`, `rule_sets`, etc. wiped per prior clean-slate sequence
- [ ] Localhost running, `dev` server up
- [ ] CC keychain authenticated
- [ ] Architect ready to perform browser-side fresh re-import after PR merges (CLEAN SLATE imports will exercise the per-sheet keying)

---

## CC PASTE BLOCK — paste verbatim into Claude Code below this line

```
HF-197B: Per-Sheet Cache Keying (Amendment of HF-197) — Implementation

ROLE: Implementation. Architect designed; you implement against locked design.

LOCKED DESIGN: The fingerprint flywheel cache key (single first-sheet hash) is reused
for ALL content units' writes (last-write-wins) AND used as the lookup target for
sheets[0]'s injection on cache hit. Result: multi-sheet workbooks produce one cache
row containing whichever unit was processed last; on re-encounter, those bindings
get injected into the new file's sheets[0] regardless of cached origin.

Fix: per-sheet keying at both read and write call sites. Each content unit gets its
own (tenant_id, fingerprint_hash) cache row keyed on H(unit.columns + unit.rows).
Each sheet at lookup time computes its own hash and matches against its own row.

CONTINUOUS PROCESSING: Proceed through phases without architect re-confirmation
EXCEPT at critical HALT conditions:
  1. Branch state ambiguity: if Phase 0 reveals branch state CC cannot disambiguate
     between (A) reuse with rewrite, (B) fresh branch from main, HALT for architect.
  2. Build failure: HALT
  3. Lint failure: HALT (introduced-by-HF; pre-existing OK)
  4. Test failure: HALT
  5. Schema discovery diverges: HALT
  6. Mid-phase discovery scope was wrong: HALT

CC STANDING ARCHITECTURE RULES (operative; do not violate):
  - Read CC_STANDING_ARCHITECTURE_RULES.md before any code change
  - Architecture Decision Gate: if any locked decision is unclear, HALT
  - Korean Test (AP-25): no language-specific or domain-specific string literals;
    per-sheet hash uses structural inputs only (column names, types, ratios)
  - Decision 64: no new signal table; existing classification_signals shared surface
    only if signals needed (HF-197B emits no new signals)
  - Decision 152: import sequence independence preserved (per-sheet keying does not
    gate sequence)
  - HF-094: per-content-unit fingerprintMap pre-existing — USE IT, do not rebuild
  - HF-145: preserve optimistic locking on writeFingerprint UPDATE path
  - HF-095/HF-186/HF-196 chain: HC primacy preserved (no changes to those surfaces)
  - HF-110: resolver fallback chain preserved (no changes to entity-resolution.ts)
  - SR-34 No Bypass: structural fix only; no workarounds
  - Rule 25 (Completion Report): completion report file is the FIRST deliverable
  - Rule 29 (CC paste LAST): observed in this prompt
  - SR-44: browser verification is architect-only

EVIDENTIARY GATES (every gate requires PASTED EVIDENCE — pasted code, pasted terminal
output, or pasted query result. PASS/FAIL self-attestation REJECTED. FP-80 false PASS
without evidence is unacceptable.):

═══════════════════════════════════════════════════════════════════════
PHASE 0 — Branch State Probe + Disposition
═══════════════════════════════════════════════════════════════════════

  0.1 Probe branch state:
      $ git fetch origin
      $ git branch -a | grep -E 'hf-197' 2>&1
      $ git log main --oneline -5 2>&1

  0.2 If branch hf-197-fingerprint-composition-drift exists, probe its state:
      $ git log origin/hf-197-fingerprint-composition-drift --oneline 2>&1 | head -20
      $ git diff main...origin/hf-197-fingerprint-composition-drift --stat 2>&1 | head -30

  0.3 PASTE all output into report Phase 0 section.

  0.4 CC determines path (this is YOUR decision per architect direction):

      DECISION TREE:
        If branch hf-197-fingerprint-composition-drift does NOT exist:
          → Path A: Create fresh branch hf-197b-per-sheet-cache-keying from main
          → State decision in report: "Branch absent. Fresh branch path selected."

        If branch exists with ZERO commits beyond main:
          → Path A (same as above; branch is a placeholder)
          → State decision: "Branch exists but no work. Fresh branch path."

        If branch exists with commits implementing composition_signature mechanism
        (the retracted HF-197 mechanism):
          → Path B: Create new branch hf-197b-per-sheet-cache-keying from main HEAD
          → ABANDON the composition_signature work (architect retracted that mechanism)
          → State decision: "Prior HF-197 composition_signature work superseded by
            DIAG-021 disambiguation. New branch from main; old branch will be
            architect-dispositioned (likely deleted post-merge)."
          → Do NOT cherry-pick from old branch
          → Do NOT delete old branch (architect dispositions)

        If branch exists with commits but content unclear:
          → HALT. Output to architect:
            "HF-197B Phase 0: branch hf-197-fingerprint-composition-drift exists with
             <N> commits. Cannot unambiguously determine prior work scope. Awaiting
             architect direction on (a) reuse-and-rewrite, (b) abandon-and-fresh-branch."

  0.5 Create selected branch:
      $ git checkout main
      $ git pull origin main
      $ git checkout -b hf-197b-per-sheet-cache-keying

  0.6 Confirm branch state:
      $ git rev-parse HEAD
      $ git rev-parse main
      Expected: HF-197B branch HEAD === main HEAD (73d52791 or current main).

═══════════════════════════════════════════════════════════════════════
PHASE α — Pre-implementation Verification (read-only, no commits)
═══════════════════════════════════════════════════════════════════════

  α.1 Schema verification (FP-49 guard):
      Author web/scripts/diag-hf-197b-schema-verify.ts:
        Use createServiceRoleClient or equivalent service-role pattern.
        Query information_schema.columns for table_name='structural_fingerprints'.
        Print column inventory.

      $ npx tsx web/scripts/diag-hf-197b-schema-verify.ts

      PASTE: column inventory.

      Verify: structural_fingerprints has columns id, tenant_id, fingerprint,
        fingerprint_hash, classification_result, column_roles, match_count,
        confidence, source_file_sample, created_at, updated_at, import_batch_id.
      If schema diverges from expected: HALT.

      Delete script after pasting (no commit).

  α.2 Pre-implementation grep (locate all six defect points):
      $ grep -rn 'computeFingerprintHashSync\|fingerprintHash =' web/src/lib/sci/ web/src/app/api/ --include='*.ts'
      $ grep -rn 'lookupFingerprint(' web/src --include='*.ts' -A 3
      $ grep -rn 'writeFingerprint(' web/src --include='*.ts' -A 3
      $ grep -rn 'primarySheet\|sheets\[0\]' web/src/app/api/import/sci/ --include='*.ts'
      $ grep -rn 'fingerprintMap' web/src --include='*.ts'

      PASTE: all matches with file:line:context.

      Verify: at least the following sites surface (per DIAG-021):
        - web/src/lib/sci/structural-fingerprint.ts (computeFingerprintHashSync)
        - web/src/lib/sci/fingerprint-flywheel.ts (lookupFingerprint, writeFingerprint)
        - web/src/app/api/import/sci/analyze/route.ts (line ~109 lookup, ~147 inject,
          ~174 log, ~392-421 write iteration)
        - web/src/app/api/import/sci/process-job/route.ts (line ~115 lookup,
          ~293-304 write iteration)
        - HF-094 fingerprintMap reference (use existing per-content-unit map)

      If grep does NOT surface these sites: HALT (defect locus mismatch with DIAG-021).

  α.3 Build clean baseline:
      $ cd web && rm -rf .next && npm run build 2>&1 | tail -30

      PASTE: tail. Must succeed (exit 0).

═══════════════════════════════════════════════════════════════════════
PHASE β — structural-fingerprint.ts (no changes expected)
═══════════════════════════════════════════════════════════════════════

  Per DIAG-021 H1 disconfirmation, the algorithm is correct as-is. Confirm by
  inspection that the algorithm hashes column-list + types + ratios per sheet
  (no sheet-identity inputs, no tenant-identity inputs). This is intentional —
  cross-tenant Tier 2 matching depends on tenant-agnostic structural hashes.

  β.1 Read computeFingerprintHashSync verbatim:
      $ sed -n '/computeFingerprintHashSync/,/^}/p' web/src/lib/sci/structural-fingerprint.ts

      PASTE: function. Confirm no changes needed.

  β.2 No commit in this phase (algorithm unchanged).

═══════════════════════════════════════════════════════════════════════
PHASE γ — fingerprint-flywheel.ts (no changes expected)
═══════════════════════════════════════════════════════════════════════

  Per DIAG-021 H2 disconfirmation, lookupFingerprint and writeFingerprint are
  correct as-is. The Tier 1 query is strict; the writeFingerprint UPDATE path
  has HF-145 optimistic locking. Both modules accept (tenantId, columns, sampleRows)
  and compute their own internal hash — they do not impose per-file or per-sheet
  semantic; the CALLER chooses what to pass.

  γ.1 Read lookupFingerprint and writeFingerprint verbatim:
      $ sed -n '/^export async function lookupFingerprint/,/^}/p' web/src/lib/sci/fingerprint-flywheel.ts
      $ sed -n '/^export async function writeFingerprint/,/^}/p' web/src/lib/sci/fingerprint-flywheel.ts

      PASTE: both functions. Confirm no changes needed at module layer.

  γ.2 No commit in this phase (module unchanged).

═══════════════════════════════════════════════════════════════════════
PHASE δ — analyze/route.ts (PRIMARY FIX SITE 1)
═══════════════════════════════════════════════════════════════════════

  δ.1 Read current state of analyze/route.ts in the regions DIAG-021 identified:
      $ sed -n '100,180p' web/src/app/api/import/sci/analyze/route.ts
      $ sed -n '385,430p' web/src/app/api/import/sci/analyze/route.ts

      PASTE: both regions verbatim.

  δ.2 Implement per-sheet keying at READ surface:

      Current pattern (per DIAG-021 :109):
        const primarySheet = file.sheets[0];
        const flywheelResult = await lookupFingerprint(
          tenantId, primarySheet.columns, primarySheet.rows, ...
        );

      New pattern: lookup is performed PER SHEET, not per file. The per-content-unit
      fingerprintMap (HF-094) is the existing machinery. Each sheet's lookup uses
      that sheet's columns/rows, and the result applies ONLY to that sheet.

      Restructure:
        // For each sheet/content unit, perform per-sheet lookup
        const sheetFlywheelResults = new Map<string, FlywheelLookupResult>();

        for (let tabIndex = 0; tabIndex < file.sheets.length; tabIndex++) {
          const sheet = file.sheets[tabIndex];
          try {
            const result = await lookupFingerprint(
              tenantId,
              sheet.columns,
              sheet.rows,
              process.env.NEXT_PUBLIC_SUPABASE_URL!,
              process.env.SUPABASE_SERVICE_ROLE_KEY!,
            );
            sheetFlywheelResults.set(sheet.sheetName, result);

            console.log(
              `[SCI-FINGERPRINT] sheet=${sheet.sheetName} ` +
              `fingerprint=${result.fingerprintHash.substring(0, 12)} ` +
              `tier=${result.tier} match=${result.match} ` +
              `confidence=${result.confidence}`
            );
          } catch (fpErr) {
            console.warn(
              `[SCI-FINGERPRINT] Lookup failed for sheet=${sheet.sheetName} ` +
              `(non-blocking): ${fpErr instanceof Error ? fpErr.message : 'unknown'}`
            );
            sheetFlywheelResults.set(sheet.sheetName, null as unknown as FlywheelLookupResult);
          }
        }

      Tier 1 injection (per DIAG-021 :147 — was injecting into file.sheets[0]):
        Replace per-file injection with per-sheet injection.
        For each sheet whose flywheel result is Tier 1 match, inject that sheet's
        cached fieldBindings into THAT sheet's profile (not into sheets[0]).

        Updated injection log line:
          console.log(
            `[SCI-FINGERPRINT] Tier 1: injected ${cached.fieldBindings.length} ` +
            `fieldBindings from flywheel into ${sheet.sheetName}`
          );

      Skip-HC logic (per AUD-001 audit, current code uses
        const skipHC = flywheelResult?.tier === 1 && flywheelResult.match):
        Becomes per-sheet:
          const sheetSkipHC = (sheetName: string) => {
            const r = sheetFlywheelResults.get(sheetName);
            return r?.tier === 1 && r.match;
          };
        And HC enhancement is filtered to only the sheets where Tier 1 didn't hit:
          const sheetsNeedingHC = file.sheets.filter(s => !sheetSkipHC(s.sheetName));
          if (sheetsNeedingHC.length > 0) {
            await enhanceWithHeaderComprehension(
              profileMap,
              sheetsNeedingHC.map(s => ({ ... })),
              tenantId,
            );
          }

  δ.3 Implement per-sheet keying at WRITE surface (per DIAG-021 :392-421):

      Current pattern (last-write-wins under H(sheets[0])):
        for (const unit of contentUnits) {
          // ... classification ...
          await writeFingerprint(
            tenantId,
            file.sheets[0].columns,    ← BUG: always sheets[0]
            file.sheets[0].rows,        ← BUG: always sheets[0]
            classificationResult,
            columnRoles,
            ...
          );
        }

      New pattern: each unit writes its OWN sheet's hash:
        for (const unit of contentUnits) {
          const sheetForUnit = file.sheets.find(s => s.sheetName === unit.sheetName);
          if (!sheetForUnit) {
            console.warn(`[SCI-FINGERPRINT] Could not locate sheet for unit ${unit.sheetName}`);
            continue;
          }
          // ... classification ...
          await writeFingerprint(
            tenantId,
            sheetForUnit.columns,        ← per-sheet
            sheetForUnit.rows,           ← per-sheet
            classificationResult,
            columnRoles,
            ...
          );
        }

      The classification_result.tabName field that gets persisted now correctly
      reflects the unit's actual sheet (not last-write-wins).

  δ.4 Build verification:
      $ cd web && rm -rf .next && npm run build 2>&1 | tail -30
      PASTE: tail. Must succeed.

  δ.5 Lint verification:
      $ cd web && npm run lint 2>&1 | tail -20
      PASTE: tail. No NEW errors introduced by HF-197B (pre-existing OK).

  δ.6 Commit:
      $ git add web/src/app/api/import/sci/analyze/route.ts
      $ git commit -m 'HF-197B Phase δ: per-sheet keying at analyze/route.ts read+write call sites'

═══════════════════════════════════════════════════════════════════════
PHASE ε — process-job/route.ts (PRIMARY FIX SITE 2)
═══════════════════════════════════════════════════════════════════════

  ε.1 Read current state in regions DIAG-021 identified:
      $ sed -n '105,135p' web/src/app/api/import/sci/process-job/route.ts
      $ sed -n '285,315p' web/src/app/api/import/sci/process-job/route.ts

      PASTE: both regions verbatim.

  ε.2 Implement per-sheet keying at READ surface (per DIAG-021 :115):

      Current pattern:
        const primarySheet = sheets[0];
        const fingerprintHash = primarySheet
          ? computeFingerprintHashSync(primarySheet.columns, primarySheet.rows)
          : '';
        // ... lookup at fingerprintHash ...

      New pattern: per-sheet lookup, same shape as Phase δ:
        const sheetFlywheelResults = new Map<string, FlywheelLookupResult>();

        for (let tabIndex = 0; tabIndex < sheets.length; tabIndex++) {
          const sheet = sheets[tabIndex];
          try {
            const result = await lookupFingerprint(
              tenantId, sheet.columns, sheet.rows,
              process.env.NEXT_PUBLIC_SUPABASE_URL!,
              process.env.SUPABASE_SERVICE_ROLE_KEY!,
            );
            sheetFlywheelResults.set(sheet.sheetName, result);
          } catch (fpErr) {
            console.warn(`[SCI-WORKER] Flywheel lookup failed for sheet=${sheet.sheetName}:`, fpErr);
          }
        }

      The recognitionTier per-job tracking (used by skipHC logic) becomes per-sheet:
        const sheetTier = (sheetName: string) => {
          return sheetFlywheelResults.get(sheetName)?.tier ?? 3;
        };

      Update processing_jobs.structural_fingerprint update: store the primary sheet's
      fingerprint for backwards compatibility with any downstream consumer that reads
      a single fingerprint per job. The per-sheet hashes are not persisted at the job
      level (they're persisted as separate structural_fingerprints rows by Phase ε.3
      writes). This preserves the single-fingerprint contract at the job-row level
      while making per-sheet caching operative at the flywheel level.

      $ grep -rn 'structural_fingerprint:' web/src --include='*.ts'
      PASTE: matches. Confirm no consumer expects per-sheet fingerprints from the
      processing_jobs table; if so, that's a separate question for architect.

  ε.3 Implement per-sheet keying at WRITE surface (per DIAG-021 :293-304):

      Same pattern as Phase δ.3 — each unit's writeFingerprint call uses
      sheetForUnit.columns and sheetForUnit.rows, not primarySheet's.

  ε.4 Build verification:
      $ cd web && rm -rf .next && npm run build 2>&1 | tail -30
      PASTE: tail. Must succeed.

  ε.5 Lint verification:
      $ cd web && npm run lint 2>&1 | tail -20
      PASTE: tail. No new errors.

  ε.6 Commit:
      $ git add web/src/app/api/import/sci/process-job/route.ts
      $ git commit -m 'HF-197B Phase ε: per-sheet keying at process-job/route.ts read+write call sites'

═══════════════════════════════════════════════════════════════════════
PHASE ζ — Verification Probe (in-memory, no DB writes)
═══════════════════════════════════════════════════════════════════════

  ζ.1 Author web/scripts/diag-hf-197b-per-sheet-keying-verify.ts:

      Construct two synthetic single-file workbooks IN-MEMORY (no DB writes):
        Workbook A: 3 sheets [SheetX (3 cols numeric), SheetY (5 cols mixed),
          SheetZ (2 cols text)]
        Generic synthetic names — no Spanish-language Meridian names. Korean Test
        compliance.

      For each sheet in Workbook A:
        sheetHash[i] = computeFingerprintHashSync(sheet.columns, sheet.rows)

      ASSERT (Korean Test compliance):
        - sheetHash[X] !== sheetHash[Y]  (different shapes → different hashes)
        - sheetHash[Y] !== sheetHash[Z]
        - sheetHash[X] !== sheetHash[Z]

      Re-create Workbook A as Workbook B (same shapes):
        For each sheet in Workbook B:
          sheetHashB[i] = computeFingerprintHashSync(sheet.columns, sheet.rows)
        ASSERT:
          - sheetHashB[i] === sheetHash[i] for each i (same shape → same hash)

      Output verbatim assertion results. All assertions PASS.

      $ npx tsx web/scripts/diag-hf-197b-per-sheet-keying-verify.ts
      PASTE: full output.

  ζ.2 Build/lint/test final pass:
      $ cd web && rm -rf .next && npm run build 2>&1 | tail -20
      $ cd web && npm run lint 2>&1 | tail -20
      $ cd web && npm test -- structural-fingerprint fingerprint-flywheel 2>&1 | tail -30

      PASTE: all three. Build succeeds. Lint clean (HF-197B-introduced). Tests green.

  ζ.3 Commit verification probe:
      $ git add web/scripts/diag-hf-197b-per-sheet-keying-verify.ts
      $ git commit -m 'HF-197B Phase ζ: verification probe (in-memory, Korean-Test-clean)'

═══════════════════════════════════════════════════════════════════════
PHASE η — Completion Report (Rule 25 first-deliverable)
═══════════════════════════════════════════════════════════════════════

  Per Rule 25, completion report is the FIRST deliverable, not the last. Create
  it BEFORE final PR push.

  η.1 Author docs/completion-reports/HF-197B_Per_Sheet_Cache_Keying_COMPLETION_REPORT.md

      Required sections (in order):

      # HF-197B — Per-Sheet Cache Keying — COMPLETION REPORT

      ## 1. Summary
      One paragraph: defect class (cross-sheet binding injection), evidence anchor
      (DIAG-021), fix shape (per-sheet keying at six caller-surface points across
      two route files), scope (code-only — architect performed clean slate).

      ## 2. Substrate citation
      DIAG-021 report path. H3+H4 verdicts. Phase 5 substrate evidence.

      ## 3. Branch state at start
      Phase 0 output verbatim. Path selected (A or B). Branch HEAD vs main HEAD.

      ## 4. Evidentiary Gates
      - α.1 schema verify output verbatim
      - α.2 grep output verbatim (six defect points located)
      - α.3 build clean baseline output

      ## 5. Phase Outputs (β through ζ)
      Per phase: commit SHA, one-paragraph summary, pasted build/lint/test outputs.

      ## 6. Verification Probe Output
      ζ.1 in-memory probe output verbatim. All Korean-Test assertions PASS.

      ## 7. Final Build/Lint/Test
      ζ.2 outputs verbatim.

      ## 8. Architect Handoff
        - Architect performed clean slate before HF-197B (substrate empty for Meridian)
        - Browser verification (architect-only, SR-44):
            1. Re-import Meridian fresh (data-only file or full benchmark)
            2. Verify Vercel logs show:
               - One [SCI-FINGERPRINT] line per sheet (not just sheets[0])
               - Tier 3 LLM runs on first encounter for each sheet
               - On second encounter, [SCI-FINGERPRINT] sheet=<X> tier=1 match=true for
                 each sheet whose hash was previously cached
               - [SCI-FINGERPRINT] Tier 1: injected N fieldBindings from flywheel into
                 <correct sheet name> (not always sheets[0])
            3. Query structural_fingerprints WHERE tenant_id=meridian — should produce
               N rows (one per sheet shape) post-second-import, not 1
            4. Entity resolution succeeds: distinct_entity_ids matches expected 67
        - Production sign-off: post-merge, observe production logs for next real import

      ## 9. Out-of-Scope Items (Carry Forward)
        - Plan tier extraction defect ("no tiers" on every component)
        - Resultados_Esperados ingested as transaction data
        - Period auto-detect failure (CLT-197 finding)
        - Storage object orphan cleanup
        - field_identities substrate question
        - Tier 2 (cross-tenant) composition awareness
        - Self-correction cycle audit (DS-017 §4.3) — flagged for separate diagnostic;
          may resolve naturally with per-sheet signal coherence

      ## 10. Compliance
        - Rule 29 (CC paste LAST): observed in originating prompt
        - Rule 25 (Completion Report First): observed (this section)
        - Korean Test (AP-25): per-sheet hash uses structural inputs only
        - Decision 64: no new signal table; no signals emitted by HF-197B
        - Decision 152: import sequence not gated on flywheel state
        - Decision 153/154: no plan-agent intelligence touched
        - HF-094: per-content-unit fingerprintMap honored
        - HF-145: optimistic locking preserved on UPDATE path
        - HF-095/HF-186/HF-196: HC primacy chain unchanged
        - HF-110: resolver fallback chain unchanged
        - SR-34: structural fix only; no bypass
        - SR-39: N/A
        - SR-44: browser verification clearly delineated as architect-only
        - FP-49: schema verified before any SQL drafted (α.1)
        - FP-80: every PASS claim has pasted evidence
        - FP-81: multi-layer defect (read+write at two route files) addressed atomically

      ## 11. Version Control
        - Branch: hf-197b-per-sheet-cache-keying (Phase 0 disposition)
        - Commit timeline: phases δ, ε, ζ, η committed sequentially
        - Tag at merge: NO (architect dispositions tag at next version-anchor session)
        - PR target: main
        - PR URL: <inserted post-creation>

  η.2 Commit completion report (BEFORE final PR push):
      $ git add docs/completion-reports/HF-197B_Per_Sheet_Cache_Keying_COMPLETION_REPORT.md
      $ git commit -m 'HF-197B Phase η: completion report (Rule 25 first-deliverable)'

═══════════════════════════════════════════════════════════════════════
PHASE θ — Push + PR
═══════════════════════════════════════════════════════════════════════

  θ.1 Push branch and create PR:
      $ git push -u origin hf-197b-per-sheet-cache-keying

      $ gh pr create --base main --head hf-197b-per-sheet-cache-keying \
          --title 'HF-197B: Per-sheet cache keying — fixes wrong-sheet binding injection at flywheel caller surface' \
          --body "$(cat <<'BODY'
## Summary
Cross-sheet binding injection at fingerprint flywheel caller surface. Both reads
(analyze/route.ts:109, process-job/route.ts:115) and writes (analyze/route.ts:392-421,
process-job/route.ts:293-304) keyed on H(sheets[0]) regardless of which sheet was
being classified. Multi-sheet writes converged on a single cache row (last-write-wins);
re-encounter injected wrong-sheet bindings into sheets[0]. Fix: per-sheet keying at
all six caller-surface points; per-sheet lookup, per-sheet write, per-sheet injection
target.

## Evidence anchor
DIAG-021 disambiguation report:
docs/diagnostic-reports/DIAG-021_Fingerprint_Cache_Match_Mechanism.md
H3 (read path uses wrong sheet) and H4 (write path stores under wrong sheet's metadata)
SUPPORTED. Phase 5 substrate evidence: exactly ONE Meridian-tenant cache row containing
Datos_Flota_Hub bindings under Plantilla's hash, last-write-wins.

## Scope
- analyze/route.ts: per-sheet read + per-sheet write (6 line-region changes)
- process-job/route.ts: per-sheet read + per-sheet write (6 line-region changes)
- Module layer (structural-fingerprint.ts, fingerprint-flywheel.ts): NO CHANGES
- Schema layer: NO CHANGES (architect performed clean slate)
- Other surfaces (HC chain, resolver, plan tier, etc.): UNTOUCHED

## Out of scope (carry forward)
See completion report Section 9.

## Architectural realignment
Per DS-016/017 spec semantic — fingerprint flywheel is per-fingerprint, per-shape.
Per-sheet keying brings implementation back into alignment with stated DS-017 §3.1
(Tier 1 = same-tenant exact fingerprint match) and §4.3 (per-fingerprint confidence
progression).

## Substrate citation
DIAG-021 (uploaded), AUD-001 SCI Pipeline Code Extraction, DS-016/017, HF-094
fingerprintMap, HF-145 optimistic locking, HF-095/HF-186/HF-196 HC primacy chain,
HF-110 resolver fallback chain.

## See completion report
docs/completion-reports/HF-197B_Per_Sheet_Cache_Keying_COMPLETION_REPORT.md
BODY
)"

      PASTE: PR URL.

  θ.2 STOP. Architect performs:
        - Browser verification per completion report §8
        - Production sign-off
        - PR merge

      Final output to architect verbatim:
        "HF-197B implementation complete. PR: <URL>. Awaiting architect:
         (1) Browser verification per completion report §8
         (2) Production sign-off
         (3) PR merge"

OUT OF SCOPE FOR HF-197B (do not touch):
  - Module-layer code (structural-fingerprint.ts, fingerprint-flywheel.ts) — correct
    in isolation per DIAG-021
  - Algorithm changes — algorithm is correct
  - Schema changes — architect performed clean slate; no migration needed
  - HC primacy chain (HF-095/HF-186/HF-196) — unrelated surface
  - Resolver chain (HF-110) — downstream of this defect; unchanged
  - Plan tier extraction defect — separate
  - Resultados_Esperados as transaction — separate
  - Period auto-detect failure — separate
  - Storage object orphan cleanup — separate
  - Tier 2 cross-tenant composition awareness — deferred
  - Self-correction cycle audit (DS-017 §4.3) — flagged carry-forward; possibly
    resolved by per-sheet signal coherence; verify post-HF-197B before declaring
    a separate finding
  These remain open carry-forward.

REPORTING DISCIPLINE:
  - No PASS claims without pasted evidence (FP-80 guard)
  - Completion report file must exist BEFORE final PR push (Rule 25)
  - All architect-only steps clearly delineated in completion report §8
  - No SQL execution by CC (architect performed clean slate; no migration)
  - HALT at the six conditions listed at top of prompt; otherwise CONTINUOUS

END OF CC PROMPT.
```
