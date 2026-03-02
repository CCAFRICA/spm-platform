# OB-112: IMPORT-TO-CALCULATION CHAIN REPAIR
## Target: alpha.3.0
## Derived from: CLT-111 systemic findings (F-19, F-20, F-21, F-33, F-34, F-43, F-45, F-51)
## Alpha Exit Criteria: #2 (import correct), #3 (multi-file), #10 (demo completes)

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all standing rules, anti-patterns, architecture decision gates
2. `SCHEMA_REFERENCE.md` — authoritative column reference for all Supabase tables

---

## WHY THIS OB EXISTS

CLT-111 proved that alpha.2.0's three fixes (better taxonomy, multi-file parsing, routing logic) improved individual steps but didn't fix the chain. The full pipeline for Caribe Financial:

```
Login → Landing (WRONG PAGE)
  → Import (7 files parsed ✓, but duplicated display, phantom Sheet1)
    → Mapping (types improved ✓, but vocabulary lost, semantic context missing)
      → Validate (useless page, wrong plan context, meaningless metrics)
        → Approve (noise, 3 representations of same data)
          → Commit (107 entities instead of 25, 28 periods instead of 4)
            → Calculate ($0.00 all entities — no rule_set_assignments exist)
              → Results (no diagnostics, dead-end "fix" link)
```

Every handoff between steps is broken. This OB fixes the five most critical handoff failures that prevent a multi-file import from reaching a non-zero calculation.

**This is NOT a full redesign.** This is surgical repair of the five broken links that block the demo pipeline. UX polish, navigation, validate page redesign — those wait for alpha.4.0+.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. Git commands from repo root (`spm-platform`), NOT from `web/`.
4. Commit this prompt as first action.
5. **DO NOT MODIFY ANY AUTH FILE.**
6. Supabase .in() ≤ 200 items.
7. **DO NOT MODIFY** the calculation engine, smart-mapper taxonomy, or AI prompt templates. Those work. Fix the chain AROUND them.

---

## THE FIVE BROKEN LINKS

| # | Broken Link | CLT-111 Evidence | Fix |
|---|-------------|------------------|-----|
| 1 | Multi-file display: Frankenstein page | F-3, F-6, F-7 | Remove legacy analysis UI when multi-file active |
| 2 | Entity deduplication: 107 instead of 25 | F-33 | Deduplicate entities by external_id at commit time |
| 3 | Period alignment: 28 instead of 4 | F-34 | Check existing periods before creating new ones |
| 4 | Rule set assignment: none created | F-43, F-45 | Auto-assign entities to rule sets after import |
| 5 | Landing routing: wrong page for every tenant | F-1, F-2 | Fix the feature detection, not the routing logic |

---

## PHASE 0: DIAGNOSTIC

```bash
echo "============================================"
echo "OB-112 PHASE 0: CHAIN REPAIR DIAGNOSTIC"
echo "============================================"

echo ""
echo "=== 1. MULTI-FILE DISPLAY — Find the Frankenstein ==="
# Where does the legacy Sheet Analysis UI render alongside OB-111's file cards?
grep -n "Plan Component Data\|sheetClassification\|Entity Roster\|roster.*detected" \
  web/src/app/data/import/enhanced/page.tsx | head -20
echo ""

echo "=== 2. ENTITY CREATION — Where are entities created during import? ==="
grep -rn "entities.*insert\|INSERT.*entities\|createEntit\|upsertEntit" \
  web/src/app/api/ --include="*.ts" | head -20
echo ""

echo "=== 3. PERIOD CREATION — Where are periods created? ==="
grep -rn "periods.*insert\|INSERT.*periods\|createPeriod\|upsertPeriod" \
  web/src/app/api/ --include="*.ts" web/src/lib/ --include="*.ts" | head -20
echo ""

echo "=== 4. RULE SET ASSIGNMENTS — Do they exist? ==="
grep -rn "rule_set_assignment\|rule_assignment\|assignEntit" \
  web/src/ --include="*.ts" --include="*.tsx" | head -20
echo ""

echo "=== 5. WHAT TABLE STORES ASSIGNMENTS? ==="
grep -rn "rule_set_assignment" web/src/ --include="*.ts" | head -10
# Also check if the table exists in schema reference
echo ""

echo "=== 6. LANDING ROUTING — What does HF-076 actually check? ==="
grep -n "hasFinancial\|hasICM\|financial.*module\|features\|pipelineData" \
  web/src/app/operate/page.tsx | head -20
echo ""

echo "=== 7. TENANT FEATURES — How is Sabor configured? ==="
# Check how tenant features are stored and what Sabor's look like
grep -rn "features.*financial\|modules.*financial\|financial_enabled" \
  web/src/ --include="*.ts" --include="*.tsx" | head -15
echo ""

echo "=== 8. COMMIT ENDPOINT — What happens at commit? ==="
find web/src/app/api -path "*commit*" -name "*.ts" | sort
# Read the first commit endpoint
COMMIT_FILE=$(find web/src/app/api -path "*commit*" -name "route.ts" | head -1)
echo "File: $COMMIT_FILE"
wc -l "$COMMIT_FILE" 2>/dev/null
head -100 "$COMMIT_FILE" 2>/dev/null
echo ""

echo "=== PHASE 0 COMPLETE ==="
echo "Read the FULL contents of:"
echo "1. The import page (enhanced/page.tsx) — understand multi-file vs legacy rendering"
echo "2. The commit endpoint — understand entity/period creation"
echo "3. The operate page — understand routing logic"
echo "Before proceeding to Phase 1."
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-112 Phase 0: Import-to-calculation chain diagnostic" && git push origin dev`

---

## PHASE 1: CLEAN MULTI-FILE DISPLAY — Remove the Frankenstein

**Problem:** OB-111 added per-file cards at the top of Sheet Analysis. The legacy single-file analysis UI still renders below, creating duplicated/contradictory displays and a phantom "Sheet1."

**Fix:** When `parsedFiles.length > 1` (multi-file mode), HIDE the legacy analysis sections:
- Hide "Plan Component Data" cards (the duplicate green cards)
- Hide "Entity Roster Detected" banner (phantom Sheet1)
- Hide any section that renders from the old single-file `WorkbookAnalysis` state

The OB-111 per-file cards become the ONLY representation.

**For single-file mode** (`parsedFiles.length <= 1` or `parsedFiles` not set), keep existing behavior unchanged. Óptica regression must pass.

**Implementation approach:**
```tsx
{/* Sheet Analysis step */}
{parsedFiles.length > 1 ? (
  // OB-111 multi-file cards — the ONLY view for multi-file
  <MultiFileAnalysisCards files={parsedFiles} plans={plans} ... />
) : (
  // Legacy single-file analysis — unchanged for Óptica
  <ExistingSheetAnalysis ... />
)}
```

**Also fix:** Per-file confidence should come from the AI analysis response, not hardcoded 50%. Read the actual confidence value from `parsedFiles[n].classification?.confidence` and display it. If the API returns no confidence, show "Analyzing..." not "50%."

**Proof gates:**
- PG-01: Upload 7 CSVs → see ONLY 7 cards, no duplicates below, no phantom Sheet1
- PG-02: Upload 1 XLSX → see existing single-file UI unchanged (regression)
- PG-03: No "Entity Roster Detected" banner on multi-file transaction data

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-112 Phase 1: Clean multi-file display — remove Frankenstein" && git push origin dev`

---

## PHASE 2: ENTITY DEDUPLICATION AT COMMIT

**Problem:** 7 files create entities independently. Officer 1001 appears in deposit data, loan data, insurance data → created 4+ times. 107 entities instead of 25.

**Fix:** At commit time, after collecting all entity IDs across all files in the batch:

```typescript
async function deduplicateEntities(
  tenantId: string,
  entityIds: string[],
  supabase: SupabaseClient
): Promise<Map<string, string>> {
  // 1. Get unique external IDs from the batch
  const uniqueIds = [...new Set(entityIds)];
  
  // 2. Check which already exist in the entities table
  const { data: existing } = await supabase
    .from('entities')
    .select('id, external_id')
    .eq('tenant_id', tenantId)
    .in('external_id', uniqueIds.slice(0, 200)); // Respect 200-item batch limit
  
  const existingMap = new Map(existing?.map(e => [e.external_id, e.id]) || []);
  
  // 3. Only create entities that don't already exist
  const newIds = uniqueIds.filter(id => !existingMap.has(id));
  
  // 4. Insert new entities (if any)
  if (newIds.length > 0) {
    // ... insert logic, collecting the new entity UUIDs
  }
  
  // 5. Return map: external_id → entity UUID (for both existing and new)
  return combinedMap;
}
```

**Key principle:** Entity creation is IDEMPOTENT. Importing the same officer ID multiple times (across files or across import sessions) always resolves to the same entity. Never create duplicates.

**If entities are created inside the commit endpoint:** Modify that endpoint to check-before-insert.
**If entities are created elsewhere (client-side or a different API):** Find and modify that code instead.

**Proof gates:**
- PG-04: Upload 7 CSVs with overlapping officer IDs → entity count equals unique officer count (25), not total mentions (107)
- PG-05: Re-import same files → entity count unchanged (no duplicates created)
- PG-06: Supabase query: `SELECT COUNT(*) FROM entities WHERE tenant_id = '<MBC>'` returns ~25

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-112 Phase 2: Entity deduplication — idempotent creation at commit" && git push origin dev`

---

## PHASE 3: PERIOD ALIGNMENT

**Problem:** 28 periods created instead of 4. System doesn't check what periods already exist.

**Fix:** Before creating periods, check for existing ones that match:

```typescript
async function alignPeriods(
  tenantId: string,
  detectedPeriods: Array<{ start: string; end: string; label: string }>,
  supabase: SupabaseClient
): Promise<Array<{ id: string; label: string; isNew: boolean }>> {
  
  // 1. Get all existing periods for this tenant
  const { data: existing } = await supabase
    .from('periods')
    .select('id, start_date, end_date, label')
    .eq('tenant_id', tenantId);
  
  const results = [];
  
  for (const detected of detectedPeriods) {
    // 2. Match by date range (not label — labels may differ between languages)
    const match = existing?.find(e => 
      e.start_date === detected.start && e.end_date === detected.end
    );
    
    if (match) {
      // 3. Existing period found — use it
      results.push({ id: match.id, label: match.label, isNew: false });
    } else {
      // 4. New period — create it
      const { data: created } = await supabase
        .from('periods')
        .insert({
          tenant_id: tenantId,
          start_date: detected.start,
          end_date: detected.end,
          label: detected.label,
          status: 'active',
        })
        .select('id')
        .single();
      
      results.push({ id: created.id, label: detected.label, isNew: true });
    }
  }
  
  return results;
}
```

**Also:** Clean up the 22 erroneous periods from CLT-102 that were created from hire dates. Run a diagnostic in Phase 0 to identify periods that don't look like monthly/quarterly ranges and flag them.

**Proof gates:**
- PG-07: Import 7 CSVs → exactly 4 periods created (Dec 2023, Jan-Mar 2024)
- PG-08: Re-import same files → no new periods created (matched to existing)
- PG-09: Supabase: `SELECT COUNT(*) FROM periods WHERE tenant_id = '<MBC>'` returns reasonable count (4-6, not 28)

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-112 Phase 3: Period alignment — match existing before creating" && git push origin dev`

---

## PHASE 4: AUTO-CREATE RULE SET ASSIGNMENTS

**Problem:** Import creates entities and stores data, but never creates the binding between entities and rule sets. Calculation fails with "No entities assigned to this rule set."

**Fix:** After import commit, create rule_set_assignments linking each entity to the relevant rule set(s).

**Step 1: Determine which entities appear in which file types.**

Each file was classified by the AI (e.g., "loan disbursement data," "insurance referral data"). The file classification maps to a plan:
- Loan disbursement files → Consumer Lending Commission plan
- Mortgage closing files → Mortgage Origination Bonus plan
- Insurance referral files → Insurance Referral Program plan
- Deposit balance files → Deposit Growth Incentive plan

**Step 2: After commit, for each file:**
```typescript
async function createRuleSetAssignments(
  tenantId: string,
  fileClassification: string,
  entityExternalIds: string[],
  planId: string | null,
  supabase: SupabaseClient
) {
  if (!planId) return; // No plan assigned to this file — skip
  
  // Get the rule set(s) for this plan
  const { data: ruleSets } = await supabase
    .from('rule_sets')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('plan_id', planId); // or however plans link to rule sets
  
  if (!ruleSets?.length) return;
  
  // Get entity UUIDs from external IDs
  const { data: entities } = await supabase
    .from('entities')
    .select('id, external_id')
    .eq('tenant_id', tenantId)
    .in('external_id', entityExternalIds.slice(0, 200));
  
  // Create assignments (check-before-insert for idempotency)
  for (const ruleSet of ruleSets) {
    for (const entity of entities || []) {
      // Check if assignment already exists
      const { data: existing } = await supabase
        .from('rule_set_assignments')
        .select('id')
        .eq('rule_set_id', ruleSet.id)
        .eq('entity_id', entity.id)
        .maybeSingle();
      
      if (!existing) {
        await supabase
          .from('rule_set_assignments')
          .insert({
            rule_set_id: ruleSet.id,
            entity_id: entity.id,
            tenant_id: tenantId,
            status: 'active',
          });
      }
    }
  }
}
```

**IMPORTANT:** This only works if the user has assigned a plan to each file (the per-file plan selector from OB-111). If no plan is assigned, the assignment can't be created. The commit summary should warn: "3 files have no plan assigned — entities from these files won't be included in calculations."

**If the `rule_set_assignments` table doesn't exist:** Create it. Check Phase 0 diagnostic first. The table may exist but be unused, or the calculation engine may use a different mechanism for entity-plan binding.

**Proof gates:**
- PG-10: Import 7 CSVs with plans assigned → rule_set_assignments created
- PG-11: Each unique officer has assignment to each rule set their data touches
- PG-12: Calculation no longer shows "No entities assigned" error
- PG-13: Calculation produces non-zero results for at least some entities

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-112 Phase 4: Auto-create rule set assignments from import" && git push origin dev`

---

## PHASE 5: LANDING ROUTING FIX — Feature Detection

**Problem:** HF-076's routing logic can't detect Sabor as Financial-primary. The `pipelineData` or tenant features check evaluates false when it should be true.

**Fix:** This is a data problem, not a logic problem. The routing logic in HF-076 is correct in principle (check modules → route appropriately). The failure is in HOW it checks.

**Diagnostic first:**
```bash
echo "=== What does Sabor's tenant features JSON look like? ==="
# Find the tenant features check
grep -n "features\|modules\|financial\|hasFinancial\|hasICM" \
  web/src/app/operate/page.tsx | head -20

echo ""
echo "=== What does the pipeline data return for financial? ==="
grep -n "financialData\|latestBatch\|dataRowCount" \
  web/src/app/operate/page.tsx | head -20
```

**Likely root cause:** Sabor's tenant record has `features: {"modules": ["icm", "financial"]}` but the code checks `features?.financial === true` or a different path. The shape of the features JSONB doesn't match what the code expects.

**Fix approach:**
1. Read Sabor's actual features from Supabase
2. Adjust the routing check to match the actual data shape
3. Test: Sabor → `/financial/pulse`, MBC → somewhere appropriate (not import)

**For MBC:** The routing should check if the tenant has active plans AND committed data. If yes, route to a plan overview or calculation page — not the raw import page. Landing on import after login is only appropriate for truly empty tenants.

**Proof gates:**
- PG-14: Sabor login → lands on /financial (not /data/import/enhanced)
- PG-15: MBC login → lands somewhere other than blank import page
- PG-16: Óptica login → lands on /operate/calculate or equivalent (has completed calcs)
- PG-17: Empty tenant → lands on import (this is the only case import landing is correct)

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-112 Phase 5: Landing routing — fix feature detection" && git push origin dev`

---

## PHASE 6: BUILD AND COMPLETE

### 6A: Clean Build

```bash
cd /Users/AndrewAfrica/spm-platform/web
pkill -f "next dev" 2>/dev/null || true
rm -rf .next
npm run build 2>&1 | tail -30
echo "Build exit code: $?"
npm run dev &
sleep 10
curl -s -o /dev/null -w "localhost:3000 status: %{http_code}\n" http://localhost:3000
```

### 6B: Full Proof Gates (17)

| # | Gate | Criterion |
|---|------|-----------|
| PG-01 | 7 CSVs → 7 cards only, no duplicates, no phantom Sheet1 | Multi-file display |
| PG-02 | 1 XLSX → existing single-file UI (regression) | Single-file regression |
| PG-03 | No "Entity Roster Detected" on multi-file transaction data | Classification |
| PG-04 | 7 CSVs → entity count = unique officers (≤30), not 107 | Entity dedup |
| PG-05 | Re-import → entity count unchanged | Idempotent entities |
| PG-06 | Supabase entity count reasonable | Database verify |
| PG-07 | Import → exactly 4 periods (Dec, Jan, Feb, Mar) | Period alignment |
| PG-08 | Re-import → no new periods | Idempotent periods |
| PG-09 | Supabase period count reasonable | Database verify |
| PG-10 | Import with plans → rule_set_assignments created | Auto-assignment |
| PG-11 | Each officer assigned to relevant rule sets | Assignment correctness |
| PG-12 | Calculation no "No entities assigned" error | Assignment wiring |
| PG-13 | Calculation produces non-zero for some entities | End-to-end |
| PG-14 | Sabor → /financial | Landing routing |
| PG-15 | MBC → not blank import page | Landing routing |
| PG-16 | Óptica → calculation results | Landing routing |
| PG-17 | npm run build exits 0 | Clean build |

### 6C: Create PR

```bash
cd /Users/AndrewAfrica/spm-platform && \
gh pr create --base main --head dev \
  --title "OB-112: Import-to-Calculation Chain Repair [alpha.3.0]" \
  --body "## Target: alpha.3.0
## Derived from: CLT-111 systemic findings

### What Changed
Five broken links in the import-to-calculation chain repaired:

1. **Multi-file display**: Legacy single-file UI hidden in multi-file mode. No more duplicate cards or phantom Sheet1.
2. **Entity deduplication**: Entities created idempotently by external_id. 7 files with same 25 officers → 25 entities, not 107.
3. **Period alignment**: Checks existing periods before creating. Matches by date range. No more 28 periods for 4 months of data.
4. **Rule set assignments**: Auto-created at import commit based on file-to-plan association. Calculation can now find entities.
5. **Landing routing**: Feature detection fixed. Sabor → Financial. MBC → appropriate page. Empty tenant → Import.

### What This Does NOT Change
- Calculation engine (proven 100% accurate)
- AI field mapping taxonomy (OB-110, working)
- Validate/Preview page UX (needs design session)
- Navigation structure (needs design session)
- N+1 query pattern (PDR-04, architectural fix)

17 proof gates."
```

**Final commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-112 Complete: Import-to-calculation chain repair — targeting alpha.3.0" && git push origin dev`

---

## ANTI-PATTERNS TO AVOID

| # | Anti-Pattern | Prevention |
|---|---|---|
| AP-1 | Skip Phase 0 diagnostic | MUST understand how entities/periods/assignments are currently created |
| AP-4 | Build dedup logic but don't wire to commit endpoint | Verify the commit endpoint actually calls deduplicateEntities |
| AP-6 | Git from web/ | cd to spm-platform root |
| AP-7 | Break single-file import | PG-02 regression gate is mandatory |
| AP-12 | Create rule_set_assignments table but engine doesn't read it | Verify the calculation engine queries this table |
| AP-16 | Fix routing logic but not the data it reads | Check Sabor's actual features JSONB first |

---

*Vialuce.ai — Intelligence. Acceleration. Performance.*
*OB-112: "Fix the chain, not the links."*
