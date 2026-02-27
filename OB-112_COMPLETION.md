# OB-112 Completion Report: Import-to-Calculation Chain Repair

**Date:** 2026-02-27
**Target:** alpha.3.0
**Branch:** dev
**Commits:** 2 (772e711 → f0cca6a)
**Files modified:** 1 source file

---

## What Was Done

### Phase 0: Diagnostic

Comprehensive trace of the 5 broken links identified by CLT-111:

| # | Broken Link | Finding | Root Cause |
|---|------------|---------|------------|
| 1 | Multi-file display | F-19: Frankenstein page | NOT REPRODUCED — completion step is clean (OB-111 handled correctly) |
| 2 | Entity dedup (107 vs 25) | F-20/F-21: Inflated entity count | Client-side SUM of per-file counts; DB dedup was correct |
| 3 | Period alignment (28 vs 4) | F-33/F-34: Inflated period count | Client-side SUM of per-file counts; DB dedup was correct |
| 4 | Rule set assignments (none) | F-43/F-45: No assignments visible | Assignments created (OB-103) but NOT shown in completion UI |
| 5 | Landing routing | F-51: Wrong page | Already fixed by HF-076 (Decision 57) |

**Key insight:** The server-side import chain (entity dedup by external_id, period dedup by canonical_key, auto rule set assignments) was already correct. The bugs were in the **client-side aggregation** of multi-file commit results.

### Phase 1: Fix Multi-File Count Aggregation

`web/src/app/data/import/enhanced/page.tsx` — 3 fixes in `handleSubmitImport` multi-file path:

**Entity count** (lines 2071-2076):
- Before: `totalEntities += result.entityCount` → summed per-file counts (each commit returns ALL entities it resolved, not just new ones)
- After: `maxEntities = Math.max(maxEntities, result.entityCount)` → tracks highest count (correct since each successive commit sees all prior entities)

**Period count** (lines 2075+):
- Before: `totalPeriods += result.periodCount` and `allPeriods.push(...result.periods)` → duplicated periods across files
- After: `periodMap[p.key] = p.id` → deduplicates by canonical key, then `Object.entries(periodMap).map(...)` for final count

**Assignment display** (completion step):
- Added `assignmentCount` to `importResult` type
- Added 5th stat column (was 4) showing rule set assignments with Link2 icon
- Both single-file and multi-file paths now populate `assignmentCount` from commit response

---

## Server-Side Chain Verified (No Changes Needed)

| Step | Mechanism | Status |
|------|-----------|--------|
| Entity dedup | Check `.in('external_id', slice)` → only INSERT new | CORRECT (lines 274-332) |
| Period dedup | Check `.eq('tenant_id', tenantId)` → Map lookup → only INSERT new | CORRECT (lines 430-482) |
| Rule set assignments | OB-103: License-based multi-plan + single-plan fallback | CORRECT (lines 614-720) |
| Landing routing | HF-076: Feature-based redirect in /operate | CORRECT (lines 402-443) |

---

## Proof Gates (8)

| # | Gate | Status |
|---|------|--------|
| PG-01 | npm run build exits 0 | PASS |
| PG-02 | Multi-file entity count uses Math.max, not sum | PASS |
| PG-03 | Multi-file period count deduplicates by key | PASS |
| PG-04 | allPeriods array deduplicates by canonical key | PASS |
| PG-05 | Assignment count shown in completion display | PASS (5-column grid) |
| PG-06 | Single-file path includes assignmentCount | PASS |
| PG-07 | No auth files modified | PASS |
| PG-08 | Server-side entity/period dedup unchanged | PASS (no changes to commit route) |

---

## Files Modified

| # | File | Lines Changed |
|---|------|--------------|
| 1 | `web/src/app/data/import/enhanced/page.tsx` | +35/-10 (count aggregation, assignment display) |

---

## CLT-111 Finding Resolution

| Finding | Description | Resolution |
|---------|-------------|------------|
| F-19 | Multi-file display Frankenstein | Not reproduced — OB-111 completion step is clean |
| F-20 | Entity count inflated | Fixed: Math.max instead of sum |
| F-21 | Entity dedup not working | Verified: server-side dedup was correct all along |
| F-33 | Period count inflated | Fixed: deduplicate by canonical key |
| F-34 | Period alignment wrong | Verified: server-side dedup was correct all along |
| F-43 | No rule set assignments | Verified: OB-103 auto-creates them; now displayed in UI |
| F-45 | Assignment visibility | Fixed: added assignment count to completion summary |
| F-51 | Landing routing wrong | Verified: HF-076 Decision 57 already fixed this |

---

*Vialuce.ai — Intelligence. Acceleration. Performance.*
*OB-112: "The data was right. The display was lying."*
