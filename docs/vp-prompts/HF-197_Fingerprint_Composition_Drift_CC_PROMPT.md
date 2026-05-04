# HF-197 — Fingerprint-Cache Composition Drift — CC Implementation Prompt

**Architect-to-architect content above CC paste block. CC paste block is LAST (Rule 29). Nothing follows.**

---

## Architect context (NOT part of CC prompt)

**Sequence:** HF-197 (next in VP sequence; HF-196 closed 2026-05-03 SHA `73d52791`)
**Defect class:** Cache-Key Indeterminacy at fingerprint flywheel read path
**Live evidence anchor:** Meridian re-import 2026-05-04 02:33 — same hash `c6f13c61a05e` served two structurally different workbooks (5-sheet `Meridian_Logistics_Benchmark.xlsx`, 3-sheet `Meridian_Datos_Q1_2025.xlsx`). Tier 1 cache hit injected wrong-sheet bindings; entity resolution degraded 505 rows linked → 67.
**Design source:** `HF_FINGERPRINT_CACHE_KEY_COLLISION_DESIGN_SPEC.md` (this conversation, 2026-05-04)
**Design dispositions locked at draft (defaults from spec §9):**
1. Composition signature: `SHA-256(sheetCount + '|' + sortedSheetNames + '|' + sortedSheetHashes)`
2. Drift action: demote to Tier 3 (full re-classify)
3. User surface: log + classification_signal (Decision 64 shared surface) + agent_inbox row
4. Sequence: HF-197
5. Scope: workbook-level only (no tenant-historical state)

**Verification anchor (architect-channel only — NOT in CC prompt):** Meridian Q1 2025 ground truth MX$185,063. CC reports calculated values verbatim only.

**Routing per capability-first:**
- CC executes: code edits, schema migration drafting (file-only), tsx-script verification, build/lint/grep, commit/push, PR creation
- Architect executes: SQL Editor migration application (VP), browser verification (SR-44), CC keychain, `gh pr create/merge`, production sign-off

---

## Pre-paste readiness (architect performs before paste)

- [ ] Branch `hf-197-fingerprint-composition-drift` created from `main` (HEAD = `73d52791`)
- [ ] Localhost running, `dev` server up
- [ ] Meridian tenant exists (`5035b1e8-0754-4527-b7ec-9f93f85e4c79`) with sufficient state to verify drift detection (or architect ready to re-clean for verification)
- [ ] CC keychain authenticated
- [ ] Architect ready to apply migration via Supabase Dashboard SQL Editor on cue (Phase α)

---

## CC PASTE BLOCK — paste verbatim into Claude Code below this line

```
HF-197: Fingerprint-Cache Composition Drift — Implementation

Branch: hf-197-fingerprint-composition-drift (architect created from main 73d52791)

ROLE: Implementation. Architect designed; you implement against locked design.

LOCKED DESIGN: The fingerprint flywheel cache key (single first-sheet hash) cannot
distinguish multi-sheet workbook composition. Two workbooks with matching first
sheets but different sheet sets collide on Tier 1 cache hit and serve each other's
cached bindings. Fix: augment cache key with composition_signature (workbook-level);
demote to Tier 3 when composition drift detected; surface hard warning via log +
classification_signal + agent_inbox. Cache memory preserved.

CC STANDING ARCHITECTURE RULES (operative; do not violate):
  - Read CC_STANDING_ARCHITECTURE_RULES.md before any code change; obey v2.1 rules
  - Architecture Decision Gate: if any locked decision is unclear, halt and ask architect
  - Korean Test (AP-25): no language-specific or domain-specific string literals in
    foundational code; composition signature uses sheet count, sorted names, sorted
    structural hashes only
  - Decision 64: signals on classification_signals shared surface ONLY; no new signal
    table; no separate signal_type prefix that violates the agent_activity:* /
    classification:* / comprehension:* / convergence:* vocabulary
  - Decision 152: do not gate import sequence on flywheel state
  - HF-145: preserve optimistic locking on writeFingerprint UPDATE path (match_count
    optimistic check)
  - SR-34 No Bypass: structural fix only; no reduced-scope tests, no workarounds, no
    interim measures, no alternative paths around blockers
  - SR-39 Compliance Verification Gate: this HF does not touch auth/session/access/
    encryption/storage. SR-39 N/A. Confirm and continue.
  - SR-44: browser verification is architect-only; do not assert browser state
  - Rule 25 (Completion Report Enforcement): the completion report file is the FIRST
    deliverable, not the last. Created BEFORE final build verification, then appended.

EVIDENTIARY GATES (every gate requires PASTED EVIDENCE — pasted code, pasted terminal
output, or pasted query result. PASS/FAIL self-attestation REJECTED. FP-80 false PASS
without evidence is unacceptable.):

  GATE-1: Schema Verification Gate (FP-49 guard — query live schema before any SQL)
    Author web/scripts/diag-hf-197-schema-verify.ts (one-shot; do not commit, delete
    after PASTE):

      Use createServiceRoleClient from @/lib/supabase/server (or equivalent service-role
      client per codebase convention). Query information_schema.columns for
      structural_fingerprints. Output column inventory.

    $ npx tsx scripts/diag-hf-197-schema-verify.ts

    PASTE: full column inventory output. Confirm composition_signature DOES NOT yet
    exist (it will be added in Phase α). If composition_signature already exists,
    HALT — surface to architect; do not proceed.

  GATE-2: Pre-implementation grep
    $ grep -rn 'computeFingerprintHashSync' web/src --include='*.ts'
    $ grep -rn 'lookupFingerprint' web/src --include='*.ts'
    $ grep -rn 'writeFingerprint' web/src --include='*.ts'

    PASTE: every match with file:line:context. Identify ALL call sites that need to
    pass composition_signature. Expected sites per AUD-001 audit: at minimum
    web/src/app/api/import/sci/analyze/route.ts and web/src/lib/sci/sci-worker.ts (or
    equivalent worker file). If grep surfaces additional callers, list them — they
    must all be updated in Phase γ.

  GATE-3: Build clean baseline (pre-implementation)
    $ cd web && rm -rf .next && npm run build 2>&1 | tail -30

    PASTE: tail. Must end successfully (exit 0). If main is broken at HEAD 73d52791,
    HALT and surface — do not proceed on broken main.

PHASE α — SCHEMA MIGRATION (file-only; architect applies via Dashboard SQL Editor)

  α.1 Author migration file:
    Path: web/migrations/<timestamp>_hf_197_fingerprint_composition_drift.sql
    Replace <timestamp> with current epoch milliseconds following existing migration
    convention in web/migrations/. Use ls web/migrations/ | tail -3 to inspect convention.

    Migration content (verbatim):

      -- HF-197 — Fingerprint Cache Composition Drift
      -- Adds composition_signature column to structural_fingerprints
      -- Backward-compatible: column nullable; pre-existing rows untouched

      ALTER TABLE structural_fingerprints
        ADD COLUMN composition_signature TEXT;

      CREATE INDEX IF NOT EXISTS idx_structural_fingerprints_composition
        ON structural_fingerprints (tenant_id, fingerprint_hash, composition_signature);

      COMMENT ON COLUMN structural_fingerprints.composition_signature IS
        'HF-197: SHA-256 of workbook composition (sheetCount + sortedSheetNames + '
        'sortedSheetHashes). NULL for pre-HF rows and single-sheet files (degenerate '
        'case). Cache key is (tenant_id, fingerprint_hash, composition_signature) when '
        'composition_signature is present.';

  α.2 Commit migration file (no execution — file-only):
    $ git add web/migrations/<timestamp>_hf_197_fingerprint_composition_drift.sql
    $ git commit -m 'HF-197 Phase α: schema migration for composition_signature (file-only; architect applies)'

  α.3 STOP. Do NOT apply migration. Architect applies via Supabase Dashboard SQL Editor.

  Output to architect verbatim:
    "HF-197 Phase α: migration committed at <full path>. AWAITING ARCHITECT APPLICATION
     via Supabase Dashboard SQL Editor. Will not proceed to Phase β until architect
     confirms migration applied successfully."

  Wait for architect "proceed" before Phase β.

PHASE β — COMPUTE PATH (composition signature implementation)

  Architect must have confirmed Phase α migration applied before β starts.

  β.1 Add composeCompositionSignature function to web/src/lib/sci/structural-fingerprint.ts:

      export function computeCompositionSignature(
        sheets: Array<{
          sheetName: string;
          columns: string[];
          rows: Record<string, unknown>[];
        }>,
      ): string

      Algorithm:
        1. If sheets.length === 0, return ''  (empty workbook degenerate)
        2. If sheets.length === 1, return computeFingerprintHashSync(sheets[0].columns, sheets[0].rows)
           (single-sheet degenerate — preserves existing behavior; cache key collapses
           to primary fingerprint when only one sheet)
        3. Otherwise:
           a. For each sheet i: sheetHashes[i] = computeFingerprintHashSync(sheets[i].columns, sheets[i].rows)
           b. sortedSheetNames = sheets.map(s => s.sheetName).sort()
           c. sortedSheetHashes = sheetHashes.slice().sort()  (lexical sort on hash strings)
           d. payload = `${sheets.length}|${sortedSheetNames.join(',')}|${sortedSheetHashes.join(',')}`
           e. Return SHA-256(payload) using same hash util as computeFingerprintHashSync

      Korean Test compliance: function uses sheet count, sheet names as opaque
      strings, and per-sheet structural hashes only. No language- or domain-specific
      literals.

  β.2 Add unit tests at web/src/lib/sci/structural-fingerprint.test.ts (extend existing file):

      Test cases (each with explicit assertion):
        - empty workbook: composition_signature === ''
        - single-sheet workbook: composition_signature === primary fingerprint hash
        - multi-sheet workbook: composition_signature !== first-sheet hash
        - two workbooks differing only in sheet order: SAME composition_signature
        - two workbooks differing in sheet count: DIFFERENT composition_signature
        - two workbooks differing in one sheet's column structure: DIFFERENT composition_signature
        - Meridian replay: 5-sheet [Plantilla, Datos_Rendimiento, Datos_Flota_Hub,
          Plan_Incentivos, Resultados_Esperados] vs 3-sheet [Plantilla,
          Datos_Rendimiento, Datos_Flota_Hub] (same first-sheet columns) →
          DIFFERENT composition_signature

      Run:
        $ cd web && npm test -- structural-fingerprint
      PASTE: full test output, all green.

  β.3 Build verification:
        $ cd web && rm -rf .next && npm run build 2>&1 | tail -20
      PASTE: tail. Must succeed.

  β.4 Commit:
        $ git add web/src/lib/sci/structural-fingerprint.ts web/src/lib/sci/structural-fingerprint.test.ts
        $ git commit -m 'HF-197 Phase β: computeCompositionSignature + unit tests'

PHASE γ — READ PATH (composition-aware lookupFingerprint + drift detection)

  γ.1 Modify web/src/lib/sci/fingerprint-flywheel.ts:

      Update FlywheelLookupResult interface:
        export interface FlywheelLookupResult {
          tier: 1 | 2 | 3;
          match: boolean;
          fingerprintHash: string;
          classificationResult: Record<string, unknown> | null;
          columnRoles: Record<string, string> | null;
          confidence: number;
          matchCount: number;
          // ADDED HF-197:
          compositionDrift?: boolean;
          priorCompositionSignature?: string | null;
          currentCompositionSignature?: string;
        }

      Update lookupFingerprint signature — add optional compositionSignature parameter
      AT END to preserve backward compatibility for any callers not yet updated:
        export async function lookupFingerprint(
          tenantId: string,
          columns: string[],
          sampleRows: Record<string, unknown>[],
          supabaseUrl: string,
          supabaseServiceKey: string,
          compositionSignature?: string,  // ADDED HF-197
        ): Promise<FlywheelLookupResult>

      Updated Tier 1 logic (replaces existing Tier 1 query):
        a. Compute primary fingerprintHash via computeFingerprintHashSync (existing)
        b. If compositionSignature is provided AND not equal to primary fingerprintHash
           (i.e., multi-sheet case):
              Query for exact (fingerprint_hash, composition_signature) match:
                .eq('tenant_id', tenantId)
                .eq('fingerprint_hash', fingerprintHash)
                .eq('composition_signature', compositionSignature)
              If found AND confidence >= 0.5: return Tier 1 (composition match — FULL CACHE HIT)
              If no exact match, query for primary fingerprint with DIFFERENT
              composition_signature (or NULL):
                .eq('tenant_id', tenantId)
                .eq('fingerprint_hash', fingerprintHash)
              If found: COMPOSITION DRIFT detected.
                Log: '[SCI-FINGERPRINT-DRIFT] Composition drift detected: hash=' +
                  fingerprintHash.substring(0, 12) + ' tenant=' + tenantId +
                  ' prior_composition=' + (prior.composition_signature || 'null').substring(0, 12) +
                  ' current_composition=' + compositionSignature.substring(0, 12) +
                  ' action=tier_demoted_to_3 reason=workbook_composition_mismatch'
                Return: {
                  tier: 3, match: false, fingerprintHash,
                  classificationResult: null, columnRoles: null,
                  confidence: 0, matchCount: 0,
                  compositionDrift: true,
                  priorCompositionSignature: prior.composition_signature,
                  currentCompositionSignature: compositionSignature,
                }
              Otherwise (no fingerprint match at all): proceed to Tier 2 (existing)
        c. If compositionSignature is undefined (legacy caller — single-sheet pipeline
           that has not been updated): preserve existing Tier 1 behavior — query by
           fingerprint_hash only. Log a one-time warning per process startup that a
           caller has not been updated. This guarantees zero regression for any
           still-undefined caller.

      Tier 2 (foundational, cross-tenant) and Tier 3 logic: unchanged in this phase.
      Tier 2 composition-awareness deferred — single-tenant Tier 1 fix is the proven
      defect; cross-tenant composition handling is separate scope.

  γ.2 Update ALL caller sites identified in GATE-2 (typically the SCI analyze route
      and SCI worker). For each:

      Before lookupFingerprint call, compute composition signature using the file's
      sheets array (whatever shape the route passes — adapt to existing data structure):
        const compositionSignature = computeCompositionSignature(file.sheets);

      Pass compositionSignature to lookupFingerprint as the new 6th argument.

      Update the existing [SCI-FINGERPRINT] log line to include the composition
      signature prefix:
        console.log(
          `[SCI-FINGERPRINT] file=${file.fileName} ` +
          `fingerprint=${flywheelResult.fingerprintHash.substring(0, 12)} ` +
          `composition=${compositionSignature.substring(0, 12)} ` +
          `tier=${flywheelResult.tier} match=${flywheelResult.match} ` +
          `confidence=${flywheelResult.confidence}`
        );

  γ.3 Build verification:
      $ cd web && rm -rf .next && npm run build 2>&1 | tail -20
      PASTE: tail. Must succeed.

  γ.4 Commit:
      $ git add web/src/lib/sci/fingerprint-flywheel.ts <route files updated>
      $ git commit -m 'HF-197 Phase γ: composition-aware lookupFingerprint + drift detection'

PHASE δ — WRITE PATH (persist composition_signature)

  δ.1 Modify writeFingerprint in web/src/lib/sci/fingerprint-flywheel.ts:

      Add parameter (optional, at end):
        compositionSignature?: string

      INSERT path: include composition_signature column when provided; pass NULL when
      undefined. Preserves backward compatibility.

      UPDATE path: only update composition_signature when provided AND different from
      existing value. Preserve HF-145 optimistic locking on match_count (no change to
      that mechanism). Updated update payload:
        {
          match_count: newMatchCount,
          confidence: Number(newConfidence.toFixed(4)),
          classification_result: classificationResult,
          column_roles: columnRoles,
          composition_signature: compositionSignature ?? existing.composition_signature,
          updated_at: new Date().toISOString(),
        }

  δ.2 Update writeFingerprint call sites identified in GATE-2 to pass compositionSignature.

  δ.3 Build verification:
      $ cd web && rm -rf .next && npm run build 2>&1 | tail -20
      PASTE: tail. Must succeed.

  δ.4 Commit:
      $ git add web/src/lib/sci/fingerprint-flywheel.ts <route files>
      $ git commit -m 'HF-197 Phase δ: persist composition_signature on write path'

PHASE ε — SURFACE EMISSION (drift signal + agent_inbox notification)

  ε.1 Drift classification_signal (Decision 64 shared surface):

      In the lookupFingerprint COMPOSITION DRIFT branch, after the log line, write a
      classification signal using the existing classification signal write utility
      (do NOT introduce new write path; locate via grep for existing
      writeClassificationSignal or equivalent and use it):

        signal_type: 'classification:composition_drift'
        signal_data: {
          primary_fingerprint: <full hash>,
          prior_composition_signature: <prior or null>,
          current_composition_signature: <current>,
          action_taken: 'tier_demoted_to_3',
          tenant_id: <tenantId>,
        }

      Fire-and-forget try/catch — must NOT block lookup return path.

  ε.2 Agent inbox notification:

      Insert row into agent_inbox table:
        tenant_id: <tenantId>
        agent_id: 'sci-fingerprint-flywheel'
        type: 'import_drift'
        title: <see template below>
        description: <see template below>
        severity: 'warning'
        persona: 'admin'
        action_label: <see template below>
        action_url: '/operate/import'  (or current import route per codebase)

      Title template (built dynamically — no hardcoded language assumption):
        'File structure familiar but workbook composition differs'

      Description template (dynamic; pass file/sheet counts as variables):
        `${fileName} has the same primary structure as a previously imported file ` +
        `but ${currentSheetCount} sheets vs ${priorSheetCount} previously. ` +
        `Re-classifying all sheets to ensure correctness.`

      Action label:
        'Review classification'

      Inbox write must be fire-and-forget try/catch — failure must NOT block import.
      Use same error-swallowing pattern as existing writeFingerprint catch blocks.

  ε.3 Build verification:
      $ cd web && rm -rf .next && npm run build 2>&1 | tail -20
      PASTE: tail. Must succeed.

  ε.4 Commit:
      $ git add web/src/lib/sci/fingerprint-flywheel.ts
      $ git commit -m 'HF-197 Phase ε: drift signal + agent_inbox notification'

PHASE ζ — VERIFICATION (executable proof gates)

  ζ.1 Author web/scripts/diag-hf-197-composition-drift-verify.ts:
      Construct two synthetic workbooks IN-MEMORY (no DB writes):
        Workbook A: 3 sheets with names [SheetX, SheetY, SheetZ], identical column
          structure on SheetX
        Workbook B: 5 sheets with names [SheetX, SheetY, SheetZ, SheetW, SheetV],
          identical SheetX column structure as Workbook A

        Use generic synthetic sheet names (no Spanish-language Meridian names) to
        keep the verification probe Korean-Test-clean.

      Compute:
        primaryA = computeFingerprintHashSync(A.sheets[0].columns, A.sheets[0].rows)
        primaryB = computeFingerprintHashSync(B.sheets[0].columns, B.sheets[0].rows)
        compositionA = computeCompositionSignature(A.sheets)
        compositionB = computeCompositionSignature(B.sheets)

      Assert:
        ASSERT primaryA === primaryB  (same first sheet → same primary fingerprint)
        ASSERT compositionA !== compositionB  (different composition → different signature)
        ASSERT compositionA !== primaryA  (multi-sheet workbook composition differs from primary)
        ASSERT compositionB !== primaryB  (same)

      Output verbatim assertion results.

      Run:
        $ npx tsx scripts/diag-hf-197-composition-drift-verify.ts
      PASTE: full output. All four assertions PASS.

  ζ.2 Build clean (final):
      $ cd web && rm -rf .next && npm run build 2>&1 | tail -30
      PASTE: tail. Success.

  ζ.3 Lint clean:
      $ cd web && npm run lint 2>&1 | tail -20
      PASTE: tail. No errors introduced by HF-197.

  ζ.4 Test green:
      $ cd web && npm test -- structural-fingerprint fingerprint-flywheel 2>&1 | tail -30
      PASTE: tail. All green.

  ζ.5 Commit verification artifacts:
      $ git add web/scripts/diag-hf-197-composition-drift-verify.ts
      $ git commit -m 'HF-197 Phase ζ: verification probe + executable assertions'

PHASE η — COMPLETION REPORT FIRST (Rule 25 enforcement)

  Per Rule 25 (Completion Report Enforcement), the completion report file is the
  FIRST deliverable, NOT the last. Create it BEFORE final PR commit.

  η.1 Author docs/completion-reports/HF-197_Fingerprint_Composition_Drift_COMPLETION_REPORT.md

      Required sections (in order):

      # HF-197 — Fingerprint-Cache Composition Drift — COMPLETION REPORT

      ## 1. Summary
      One paragraph: defect class, fix shape, evidence anchor, scope.

      ## 2. Evidentiary Gates
      Verbatim paste of GATE-1 schema verify output, GATE-2 grep output, GATE-3 build
      baseline output.

      ## 3. Phase Outputs
      Per phase α-ζ:
        - Commit SHA (paste from git log)
        - One-paragraph summary of what shipped
        - Pasted build/test/lint output for that phase

      ## 4. Verification Probe Output
      Verbatim paste of ζ.1 diag script output (all four assertions PASS).

      ## 5. Final Verification
      ζ.2 build, ζ.3 lint, ζ.4 test outputs verbatim.

      ## 6. Architect Handoff
        - Phase α migration: <path> (architect must apply via Supabase Dashboard SQL
          Editor before Phase β through ζ are operationally meaningful — but
          implementation is committed regardless)
        - Browser verification (architect-only, SR-44):
            1. Re-import Meridian Benchmark.xlsx (5 sheets) — first import, Tier 3
            2. Re-import Meridian Datos_Q1_2025.xlsx (3 sheets) — should Tier-3 demote
               with [SCI-FINGERPRINT-DRIFT] log line, classification signal written,
               agent_inbox row created
            3. Verify agent_inbox row visible to admin persona
            4. Verify entity resolution behaves correctly (HC primacy operative; no
               fallback to Mes/Cuentas_Nuevas as identifier candidates)
        - Production sign-off: post-merge, observe production logs for
          [SCI-FINGERPRINT] and [SCI-FINGERPRINT-DRIFT] lines on next real import

      ## 7. Out-of-Scope Items (Carry Forward)
      Verbatim:
        - Plan tier extraction defect ("no tiers" on every component)
        - Resultados_Esperados ingested as transaction data (reconciliation-channel
          violation at import surface)
        - Period auto-detect failure (CLT-197 finding)
        - Storage object orphan cleanup
        - field_identities substrate question
        - Tier 2 (cross-tenant) composition awareness — deferred

      ## 8. Compliance
        - Rule 29 (CC paste LAST): observed in originating prompt
        - Rule 25 (Completion Report First): observed (this section)
        - Korean Test (AP-25): composition signature uses structural inputs only
        - Decision 64: drift signal on classification_signals shared surface
        - Decision 152: import sequence not gated on flywheel state
        - HF-145: optimistic locking preserved on UPDATE path
        - SR-34: structural fix only; no bypass
        - SR-39: N/A (no auth/access/encryption/storage touched)
        - FP-49: schema verified before any SQL drafted (GATE-1)
        - FP-80: every PASS claim has pasted evidence
        - FP-81: multi-layer fix across 6 phases (schema + compute + read + write +
          surface + verify)

  η.2 Commit completion report (BEFORE final PR push):
      $ git add docs/completion-reports/HF-197_Fingerprint_Composition_Drift_COMPLETION_REPORT.md
      $ git commit -m 'HF-197 Phase η: completion report (Rule 25 first-deliverable)'

PHASE θ — PR

  θ.1 Push branch and create PR:
      $ git push -u origin hf-197-fingerprint-composition-drift
      $ gh pr create --base main --head hf-197-fingerprint-composition-drift \
          --title 'HF-197: Fingerprint composition drift — cache-key indeterminacy fix' \
          --body "$(cat <<'BODY'
## Summary
Cache-Key Indeterminacy at fingerprint flywheel read path. Multi-sheet workbooks with
matching first sheets but different sheet sets collided on Tier 1 cache hit, serving
each other's cached bindings. Fix augments cache key with composition_signature
(workbook-level), demotes to Tier 3 on drift, surfaces hard warning via log +
classification_signal + agent_inbox.

## Evidence anchor
Meridian re-import 2026-05-04 02:33: same hash `c6f13c61a05e` served 5-sheet Benchmark
and 3-sheet Datos_Q1; entity resolution degraded 505 → 67 rows linked.

## Scope
- Schema: composition_signature column on structural_fingerprints (nullable;
  backward-compatible)
- Code: computeCompositionSignature, composition-aware lookupFingerprint,
  composition-aware writeFingerprint, drift surface emission
- Verification: in-memory probe + unit tests + build/lint/test green

## Out of scope (carry forward)
- Plan tier extraction defect
- Resultados_Esperados ingested as transaction data
- Period auto-detect failure
- Storage object orphan cleanup
- field_identities substrate question
- Tier 2 cross-tenant composition awareness

## See completion report
docs/completion-reports/HF-197_Fingerprint_Composition_Drift_COMPLETION_REPORT.md
BODY
)"

      PASTE: PR URL.

  θ.2 STOP. Architect performs:
        - Phase α migration application via Supabase Dashboard SQL Editor (if not
          already done)
        - Browser verification per completion report §6
        - Production sign-off
        - PR merge

      Final output to architect verbatim:
        "HF-197 implementation complete. PR: <URL>. Awaiting architect:
         (1) Phase α migration application via SQL Editor (if not yet done)
         (2) Browser verification per completion report §6
         (3) PR merge"

OUT OF SCOPE FOR HF-197 (do not touch):
  - Plan tier extraction defect ("no tiers" on every component)
  - Resultados_Esperados being importable as transaction data
  - Period auto-detect failure (CLT-197 finding)
  - Storage object orphan cleanup
  - field_identities substrate question
  - Tier 2 cross-tenant composition awareness
  These remain open carry-forward.

REPORTING DISCIPLINE:
  - No PASS claims without pasted evidence (FP-80 guard)
  - Completion report file must exist BEFORE final PR push (Rule 25)
  - All architect-only steps clearly delineated in completion report §6
  - Migration is file-only; do not execute (capability-first routing)

END OF CC PROMPT.
```
