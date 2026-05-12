# AUD-007 — OB-199 SCI Structural Preservation Audit

**Status:** DIRECTIVE for CC execution
**Type:** Read-only empirical audit — evidence surface only
**Repository:** `CCAFRICA/spm-platform`
**Branch:** `ob-199-canonical-signal-write-implementation` (current HEAD)
**Output location (main report):** `docs/audits/AUD-007_OB-199_SCI_Structural_Preservation_Audit.md`
**Output location (raw evidence):** `docs/audits/AUD-007_evidence/`
**Inheritance:** `CC_STANDING_ARCHITECTURE_RULES.md` Rules 1–30+
**Audit predecessor:** AUD-006 + `AUD-006_addendum_inventory_corrections.md`
**Work under audit:** OB-199 Phases 1–4 at commits 7dead762, ff55872c, 5e42d88d, a510542b, 65b5efa2, ba859230, 9a33210a, 3e605692, 21e85f60, 6042d29e, 93d6e793, 8807c82c

---

## Section 0 — Audit discipline (CC reads first)

**This audit is READ-ONLY. CC produces evidence. CC does NOT:**

- Classify deletions or migrations as SUPERSET / SUBSET / IDENTICAL / DIVERGENT
- Assess intent preservation
- Propose dispositions or fixes
- Suggest what architect should do with the findings
- Synthesize conclusions from the evidence
- Add commentary, summaries, or assessment columns to evidence tables

**CC produces VERBATIM CODE EXCERPTS, VERBATIM SCHEMA READS, VERBATIM SPECIFICATION TEXT, VERBATIM DIFFS.** CC's role is to surface; architect's role is to assess.

If CC would normally summarize, instead quote the source verbatim with file:line markers. If a single quote would exceed 200 lines, surface the first 100 + last 100 lines with an elision marker indicating total line count.

If CC encounters a circumstance not anticipated by this directive (file not found, command fails, output unexpectedly empty), surface that fact verbatim in the report ("E3.1 returned zero rows") — do NOT interpret what it means.

---

## Section 1 — Artifact structure (CC produces)

CC produces two outputs:

**(1) Main report** at `docs/audits/AUD-007_OB-199_SCI_Structural_Preservation_Audit.md` with structure:

- Section 0: Audit scope + discipline statement (verbatim from this directive)
- Section 1: Evidence inventory (manifest of what was read, with path to each evidence file)
- Section 2: Evidence section-by-section (E1–E6) — each section names the evidence files in the appendix folder
- Section 3: Observed-but-unjudged surface — raw observations CC noticed that the directive did not explicitly ask for but that may be material. CC surfaces these as observations without claim of significance ("E1.1 line 47 contains a TODO comment referencing HF-214"; "E3.1 returned 19 columns, not 9 as referenced in the OB-199 directive"). One-line observations only; no commentary.
- Section 4: HALT marker

The main report does NOT contain a "Conclusion" or "Recommendations" section. The audit ends at Section 4 HALT.

**(2) Raw evidence appendix** at `docs/audits/AUD-007_evidence/` containing one `.md` per evidence section listed below, plus a `MANIFEST.md` listing every evidence file produced.

---

## Section 2 — Evidence sections

### E1 — Canonical writer source

| ID | Action |
|---|---|
| E1.1 | Read `web/src/lib/intelligence/canonical-signal-writer.ts` in full. Surface entire file verbatim to `E1_1_canonical_signal_writer_full_source.md` with line numbers. |
| E1.2 | Surface function signatures (full TypeScript type signature, including all parameters and return type) of `writeSignal`, `writeSignalBatch`, `writeSignalWithClient`, `writeSignalBatchWithClient` verbatim. |
| E1.3 | Surface the column list the canonical writer's insert constructs: every field name in the row object passed to `.insert()`, verbatim, with the source field that populates each. Format as a table: `\| DB column \| Source from CanonicalSignalInput \| Default if absent \| Type \|`. |
| E1.4 | Surface `CanonicalSignalInput` type definition verbatim, including every field, every optional marker, every type annotation, every JSDoc comment. |
| E1.5 | Surface the §5.2 validation function (`validateSignal` or equivalent) body verbatim. Surface the four-outcome routing logic verbatim. |
| E1.6 | Surface the §5.3 identifier validation logic verbatim (the registry lookup). |
| E1.7 | Surface the `observability:write_failure` signal emission code verbatim — what it writes, what columns, what context fields. |
| E1.8 | List every `import` statement in the file verbatim. |

### E2 — Signal reader source + byte-identical claim

| ID | Action |
|---|---|
| E2.1 | Read `web/src/lib/ai/signal-reader.ts` in full. Surface entire file verbatim to `E2_1_signal_reader_full_source.md` with line numbers. |
| E2.2 | Read the pre-deletion `web/src/lib/ai/signal-persistence.ts` at commit `5e42d88d^` (the commit just before Phase 3 thin-wrap) for the `getTrainingSignals` function body. Surface that function verbatim to `E2_2_pre_deletion_getTrainingSignals.md`. |
| E2.3 | Produce a diff between pre-deletion `getTrainingSignals` and current `signal-reader.ts:getTrainingSignals` body. Run: `git diff 5e42d88d^ HEAD -- web/src/lib/ai/signal-persistence.ts web/src/lib/ai/signal-reader.ts`. Surface diff output verbatim to `E2_3_byte_identical_diff.md`. CC does NOT claim the diff is empty or non-empty; CC surfaces the diff and architect reads. |
| E2.4 | List every importer of `signal-reader.ts`: `grep -rn "from.*signal-reader\|from.*ai/signal-reader" web/src/`. Surface output verbatim. |

### E3 — `classification_signals` schema

| ID | Action |
|---|---|
| E3.1 | Run against current Supabase project (Rule 7 live SQL gate): `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'classification_signals' ORDER BY ordinal_position;`. Surface output verbatim (full row-by-row result, not a summary). |
| E3.2 | Run: `SELECT con.conname, con.contype, pg_get_constraintdef(con.oid) AS def FROM pg_constraint con INNER JOIN pg_class rel ON rel.oid = con.conrelid INNER JOIN pg_namespace nsp ON nsp.oid = connamespace WHERE rel.relname = 'classification_signals' AND nsp.nspname = 'public' ORDER BY con.conname;`. Surface verbatim. Captures CHECK / FK / UNIQUE / NOT NULL constraints expressed as constraints. |
| E3.3 | Run: `SELECT polname, polcmd, polqual, polwithcheck FROM pg_policy WHERE polrelid = 'public.classification_signals'::regclass;`. Surface verbatim. Captures RLS policies. |
| E3.4 | Run: `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'classification_signals';`. Surface verbatim. Captures indexes. |
| E3.5 | Locate the HF-092 migration: `find . -path ./node_modules -prune -o -type f -name "*HF-092*" -print` and `find . -path ./node_modules -prune -o -type f -name "*hf-092*" -print` and `grep -rln "HF-092\|hf-092" supabase/ docs/ 2>/dev/null`. For each file found, surface the full file contents verbatim to `E3_5_hf092_migration_<filename>.md`. |
| E3.6 | Cross-reference E3.1's column list against E1.3's canonical writer insert column list. Surface as a side-by-side table: `\| Schema column (E3.1) \| NULL? \| Default \| Written by canonical writer? (E1.3) \| If written, source field \|`. CC does NOT comment on mismatches; CC produces the table; architect reads. |

### E4 — The 5 migrated SCI call sites + pre-deletion `writeClassificationSignal`

| ID | Action |
|---|---|
| E4.1 | Pre-deletion `writeClassificationSignal` source. Run: `git show 93d6e793^:web/src/lib/sci/classification-signal-service.ts`. Surface the `writeClassificationSignal` function verbatim (full body from `export async function writeClassificationSignal` to its closing brace) to `E4_1_pre_deletion_writeClassificationSignal.md`. |
| E4.2 | For each of the 5 migrated call sites, surface 50 lines before and 50 lines after the `writeSignal` call, verbatim with line numbers, to `E4_2_call_site_<a-e>.md`. Sites: (a) `web/src/app/api/import/sci/execute/route.ts:387` area; (b) `web/src/app/api/intelligence/converge/route.ts:95` area; (c) `web/src/app/api/intelligence/converge/route.ts:120` area; (d) `web/src/app/api/import/sci/process-job/route.ts:354` area; (e) `web/src/app/api/import/sci/analyze/route.ts:475` area. |
| E4.3 | For each call site, surface the corresponding PRE-DELETION code at the same file:line range from commit `93d6e793^`: `git show 93d6e793^:<filepath> \| sed -n '<start>,<end>p'`. Surface to `E4_3_call_site_<a-e>_pre_deletion.md`. |
| E4.4 | Side-by-side: for each of the 5 sites, produce a two-column diff showing pre-deletion call vs post-migration call. CC does NOT label differences; CC produces the diff. Surface to `E4_4_call_site_<a-e>_sidebyside.md`. |
| E4.5 | For each post-migration call site, surface the `.catch()` / try-catch / error-handling code immediately surrounding the `writeSignal` call. Verbatim with line numbers. |
| E4.6 | Run: `grep -rn "sciVersion\|sci_version" web/src/ --include="*.ts"`. Surface verbatim. Every SCI version marker reference. |
| E4.7 | Run: `grep -rn "phase:\s*['\"]E['\"]" web/src/ --include="*.ts"`. Surface verbatim. Every SCI Phase E marker. |
| E4.8 | Run: `grep -rn "schema:\s*['\"]HF-092['\"]" web/src/ --include="*.ts"`. Surface verbatim. |
| E4.9 | Run: `grep -rn "\[SCI Signal\]\|\[SciSignal\]\|sci_agent\|user_corrected" web/src/ --include="*.ts"`. Surface verbatim. SCI logging markers, source vocabulary. |

### E5 — SCI architecture substrate

| ID | Action |
|---|---|
| E5.1 | Locate DS-021 (Substrate Architecture Biological Lineage): `find docs/design-specifications/ -name "DS-021*"`. For each found file, surface full contents verbatim to `E5_1_DS-021_<filename>.md`. |
| E5.2 | Locate every DS artifact: `ls docs/design-specifications/`. Surface directory listing verbatim. For each DS artifact, surface its Section 1 (problem statement) and Section 3 (substrate citations) only. If a DS clearly relates to SCI (grep its body for `SCI\|Synaptic Content Ingestion\|signal-capture` returns matches), surface the full DS to `E5_2_DS-<id>_<name>_full.md`. |
| E5.3 | Locate any artifact referencing "Synaptic Surface" or "Synaptic Content Ingestion": `grep -rln "Synaptic Surface\|Synaptic Content Ingestion\|SCI Phase" docs/`. For each match, surface the file's full contents to `E5_3_<filename>.md`. |
| E5.4 | Locate HF-092's completion report or design notes: `find docs/ -name "*HF-092*"` and `find docs/ -name "*hf-092*"`. Surface each found file's full contents verbatim. |
| E5.5 | Surface every file in `web/src/lib/sci/` directory listing. For each `.ts` file, surface its full contents verbatim to `E5_5_lib_sci_<filename>.md`. Captures the full SCI namespace as it currently exists. |
| E5.6 | Run: `grep -rln "SCI emission\|SCI signal\|sci_emission\|sciEmission\|SCI write\|SCI persist" web/src/ docs/`. Surface verbatim. |

### E6 — Reader-side surfaces

| ID | Action |
|---|---|
| E6.1 | Locate `loadMetricComprehensionSignals` and surrounding read functions in convergence-service: `grep -n "loadMetricComprehensionSignals\|loadSignals\|fetchSignals" web/src/lib/intelligence/convergence-service.ts`. For each function, surface the full function body verbatim to `E6_1_convergence_reader_<function>.md`. |
| E6.2 | Surface `web/src/lib/ai/ai-metrics-service.ts:fetchSignals` (and any sibling read functions) verbatim to `E6_2_ai_metrics_service_readers.md`. |
| E6.3 | Locate every `.from('classification_signals').select(...)` call in `web/src/`: `grep -rnE "\.from\(['\"\`]classification_signals['\"\`]\)\.select" web/src/`. For each reader, surface the full surrounding function (50 lines before, 50 after) verbatim to `E6_3_reader_<file>_<line>.md`. |
| E6.4 | For each reader located in E6.1–E6.3, surface the JSONB-path field reads and dedicated-column field reads. Format: `\| Reader file:line \| Reads JSONB context fields \| Reads dedicated columns \| Filters on signal_type values \|`. CC produces the table; architect compares against E1.3 + E3.1 to assess shape coherence. |
| E6.5 | Run: `grep -rn "convergence-service\|ai-metrics-service\|persona" web/src/ --include="*.ts" \| grep -i "classification_signals\|signal_type"`. Surface verbatim. Captures cross-references between readers and the writer surface. |

---

## Section 3 — Manifest, halt, commit

After CC produces every E1–E6 evidence file plus the main report, CC produces:

**Manifest:** `docs/audits/AUD-007_evidence/MANIFEST.md` listing every evidence file with its size in lines and a one-line description of what it contains (verbatim from this directive's E1.1–E6.5 entries).

**Halt:** Main report Section 4 contains the verbatim text:

> AUD-007 evidence surface complete. CC has produced verbatim raw evidence per directive E1.1–E6.5. CC has NOT classified intent preservation, NOT assessed SCI structural status, NOT proposed dispositions. Architect-channel review of the evidence is the next step. CC HALTS. No further code modification, no further OB-199 phase progression, no further audit work until explicit architect re-authorization.

**Commit:**

```
git add docs/audits/AUD-007_OB-199_SCI_Structural_Preservation_Audit.md \
        docs/audits/AUD-007_evidence/
git commit -m "AUD-007: OB-199 SCI Structural Preservation Audit — evidence surface

- Read-only empirical audit per architect directive
- E1–E6 evidence sections produced verbatim
- CC does not classify or assess; architect reads raw evidence
- Halts before Phase 5 authorization or OB-199 supplement work"
git push origin ob-199-canonical-signal-write-implementation
```

---

## Section 4 — Standing constraints

- **No code modification.** This audit reads only. Any code change is out of scope.
- **No SUPERSET/SUBSET/IDENTICAL/DIVERGENT classification.** CC produces evidence; architect classifies.
- **No CC self-assessment columns.** Evidence tables contain raw facts, not CC's reading of them.
- **No summarization.** If a section would summarize, quote verbatim instead.
- **Halt on completion.** No proceeding to Phase 5, no proceeding to Phase 4 supplement, no proceeding to OB-199 PR open. CC halts at Section 3's commit + push and reports the manifest in chat.
- **Halt-and-surface per SR-42** on any directive ambiguity or unexpected condition; do NOT interpret.

---

*AUD-007 — OB-199 SCI Structural Preservation Audit · DIRECTIVE for CC execution · Read-only empirical audit · CC surfaces verbatim evidence; architect classifies post-audit · Audit predecessor: AUD-006 + AUD-006 addendum · Work under audit: OB-199 Phases 1–4 at commits 7dead762 through 8807c82c*
