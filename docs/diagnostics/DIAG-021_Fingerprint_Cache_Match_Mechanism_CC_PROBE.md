# DIAG-021 — Fingerprint Cache Match Mechanism Probe

**Architect-channel content above CC paste block. CC paste block is LAST (Rule 29). Nothing follows.**

---

## Architect context (NOT part of CC prompt)

**Sequence:** DIAG-021 (DIAG-018 closed; DIAG-019/020 ran this session, committed locally on `hf-196-platform-restoration-vertical-slice`, not pushed)

**Defect class candidate:** Cross-sheet binding injection at fingerprint flywheel read path. Per-sheet cache entry (`tabName: "Datos_Flota_Hub"`) is being applied to a different sheet (Plantilla) on Tier 1 cache hit, without sheet-identity verification.

**Live evidence anchor:**
- Cache row `c6f13c61a05e2ee33610a40e2fd2f4bad6b88e40e9592b19c8cbac082b0b4cbb` for tenant `5035b1e8-0754-4527-b7ec-9f93f85e4c79`
- `classification_result.tabName = "Datos_Flota_Hub"`
- `classification_result.fieldBindings` = 7 fields from Datos_Flota_Hub (Region, Hub, Mes, Año, Capacidad_Total, Cargas_Totales, Tasa_Utilizacion)
- match_count=5, confidence=0.8333, last updated 2026-05-04 04:49:45
- Yesterday and today's import logs: `[SCI-FINGERPRINT] Tier 1: injected 7 fieldBindings from flywheel into Plantilla` — wrong-sheet injection

**Hypotheses to disambiguate:**
- H1: Fingerprint algorithm collides — Plantilla and Datos_Flota_Hub produce the same SHA-256 hash for this tenant due to insufficient input dimensions
- H2: Lookup mechanism is wider than per-sheet — Tier 1 query matches by tenant + something less specific than computed-from-current-sheet hash
- H3: Read path uses wrong sheet to compute lookup hash — `file.sheets[0]` versus per-content-unit hashing
- H4: Write path stores cache under wrong sheet's metadata — `tabName` field captured incorrectly at write time

**What HF-197 was solving (now retracted as drafted):** workbook composition collision. That hypothesis was incorrect. The cache row shows the actual defect is per-sheet binding injection without sheet-identity validation, not workbook composition.

**Routing per capability-first:**
- CC executes: file reads, grep, structural code analysis, ~3 targeted SQL queries via tsx-script
- Architect executes: nothing during probe; reads CC's report

**Probe is read-only.** No code modifications, no migrations, no schema changes, no commits except the probe report itself.

---

## Probe scope (5 phases)

1. **Phase 1** — Read `web/src/lib/sci/structural-fingerprint.ts` in full. Extract fingerprint computation algorithm. Document what dimensions feed SHA-256.

2. **Phase 2** — Read `web/src/lib/sci/fingerprint-flywheel.ts` `lookupFingerprint` function in full. Document the WHERE clause structure of the Tier 1 query. Identify what columns/rows are passed to `computeFingerprintHashSync` for the lookup.

3. **Phase 3** — Read all callers of `lookupFingerprint`. Identify which sheet's data is passed for hash computation at the call site. Specifically: is it `file.sheets[0]` (primary sheet only), is it iterated per-sheet, or is it something else?

4. **Phase 4** — Read `writeFingerprint` function in full. Identify what `tabName` corresponds to in the cached `classification_result` and how it gets there. Determine which sheet's bindings are persisted under which fingerprint.

5. **Phase 5** — Targeted SQL probe (FP-49 schema-verify-first): query `structural_fingerprints` for all rows belonging to tenant `5035b1e8-0754-4527-b7ec-9f93f85e4c79` to see whether multiple sheets all map to the same hash, or whether different sheets have distinct hashes. Also check whether per-sheet writes happen at all or only the first sheet's classification gets persisted.

**Exit criterion:** the probe report disambiguates which of H1/H2/H3/H4 (or some combination) is the actual defect mechanism. No HF gets drafted until this is unambiguous.

---

## CC PASTE BLOCK — paste verbatim into Claude Code below this line

```
DIAG-021: Fingerprint Cache Match Mechanism Probe

ROLE: Read-only diagnostic. No code changes. No migrations. No commits except probe report.

BRANCH: stay on whatever branch is currently checked out (architect dispositioned in prior session). Do NOT switch branches.

CC STANDING ARCHITECTURE RULES (operative):
  - Read CC_STANDING_ARCHITECTURE_RULES.md before any work
  - Korean Test (AP-25): probe must surface structural code paths only
  - SR-34 No Bypass: do not propose workarounds; this is diagnostic only
  - FP-49: any SQL must verify schema first via information_schema
  - Rule 29: report file ends with this paste block's section header — nothing after
  - Rule 25 (Completion Report): probe report file is the deliverable; create it incrementally
  - SR-44: this probe surfaces no browser state assertions

EVIDENTIARY DISCIPLINE: every finding requires PASTED EVIDENCE — pasted code with file:line, pasted query result, or pasted grep output. Self-attestation rejected (FP-80 guard).

OUTPUT FILE: docs/diagnostic-reports/DIAG-021_Fingerprint_Cache_Match_Mechanism.md
  Create the file at probe start. Append findings phase by phase.

═══════════════════════════════════════════════════════════════════════
PHASE 0 — Setup
═══════════════════════════════════════════════════════════════════════

  0.1 Verify current branch:
      $ git status
      $ git rev-parse HEAD
      PASTE: branch name and HEAD SHA into the report.

  0.2 Confirm read-only mode:
      Append to report verbatim:
        "DIAG-021 is read-only. Will produce no commits except this report file.
         No migrations applied. No code modified. No schema changed."

═══════════════════════════════════════════════════════════════════════
PHASE 1 — Fingerprint Computation Algorithm
═══════════════════════════════════════════════════════════════════════

  1.1 Locate file:
      $ ls -la web/src/lib/sci/structural-fingerprint.ts

  1.2 Read full file:
      $ cat web/src/lib/sci/structural-fingerprint.ts

      PASTE: full file contents into report Phase 1 section.

  1.3 Identify and extract:
      - The function that computes the fingerprint hash (likely
        `computeFingerprintHashSync` per AUD-001 audit; verify name)
      - What inputs it takes (parameter list)
      - What dimensions it includes in the SHA-256 input string

      Write a "Phase 1 Findings" subsection that answers:
        Q1.1: What is the function signature for the hash compute?
        Q1.2: What is the EXACT string that gets SHA-256'd?
          (Quote the verbatim payload-construction code)
        Q1.3: Does the algorithm include any sheet-identifying property
          (sheet name, tab name, sheet index)? Yes/No with code citation.
        Q1.4: Does the algorithm include any tenant-identifying property?
          Yes/No with code citation.

  1.4 Locate and extract any related helper:
      $ grep -rn 'fingerprintToSignature\|computeFingerprint' web/src/lib/sci --include='*.ts'

      PASTE all matches.

═══════════════════════════════════════════════════════════════════════
PHASE 2 — Lookup Path
═══════════════════════════════════════════════════════════════════════

  2.1 Locate file:
      $ ls -la web/src/lib/sci/fingerprint-flywheel.ts

  2.2 Read full file:
      $ cat web/src/lib/sci/fingerprint-flywheel.ts

      PASTE: full file contents into report Phase 2 section.

  2.3 Identify and extract `lookupFingerprint`:
      Quote the entire function verbatim into the report.

  2.4 Write a "Phase 2 Findings" subsection answering:
      Q2.1: What is the WHERE clause structure of the Tier 1 query?
        Quote it verbatim. Identify each `.eq()` / `.is()` filter.
      Q2.2: How is the lookup `fingerprintHash` computed inside lookupFingerprint?
        Is it computed from passed columns + sampleRows arguments? Yes/No.
        If yes, the caller chose what to pass — note this for Phase 3.
      Q2.3: What is the WHERE clause structure of the Tier 2 (cross-tenant)
        query if present? Quote verbatim.
      Q2.4: Is there ANY code path where a Tier 1 match is returned for a hash
        that was NOT computed from the current input columns? E.g., a tenant-
        scoped lookup that returns ANY matching row regardless of hash?
        Quote the relevant code with line numbers.
      Q2.5: When a Tier 1 match is returned, what is the structure of the
        returned object? Specifically, does it include a `tabName` or sheet-
        identity field that the caller could use to validate context?

═══════════════════════════════════════════════════════════════════════
PHASE 3 — Caller Sites (Hash Computation Choice)
═══════════════════════════════════════════════════════════════════════

  3.1 Find all callers of lookupFingerprint:
      $ grep -rn 'lookupFingerprint(' web/src --include='*.ts'

      PASTE: all matches with file:line.

  3.2 For EACH caller, read the surrounding context (10 lines before and 5 lines
      after the call site):

      For each caller `<file>:<line>`:
        $ sed -n '<line-10>,<line+5>p' <file>

      PASTE: full context block per caller.

  3.3 Write a "Phase 3 Findings" subsection answering, for each caller:
      Q3.<n>.1: What sheet/data is passed for hash computation?
        Specifically: is it `file.sheets[0]` (first-sheet-only),
        is it iterated per-sheet, is it the current sheet being processed,
        or something else?
      Q3.<n>.2: What is the loop/iteration structure surrounding the call?
        Is the call inside a `for (const sheet of file.sheets)` loop, or
        outside the per-sheet loop?
      Q3.<n>.3: When the lookup returns a match, what does the caller DO
        with the cached fieldBindings? Specifically: does it apply them to
        the sheet whose hash matched, or to a different sheet (e.g., always
        to the first sheet, or to all sheets in the file)?

  3.4 Synthesize a "Phase 3 Synthesis" subsection answering:
      Q3.S.1: For the live evidence (cache row tabName="Datos_Flota_Hub",
        injected into Plantilla), is there a code path that explains how
        Datos_Flota_Hub's cached fieldBindings reach Plantilla?
        Cite the specific lines.

═══════════════════════════════════════════════════════════════════════
PHASE 4 — Write Path
═══════════════════════════════════════════════════════════════════════

  4.1 Locate writeFingerprint in fingerprint-flywheel.ts (already read in Phase 2;
      reference back).

  4.2 Identify all callers of writeFingerprint:
      $ grep -rn 'writeFingerprint(' web/src --include='*.ts'

      PASTE: all matches with file:line.

  4.3 For EACH caller, read 10 lines of context around the call site.
      PASTE: context per caller.

  4.4 Write a "Phase 4 Findings" subsection answering:
      Q4.1: When writeFingerprint is called, what is the source of the
        `tabName` field that ends up in the cached `classification_result`?
        Is it the sheet name being processed at that call site, or
        something else (e.g., file name, first sheet name)?
      Q4.2: For multi-sheet workbooks, does the write path execute ONCE
        per file or ONCE per sheet?
      Q4.3: When multiple sheets in the same file all get classified,
        does each sheet's classification get persisted to a separate
        `structural_fingerprints` row, or is only one sheet's classification
        persisted (e.g., only the first sheet, or only the highest-confidence
        sheet)?

═══════════════════════════════════════════════════════════════════════
PHASE 5 — Substrate State Probe (FP-49 schema-verified SQL)
═══════════════════════════════════════════════════════════════════════

  5.1 Schema verify (FP-49 guard):
      Author web/scripts/diag-021-schema-verify.ts:

        Use createServiceRoleClient or equivalent service-role pattern.
        Query information_schema.columns for table_name='structural_fingerprints'.
        Print column inventory.

      $ npx tsx web/scripts/diag-021-schema-verify.ts

      PASTE: column inventory output.

      DELETE the script after pasting (do not commit).

  5.2 Author web/scripts/diag-021-cache-state-probe.ts:

      Use service-role client.

      Query 1: All rows for tenant 5035b1e8-0754-4527-b7ec-9f93f85e4c79
        SELECT id, fingerprint_hash, match_count, confidence,
               classification_result->>'tabName' AS cached_tab,
               classification_result->>'classification' AS cached_class,
               jsonb_array_length(classification_result->'fieldBindings') AS field_count,
               column_roles,
               created_at, updated_at
        FROM structural_fingerprints
        WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
        ORDER BY updated_at DESC

      Query 2: Cross-tenant rows with the Meridian fingerprint hash
        SELECT id, tenant_id, fingerprint_hash, match_count, confidence,
               classification_result->>'tabName' AS cached_tab,
               updated_at
        FROM structural_fingerprints
        WHERE fingerprint_hash LIKE 'c6f13c61a05e%'
        ORDER BY updated_at DESC

      Query 3: Distinct tabNames across all Meridian-tenant cached rows
        SELECT DISTINCT classification_result->>'tabName' AS cached_tab,
               COUNT(*) AS row_count
        FROM structural_fingerprints
        WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
        GROUP BY classification_result->>'tabName'

      Run:
        $ npx tsx web/scripts/diag-021-cache-state-probe.ts

      PASTE: full output of all three queries.

      DELETE the script after pasting (do not commit).

  5.3 Write a "Phase 5 Findings" subsection answering:
      Q5.1: How many rows exist in structural_fingerprints for the Meridian
        tenant? List each with cached_tab + classification.
      Q5.2: Were Plantilla and Datos_Rendimiento ever persisted as their own
        cached rows? If yes, how many rows for each? If no, why not?
      Q5.3: Does ONE fingerprint_hash map to ONE cached_tab or multiple?
      Q5.4: Cross-tenant: does the hash c6f13c61a05e* appear under any other
        tenant_id? If yes, list them.

═══════════════════════════════════════════════════════════════════════
PHASE 6 — Synthesis (the disambiguation)
═══════════════════════════════════════════════════════════════════════

  6.1 Write a "Phase 6 Synthesis" section answering the four hypotheses:

      H1 — Fingerprint algorithm collides across sheets:
        Verdict: SUPPORTED / NOT SUPPORTED / UNCERTAIN
        Evidence: cite Phase 1 algorithm + Phase 5 distinct hashes per sheet

      H2 — Lookup mechanism is wider than per-sheet:
        Verdict: SUPPORTED / NOT SUPPORTED / UNCERTAIN
        Evidence: cite Phase 2 WHERE clause structure

      H3 — Read path uses wrong sheet to compute lookup hash:
        Verdict: SUPPORTED / NOT SUPPORTED / UNCERTAIN
        Evidence: cite Phase 3 caller code paths

      H4 — Write path stores under wrong sheet's metadata:
        Verdict: SUPPORTED / NOT SUPPORTED / UNCERTAIN
        Evidence: cite Phase 4 write path + Phase 5 cached tabName values

  6.2 Write a "Defect mechanism" subsection stating, in plain language:
      What is the structural mechanism by which Datos_Flota_Hub's cached
      fieldBindings end up applied to Plantilla on second-encounter?

      Include a code-path trace from caller to lookup to injection. Cite line
      numbers throughout.

  6.3 Write a "Forward implication" subsection:
      What scope of fix is required to address the defect at the structural
      layer (per SR-34 No Bypass)? Do not draft an HF; just name the layer
      and the required behavior change. Architect drafts HF in next turn.

═══════════════════════════════════════════════════════════════════════
PHASE 7 — Probe Report Closure
═══════════════════════════════════════════════════════════════════════

  7.1 Append to report:
      "DIAG-021 PROBE COMPLETE. Read-only. No code modified. No migrations
       applied. No schema changed. Diagnostic disposition pending architect
       review."

  7.2 Commit ONLY the probe report:
      $ git add docs/diagnostic-reports/DIAG-021_Fingerprint_Cache_Match_Mechanism.md
      $ git commit -m 'DIAG-021: fingerprint cache match mechanism probe (read-only diagnostic)'

      Do NOT push. Architect dispositions push timing.

  7.3 Output verbatim to architect:
      "DIAG-021 complete. Report: docs/diagnostic-reports/DIAG-021_Fingerprint_Cache_Match_Mechanism.md
       Local commit only — not pushed. Probe is read-only; no code changes,
       no migrations, no schema changes. Awaiting architect review and HF
       sequencing disposition."

OUT OF SCOPE FOR DIAG-021 (do not touch):
  - HF drafting (architect responsibility, post-probe)
  - Code modifications (read-only diagnostic)
  - Migration changes (none required for diagnostic)
  - Resolver code (HF-110 surface; not the current defect locus)
  - HC primacy code (HF-095/HF-196 surface; not the current defect locus)
  - Plan tier extraction defect (separate, deferred)
  - Resultados_Esperados as transaction (separate, deferred)

REPORTING DISCIPLINE:
  - Every finding requires pasted evidence (FP-80 guard)
  - Code citations include file:line throughout
  - Hypothesis verdicts include evidence chain
  - Synthesis (Phase 6) is the deliverable that drives next-step decision

END OF CC PROMPT.
```
