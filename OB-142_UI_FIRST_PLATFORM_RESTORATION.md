# OB-142: UI-FIRST PLATFORM RESTORATION
## Experience + Engine — Evolving Together
## Estimated Duration: 6–8 hours

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST — IN THIS ORDER

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules, all anti-patterns
2. `SCHEMA_REFERENCE.md` — authoritative column reference
3. `OB-140_DIAGNOSIS.md` — the 8 contributing factors this OB fixes
4. `web/prompts/DS-006_PROTOTYPE.jsx` — the approved UI design target (COMMITTED IN PHASE 0)
5. This entire prompt before executing anything

---

## CONTEXT

CLT-139 revealed the platform is broken: 22,237 entities (should be 719), wrong rule_set active, calculation producing $524K instead of $1.28M, UI bears no resemblance to the approved DS-006 v2 design, missing pages, undocumented pages, 500-600 requests per page load.

OB-140 diagnosed the root cause: PPTX import auto-archived the proven plan and activated a heuristic replacement. 8 contributing factors documented with evidence.

This OB fixes everything together — experience and engine. The admin walks through the UI, sees the intelligence, confirms, and the number on screen proves the engine.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000 responds
3. Commit this prompt + DS-006 prototype to git as first action
4. Git from repo root (spm-platform), NOT web/
5. **DO NOT MODIFY ANY FILE IN THE AUTH CHAIN** (middleware.ts, auth-service.ts, session-context.tsx, auth-shell.tsx)
6. Supabase `.in()` ≤ 200 items. Batch everything.

---

## PHASE 0: COMMIT PROMPT + DS-006 PROTOTYPE

Copy the DS-006 v2 prototype from `web/prompts/DS-006_PROTOTYPE.jsx` into the codebase. This file IS the design target. Read it before writing any UI code.

```bash
cp OB-142_UI_FIRST_PLATFORM_RESTORATION.md web/prompts/
git add -A
git commit -m "OB-142 Phase 0: Commit prompt + DS-006 prototype"
git push origin dev
```

---

## PHASE 1: DELETE AND RE-SEED ÓPTICA LUMINAR TENANT

Delete the entire tenant and all its data. Then re-run the proven seed script.

### 1A: Delete tenant data (FK order)

```typescript
// web/scripts/ob142-phase1-delete-tenant.ts
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function deleteTenant() {
  // Find Óptica Luminar tenant
  const { data: tenants } = await supabase.from('tenants').select('id, name, slug');
  const ol = tenants?.find(t => t.name?.includes('Optica') || t.name?.includes('Luminar') || t.slug?.includes('optica'));
  if (!ol) { console.error('Tenant not found'); process.exit(1); }
  const TID = ol.id;
  console.log(`Deleting tenant: ${ol.name} (${TID})`);

  // Delete in FK order — batch large tables
  const tables = [
    'calculation_results', 'calculation_batches', 'entity_period_outcomes',
    'rule_set_assignments', 'committed_data', 'classification_signals',
    'import_batches', 'metric_derivations', 'entities', 'rule_sets', 'periods'
  ];
  
  for (const table of tables) {
    let deleted = 0;
    while (true) {
      const { data: batch } = await supabase
        .from(table).select('id').eq('tenant_id', TID).limit(200);
      if (!batch || batch.length === 0) break;
      await supabase.from(table).delete().in('id', batch.map(r => r.id));
      deleted += batch.length;
    }
    console.log(`  ${table}: ${deleted} rows deleted`);
  }

  // Delete profiles
  const { data: profiles } = await supabase.from('profiles').select('id').eq('tenant_id', TID);
  if (profiles?.length) {
    await supabase.from('profiles').delete().in('id', profiles.map(p => p.id));
    console.log(`  profiles: ${profiles.length} deleted`);
  }

  // Delete tenant
  await supabase.from('tenants').delete().eq('id', TID);
  console.log(`  tenants: deleted ${ol.name}`);

  // Verify
  for (const table of [...tables, 'profiles']) {
    const { count } = await supabase.from(table).select('*', { count: 'exact', head: true }).eq('tenant_id', TID);
    if (count && count > 0) console.error(`  ⚠️ ${table} still has ${count} rows!`);
  }
  console.log('\nTenant deleted. Ready for re-seed.');
}

deleteTenant().catch(console.error);
```

### 1B: Re-run seed script

```bash
# Find the seed script
grep -rn "optica\|luminar\|1253832\|748600" web/scripts/ web/seed/ --include="*.ts" | head -20
# Run it
cd web && npx tsx <seed-script-path>
```

### 1C: Verify seed data

```typescript
// Inline verification — run after seed
const { count: entities } = await supabase.from('entities').select('*', { count: 'exact', head: true }).eq('tenant_id', TID);
const { data: rs } = await supabase.from('rule_sets').select('id, name, status').eq('tenant_id', TID);
const { count: cd } = await supabase.from('committed_data').select('*', { count: 'exact', head: true }).eq('tenant_id', TID);
const { data: periods } = await supabase.from('periods').select('id, label').eq('tenant_id', TID);
console.log(`Entities: ${entities} (expect 22)`);
console.log(`Rule sets: ${rs?.map(r => `${r.name} [${r.status}]`).join(', ')}`);
console.log(`Committed data: ${cd}`);
console.log(`Periods: ${periods?.length}`);
```

**PASTE ALL OUTPUT.**

**Commit:** `OB-142 Phase 1: Delete and re-seed Óptica Luminar tenant`

---

## PHASE 2: FIX PIPELINE BUGS (4 Surgical Changes)

### 2A: PPTX import creates rule_sets as draft — never auto-archives

```bash
grep -rn "archived\|archive\|status.*active" web/src/app/api/import/sci/ web/src/lib/sci/ --include="*.ts" | head -20
```

Find the code that sets existing rule_sets to `archived` when a new one is imported. Change:
- New rule_sets from PPTX import get `status: 'draft'`
- Existing rule_sets are NOT modified
- No auto-activation

### 2B: SCI entity pipeline deduplicates by external_id

```bash
grep -rn "entities.*insert\|from('entities').*insert\|createEntit" web/src/lib/sci/ web/src/app/api/import/sci/ --include="*.ts" | head -20
```

Before inserting entities:
1. Extract unique external_ids from the data
2. Query existing: `SELECT id, external_id FROM entities WHERE tenant_id = ? AND external_id IN (?)`
3. Batch the `.in()` at ≤ 200
4. Insert only genuinely new entities
5. Return map of external_id → entity_id (existing + new)

### 2C: Assignment creation chunks at 200

```bash
grep -rn "rule_set_assignments.*insert" web/src/ --include="*.ts" | head -20
```

Chunk any bulk insert of assignments:
```typescript
const CHUNK = 200;
for (let i = 0; i < assignments.length; i += CHUNK) {
  await supabase.from('rule_set_assignments').insert(assignments.slice(i, i + CHUNK));
}
```

### 2D: Old plan import route redirects to /operate/import

```bash
find web/src/app -path "*configure*plan*" -name "page.tsx" | sort
```

Replace with redirect:
```typescript
'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
export default function PlanImportRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/operate/import'); }, [router]);
  return null;
}
```

### 2E: Build

```bash
cd web && rm -rf .next && npm run build
```

**Commit:** `OB-142 Phase 2: Pipeline fixes — draft plans, entity dedup, assignment chunking, route redirect`

---

## PHASE 3: REBUILD SCIProposal TO DS-006 v2

**READ `web/prompts/DS-006_PROTOTYPE.jsx` BEFORE WRITING ANY CODE.**

The prototype defines the EXACT component structure, layout, and behavior. CC implements the production version by:
1. Reading the prototype components (ContentUnitCard, ConfidenceIndicator, VerdictBadge, ScenarioReview)
2. Replacing mock data with actual SCI API response data
3. Keeping the EXACT same visual structure, class names, and interaction patterns

### What the DS-006 v2 prototype specifies:

**Collapsed card row (always visible):**
- Checkbox (confirm)
- Tab name (customer vocabulary)
- Verdict badge (split/plan/entities/targets/transactions/uncertain)
- Verdict text (natural language: "This looks like two things in one sheet")
- Row count
- Confidence bar (green ≥75%, amber ≥50%, red <50%)
- Expand chevron

**Expanded card (on click):**
- Content profile headline (e.g. "2,187 rows × 12 columns — employee numbers, store codes...")
- "What I observe" — structural facts with icons (🔑 num_empleado — 719 unique values...)
- "Why I chose this classification" — reasoning text
- "What would change my mind" — honest uncertainty
- Close scores warning (amber box when alt classification is within 15%)
- Split info (violet box when sheet is being split)

**Summary bar:**
- N confident · N need review
- Total rows
- "Confirm all →" button

**Footer:**
- "✓ Confirm all" text button
- "Import N rows →" primary button (disabled until all confirmed)

### Data mapping: SCI API response → DS-006 v2 UI

The SCI analyze API returns `contentUnits[]` where each unit has:
- `tabName` → card title
- `classification` → verdict badge type
- `classificationVerdict` or `verdict` → verdict text
- `confidence` → confidence bar value
- `altClassification` / `altConfidence` → close scores warning
- `fieldBindings[]` → "What I observe" section (map `sourceField` → `semanticRole`)
- `rows` or `rowCount` → row count display
- `observations[]` or `reasoning` → "Why I chose this" section
- `needsReview` → amber border + auto-expand

**FIND THE ACTUAL SCI RESPONSE SHAPE:**
```bash
grep -rn "contentUnit\|classif.*verdict\|fieldBinding\|observation\|needsReview" \
  web/src/lib/sci/ web/src/app/api/import/sci/ --include="*.ts" | head -30
```

Map whatever the API returns to the DS-006 v2 structure. If a field doesn't exist in the API response, surface it as "Not available" — don't hide the section.

### Files to modify:

```bash
find web/src -name "*SCIProposal*" -o -name "*sci-proposal*" -o -name "*SciProposal*" | sort
find web/src -path "*operate/import*" -name "*.tsx" | sort
```

Replace the existing SCIProposal component with the DS-006 v2 implementation. Keep the same file location and export name so existing imports work.

### Key behaviors:

1. **Needs-review items auto-expand.** If `confidence < 0.6` or `needsReview === true`, the card starts expanded.
2. **Single "Import all →" button.** No per-card confirm buttons. Checkbox + bulk action.
3. **Field-level mapping visible in expanded view.** The admin sees `num_empleado → entity identifier`, `Monto → monetary value`.
4. **"Why I chose this" and "What would change my mind" sections.** These come from the SCI agent's reasoning strings if available, or are generated from the classification confidence and field profiles.
5. **Honest failure states.** If a content unit failed processing, show the error message (not a UUID), show a retry button. No "Import Complete" when items failed.

**Commit:** `OB-142 Phase 3: SCIProposal rebuilt to DS-006 v2 — field mapping, honest uncertainty, bulk confirm`

---

## PHASE 4: REBUILD ImportReadyState

The post-import ready state must show:
- Records imported (total committed_data rows from this import)
- Entities matched (how many unique entities were linked)
- Components (from the active rule_set)
- Plan name (from the active rule_set — NOT "Imported Plan")
- Period detected (from the import data)
- Component readiness (for each component, does data exist?)
- "Calculate [Period] →" button (only if plan + data + entities are ready)
- "Import more data →" as PROMINENT secondary button (not a text link)

If ANY items failed during import:
- Show which items failed with error messages
- Show "Retry failed" button
- Do NOT show "Import Complete" — show "Import partially complete — N of M succeeded"

**Commit:** `OB-142 Phase 4: ImportReadyState rebuilt — honest status, component readiness, correct next action`

---

## PHASE 5: END-TO-END VERIFICATION

This is the proof gate. Walk through the platform as an admin.

### 5A: Navigate to /operate/import
- Verify the upload dropzone appears
- Verify no extraneous elements

### 5B: Upload the Óptica Luminar XLSX
- Verify the SCI analyze API runs
- Verify the SCIProposal renders with:
  - Content unit cards matching DS-006 v2 layout
  - Tab names from the file (Datos Colaborador, Base_Venta_Individual, etc.)
  - Field mappings visible when expanded
  - Confidence bars with correct colors
  - "Needs review" items auto-expanded
  - Summary bar with counts

### 5C: Confirm all and import
- Verify the processing step shows per-item progress
- Verify failed items show error messages (not UUIDs)
- Verify the ready state shows correct stats

### 5D: Navigate to /operate/calculate
- Select "Plan de Comisiones Optica Luminar 2026"
- Select January 2024
- Calculate
- **VERIFY: MX$1,253,832 total**
- **VERIFY: 6 components match expected values**

### 5E: Verify other pages
- /configure/people — entity count correct (should be ≤ 719 after SCI import, not 22K)
- /configure/periods — only periods with data (not 8 stale periods)
- /configure/plans — redirects to /operate/import
- Network tab: < 100 requests per page (not 500+)

**PASTE SCREENSHOTS OR DESCRIPTIONS OF EACH STEP.**

If Step 5D produces MX$1,253,832 → **Alpha benchmark restored through the UI.**
If it produces a different number → STOP and report the delta, which components diverge, and what the trace shows.

**Commit:** `OB-142 Phase 5: End-to-end verification — [PASS/FAIL]`

---

## PHASE 6: COMPLETION REPORT + PR

```bash
gh pr create --base main --head dev \
  --title "OB-142: UI-First Platform Restoration — Experience + Engine" \
  --body "## Full Platform Restoration

### What was broken (CLT-139)
- 22,237 entities (should be 719)
- Wrong rule_set active (heuristic 'Imported Plan' replaced proven 6-component plan)
- MX\$524,500 calculation (should be MX\$1,253,832)
- SCIProposal UI bore no resemblance to DS-006 v2 design
- 500-600 network requests per page
- Missing Data Quality Center, undocumented System page
- Old plan import route still accessible

### What this PR does
1. Deletes and re-seeds Óptica Luminar tenant (clean data)
2. Fixes PPTX import (draft status, no auto-archive)
3. Fixes SCI entity pipeline (dedup by external_id)
4. Fixes assignment creation (chunks at 200)
5. Redirects old plan import route
6. Rebuilds SCIProposal to DS-006 v2 (field mapping, honest uncertainty, bulk confirm)
7. Rebuilds ImportReadyState (honest status, component readiness)

### Proof
[PASTE PHASE 5 VERIFICATION RESULTS]
Alpha benchmark: MX\$1,253,832 through the UI — or report what it produced."
```

**Commit:** `OB-142 Phase 6: Completion report + PR`

---

## PROOF GATES

| # | Gate | Criterion |
|---|------|-----------|
| PG-01 | Tenant deleted and re-seeded | Entity count ~22, active rule_set = 6-component plan |
| PG-02 | PPTX import creates draft rule_set | grep: no auto-archive in import path |
| PG-03 | Entity pipeline deduplicates | Code: check-before-insert with batched .in() |
| PG-04 | Assignments chunk at 200 | Code: CHUNK_SIZE = 200 in assignment creation |
| PG-05 | /configure/plans redirects to /operate/import | Browser: URL changes to /operate/import |
| PG-06 | SCIProposal matches DS-006 v2 | Browser: field mapping visible, verdict badges, confidence bars |
| PG-07 | Needs-review items auto-expand | Browser: low-confidence cards expanded on load |
| PG-08 | Single bulk confirm, no per-card buttons | Browser: one "Import N rows →" button |
| PG-09 | ImportReadyState shows honest status | Browser: failed items show error, not UUID |
| PG-10 | **Calculate produces MX$1,253,832** | Browser: calculation result on screen |
| PG-11 | **6 components match expected values** | Browser: component breakdown visible |
| PG-12 | Entity count after SCI import ≤ 719 | Database: no entity explosion |
| PG-13 | < 100 network requests per page | Browser: network tab |
| PG-14 | `npm run build` exits 0 | Build output |
| PG-15 | Auth files unchanged | git diff |

**PG-10 and PG-11 are the gates that prove both engine and experience.** The number on the admin's screen is the proof. Not a script. Not a trace.

---

## CC FAILURE PATTERN WARNING

| Pattern | Risk | Prevention |
|---------|------|------------|
| Building from description not prototype | CC interprets DS-006 v2 loosely, produces cards that don't match | Phase 0 commits the prototype file. CC reads it before any UI code. |
| Skipping tenant deletion | CC tries incremental cleanup again | Phase 1 is a full delete + re-seed. No partial cleanup. |
| Proof gates that test rendering not data | PG says "component renders" while data is wrong | PG-10/11 verify the calculation RESULT, not the component. |
| Auto-archive regression | New code still auto-archives plans on import | PG-02 greps for the pattern. |

---

*"Fix the UI first. Then use it to prove the engine."*
*"The number on screen is the proof. Not a script. Not a trace. The admin sees it."*
