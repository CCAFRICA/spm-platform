# HF-033: Seed Period Alignment — Current Dates for Demo Data

**Autonomy Directive: Execute all phases without stopping for confirmation. NEVER ask yes/no questions. Just act.**

## REPO ROOT RULE
**git commands from `/Users/AndrewAfrica/spm-platform`. npm/npx commands from `web/`.**

---

## PROBLEM

OB-45 seeded both tenants with complete data (59/59 CLT gates). But the dashboard shows all zeros because the seeded periods use 2024 dates while the dashboard correctly queries the current period (February 2026). The dashboard logic is correct — a live system shows current data. The seed data needs to use current dates.

## FIX

Update both seed scripts to use current/recent periods, then re-run them.

---

## PHASE 1: OPTICA LUMINAR — Update Period

File: `web/scripts/seed-optica-luminar.ts`

Change the single period:
- **FROM:** Enero 2024 (2024-01-01 to 2024-01-31)
- **TO:** Febrero 2026 (2026-02-01 to 2026-02-28)
- Period name: "Febrero 2026"
- Status: `approved` (so it shows as active/current)

Update ALL references:
- `periods` row: new dates, new name
- `committed_data`: all rows referencing this period
- `calculation_batches`: timestamps should be recent (e.g., 2026-02-10)
- `calculation_results`: same period reference
- `entity_period_outcomes` (or `outcomes`): same period reference
- `import_batches`: if they reference a period, update those too

**Do NOT change any amounts, entities, relationships, or rule sets.** Only dates and period references.

Re-run:
```bash
cd /Users/AndrewAfrica/spm-platform/web
npx tsx --env-file=.env.local scripts/seed-optica-luminar.ts
```

Verify:
```bash
npx tsx --env-file=.env.local -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const tid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const { data } = await sb.from('periods').select('name, start_date, end_date, status').eq('tenant_id', tid);
console.table(data);
const { count } = await sb.from('calculation_results').select('*', { count: 'exact', head: true }).eq('tenant_id', tid);
console.log('Calculation results:', count);
"
```

**Expected:** Period shows "Febrero 2026", 12 calculation results still present.

**Commit:** `HF-033: Optica Luminar seed periods updated to February 2026`

---

## PHASE 2: VELOCIDAD DEPORTIVA — Update Periods

File: `web/scripts/seed-velocidad-deportiva.ts`

Change the 6 monthly periods and 2 quarterly periods:

| Old Period | New Period | Status |
|-----------|-----------|--------|
| Jul 2024 | Sep 2025 | closed |
| Aug 2024 | Oct 2025 | closed |
| Sep 2024 | Nov 2025 | closed |
| Oct 2024 | Dec 2025 | approved |
| Nov 2024 | Jan 2026 | approved |
| Dec 2024 | Feb 2026 | approved |
| Q3 2024 (quarterly) | Q1 FY26: Sep-Nov 2025 (quarterly) | closed |
| Q4 2024 (quarterly) | Q2 FY26: Dec 2025-Feb 2026 (quarterly) | approved |

Update ALL references:
- `periods` rows: new dates, new names
- `committed_data`: all rows referencing these periods
- `calculation_batches`: timestamps should reflect recent dates
- `calculation_results`: period references
- `entity_period_outcomes`: period references
- `import_batches`: period references if applicable

**Do NOT change amounts, entities, relationships, rule sets, attendance percentages, streak logic, or medal assignments.** Only dates and period references.

The narrative patterns must be preserved:
- VD-A01 Carlos Mendoza: 6-month Oro streak (Sep 2025 → Feb 2026)
- VD-A05 Diego Castillo: GATED all 6 months (88% attendance)
- VD-A10 Lucia Gutierrez: GATED all 6 months (85% attendance)
- VD-A12 Ana Martinez: 4-month Oro streak
- Q1 FY26 (Sep-Nov): CLOSED/paid
- Q2 FY26 (Dec-Feb): APPROVED/pending — this is the current quarter

Re-run:
```bash
cd /Users/AndrewAfrica/spm-platform/web
npx tsx --env-file=.env.local scripts/seed-velocidad-deportiva.ts
```

Verify:
```bash
npx tsx --env-file=.env.local -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const tid = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const { data } = await sb.from('periods').select('name, start_date, end_date, status').eq('tenant_id', tid).order('start_date');
console.table(data);
const { count } = await sb.from('calculation_results').select('*', { count: 'exact', head: true }).eq('tenant_id', tid);
console.log('Calculation results:', count);
"
```

**Expected:** 8 periods (Sep 2025 → Feb 2026 + 2 quarterly), 108 calculation results.

**Commit:** `HF-033: Velocidad Deportiva seed periods updated to Sep 2025 — Feb 2026`

---

## PHASE 3: VERIFY DASHBOARD POPULATES

```bash
cd /Users/AndrewAfrica/spm-platform/web
pkill -f "next dev" 2>/dev/null || true
rm -rf .next
npm run build
npm run dev &
sleep 10
```

Open localhost:3000 incognito:
1. Login as platform@vialuce.com / demo-password-VL1
2. Select Optica Luminar
3. Dashboard KPI cards should show NON-ZERO values:
   - YTD Outcome: non-zero MXN amount
   - Target Achievement: non-zero %
   - Team Ranking: #X of Y entities
   - Pending Outcomes: non-zero amount or transaction count
4. Console: zero 400 errors
5. Go back to tenant selector, pick Velocidad Deportiva
6. Dashboard should show VD data with non-zero values
7. Console: zero 400 errors

If the dashboard STILL shows zeros after this fix, the issue is in how the dashboard queries filter by period. In that case, investigate:
```bash
grep -rn "period" web/src/app/ --include="*.tsx" --include="*.ts" | grep -i "current\|now\|today\|date"
```
And fix the query to match the period dates we just seeded. But do NOT change the seed dates back to 2024.

---

## PHASE 4: RE-RUN CLT VERIFICATION

```bash
cd /Users/AndrewAfrica/spm-platform/web
npx tsx --env-file=.env.local scripts/verify-all-seeds.ts
```

All 59 gates must still pass. The only change is dates — row counts and narratives are identical.

---

## PHASE 5: COMPLETION

```bash
cd /Users/AndrewAfrica/spm-platform
git add -A
git commit -m "HF-033: Seed period alignment — current dates for demo dashboards"
git push origin dev
gh pr create --base main --head dev \
  --title "HF-033: Seed period alignment — demo data uses current dates" \
  --body "Updated seed scripts to use current periods (Sep 2025 — Feb 2026) instead of 2024 dates. Dashboard correctly queries current period — seed data now matches. Both tenants verified: 59/59 CLT gates pass. No changes to amounts, entities, or business logic."
```
