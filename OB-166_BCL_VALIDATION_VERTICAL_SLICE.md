# OB-166: BCL Validation Vertical Slice
## Intelligence Stream Fixes + Browser Import Proof — One PR, One Journey

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules, anti-patterns, operational requirements
2. `SCHEMA_REFERENCE_LIVE.md` — actual database schema (generated March 7, 2026 from live Supabase)
3. This prompt in its entirety — every phase is load-bearing

---

## WHAT THIS OB IS

A vertical slice. Engine and experience together. One PR.

Andrew must be able to complete this entire journey in the browser on vialuce.ai after this PR merges:

1. Login as BCL admin → see Intelligence Stream with correct data
2. Click an action on the Intelligence Stream → arrive at Import
3. Upload a BCL monthly data file through the browser → data commits
4. Navigate to Calculate → run calculation → results appear
5. Return to Intelligence Stream → see updated numbers
6. Switch persona to Manager → see team grid with per-component data
7. Switch persona to Individual (Valentina) → see her personal earnings

If any step in this journey fails, the OB has failed. There are no partial passes.

## WHAT THIS OB IS NOT

- NOT a new feature build. Zero new components. Zero new concepts.
- NOT DS-013 Phase B. No trajectory, no allocation intelligence, no warm-tier features.
- This is a FIX + PROVE OB. Fix what OB-165 broke. Prove the platform works end-to-end through the browser.

---

## CONTEXT — WHAT'S BROKEN

OB-165 (PR #230) built the Intelligence Stream at `/stream`. It partially works. CLT-165 browser verification found these failures:

| # | Finding | Severity | Detail |
|---|---------|----------|--------|
| F-01 | Individual stream completely blank | **P0** | Valentina Salazar logs in, sees `/stream` header and nothing else. Zero cards render. |
| F-02 | `/operate` redirects to `/stream` | **P0** | The entire Operate workspace (import, calculate, reconcile) is unreachable via sidebar. Direct URLs `/operate/import` and `/operate/calculate` still work. |
| F-03 | Manager grid shows all dashes | **P1** | Fernando Hidalgo sees team totals but every component cell is "–". No per-component breakdown. |
| F-04 | Manager 30/30 "Needs Attention" | **P1** | Every entity classified as "Needs Attention". Zero "On Track" or "Exceeding". Threshold logic is wrong. |
| F-05 | Admin missing OptimizationCard and BloodworkCard | **P2** | Only SystemHealthCard, LifecycleCard, and DistributionCard render. |

### What works (do NOT break these):
- Admin SystemHealthCard: $60,107 for March BCL (correct GT match)
- Admin: 85 entities, 4 components (correct)
- Admin: +15.1% vs prior period (correct)
- Admin LifecycleCard and DistributionCard render correctly
- Meridian admin: MX$185,063 (correct GT match), COLD START badge
- BCL: HOT badge (6 periods). Meridian: COLD START badge (1 period). Confidence tier is data-driven — working.
- Manager TeamHealthCard hero: $21,595, 30 team members
- Manager entity names from database (Korean Test passes visually)
- Manager GT anchors: Gabriela Vascones $2,070, Valentina Salazar $945 (March, correct)
- Persona gradients: indigo/amber/emerald all rendering
- `/operate/import` and `/operate/calculate` work when hit directly

---

## CC FAILURE PATTERNS TO AVOID

| # | Pattern | What Happened | Prevention |
|---|---------|---------------|------------|
| FP-67 | Building a dashboard and calling it intelligence | OB-163's Briefing was charts without actions | This OB fixes existing components, doesn't build new ones |
| FP-66 | Seeding instead of importing | OB-163 seeded BCL data via SQL | Phase 4 requires browser file upload — if CC uses SQL INSERT, the OB has failed |
| FP-68 | Missing completion report | OB-164 delivered PR without evidence | Phase 6 requires screenshots |
| AP-9 | Report PASS based on file existence | OB-165 reported PG-03 PASS but Individual stream is blank | Every proof gate in this OB requires a SCREENSHOT or PASTED QUERY RESULT |
| AP-11 | Shell pages that pass existence checks | OB-165 components exist as files but don't render | The test is what Andrew sees in the browser, not what exists in the codebase |
| AP-14 | profiles.entity_id | Column doesn't exist. Linkage is entities.profile_id → profiles.id | Phase 2 must use correct linkage path |

---

## PHASE 0: DIAGNOSTIC — UNDERSTAND WHY IT'S BROKEN

**Do NOT write any fix code in this phase. Only observe and document.**

```bash
echo "============================================"
echo "OB-166 PHASE 0: DIAGNOSTIC"
echo "============================================"

echo ""
echo "=== 0A: WHY IS INDIVIDUAL STREAM BLANK? ==="
echo "--- Check how buildIndividualData resolves entity_id ---"
grep -n "personaEntityId\|entityId\|entity_id\|buildIndividual" \
  web/src/lib/data/intelligence-stream-loader.ts | head -30

echo ""
echo "--- Check persona context entity resolution ---"
grep -n "entityId\|entity_id\|profile_id" \
  web/src/contexts/persona-context.tsx | head -30

echo ""
echo "--- Check Valentina's profile → entity linkage in DB ---"
echo "RUN THIS IN SUPABASE SQL EDITOR:"
echo "SELECT p.id as profile_id, p.email, p.role, p.tenant_id,"
echo "  e.id as entity_id, e.external_id, e.display_name, e.profile_id as entity_profile_id"
echo "FROM profiles p"
echo "LEFT JOIN entities e ON e.profile_id = p.id"
echo "WHERE p.email = 'valentina@bancocumbre.ec';"

echo ""
echo "=== 0B: WHY IS MANAGER GRID ALL DASHES? ==="
echo "--- Check how component data is loaded for grid ---"
grep -n "component\|grid\|heatmap\|breakdown" \
  web/src/lib/data/intelligence-stream-loader.ts | head -30

echo ""
echo "--- Check calculation_results structure for BCL ---"
echo "RUN THIS IN SUPABASE SQL EDITOR:"
echo "SELECT entity_id, rule_set_id, components, final_payout"
echo "FROM calculation_results"
echo "WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'"
echo "LIMIT 3;"

echo ""
echo "=== 0C: WHY IS SEGMENTATION ALL 'NEEDS ATTENTION'? ==="
grep -n "exceeding\|onTrack\|needsAttention\|threshold\|segment\|attainment" \
  web/src/lib/data/intelligence-stream-loader.ts \
  web/src/components/intelligence/TeamHealthCard.tsx | head -30

echo ""
echo "=== 0D: OPERATE REDIRECT ==="
cat web/src/app/operate/page.tsx

echo ""
echo "=== 0E: PERFORM REDIRECT ==="
cat web/src/app/perform/page.tsx

echo ""
echo "=== 0F: IMPORT PAGE STILL WORKS? ==="
ls -la web/src/app/operate/import/
cat web/src/app/operate/import/page.tsx | head -40

echo ""
echo "=== 0G: CALCULATE PAGE STILL WORKS? ==="
ls -la web/src/app/operate/calculate/
cat web/src/app/operate/calculate/page.tsx | head -40
```

**After running diagnostics, document findings in a commit:**

```
DIAGNOSTIC FINDINGS — OB-166 Phase 0
=====================================
F-01 Root Cause (Individual blank): [PASTE WHAT YOU FOUND]
F-02 Root Cause (/operate redirect): [PASTE THE REDIRECT CODE]
F-03 Root Cause (Grid dashes): [PASTE THE DATA LOADING ISSUE]
F-04 Root Cause (Segmentation): [PASTE THE THRESHOLD LOGIC]

Supabase query results:
- Valentina profile→entity linkage: [PASTE RESULT]
- BCL calculation_results components structure: [PASTE RESULT]
```

**Commit:** `OB-166 Phase 0: Diagnostic — root cause analysis for 5 CLT-165 findings`

---

## PHASE 1: RESTORE OPERATE WORKSPACE (F-02 fix)

The `/operate` route must be a functional page, NOT a redirect to `/stream`.

1. Revert `web/src/app/operate/page.tsx` to its state before OB-165 (PR #230). Use `git show HEAD~1:web/src/app/operate/page.tsx` or the OB-165 Architecture Decision which documented the pre-OB-165 state.
2. Revert `web/src/app/perform/page.tsx` — same logic. If `/perform` had content before OB-165, restore it. If it was already a redirect to somewhere useful, keep that behavior but do NOT redirect to `/stream`.
3. `/operate/briefing` → `/stream` redirect is FINE. The Briefing is genuinely superseded. Leave this redirect.
4. Sidebar must show both Operate (→ `/operate`) and Intelligence (→ `/stream`) as distinct workspace entries.

**Verification:**
```bash
# After fix, confirm operate page is NOT a redirect
grep -n "redirect\|replace\|router.push\|router.replace" web/src/app/operate/page.tsx
# Should show NO redirect to /stream

# Confirm build passes
npm run build 2>&1 | tail -20
```

**Commit:** `OB-166 Phase 1: Restore /operate and /perform as functional routes`

---

## PHASE 2: FIX INDIVIDUAL STREAM (F-01 fix)

The Individual stream is blank for Valentina Salazar. This is a P0 — the largest user population sees nothing.

### Root Cause Investigation

The linkage path is: `profiles.id` ← `entities.profile_id`. The column `profiles.entity_id` DOES NOT EXIST (AP-14).

Check the intelligence-stream-loader.ts to see how `buildIndividualData()` resolves the entity:
- If it reads `personaEntityId` from `usePersona()`, trace how usePersona derives that value
- If usePersona reads from `profile_scope.visible_entity_ids`, check that profile_scope is populated for BCL demo users
- If usePersona reads from `entities WHERE profile_id = currentProfileId`, check that BCL entities have `profile_id` set

**The fix must follow this chain:**
1. Authenticated user → `profiles.id`
2. `entities WHERE profile_id = profiles.id AND tenant_id = current_tenant` → `entities.id`
3. `calculation_results WHERE entity_id = entities.id` → results

**SQL verification (run in Supabase SQL Editor BEFORE writing fix):**
```sql
-- Check if BCL entities have profile_id set
SELECT id, external_id, display_name, profile_id
FROM entities
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
AND display_name ILIKE '%valentina%';

-- Check if Valentina's profile exists and is linked
SELECT p.id as profile_id, p.email, e.id as entity_id, e.display_name
FROM profiles p
LEFT JOIN entities e ON e.profile_id = p.id
WHERE p.email = 'valentina@bancocumbre.ec';
```

**If `profile_id` is NULL on Valentina's entity:** The OB-163 seeding script created entities without linking them to profiles. Fix: UPDATE the entity to set `profile_id` to Valentina's profile ID. Also fix for Fernando (manager) and Patricia (admin) demo users.

**If `profile_id` is set but the loader doesn't use it:** Fix the loader to query `entities WHERE profile_id = ?` to resolve the entity_id, then query `calculation_results WHERE entity_id = ?`.

**After fix, verify on localhost:**

Log in as valentina@bancocumbre.ec. Navigate to `/stream`. The PersonalEarningsCard MUST render with her March 2026 total of $945.

**Proof gate — PASTE A SCREENSHOT of Valentina's Individual stream showing $945.**

If you cannot take a screenshot, paste the localhost console output showing the data that loaded, AND paste the Supabase query result confirming her entity linkage.

**Commit:** `OB-166 Phase 2: Fix Individual stream — entity resolution via profile_id linkage`

---

## PHASE 3: FIX MANAGER COMPONENT GRID + SEGMENTATION (F-03 + F-04 fix)

### F-03: Component grid shows dashes

The Team Performance Grid shows entity totals but all component cells are "–".

**Root cause:** `buildManagerData()` in `intelligence-stream-loader.ts` fetches `calculation_results` but doesn't extract per-component amounts from the `components` JSONB field.

**How calculation_results stores component data:**
```sql
-- Check the actual structure
SELECT entity_id, components, final_payout
FROM calculation_results
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
LIMIT 1;
```

The `components` field is JSONB containing per-component results. The grid needs to extract each component's `final_payout` (or equivalent field) and display it in the correct column.

**Fix:** Parse the `components` JSONB for each entity's calculation_result. Map component names to grid columns. Display the per-component payout in each cell instead of "–".

### F-04: 30/30 "Needs Attention"

The segmentation logic classifies entities as exceeding/on-track/needs-attention based on some threshold. Currently all 30 are "Needs Attention."

**Root cause:** Either:
- (a) The threshold is hardcoded (e.g., attainment > 100% = exceeding, > 80% = on track) but the loader doesn't compute attainment, OR
- (b) The segmentation reads a field that doesn't exist or is always null, causing the default "needs attention" classification

**Fix:** The segmentation must read actual data. Options:
- If `components` JSONB contains attainment data, use it
- If not, compute attainment from `final_payout` vs plan targets from `rule_sets`
- If neither is available, segment by relative position (above median = on track, top quartile = exceeding, below median = needs attention)

**The simplest correct approach:** Use relative position. It requires no plan-specific threshold knowledge and works for any tenant. Above population median = "On Track". Top 25% = "Exceeding". Below median = "Needs Attention". This is domain-agnostic and Korean Test compliant.

**After fix, verify on localhost:**

Log in as fernando@bancocumbre.ec. Navigate to `/stream`. The Team Performance Grid MUST show per-component values in each cell (not dashes). The segmentation pills MUST NOT show 30/30 "Needs Attention."

**Proof gate — PASTE A SCREENSHOT of Fernando's Manager stream showing:**
1. Component columns with actual dollar values (not dashes)
2. Segmentation pills with a reasonable distribution (not 0/0/30)

**Commit:** `OB-166 Phase 3: Fix Manager grid component data + segmentation logic`

---

## PHASE 4: BCL BROWSER IMPORT PROOF

**This is the most important phase.** The calculation engine proof for BCL was done via import script (OB-164). The browser import has NEVER been tested for BCL. This phase proves it works.

**CRITICAL: If you insert data via SQL instead of uploading through the browser, this phase has failed completely. The entire point is to prove the browser import pipeline works.**

### Step 4A: Prepare

Identify a BCL monthly data file. The files were generated during OB-163 and live in the repo or as uploaded artifacts. If the file is not available in the repo, create a minimal BCL data file that matches the expected format:
- Entity external IDs matching BCL entities
- 4 component metrics
- One month of data (e.g., a period not yet imported, OR re-import an existing period)

If all 6 BCL periods are already in `committed_data`, you need to either:
- (a) Delete one period's committed_data and re-import it through the browser, OR
- (b) Use the existing import pipeline to upload the same file again (testing idempotency), OR
- (c) Create a 7th month file and import it fresh

**Option (a) is preferred** — it proves the full import pipeline produces the same results the script did.

### Step 4B: Upload through browser

1. Open localhost:3000
2. Login as admin@bancocumbre.ec (password: demo-password-BCL1)
3. Navigate to `/operate/import` (this must work after Phase 1 fix)
4. Upload the BCL monthly data file through the browser file picker
5. Wait for AI classification to complete
6. Proceed through field mapping / confirmation steps
7. Commit the import

### Step 4C: Verify import

```sql
-- Run in Supabase SQL Editor (or via localhost if admin tools available)

-- Check ingestion_events got a row
SELECT id, tenant_id, status, records_processed, created_at
FROM ingestion_events
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
ORDER BY created_at DESC
LIMIT 3;

-- Check committed_data row count
SELECT COUNT(*) as row_count
FROM committed_data
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

-- Check classification_signals for new entries
SELECT signal_type, COUNT(*) as count
FROM classification_signals
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
GROUP BY signal_type
ORDER BY count DESC;
```

### Step 4D: Run calculation through browser

1. Navigate to `/operate/calculate`
2. Run calculation for the imported period
3. Verify results appear

### Step 4E: Verify results match GT

```sql
-- Check calculation results for the imported period
SELECT
  SUM(final_payout) as total_payout,
  COUNT(*) as entity_count
FROM calculation_results
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
AND period_id = (
  SELECT id FROM periods
  WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
  ORDER BY start_date DESC LIMIT 1
);
```

The total must match the BCL ground truth for that period. Per-period GT:
- Oct $48,314 / Nov $49,727 / Dec $65,253 / Jan $45,739 / Feb $52,241 / Mar $60,107

### Step 4F: Return to Intelligence Stream

Navigate to `/stream`. The SystemHealthCard should now reflect the data that was just imported and calculated. If you deleted a period and re-imported it, the numbers should match what they were before.

**Proof gates for Phase 4 — ALL required, ALL must include pasted evidence:**

| # | Gate | Evidence Required |
|---|------|-------------------|
| PG-4A | File uploaded through browser file picker | Screenshot of import page with file selected |
| PG-4B | Import pipeline processes file (not SQL insert) | Paste `ingestion_events` query result showing new row |
| PG-4C | Data committed | Paste `committed_data` count query |
| PG-4D | Calculation run through browser | Screenshot of calculate page showing results |
| PG-4E | Results match GT | Paste `calculation_results` SUM query with total matching GT |
| PG-4F | Intelligence Stream reflects data | Screenshot of `/stream` admin view |

**Commit:** `OB-166 Phase 4: BCL browser import proof — file upload → classify → commit → calculate → verify`

---

## PHASE 5: WIRE ONE ACTION BUTTON

The Intelligence Stream has action buttons that are dead callbacks. Wire exactly ONE to prove the thermostat pattern:

**The LifecycleCard "Start Reconciliation →" button** (visible in admin stream for both BCL and Meridian).

Wire it to navigate to `/operate/reconcile` (or the correct reconciliation route). This is a simple `router.push('/operate/reconcile')` — not a new feature, just connecting an existing button to an existing page.

**If `/operate/reconcile` doesn't exist as a route**, wire the button to `/operate` instead. The point is: the button does something, not nothing.

**Also wire:** The lifecycle stepper's "Advance to PREVIEW" action. If clicking it should advance the calculation batch lifecycle, wire it. If that's too complex, wire it as navigation to the relevant operational page.

**Proof gate:** Click "Start Reconciliation →" on localhost. Paste screenshot showing navigation occurred.

**Commit:** `OB-166 Phase 5: Wire LifecycleCard action buttons to operational routes`

---

## PHASE 6: COMPLETION REPORT WITH SCREENSHOTS

**This is not optional. This is not a code-path summary. This is pasted evidence from the running application.**

Create `OB-166_COMPLETION_REPORT.md` with this exact structure:

```markdown
# OB-166 COMPLETION REPORT — BCL Validation Vertical Slice

## Phase 0: Diagnostic
[Paste diagnostic findings — root causes for all 5 CLT-165 failures]

## Phase 1: Operate Restored
- Screenshot or evidence: /operate loads as functional page (not redirect)
- Screenshot or evidence: /operate/import accessible from sidebar navigation

## Phase 2: Individual Stream Fixed
- Supabase query: Valentina's entity linkage (profile_id → entity_id)
- Screenshot: Valentina's /stream showing $945 (March 2026)
  [IF SCREENSHOT NOT POSSIBLE: paste console.log showing loaded data + paste DB query]

## Phase 3: Manager Grid + Segmentation Fixed
- Screenshot: Fernando's /stream showing component values in grid (not dashes)
- Screenshot: Segmentation pills showing distribution (not 0/0/30)

## Phase 4: BCL Browser Import
- Screenshot: Import page with BCL file selected
- Pasted query: ingestion_events showing new row
- Pasted query: committed_data count
- Screenshot: Calculate page showing results
- Pasted query: calculation_results SUM matching GT
- Screenshot: Intelligence Stream reflecting imported data

## Phase 5: Action Button Wired
- Screenshot: Clicking "Start Reconciliation →" navigates to reconciliation page

## Build
- npm run build exits 0 (paste last 10 lines of build output)
- /stream route size in build output
```

**Commit:** `OB-166 Phase 6: Completion report with production evidence`

---

## PHASE 7: PR

```bash
cd /Users/AndrewAfrica/spm-platform
gh pr create --base main --head dev \
  --title "OB-166: BCL Validation Vertical Slice — Stream Fixes + Browser Import Proof" \
  --body "## What This Fixes
- F-01: Individual stream blank → entity resolution via profile_id linkage
- F-02: /operate redirected to /stream → restored as functional workspace
- F-03: Manager grid all dashes → component JSONB extraction
- F-04: 30/30 Needs Attention → relative position segmentation

## What This Proves
- BCL data imported through browser (not script)
- Import → classify → commit → calculate → results match GT
- Intelligence Stream reflects real calculation data for all 3 personas
- Action buttons navigate to operational pages

## Evidence
See OB-166_COMPLETION_REPORT.md for screenshots and DB query results.

## Regression
- Admin SystemHealthCard: BCL $60,107 (March GT) unchanged
- Meridian: MX\$185,063 unchanged
- /operate/import and /operate/calculate accessible
- Build exits 0"
```

---

## SUMMARY — WHAT SUCCESS LOOKS LIKE

After this PR merges, Andrew logs into vialuce.ai as BCL admin and completes the full journey:

1. ✅ Sees Intelligence Stream with correct BCL data ($60,107 March)
2. ✅ Clicks lifecycle action → arrives at operational page
3. ✅ Navigates to Import → uploads a BCL file → data commits
4. ✅ Navigates to Calculate → runs engine → results match GT
5. ✅ Returns to Intelligence Stream → numbers reflect imported data
6. ✅ Switches to Manager (Fernando) → sees team grid WITH component values
7. ✅ Switches to Individual (Valentina) → sees $945 personal earnings

Seven steps. One journey. One PR. No partial passes.

---

## VERIFICATION ANCHORS (for CC to check against)

| Entity | March 2026 Total | Verification |
|--------|-----------------|--------------|
| Gabriela Vascones (BCL-5003, Ejecutivo Senior) | $2,070 | C1=$900 + C2=$750 + C3=$270 + C4=$150 |
| Valentina Salazar (BCL-5012, Ejecutivo) | $945 | C1=$450 + C2=$275 + C3=$120 + C4=$100 |
| Diego Mora (BCL-5063, Ejecutivo) | $671 | C1=$300 + C2=$275 + C3=$96 + C4=$0 (gate fail) |
| BCL March Total | $60,107 | 85 entities |
| BCL 6-Month Total | $321,381 | All periods |
| Meridian Total | MX$185,063 | 67 entities, January 2025 |

---

*"The engine produces the right numbers. Now prove the platform can get data in and results out through the browser. Seven steps. One journey. One PR."*
