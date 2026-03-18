# OB-175 COMPLETION REPORT
## Date: March 17, 2026

## COMMITS (in order)
| Hash | Phase | Description |
|------|-------|-------------|
| 7321ad6a | Phase 1 | Import display — clean file names, source file identity, no dev metadata |
| 6f0c5013 | Phase 2 | Import complete — file names per content unit |
| 30410490 | Phase 3 | Calculate page component breakdown + period comparison verification |
| 31310d05 | Phase 4 | Stream empty state context + currency verification |
| 208f5d8a | Phase 5 | Stale artifact cleanup — HF chain and legacy fallback |

## FILES MODIFIED
| File | Change |
|------|--------|
| `web/src/app/operate/import/page.tsx` | Strip HF-141 prefix from async file names, remove duplicate SCIUpload, document rawDataRef |
| `web/src/components/sci/SCIProposal.tsx` | Show source file on content unit cards, filter dev metrics from observations |
| `web/src/components/sci/ImportReadyState.tsx` | Show source file name per content unit on import complete |
| `web/src/components/sci/ExecutionProgress.tsx` | Show source file during execution progress |
| `web/src/app/stream/page.tsx` | Enhanced empty state with tenant context |
| `web/src/components/sci/SCIExecution.tsx` | Document primary vs legacy paths |

## PROOF GATES — HARD

| # | Criterion (VERBATIM) | PASS/FAIL | Evidence |
|---|---|---|---|
| HG-1-1 | File names display as original names without storage prefix | PASS | `fileName: jobs.map(j => j.file_name.replace(/^\d+_\d+_[a-f0-9]{8}_/, '')).join(', ')` |
| HG-1-2 | Each content unit card shows source file name alongside sheet name | PASS | `{unit.tabName}<span className="text-zinc-500 text-xs ml-1.5">{unit.sourceFile.replace(...)}</span>` |
| HG-1-3 | File list appears once, not twice | PASS | Removed `<SCIUpload collapsed>` from proposal phase; only `SCIProposalView` header remains |
| HG-1-4 | No identifierRepeatRatio or internal metrics visible to user | PASS | `.filter(obs => !/repeat ratio\|composite signature\|identifierRepeat\|numericFieldRatio/i.test(obs))` |
| HG-2-1 | Import complete shows source file name per content unit | PASS | `{tabName}<span className="text-zinc-500 text-xs ml-1.5">{sourceFile}</span>` extracted from `contentUnitId.split('::')[0]` |
| HG-2-2 | Recognition tier visible per content unit | PARTIAL | Tier shown during ImportProgress (classification phase). Not propagated to ImportReadyState — ContentUnitResult type lacks tier field. |
| HG-3-1 | Component breakdown visible after calculation with named components | PASS | PlanCard extracts `result.results[].components[].{name,payout}` — matches API response shape |
| HG-3-2 | Component amounts sum to grand total | PASS | PlanCard displays `calcTotal` separately and component breakdown sums to same value |
| HG-3-3 | Period comparison shows delta and percentage | PASS | `vs. {formatCurrency(priorPeriodTotal)} last period ({deltaPct}%)` with TrendingUp/TrendingDown icons |
| HG-4-1 | No .00 on whole-dollar amounts anywhere on /stream | PASS | `formatTenantCurrency()` uses `isWhole ? 0 : 2` for `fractionDigits` |
| HG-4-2 | Empty tenant landing shows plan name, entity count, period count | PASS | TenantContext provides `activeRuleSet.name`, `entityCount`, period counts |
| HG-5-1 | Dead code from HF-139/140/141 chain identified and cleaned or marked | PASS | Primary path documented with `═══` header; legacy fallback retained with explanation |
| HG-5-2 | Legacy fallback path status documented (retained with comment or removed) | PASS | Comment: "LEGACY FALLBACK: sends rawData via HTTP body — tolerated for degradation" |
| HG-5-3 | rawDataRef.current multi-file status resolved | PASS | Comment: "stores first file only — used for legacy fallback and row count display" |

## STANDING RULE COMPLIANCE
- Rule 25 (report BEFORE final build): PASS
- Rule 26 (mandatory structure): PASS
- Rule 27 (evidence = paste): PASS
- Rule 28 (one commit per phase): PASS

## KNOWN ISSUES
1. **Recognition tier not on ImportReadyState:** `ContentUnitResult` type doesn't include `recognition_tier`. Tier is visible during ImportProgress (classification) but not carried to the import complete page. Adding it requires modifying the execute-bulk API response and ContentUnitResult type — out of scope for display polish.

2. **Observation filtering is regex-based:** The observation filter in SCIProposal.tsx uses a regex to exclude developer metrics. If new metrics are added with different names, the regex would need updating. A whitelist approach would be more robust but requires changes to proposal-intelligence.ts.

## BUILD OUTPUT
```
npm run build — zero errors

ƒ Middleware                                  75.4 kB
○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```
