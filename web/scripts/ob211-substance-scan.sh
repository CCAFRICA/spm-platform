#!/usr/bin/env bash
# OB-211 recovery: read-only substance measurement of the 81 orphaned pages.
set +e
cd "$(dirname "$0")/.."   # web/

PATHS=(
/insights /insights/analytics /insights/compensation /insights/my-team /insights/performance /insights/sales-finance /insights/trends
/investigate/adjustments /investigate/audit /investigate/entities /investigate/reconciliation
/govern/access /govern/approvals /govern/audit-reports /govern/calculation-approvals /govern/data-lineage
/design/budget /design/goals /design/plans/new
/data /data/import/enhanced /data/operations /data/quality /data/readiness /data/reports /data/transactions
/configuration /configuration/locations /configuration/personnel /configuration/teams /configuration/terminology
/configure /configure/data-specs /configure/locations /configure/organization/locations /configure/organization/teams /configure/system /configure/teams /configure/users/invite
/perform /perform/compensation /perform/statements /perform/team /perform/trends
/performance/adjustments /performance/approvals /performance/approvals/plans /performance/goals
/operations/audits /operations/audits/logins /operations/data-readiness /operations/messaging /operations/rollback
/operate/approve /operate/briefing /operate/import/quarantine /operate/monitor/operations /operate/monitor/quality /operate/monitor/readiness /operate/pay
/admin/access-control /admin/audit /admin/users /admin/tenants/new /admin/launch/calculate /admin/launch/calculate/diagnostics /admin/launch/plan-import /admin/launch/reconciliation
/workforce/permissions /workforce/personnel /workforce/roles /workforce/teams
/financial/patterns /financial/products /financial/summary
/acceleration /approvals /my-compensation /notifications /spm/alerts /integrations/catalog
)

printf "PATH\tLINES\tJSX\tHANDLERS\tDATAHOOK\tSTUB\tCLASS\tNAME\n"
for p in "${PATHS[@]}"; do
  f="src/app${p}/page.tsx"
  if [ ! -f "$f" ]; then printf "%s\tMISSING\t-\t-\t-\t-\t-\t-\n" "$p"; continue; fi
  lines=$(wc -l < "$f" | tr -d ' ')
  jsx=$(grep -oE "<[A-Z][A-Za-z0-9]+" "$f" 2>/dev/null | sort -u | wc -l | tr -d ' ')
  handlers=$(grep -cE "onClick|onSubmit|onChange|const handle[A-Z]|=> *void|async \(" "$f" 2>/dev/null | tr -d ' ')
  datahook=$(grep -cE "useEffect|fetch\(|useSWR|supabase|createClient|use[A-Z][A-Za-z]*\(|loadData|await " "$f" 2>/dev/null | tr -d ' ')
  stub=$(grep -ciE "todo|fixme|placeholder|mock|coming soon|not implemented|\bstub\b|lorem|\bwip\b|under construction|dummy|sample data" "$f" 2>/dev/null | tr -d ' ')
  name=$(grep -oE "<h1[^>]*>[^<{]+" "$f" 2>/dev/null | head -1 | sed -E 's/<h1[^>]*>//; s/[[:space:]]+$//')
  [ -z "$name" ] && name=$(grep -oE ">[A-Z][A-Za-z &/-]{4,40}<" "$f" 2>/dev/null | head -1 | sed -E 's/[><]//g; s/[[:space:]]+$//')
  [ -z "$name" ] && name="(unclear)"
  # crude class: EMPTY if tiny+no jsx+no datahook; SUBSTANTIVE if rich; else PARTIAL
  cls="PARTIAL"
  if [ "$lines" -le 20 ] && [ "$jsx" -le 3 ]; then cls="EMPTY"; fi
  if [ "$lines" -ge 120 ] && [ "$jsx" -ge 10 ] && [ "$datahook" -ge 2 ] && [ "$stub" -le 4 ]; then cls="SUBSTANTIVE"; fi
  printf "%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n" "$p" "$lines" "$jsx" "$handlers" "$datahook" "$stub" "$cls" "$name"
done
