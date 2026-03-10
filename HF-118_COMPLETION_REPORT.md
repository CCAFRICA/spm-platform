# HF-118 COMPLETION REPORT
## Import Pipeline Truncation Fix

### Root Cause
`web/src/components/sci/SCIUpload.tsx:177` — `SAMPLE_ROWS = 50` constant caused `sampleData.slice(0, 50)` to discard rows 51-67 after `sheet_to_json` had already parsed ALL rows. When Storage upload failed and legacy execute path was used, only 50 rows reached committed_data. 17 employees silently dropped.

### Commits
| Phase | Commit | Description |
|-------|--------|-------------|
| Prompt | `8eed73d` | Commit prompt |
| 0 | `b202831` | Diagnostic — truncation at SCIUpload.tsx:177, SAMPLE_ROWS=50 |
| 1 | `9ab38ac` | Fix: keep all parsed rows, sample only at analyze-time |
| 2 | This commit | Completion report + PR |

### Files Changed
| File | Change |
|------|--------|
| `web/src/components/sci/SCIUpload.tsx` | Removed `SAMPLE_ROWS = 50` and `.slice(0, SAMPLE_ROWS)`. All parsed rows kept in `parsedData.sheets[].rows`. Renamed constant to `ANALYSIS_SAMPLE_SIZE` (used only for empty-column filtering). |

### Hard Gates
| Gate | Status | Evidence |
|------|--------|----------|
| PG-1: Truncation point found | PASS | `SCIUpload.tsx:144`: `const SAMPLE_ROWS = 50;` → line 177: `sampleData.slice(0, SAMPLE_ROWS)` |
| PG-2: Fix applied | PASS | Replaced `sampleData.slice(0, SAMPLE_ROWS)` with `allRows` (no truncation). `rows: allRows` at line 181. |
| PG-3: No hardcoded limit remains | PASS | `grep -rn "SAMPLE_ROWS\|\.slice(0, 50)" web/src/components/sci/` returns 0 matches |
| PG-4: Build exits 0 (Phase 1) | PASS | `npm run build` succeeds |
| PG-5: Final build exits 0 | PASS | Clean build (`rm -rf .next && npm run build`) succeeds |

### Standing Rule Compliance
| Rule | Status |
|------|--------|
| Korean Test | PASS — no field name changes. Fix is structural (remove row truncation) |
| Scale by Design | PASS — for large files (10K+), Storage bulk path is primary (parses server-side). Client keeps all rows as fallback. Analyze API applies its own sample truncation. |
| Fix Logic Not Data | PASS — pipeline logic fix, not data adjustment |
| Architecture Decision Gate | PASS — HF-118_ARCHITECTURE_DECISION.md committed before implementation |
| AP-1 compliance | PASS — Primary path uses Storage (no row data in HTTP). Legacy fallback already sent rows via HTTP by design; now sends all rows instead of truncated sample. |

### Post-Merge (FOR ANDREW)
| Gate | Status | Evidence |
|------|--------|----------|
| PG-6: PR created | | |
| PG-7: plantilla = 67 | | |
| PG-8: datos_rendimiento >= 67 | | |
| PG-9: entities = 67 | | |
| PG-10: grand total = MX$185,063 | | |

---
*HF-118 Complete | March 9, 2026*
