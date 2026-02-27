# HF-072: DEAD PAGE CLEANUP AND NAVIGATION FIX
## Remove abandoned pages, fix broken navigation links

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Execute sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply
2. `PERSISTENT_DEFECT_REGISTRY.md` — verify in-scope items
3. `CLT-102_FINDINGS.md` — findings CLT102-F7, CLT102-F8

---

## WHY THIS HF EXISTS

CLT-102 found that clicking "View Plans" after a successful 4-plan import navigates to `/admin/launch` — the abandoned Customer Launch Dashboard. This page shows a 7-step linear pipeline with "Active Launches (0)" and "No launches yet." It's a dead end that undermines credibility during demos.

The Customer Launch Dashboard was an early concept (7-step sequential onboarding) that was superseded by the current import pipeline. It's still navigable and still linked from active pages.

**CLT-102 findings addressed:** CLT102-F7, CLT102-F8
**CLT-72A inventory:** This page was identified as a stub/dead page

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. Git commands from repo root (spm-platform), NOT from web/.
4. Commit this prompt to git as first action.
5. **DO NOT MODIFY ANY AUTH FILE.**

---

## PHASE 0: DIAGNOSTIC — MAP THE DEAD PAGES

```bash
echo "============================================"
echo "HF-072 PHASE 0: DEAD PAGE DIAGNOSTIC"
echo "============================================"

echo ""
echo "=== 0A: CUSTOMER LAUNCH DASHBOARD ==="
find web/src/app -path "*launch*" -name "*.tsx" | sort
echo "--- Page content ---"
wc -l web/src/app/admin/launch/page.tsx 2>/dev/null
head -30 web/src/app/admin/launch/page.tsx 2>/dev/null

echo ""
echo "=== 0B: PLAN IMPORT COMPLETION — WHERE DOES 'VIEW PLANS' LINK TO? ==="
grep -rn "View Plans\|viewPlans\|view.*plans\|/admin/launch\|/launch" \
  web/src/app/admin/launch/plan-import/ --include="*.tsx" | head -10

echo ""
echo "=== 0C: SIDEBAR REFERENCES TO LAUNCH ==="
grep -rn "launch\|Launch" web/src/components/navigation/ web/src/lib/navigation/ \
  --include="*.tsx" --include="*.ts" | head -10

echo ""
echo "=== 0D: ANY OTHER PAGES LINKING TO /admin/launch ==="
grep -rn '"/admin/launch"\|/admin/launch' web/src/ --include="*.tsx" --include="*.ts" \
  | grep -v node_modules | grep -v ".next" | head -20

echo ""
echo "=== 0E: CONFIGURE > PLANS PAGE — DOES IT EXIST? ==="
find web/src/app -path "*configure*plan*" -o -path "*config*plan*" | grep "page.tsx" | sort
echo "--- Content ---"
cat web/src/app/configure/plans/page.tsx 2>/dev/null | head -30

echo ""
echo "=== 0F: OTHER DEAD/STUB PAGES REFERENCED IN CLT-72A ==="
echo "Checking known stubs from inventory..."
for page in \
  "web/src/app/pay/page.tsx" \
  "web/src/app/approve/page.tsx" \
  "web/src/app/reconcile/page.tsx"; do
  if [ -f "$page" ]; then
    lines=$(wc -l < "$page")
    echo "  $page: $lines lines ($([ $lines -lt 15 ] && echo 'STUB' || echo 'real'))"
  else
    echo "  $page: NOT FOUND"
  fi
done
```

**Paste ALL output before proceeding.**

---

## PHASE 1: FIX "VIEW PLANS" NAVIGATION

From Phase 0B, find where "View Plans" links to `/admin/launch` and change it.

**Target:** "View Plans" should navigate to Configure → Plans (`/configure/plans`) if that page exists. If it doesn't exist, create a minimal redirect or link to the plan import page that shows existing plans.

```bash
# From Phase 0B output, find the exact link and change its href
# The fix should be a single href change, not a page rewrite
```

---

## PHASE 2: REDIRECT OR REMOVE CUSTOMER LAUNCH DASHBOARD

**Option A (preferred): Redirect.** Change `/admin/launch/page.tsx` to redirect to a useful destination:

```typescript
// web/src/app/admin/launch/page.tsx
import { redirect } from 'next/navigation';
export default function LaunchPage() {
  redirect('/configure/plans');
}
```

**Option B: Remove from sidebar.** If the Launch page isn't in the sidebar, just fix the "View Plans" link (Phase 1) and leave the dead page in place — it won't be discoverable.

From Phase 0C and 0D, determine which approach is appropriate:
- If sidebar links to `/admin/launch` → remove sidebar entry
- If no sidebar link but other pages link to it → redirect
- If only "View Plans" links to it → fix that link (Phase 1 is sufficient)

---

## PHASE 3: CLEAN UP STUB REDIRECTS (If Quick Wins Exist)

From Phase 0F, if stub pages exist that just redirect to `/operate`:

```bash
# Only if these are 3-5 line files that redirect to /operate:
# Change them to redirect to the correct destination instead
# e.g., /pay → /operate/results (closest match)
# e.g., /approve → /operate/operations (closest match)
# e.g., /reconcile → /operate/reconciliation
```

**Only do this if the stubs are trivial redirects.** Do not rewrite pages. Do not create new pages.

---

## PHASE 4: BUILD AND VERIFY

```bash
cd /Users/AndrewAfrica/spm-platform/web
pkill -f "next dev" 2>/dev/null || true
rm -rf .next
npm run build 2>&1 | tail -20
npm run dev &
sleep 10
curl -s -o /dev/null -w "localhost:3000 status: %{http_code}\n" http://localhost:3000
```

---

## PHASE 5: COMPLETION

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-01 | "View Plans" goes to plan list, not Launch Dashboard | Verify the link target |
| PG-02 | /admin/launch either redirects or is not in sidebar | Not a dead end |
| PG-03 | No sidebar references to Launch Dashboard | grep confirms |
| PG-04 | npm run build exits 0 | Clean build |
| PG-05 | localhost:3000 responds | HTTP 200 or 307 |
| PG-06 | No auth files modified | git diff confirms |

### PDR Verification

| PDR # | In Scope? | Status | Evidence |
|-------|-----------|--------|----------|
| PDR-01 | NO | — | Not in scope |
| PDR-02 | NO | — | Not in scope |
| PDR-03 | NO | — | Not in scope |
| PDR-04 | NOTE | — | Note request count on /configure/plans if visited |
| PDR-05 | NO | — | Not in scope |
| PDR-06 | NO | — | Not in scope |
| PDR-07 | NO | — | Not in scope |

### PR

```bash
cd /Users/AndrewAfrica/spm-platform && \
gh pr create --base main --head dev \
  --title "HF-072: Dead page cleanup — fix View Plans link, redirect Launch Dashboard" \
  --body "## CLT-102 Findings Addressed

- CLT102-F7: View Plans → dead Customer Launch Dashboard (FIXED — redirects to plans list)
- CLT102-F8: Customer Launch Dashboard abandoned (FIXED — redirected or removed from nav)

## Changes
- View Plans link now navigates to Configure → Plans
- Customer Launch Dashboard redirects to useful destination
- No auth files modified
- Build passes"
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-072: Dead page cleanup — View Plans link + Launch Dashboard redirect" && git push origin dev`

---

*Vialuce.ai — Intelligence. Acceleration. Performance.*
*HF-072: "Dead pages destroy demo credibility. Remove them."*
