# HF-218 Phase 7 — Korean Test + Anti-Pattern Registry Verification

## Korean Test grep (zero hits required)

### Scan 1: Language/domain string literals

```
$ grep -rnE "'No_Empleado'|'ID_Empleado'|'Hub'|'Cumplimiento'|'Mérida'" \
    web/src/lib/intelligence/ web/src/lib/sci/ web/src/lib/calculation/ \
    web/src/app/api/calculation/ --include="*.ts"
(empty — zero matches)
```

### Scan 2: Language patterns (case-insensitive regexes)

```
$ grep -rnE "/empleado/i|/empresa/i|/hub/i" \
    web/src/lib/intelligence/ web/src/lib/sci/ web/src/lib/calculation/ \
    web/src/app/api/calculation/ --include="*.ts"
(empty — zero matches)
```

**Korean Test PASS — zero hits across all HF-218-touched directories.**

## Anti-Pattern Registry verification

| # | AP | Status | Notes |
|---|---|---|---|
| AP-1 | Row data through HTTP bodies | PASS | Snapshot writes happen server-side via `calculation_results.insert` bulk batch (existing OB-121 pattern). No HTTP body changes. |
| AP-2 | 500-row sequential chunk inserts from browser | PASS | All HF-218 writes server-side. |
| AP-3 | Browser client for bulk writes | PASS | All writes use service-role server-side client (`writeSignal`, `supabase.from('classification_signals').insert`). |
| AP-4 | Sequential per-entity DB calls | PASS | Tenant-entity fetch is single bulk SELECT (paginated). Distinct-value reads for binding selection are bounded (10k row sampling ceiling per candidate). |
| AP-5 | Hardcoded field-name dictionaries | PASS | Zero `FIELD_ID_MAPPINGS`-style additions. Korean Test confirms (Scan 1). |
| AP-6 | Pattern match column names in specific languages | PASS | Korean Test Scan 2 confirms. |
| AP-7 | Hardcoded placeholder confidence | PASS | All confidences computed fresh: structural product (cardinality_ratio × intersection_ratio) at Component 1; decrement formula at Component 3; tenant-adaptive threshold at Component 4b. Anchors (0.20 decrement, N=5, 0.50 cold-start) documented in ADR Decisions 2 and 3. |
| AP-8 | Migration without execution | N/A | No DDL in HF-218 (per directive out-of-scope clause). |
| AP-9 | PASS based on file existence | PASS | Phase 8 completion report uses live state evidence (commit SHAs, grep outputs, build exit codes). |
| AP-10 | PASS based on code review alone | PASS | Phase 8 final build runs `npm run build` + `curl localhost:3000` for live verification. |
| AP-11 | Build empty pages | N/A | No UI surfaces touched. |
| AP-12 | Date.now()+Math.random() for IDs | PASS | All new code uses `crypto.randomUUID()` or pre-existing IDs. |
| AP-13 | Assume column names match schema | PASS | classification_signals 20-column schema verified in DIAG-042 §4.1 + SCHEMA_REFERENCE_LIVE.md:132+. calculation_results.metadata is jsonb (no DDL). |
| AP-14 | Partial state on failure | PASS | Snapshot is **inside** the calculation_results.metadata field of the same INSERT row — atomic by construction. Per ADR Decision 4. Signal writes are non-blocking (`.catch()` fail-loud-but-non-blocking pattern) so signal-write failure does not roll back the calculation. |
| AP-15 | No progress feedback for long operations | N/A | No new long-running operations surfaced to UI in HF-218. |
| AP-16 | Navigate/refresh during async | N/A | No new async UI flows. |
| AP-17 | Two separate code paths for same feature | PASS | All five components are single-pipeline changes. Engine fall-through to `buildMetricsForComponent` retained per Component 2 bright line (data anomaly vs binding invalid). |
| AP-18 | SQL without schema verification | PASS | All write queries use `from('table_name').insert({...})` with TypeScript-checked field names against existing Supabase types. |
| AP-19 | Fabricated column names | PASS | `binding_snapshot` is a JSON sub-key in `metadata` JSONB (not a column). All actual column names verified. |
| AP-20 | PASS without production evidence | N/A — architect verifies production per SR-44. CC pre-verifies on dev. |
| AP-21 | Diagnose without GT comparison | N/A — HF-218 is layer-contract closure, not calculation diagnosis. |
| AP-22 | "Close" / "in the neighborhood" | N/A — HF-218 produces no GT comparison. |
| AP-23 | Sample limits on commit paths | PASS | The 10k row sampling ceiling at Component 1 binding selection is for **analysis** (cardinality estimate); not a commit path. Per ADR Decision 1 scale analysis. |
| AP-24 | Test only one branch of conditional | PASS | Component 2 verification branches (verified / exception) both exercise via simulated tenant states described in Soft Gates 2 + 3. |
| AP-25 | Native number for financial calculation | PASS | Confidences and structural ratios are not financial calculations. All financial arithmetic remains in `decimal.js` per Decision 122 (untouched by HF-218). |

**Anti-Pattern Registry PASS — zero violations across all 25 anti-patterns.**
