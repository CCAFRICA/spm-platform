# CLT-160 PART 1: PRE-FLIGHT VERIFICATION
## CC-Executed — Run before any browser testing
## Type: Automated codebase + database verification
## Prerequisite: ALL PRs merged (182-192), HF-092 migration applied

---

## AUTONOMY DIRECTIVE
NEVER ask yes/no. NEVER say "shall I". Just act. Execute all checks sequentially. Paste ALL output. Commit the report.

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md`
2. This prompt in its entirety

---

## PHASE 1: CODEBASE STRUCTURAL VERIFICATION

Run each command. Paste the COMPLETE output. Mark PASS or FAIL.

### 1.1 Korean Test Compliance (All SCI Files)
```bash
grep -rn '"mes"\|"month"\|"nombre"\|"name"\|"año"\|"year"\|"employee"\|"hub"\|"target"\|"revenue"' \
  web/src/lib/sci/ --include="*.ts" | grep -v "// " | grep -v "console.log" | grep -v "test" | grep -v "\.d\.ts"
```
**Gate:** ZERO results = PASS. Any match = FAIL (P0).

### 1.2 Period Reference Absence (Decision 92/93)
```bash
grep -rn "createPeriod\|/api/periods\|periodId.*=" \
  web/src/lib/sci/ web/src/app/api/import/ --include="*.ts" | grep -v "// " | grep -v "console.log" | grep -v "null" | grep -v "NULL"
```
**Gate:** ZERO functional period references = PASS.

### 1.3 Absence-Based Logic (AP-31)
```bash
grep -rn "=== 0.*boost\|has no.*Agent\|!.*Count.*\+\|!.*Exists.*\+" \
  web/src/lib/sci/ --include="*.ts" | grep -v "// " | grep -v "❌"
```
**Gate:** ZERO results = PASS.

### 1.4 SCI File Inventory
```bash
ls -la web/src/lib/sci/
```
**Gate:** Core files present (content-profile.ts, header-comprehension.ts, synaptic-ingestion-state.ts, tenant-context.ts, sci-types.ts, classification-signal-service.ts, negotiation.ts, source-date-extraction.ts, promoted-patterns.ts).

### 1.5 Signal Service — Dedicated Columns (HF-092)
```bash
grep -n "signal_value" \
  web/src/lib/sci/classification-signal-service.ts \
  web/src/app/api/import/sci/trace/route.ts 2>/dev/null | grep -v "// "
```
**Gate:** ZERO functional signal_value references for SCI data = PASS.

### 1.6 Processing Order in Execute Route
```bash
grep -n "PIPELINE_ORDER\|sortOrder\|entity.*0.*reference.*1.*transaction.*2\|processing.*order" \
  web/src/app/api/import/sci/execute/route.ts | head -10
```
**Gate:** Processing order enforcement exists (entity → reference → transaction).

### 1.7 Convergence Wired to Execute
```bash
grep -n "converge\|convergence\|Convergence" \
  web/src/app/api/import/sci/execute/route.ts | head -10
```
**Gate:** Convergence triggered after execute completes.

### 1.8 Flywheel Aggregation Wired
```bash
grep -n "aggregateToFoundational\|aggregateToDomain\|foundational\|domain.*pattern" \
  web/src/app/api/import/sci/execute/route.ts web/src/lib/sci/classification-signal-service.ts | head -15
```
**Gate:** Foundational + domain aggregation triggered after signal write.

### 1.9 Prior Signal Chain (Tenant → Domain → Foundational)
```bash
grep -n "lookupPriorSignals\|lookupFoundationalPriors\|lookupDomainPriors\|foundational.*0.05\|domain.*0.07\|tenant.*0.10" \
  web/src/lib/sci/classification-signal-service.ts web/src/lib/sci/synaptic-ingestion-state.ts | head -15
```
**Gate:** Three-scope prior chain exists with correct boost values.

### 1.10 Classification Density
```bash
grep -n "ClassificationDensity\|computeClassificationDensity\|SCIExecutionMode\|full_analysis\|light_analysis\|confident" \
  web/src/lib/sci/classification-signal-service.ts | head -10
```
**Gate:** Classification density types and computation exist.

### 1.11 Pattern Promotion
```bash
grep -n "PromotedPattern\|loadPromotedPatterns\|checkPromotedPatterns\|identifyPromotionCandidates" \
  web/src/lib/sci/promoted-patterns.ts 2>/dev/null web/src/lib/sci/ --include="*.ts" -r | head -10
```
**Gate:** Pattern promotion service exists.

### 1.12 Trace API Endpoint
```bash
ls -la web/src/app/api/import/sci/trace/route.ts 2>/dev/null
```
**Gate:** File exists.

### 1.13 Draft Status Inclusion (HF-092/Phase G fix)
```bash
grep -n "draft\|active.*draft\|in.*status.*active.*draft" \
  web/src/app/api/import/sci/execute/route.ts web/src/app/api/intelligence/converge/route.ts 2>/dev/null | head -10
```
**Gate:** Convergence includes draft status plans.

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "CLT-160 Phase 1: Codebase structural verification — 13 gates" && git push origin dev`

---

## PHASE 2: DATABASE SCHEMA VERIFICATION

Run each SQL query in Supabase SQL Editor. Paste the COMPLETE output.

### 2.1 Meridian Tenant Exists
```sql
SELECT id, name, slug, locale, currency, settings->>'industry' as industry
FROM tenants WHERE id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
```
**Gate:** Row returned with name containing 'Meridian'.

### 2.2 Engine Contract — Starting State
```sql
SELECT 
  (SELECT count(*) FROM rule_sets WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as rule_sets,
  (SELECT count(*) FROM entities WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as entities,
  (SELECT count(*) FROM committed_data WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as committed_data,
  (SELECT count(*) FROM periods WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as periods,
  (SELECT count(*) FROM rule_set_assignments WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as assignments;
```
**Gate:** Document starting state. (rule_sets=1 from prior plan import is expected.)

### 2.3 Classification Signals Schema (HF-092)
```sql
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'classification_signals' ORDER BY ordinal_position;
```
**Gate:** All 20 columns present including dedicated: source_file_name, sheet_name, structural_fingerprint, classification, decision_source, classification_trace, header_comprehension, vocabulary_bindings, agent_scores, human_correction_from, scope.

### 2.4 Classification Signal Indexes
```sql
SELECT indexname FROM pg_indexes WHERE tablename = 'classification_signals';
```
**Gate:** idx_cs_tenant_scope, idx_cs_tenant_fingerprint, idx_cs_vocab_bindings, idx_cs_foundational present.

### 2.5 committed_data.source_date Column
```sql
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'committed_data' AND column_name = 'source_date';
```
**Gate:** One row returned.

### 2.6 Reference Tables
```sql
SELECT table_name, count(*) as column_count 
FROM information_schema.columns 
WHERE table_name IN ('reference_data', 'reference_items')
GROUP BY table_name;
```
**Gate:** Both tables exist.

### 2.7 Flywheel Tables
```sql
SELECT table_name, count(*) as column_count 
FROM information_schema.columns 
WHERE table_name IN ('foundational_patterns', 'domain_patterns')
GROUP BY table_name;
```
**Gate:** Both tables exist.

### 2.8 Synaptic Density Table
```sql
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'synaptic_density' ORDER BY ordinal_position;
```
**Gate:** Table exists (from OB-78).

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "CLT-160 Phase 2: Database schema verification — 8 gates" && git push origin dev`

---

## PHASE 3: LOCALHOST SMOKE TEST

Before Andrew tests on vialuce.ai, verify the application runs and key routes respond.

```bash
# Build and start
kill dev server 2>/dev/null
rm -rf .next
npm run build
npm run dev &
sleep 5

# Test key API routes respond (not 500)
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health 2>/dev/null || echo "no health endpoint"

# Verify analyze route exists
ls -la web/src/app/api/import/sci/analyze/route.ts
ls -la web/src/app/api/import/sci/execute/route.ts
ls -la web/src/app/api/import/sci/trace/route.ts
ls -la web/src/app/api/intelligence/converge/route.ts 2>/dev/null

# Verify build succeeded
echo "Build status: $?"
```

**Gate:** npm run build exits 0. All route files exist. localhost:3000 responds.

---

## PHASE 4: PRE-FLIGHT REPORT

Create `CLT-160_PREFLIGHT_REPORT.md` in PROJECT ROOT:

### Report Structure
1. **Codebase Verification (Phase 1)** — 13 gates, each PASS/FAIL with pasted output
2. **Database Verification (Phase 2)** — 8 gates, each PASS/FAIL with pasted output
3. **Localhost Smoke (Phase 3)** — build status + route existence
4. **Summary:** X/21 gates PASS. Ready for browser testing: YES/NO
5. **Blocking issues:** List any FAIL gates that must be resolved before browser testing

If ALL 21 gates pass: "CLT-160 pre-flight PASS. Ready for Andrew's browser testing on vialuce.ai."
If ANY gate fails: "CLT-160 pre-flight BLOCKED. [N] gates failed. See details above."

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "CLT-160 Pre-flight report: [PASS/BLOCKED]" && git push origin dev`

---

## SECTION F QUICK CHECKLIST

```
Before submitting pre-flight report, verify:
□ All 13 codebase grep commands run with output pasted?
□ All 8 database queries run with output pasted?
□ npm run build exits 0?
□ Zero Korean Test violations?
□ Zero period references?
□ Zero absence-based logic?
□ Signal service uses dedicated columns?
□ Processing order enforced?
□ Convergence wired?
□ Flywheel aggregation wired?
□ Three-scope prior chain exists?
□ Classification density exists?
□ Pattern promotion exists?
□ Trace API exists?
□ All database tables exist?
□ All indexes exist?
□ Pre-flight report committed to git?
```

---

*CLT-160 Part 1: "Before we prove it in the browser, prove the code is right. Every grep. Every schema query. Every file. Then — and only then — does Andrew open vialuce.ai."*
