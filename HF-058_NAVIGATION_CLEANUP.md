# HF-058: NAVIGATION CLEANUP — DEAD LINKS, CANONICAL ROUTES, STUB REMOVAL

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST: CC_STANDING_ARCHITECTURE_RULES.md

Before reading further, open and read the COMPLETE file `CC_STANDING_ARCHITECTURE_RULES.md` at the project root. Every decision in this HF must comply with all sections. Pay special attention to:

- **Standing Rule 24 (NEW):** One canonical location per surface. No duplicate pages across workspaces. Cross-references allowed, duplicate routes prohibited. Reconciliation lives in Operate (lifecycle step).

**If you have not read that file, STOP and read it now.**

---

## WHY THIS HF EXISTS

CLT-91 browser verification found 7 navigation failures. Sidebar links point to pages that don't exist, redirect incorrectly, or fall back to parent workspace landing pages. Every dead link erodes demo trust.

### CLT-91 Findings Addressed

| # | Finding | Detail |
|---|---------|--------|
| F-01 | Operate > Reconcile fails back to Operate | Route deleted by OB-89 M2, redirect not working |
| F-06 | Govern > Reconciliation fails back to Govern | Same root cause as F-01 |
| F-08 | Payroll Calendar fails back to Operate | Sidebar link to unbuilt feature |
| F-09 | Payroll Cycle fails back to Operate | Sidebar link to unbuilt feature |
| F-10 | Rate Table fails back to Operate | Sidebar link to unbuilt feature |
| F-11 | Resolution History fails back to Investigate | Sidebar link to unbuilt feature |
| F-12 | Adjustment History fails back to Investigate | Sidebar link to unbuilt feature |

### Standing Rule 24: One Canonical Location Per Surface

This HF enforces a new architectural rule:

> Every feature has exactly ONE route that owns it. Other workspaces can link to it — they NEVER duplicate it.
>
> **Reconciliation canonical home: `/operate/reconciliation`** (it's a lifecycle step: import → calculate → reconcile → approve)
>
> Investigate can link to reconciliation findings. Govern can link to reconciliation audit trail. Neither hosts its own reconciliation page.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000 responds
3. Final step: `gh pr create --base main --head dev` with descriptive title and body
4. **Git commands from repo root (spm-platform), NOT from web/.**
5. **Commit this prompt to git as first action.**

---

## PHASE 0: DIAGNOSTIC — MAP ALL SIDEBAR LINKS AND ROUTES

Before changing anything, produce a complete map of what exists.

```bash
echo "============================================"
echo "HF-058 PHASE 0: NAVIGATION DIAGNOSTIC"
echo "============================================"

echo ""
echo "=== 0A: ALL SIDEBAR/NAVIGATION COMPONENTS ==="
find web/src/components -name "*sidebar*" -o -name "*Sidebar*" -o -name "*navigation*" -o -name "*Navigation*" | grep -E "\.tsx$" | sort

echo ""
echo "=== 0B: ALL SIDEBAR MENU ITEMS ==="
# Extract every label, route, href, path from sidebar components
for f in $(find web/src/components -name "*sidebar*" -o -name "*Sidebar*" -o -name "*navigation*" | grep -E "\.tsx$"); do
  echo "--- FILE: $f ---"
  grep -n "label\|route\|path\|href\|to=" "$f" | head -40
done

echo ""
echo "=== 0C: ALL PAGE ROUTES ==="
find web/src/app -name "page.tsx" | sort

echo ""
echo "=== 0D: RECONCILIATION ROUTES (ALL LOCATIONS) ==="
find web/src/app -path "*reconcil*" -name "page.tsx" | sort
grep -rn "reconcil" web/src/components/navigation/ --include="*.tsx" | head -20

echo ""
echo "=== 0E: ROUTE REDIRECTS ==="
grep -rn "redirect\|useRouter\|router.push\|router.replace" web/src/app/*/page.tsx web/src/app/*/*/page.tsx 2>/dev/null | head -30

echo ""
echo "=== 0F: DEAD LINK CANDIDATES ==="
echo "Checking sidebar links against existing page.tsx files..."
# This will be compared manually against 0B and 0C output
```

**PASTE ALL OUTPUT.** This is the diagnostic evidence for what needs fixing.

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-058 Phase 0: Navigation diagnostic" && git push origin dev`

---

## PHASE 1: ARCHITECTURE DECISION

```
ARCHITECTURE DECISION RECORD
============================
Problem: Sidebar contains links to (a) duplicate pages for the same feature
across multiple workspaces and (b) unbuilt features that fall back to
parent workspace landing pages. Both erode demo trust.

Option A: Remove dead links, consolidate reconciliation to /operate/reconciliation
  - Scale test: Works at 10x? YES — fewer routes = simpler
  - AI-first: Any hardcoding? NO
  - Transport: N/A
  - Atomicity: Clean — removing links, not adding complexity

Option B: Build stub pages with "Coming Soon" placeholders
  - Scale test: Works at 10x? YES but adds maintenance burden
  - AI-first: N/A
  - Transport: N/A
  - Atomicity: Adds pages that need future cleanup

CHOSEN: Option A — remove what isn't built, consolidate what is.
REJECTED: Option B — padding nav with stubs is worse than a lean, honest menu.
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-058 Phase 1: Architecture decision — remove dead links" && git push origin dev`

---

## PHASE 2: RECONCILIATION ROUTE CONSOLIDATION

### 2A: Establish canonical reconciliation route

The ONE canonical reconciliation page lives at `/operate/reconciliation`. If a page already exists at `/investigate/reconciliation` that is the functional implementation, MOVE it to `/operate/reconciliation`.

Steps:
1. Identify which reconciliation `page.tsx` contains the actual working component (not a redirect or re-export)
2. Ensure that component lives at `web/src/app/operate/reconciliation/page.tsx`
3. If the working page is elsewhere, move it to `/operate/reconciliation/`

### 2B: Remove all non-canonical reconciliation routes

Delete or redirect ALL other reconciliation page.tsx files:
- `web/src/app/govern/reconciliation/page.tsx` → DELETE (if exists)
- `web/src/app/investigate/reconciliation/page.tsx` → REDIRECT to `/operate/reconciliation` (if this was the functional page, it was moved in 2A)
- `web/src/app/operate/reconcile/page.tsx` → DELETE (old route, OB-89 should have removed this)
- `web/src/app/admin/launch/reconciliation/page.tsx` → DELETE (legacy route)
- Any other `*reconcil*` page routes found in Phase 0

For any route that external links or bookmarks might reference, use a redirect:
```tsx
'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
export default function RedirectPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/operate/reconciliation'); }, [router]);
  return null;
}
```

### 2C: Update sidebar reconciliation link

In the sidebar navigation component, update the reconciliation link to point to `/operate/reconciliation`. Remove reconciliation links from Investigate and Govern sidebar sections entirely.

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-058 Phase 2: Reconciliation consolidated to /operate/reconciliation" && git push origin dev`

---

## PHASE 3: REMOVE UNBUILT FEATURE LINKS FROM SIDEBAR

Remove the following items from the sidebar navigation. Do NOT delete any page.tsx files if they exist — only remove the sidebar links.

| Sidebar Item | Workspace | Action |
|---|---|---|
| Payroll Calendar | Operate | REMOVE from sidebar |
| Payroll Cycle | Operate | REMOVE from sidebar |
| Rate Table | Operate / Calculate | REMOVE from sidebar |
| Resolution History | Investigate | REMOVE from sidebar |
| Adjustment History | Investigate | REMOVE from sidebar |
| Performance Ranges | Operate / Calculate | REMOVE from sidebar (if unbuilt) |

**Rule:** If it's not built, it's not in the nav. Add it back when the feature ships.

**Verification after removal:**
```bash
echo "=== SIDEBAR ITEMS AFTER CLEANUP ==="
for f in $(find web/src/components -name "*sidebar*" -o -name "*Sidebar*" -o -name "*navigation*" | grep -E "\.tsx$"); do
  echo "--- $f ---"
  grep -n "label\|route\|path\|href" "$f"
done
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-058 Phase 3: Remove unbuilt feature links from sidebar" && git push origin dev`

---

## PHASE 4: ADD STANDING RULE 24 TO CC_STANDING_ARCHITECTURE_RULES.md

Add the following rule to Section D (CC Operational Rules) of `CC_STANDING_ARCHITECTURE_RULES.md`:

```
### Navigation & Routes
24. **One canonical location per surface.** Every feature has ONE route that owns it. Other workspaces can link to it — they NEVER duplicate it. Cross-references allowed, duplicate routes prohibited. If it's not built, it's not in the nav. Reconciliation lives in Operate (lifecycle step).
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-058 Phase 4: Standing Rule 24 — canonical locations" && git push origin dev`

---

## PHASE 5: BUILD + VERIFY

```bash
cd /Users/AndrewAfrica/spm-platform/web
rm -rf .next
npm run build 2>&1 | tail -20
# MUST exit 0 with no errors

npm run dev &
sleep 5

echo "=== ROUTE VERIFICATION ==="

# Canonical reconciliation route works
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/operate/reconciliation
# Expected: 200

# Old routes redirect (not 404, not fallback)
curl -s -o /dev/null -w "%{http_code}" --max-redirs 0 http://localhost:3000/investigate/reconciliation
# Expected: 307 (redirect to /operate/reconciliation)

curl -s -o /dev/null -w "%{http_code}" --max-redirs 0 http://localhost:3000/govern/reconciliation
# Expected: 307 or 404

curl -s -o /dev/null -w "%{http_code}" --max-redirs 0 http://localhost:3000/operate/reconcile
# Expected: 307 or 404

echo ""
echo "=== SIDEBAR LINK COUNT ==="
# Count remaining sidebar items — should be fewer than before
grep -c "label\|route" web/src/components/navigation/Sidebar.tsx 2>/dev/null || echo "Check sidebar component name"
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-058 Phase 5: Build verification" && git push origin dev`

---

## PHASE 6: COMPLETION REPORT

Create `HF-058_COMPLETION_REPORT.md` at project root:

```markdown
# HF-058: Navigation Cleanup — Completion Report

## Status: COMPLETE / PARTIAL / FAILED

## Findings Addressed
| CLT-91 # | Finding | Status |
|---|---|---|
| F-01 | Operate > Reconcile fails back to Operate | FIXED / NOT FIXED |
| F-06 | Govern > Reconciliation fails back to Govern | FIXED / NOT FIXED |
| F-08 | Payroll Calendar dead link | FIXED / NOT FIXED |
| F-09 | Payroll Cycle dead link | FIXED / NOT FIXED |
| F-10 | Rate Table dead link | FIXED / NOT FIXED |
| F-11 | Resolution History dead link | FIXED / NOT FIXED |
| F-12 | Adjustment History dead link | FIXED / NOT FIXED |

## Reconciliation Route Consolidation
- Canonical route: /operate/reconciliation
- Routes deleted: [list]
- Routes redirected: [list]
- Sidebar links updated: [yes/no]

## Sidebar Items Removed
[List all items removed from sidebar]

## Sidebar Items Remaining
[List all items still in sidebar, grouped by workspace]

## Standing Rule 24 Added
[yes/no — paste the rule text]

## Build
npm run build: [exit code]

## Route Verification
| Route | Expected | Actual |
|---|---|---|
| /operate/reconciliation | 200 | |
| /investigate/reconciliation | 307 → /operate/reconciliation | |
| /govern/reconciliation | 307 or 404 | |
| /operate/reconcile | 307 or 404 | |

## Constraints Honored
- Did NOT modify calculation engine
- Did NOT modify reconciliation comparison logic
- Did NOT modify AI pipelines
- Did NOT add new features — only removed/consolidated
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-058 Complete: Navigation cleanup — 7 dead links fixed, Standing Rule 24" && git push origin dev`

---

## FINAL STEP: PR

```bash
cd /Users/AndrewAfrica/spm-platform && \
gh pr create --base main --head dev \
  --title "HF-058: Navigation Cleanup — Dead Links, Canonical Routes, Standing Rule 24" \
  --body "## CLT-91 Findings Addressed

### Navigation Failures Fixed
- F-01: Operate > Reconcile fails back to Operate → FIXED
- F-06: Govern > Reconciliation fails back to Govern → FIXED
- F-08: Payroll Calendar dead link → REMOVED from sidebar
- F-09: Payroll Cycle dead link → REMOVED from sidebar
- F-10: Rate Table dead link → REMOVED from sidebar
- F-11: Resolution History dead link → REMOVED from sidebar
- F-12: Adjustment History dead link → REMOVED from sidebar

### Reconciliation Consolidation
- Canonical route: /operate/reconciliation (ONE location)
- Duplicate routes deleted or redirected
- Standing Rule 24 added to CC_STANDING_ARCHITECTURE_RULES.md

### Rule
One canonical location per surface. No duplicate pages across workspaces.
Cross-references allowed, duplicate routes prohibited.
If it's not built, it's not in the nav.

## 7 CLT-91 findings addressed | 1 standing rule added | 0 features modified"
```

---

*ViaLuce.ai — The Way of Light*
*HF-058: Clean the map before you navigate.*
*"If it's not built, it's not in the nav."*
