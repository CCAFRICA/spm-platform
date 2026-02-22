# OB-66: COMPREHENSIVE PLATFORM AUDIT

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". Just act. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

**MANDATORY:** Read CC_STANDING_ARCHITECTURE_RULES.md FIRST. This entire OB audits compliance against those rules.

**CRITICAL RULE: Build EXACTLY what this prompt specifies. Do NOT substitute simpler alternatives. Do NOT skip deliverables. (Standing Rule 15)**

**THIS IS AN AUDIT, NOT A BUILD.** This OB produces REPORTS WITH EVIDENCE. It changes ZERO production code. Every finding is documented with file paths, line numbers, and code snippets. The output is a set of audit documents that inform what to build next.

---

## PURPOSE

Conduct a comprehensive, evidence-based audit of the entire Vialuce platform across seven dimensions:

1. **NAVIGATION AUDIT** — Menu tree, route inventory, page sprawl, dead routes, unreachable pages
2. **PAGE QUALITY AUDIT** — Every page tested against IAP Gate (Intelligence, Acceleration, Performance)
3. **HARDCODING AUDIT** — Every violation of AI-first, domain-agnostic, and standing architecture rules
4. **SCHEMA ALIGNMENT AUDIT** — Every Supabase query checked against actual database columns
5. **AI/ML SIGNAL MESH AUDIT** — Every AI touchpoint, training signal, closed-loop status
6. **FUNCTIONALITY GAP ANALYSIS** — What must be built for a user to complete core workflows
7. **DESIGN PRINCIPLE COMPLIANCE** — Every component checked against TMR, VVSPv3, design principles

The output is truth — not opinion, not aspiration. Every finding backed by `grep`, file path, and line number.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → rm -rf .next → npm run build → npm run dev → confirm localhost:3000 responds
3. This OB produces ZERO code changes. Audit reports only.
4. Every finding must include: file path, line number, code snippet, severity, and recommended fix
5. Use SCHEMA_TRUTH.md (if created by HF-054) as the authoritative column reference
6. Commit each audit phase separately for clean tracking

---

## PHASE 0: ENVIRONMENT SETUP

```bash
echo "=== REPOSITORY STATE ==="
git branch
git log --oneline -5

echo ""
echo "=== FILE COUNT ==="
find web/src -name "*.tsx" -o -name "*.ts" | grep -v node_modules | grep -v ".next" | wc -l

echo ""
echo "=== APP DIRECTORY STRUCTURE ==="
find web/src/app -name "page.tsx" | sort

echo ""
echo "=== COMPONENT COUNT ==="
find web/src/components -name "*.tsx" | grep -v node_modules | wc -l

echo ""
echo "=== LIB MODULE COUNT ==="
find web/src/lib -name "*.ts" -o -name "*.tsx" | grep -v node_modules | wc -l
```

**Commit:** `OB-66 Phase 0: Audit environment baseline`

---

## PHASE 1: NAVIGATION AUDIT — MENU TREE & PAGE SPRAWL

### 1A: Build complete route inventory

```bash
echo "========================================="
echo "PHASE 1A: COMPLETE ROUTE INVENTORY"
echo "========================================="

echo ""
echo "=== EVERY page.tsx IN THE APP ==="
find web/src/app -name "page.tsx" | sort

echo ""
echo "=== EVERY layout.tsx ==="
find web/src/app -name "layout.tsx" | sort

echo ""
echo "=== ROUTE GROUP DIRECTORIES ==="
find web/src/app -type d | sort

echo ""
echo "=== TOTAL PAGE COUNT ==="
find web/src/app -name "page.tsx" | wc -l
```

### 1B: Map the sidebar navigation menu

```bash
echo "========================================="
echo "PHASE 1B: SIDEBAR NAVIGATION MENU"
echo "========================================="

echo ""
echo "=== SIDEBAR/NAVIGATION COMPONENTS ==="
find web/src/components -name "*sidebar*" -o -name "*Sidebar*" -o -name "*navigation*" -o -name "*Navigation*" -o -name "*rail*" -o -name "*Rail*" -o -name "*Chrome*" | grep -v node_modules | grep -v ".next" | sort

echo ""
echo "=== MENU ITEMS DEFINED IN SIDEBAR ==="
grep -rn "label\|route\|path\|href\|to=" web/src/components/navigation/ web/src/components/layout/ --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -60

echo ""
echo "=== WORKSPACE DEFINITIONS ==="
grep -rn "workspace\|Workspace\|WORKSPACE" web/src/lib/navigation/ --include="*.ts" --include="*.tsx" 2>/dev/null | head -30
grep -rn "Operate\|Perform\|Investigate\|Design\|Configure\|Govern" web/src/components/navigation/ --include="*.tsx" | head -30
```

### 1C: Test every route for resolution

```bash
echo "========================================="
echo "PHASE 1C: ROUTE RESOLUTION TEST"
echo "========================================="

echo "Testing every page.tsx route on localhost..."
for pagefile in $(find web/src/app -name "page.tsx" | sort); do
  # Extract route from file path
  route=$(echo "$pagefile" | sed 's|web/src/app||;s|/page.tsx||;s|/(public)||;s|/(protected)||')
  if [ -z "$route" ]; then route="/"; fi
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://localhost:3000$route" 2>/dev/null)
  echo "$route → HTTP $STATUS"
done
```

### 1D: Identify dead routes and orphaned pages

```bash
echo "========================================="
echo "PHASE 1D: DEAD ROUTES & ORPHANED PAGES"
echo "========================================="

echo ""
echo "=== PAGES NOT LINKED FROM ANY NAVIGATION ==="
for pagefile in $(find web/src/app -name "page.tsx" | sort); do
  route=$(echo "$pagefile" | sed 's|web/src/app||;s|/page.tsx||')
  if [ -z "$route" ]; then route="/"; fi
  # Check if this route appears in any navigation/sidebar component
  REFS=$(grep -rn "$route" web/src/components/navigation/ web/src/components/layout/ --include="*.tsx" 2>/dev/null | wc -l)
  if [ "$REFS" -eq 0 ]; then
    echo "ORPHANED: $route (not linked from navigation)"
  fi
done

echo ""
echo "=== NAVIGATION LINKS POINTING TO NON-EXISTENT PAGES ==="
# Extract all href/route values from navigation and check they have page.tsx files
grep -rn "href=\|route:\|path:" web/src/components/navigation/ web/src/components/layout/ --include="*.tsx" | grep -v node_modules | while read line; do
  route=$(echo "$line" | grep -oP "(?:href|route|path)[=:]\s*['\"]([^'\"]+)" | grep -oP "(?<=['\"])[^'\"]+")
  if [ -n "$route" ] && [[ "$route" != http* ]] && [[ "$route" != "#" ]]; then
    pagefile="web/src/app${route}/page.tsx"
    if [ ! -f "$pagefile" ]; then
      echo "DEAD LINK: $route (no page.tsx found)"
    fi
  fi
done
```

### 1E: Page sprawl analysis

For every page found, classify it:

| Classification | Criteria |
|---|---|
| **ACTIVE** | Has real data queries, renders meaningful content |
| **STUB** | Exists but only renders a title/placeholder with no data |
| **STATIC** | Nav hub page that just links to sub-pages |
| **DEAD** | Returns error, blank, or is never reached |
| **DUPLICATE** | Same or nearly identical content as another page |

```bash
echo "========================================="
echo "PHASE 1E: PAGE CLASSIFICATION"
echo "========================================="

for pagefile in $(find web/src/app -name "page.tsx" | sort); do
  route=$(echo "$pagefile" | sed 's|web/src/app||;s|/page.tsx||')
  if [ -z "$route" ]; then route="/"; fi
  LINES=$(wc -l < "$pagefile")
  HAS_DATA=$(grep -c "from('\|\.select\|useQuery\|useSWR\|fetch" "$pagefile" 2>/dev/null)
  HAS_LOADING=$(grep -c "loading\|Loading\|isLoading\|Cargando" "$pagefile" 2>/dev/null)
  echo "$route | ${LINES} lines | data_queries=$HAS_DATA | loading_states=$HAS_LOADING"
done
```

### 1F: Generate Navigation Audit Report

Create `OB-66_01_NAVIGATION_AUDIT.md` at project root containing:

1. **Complete Route Map** — every route, status code, classification
2. **Menu Tree** — exact hierarchy as rendered in sidebar
3. **Dead Routes** — routes in navigation that don't resolve
4. **Orphaned Pages** — pages that exist but aren't linked
5. **Sprawl Score** — total pages vs. pages with real data queries
6. **Recommendation** — which pages to keep, merge, or cut

**Commit:** `OB-66 Phase 1: Navigation audit complete — route map, menu tree, sprawl analysis`

---

## PHASE 2: PAGE QUALITY AUDIT — IAP GATE

### 2A: Test every active page against the IAP Gate

For each page classified as ACTIVE or STUB in Phase 1, evaluate:

| Dimension | Question | Score |
|---|---|---|
| **Intelligence** | Does this page provide insight beyond raw data display? | 0-3 |
| **Acceleration** | Does this page recommend actions or surface what to do next? | 0-3 |
| **Performance** | Does this page enable faster/better outcomes? | 0-3 |

**Scoring:**
- 0 = Not present at all
- 1 = Minimal (placeholder or stub)
- 2 = Partial (some real content but not actionable)
- 3 = Full (delivers real value)

**IAP Gate:** Pages scoring 0 across all three dimensions should be flagged for removal or redesign.

### 2B: Test every page for empty states

```bash
echo "========================================="
echo "PHASE 2B: EMPTY STATE HANDLING"
echo "========================================="

for pagefile in $(find web/src/app -name "page.tsx" | sort); do
  route=$(echo "$pagefile" | sed 's|web/src/app||;s|/page.tsx||')
  HAS_EMPTY=$(grep -c "empty\|Empty\|no data\|no.*found\|Nothing\|nothing" "$pagefile" 2>/dev/null)
  HAS_LOADING=$(grep -c "loading\|Loading\|isLoading\|Cargando" "$pagefile" 2>/dev/null)
  HAS_TIMEOUT=$(grep -c "timeout\|Timeout\|setTimeout" "$pagefile" 2>/dev/null)
  echo "$route | empty_state=$HAS_EMPTY | loading=$HAS_LOADING | timeout=$HAS_TIMEOUT"
done
```

### 2C: Check for hardcoded/placeholder content on pages

```bash
echo "========================================="
echo "PHASE 2C: PLACEHOLDER CONTENT"
echo "========================================="

echo "=== PAGES WITH 'TODO' / 'COMING SOON' / 'PLACEHOLDER' ==="
grep -rn "TODO\|FIXME\|coming soon\|Coming Soon\|placeholder\|Placeholder\|Lorem\|lorem\|sample\|Sample" web/src/app/ --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -40

echo ""
echo "=== HARDCODED NUMBERS OR MOCK DATA ==="
grep -rn "12345\|99\.9\|100%\|demo.*data\|mock.*data\|fake.*data\|sample.*data" web/src/app/ --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -30
```

### 2D: Generate Page Quality Report

Create `OB-66_02_PAGE_QUALITY_AUDIT.md` at project root:

1. **IAP Gate Scorecard** — every page with I/A/P scores
2. **Pages failing IAP** — score 0 across all three (recommend cut or redesign)
3. **Pages passing IAP** — score 2+ in at least one dimension
4. **Empty State Coverage** — which pages handle empty data, which don't
5. **Placeholder Content Inventory** — every TODO, Coming Soon, mock data reference

**Commit:** `OB-66 Phase 2: Page quality audit — IAP gate scorecard, empty states, placeholders`

---

## PHASE 3: HARDCODING AUDIT — DESIGN PRINCIPLE VIOLATIONS

### 3A: AP-5 / AP-6 — Hardcoded field names and language patterns

```bash
echo "========================================="
echo "PHASE 3A: HARDCODED FIELD NAMES"
echo "========================================="

echo "=== SPANISH FIELD NAMES IN LOGIC CODE ==="
grep -rn "'año'\|'ano'\|'anio'\|'mes'\|'fecha'\|'periodo'\|'empleado'\|'tienda'\|'puesto'\|'venta'\|'cobr'" \
  web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | grep -v "label\|Label\|placeholder\|Placeholder\|labelEs"

echo ""
echo "=== ENGLISH FIELD NAMES IN LOGIC CODE ==="
grep -rn "'month'\|'year'\|'employee'\|'store'\|'sales'\|'commission'\|'quota'\|'target'" \
  web/src/lib/ web/src/app/api/ --include="*.ts" | grep -v node_modules | grep -v ".next" | grep -v "import\|export\|interface\|type " | head -30

echo ""
echo "=== FIELD_ID_MAPPINGS OR STATIC DICTIONARIES ==="
grep -rn "FIELD_ID_MAPPINGS\|FIELD_MAPPINGS\|fieldDictionary\|NORMALIZER\|normalizer\|lookupTable\|lookupDict" \
  web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -20

echo ""
echo "=== HARDCODED ARRAYS (language-specific field lists) ==="
grep -rn "YEAR_FIELDS\|MONTH_FIELDS\|PERIOD_FIELDS\|ENTITY_FIELDS\|ID_FIELDS\|YEAR_TARGETS\|MONTH_TARGETS" \
  web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -20
```

### 3B: AP-7 — Hardcoded confidence scores

```bash
echo "========================================="
echo "PHASE 3B: HARDCODED CONFIDENCE SCORES"
echo "========================================="

grep -rn "50%\|confidence.*=.*50\|confidence.*=.*0\.5\|confidence.*=.*100\|confidence.*=.*0\b" \
  web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -20

echo ""
echo "=== ALL CONFIDENCE ASSIGNMENTS ==="
grep -rn "confidence\s*[:=]" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | grep -v "interface\|type " | head -30
```

### 3C: Domain-agnostic violations — ICM-specific language in UI

```bash
echo "========================================="
echo "PHASE 3C: ICM-BIASED LANGUAGE IN UI"
echo "========================================="

echo "=== ICM-SPECIFIC TERMS IN COMPONENTS ==="
grep -rn "commission\|Commission\|compensation\|Compensation\|incentive\|Incentive\|payout\|Payout\|comp plan\|Comp Plan\|sales rep\|Sales Rep\|quota\|Quota" \
  web/src/components/ web/src/app/ --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -40

echo ""
echo "=== SHOULD BE DOMAIN-AGNOSTIC ==="
echo "commission → payout/outcome"
echo "compensation plan → rule set"  
echo "sales rep → entity/participant"
echo "quota → target/goal"
echo "incentive → outcome/result"
```

### 3D: Switch statements and string matching that should be AI

```bash
echo "========================================="
echo "PHASE 3D: LOGIC THAT SHOULD BE AI-DRIVEN"
echo "========================================="

echo "=== SWITCH STATEMENTS ON DATA TYPES ==="
grep -rn "switch\s*(" web/src/lib/ --include="*.ts" | grep -v node_modules | head -20

echo ""
echo "=== STRING MATCHING ON COMPONENT TYPES ==="
grep -rn "includes('optical\|includes('store\|includes('new_customer\|includes('insurance\|includes('collection\|includes('warranty\|includes('club" \
  web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -20

echo ""
echo "=== ROLE STRING MATCHING ==="
grep -rn "isCertified\|is_certified\|'Optometrista'\|'optometrista'\|role.*==\|role.*includes" \
  web/src/lib/ --include="*.ts" | grep -v node_modules | head -20

echo ""
echo "=== HARDCODED COMPONENT NAMES ==="
grep -rn "'optical_sales'\|'store_sales'\|'new_customers'\|'collections'\|'insurance_sales'\|'service_sales'" \
  web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -20
```

### 3E: Generate Hardcoding Audit Report

Create `OB-66_03_HARDCODING_AUDIT.md` at project root:

1. **AP-5/AP-6 Violations** — every hardcoded field name with file:line
2. **AP-7 Violations** — every hardcoded confidence score
3. **ICM Language Violations** — every domain-specific term in shared components
4. **Logic Violations** — switch statements and string matching that should be AI-driven
5. **Severity Classification** — CRITICAL (blocks domain-agnostic operation), HIGH (visible to users), MEDIUM (internal only)
6. **Total violation count by severity**

**Commit:** `OB-66 Phase 3: Hardcoding audit — field names, confidence, ICM language, logic violations`

---

## PHASE 4: SCHEMA ALIGNMENT AUDIT

### 4A: Dump actual database schema

Run these queries in Supabase SQL Editor or via service role API and paste results:

```sql
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' 
ORDER BY table_name, ordinal_position;
```

### 4B: Cross-reference every Supabase query in the codebase

```bash
echo "========================================="
echo "PHASE 4B: EVERY SUPABASE QUERY"
echo "========================================="

echo "=== ALL .select() CALLS WITH COLUMNS ==="
grep -rn "\.select(" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -80

echo ""
echo "=== ALL .eq() FILTER CALLS ==="
grep -rn "\.eq(" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -60

echo ""
echo "=== ALL .insert() CALLS ==="
grep -rn "\.insert(" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -40

echo ""
echo "=== ALL .update() CALLS ==="
grep -rn "\.update(" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -30
```

### 4C: Find every column mismatch

For each query found in 4B, verify every column name against the schema dump from 4A. Flag any column that doesn't exist on the referenced table.

```bash
echo "========================================="
echo "PHASE 4C: KNOWN MISMATCHES"
echo "========================================="

echo "=== entity_id ON profiles (INVALID) ==="
grep -rn "entity_id" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | grep -i "profile"

echo ""
echo "=== scope_level ANYWHERE (INVALID) ==="
grep -rn "scope_level" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next"

echo ""
echo "=== lifecycle_state ON calculation_batches ==="
grep -rn "lifecycle_state" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next"

echo ""
echo "=== .eq('id', user.id) ON profiles (SHOULD BE auth_user_id) ==="
grep -rn "profiles.*\.eq.*'id'" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -20
```

### 4D: Generate Schema Alignment Report

Create `OB-66_04_SCHEMA_AUDIT.md` at project root:

1. **Complete Schema Dump** — every table, every column, every type
2. **Every Supabase Query** — file, line, table, columns selected/filtered
3. **Every Mismatch** — column referenced but doesn't exist on table
4. **Error Impact** — which mismatches cause HTTP 400/406 errors in production
5. **Fix Priority** — ordered by user-facing impact

**Commit:** `OB-66 Phase 4: Schema alignment audit — every query vs actual schema`

---

## PHASE 5: AI/ML SIGNAL MESH AUDIT

### 5A: AI Service layer inventory

```bash
echo "========================================="
echo "PHASE 5A: AI SERVICE LAYER"
echo "========================================="

echo "=== AIService file ==="
cat web/src/lib/ai/ai-service.ts 2>/dev/null | head -50

echo ""
echo "=== Provider adapters ==="
find web/src/lib/ai -type f -name "*.ts" 2>/dev/null | sort

echo ""
echo "=== AIService usage across codebase ==="
grep -rn "getAIService\|AIService\|aiService\|ai-service" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | sort

echo ""
echo "=== DIRECT Anthropic API calls (SHOULD go through AIService) ==="
grep -rn "anthropic\|Anthropic\|claude\|ANTHROPIC_API\|x-api-key.*anthropic" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -20
```

### 5B: Training signal system

```bash
echo "========================================="
echo "PHASE 5B: TRAINING SIGNALS"
echo "========================================="

echo "=== Training signal files ==="
find web/src -name "*training*" -o -name "*signal*" | grep -v node_modules | sort

echo ""
echo "=== Training signal capture points ==="
grep -rn "captureAIResponse\|recordUserAction\|recordOutcome\|trainingSignal\|signalId" \
  web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | head -30

echo ""
echo "=== Training signal PERSISTENCE (database writes) ==="
grep -rn "training_signals\|from('training\|INSERT.*training\|\.insert.*training" \
  web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | head -15

echo ""
echo "=== Training signal CONSUMPTION (reading for improvement) ==="
grep -rn "getTrainingSignals\|readTrainingSignals\|trainingData\|learningLoop" \
  web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | head -15

echo ""
echo "=== Does training_signals TABLE exist? ==="
echo "Check information_schema.columns for 'training_signals' table"
```

### 5C: AI touchpoint inventory

```bash
echo "========================================="
echo "PHASE 5C: AI TOUCHPOINTS"
echo "========================================="

echo "=== Every AI API call site ==="
grep -rn "analyze-workbook\|classify-fields\|interpret.*plan\|analyze.*sheet\|ai.*classify\|ai.*analyze\|ai.*interpret\|ai.*extract" \
  web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | sort

echo ""
echo "=== Every /api/ai/ route ==="
find web/src/app/api -path "*ai*" -o -path "*analyze*" -o -path "*classify*" -o -path "*interpret*" | sort

echo ""
echo "=== Confidence scores generated by AI ==="
grep -rn "confidence" web/src/lib/ai/ web/src/app/api/ --include="*.ts" | head -20

echo ""
echo "=== AI responses parsed and stored ==="
grep -rn "aiResult\|aiResponse\|analysisResult\|classificationResult" \
  web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -20
```

### 5D: Closed-loop status

For each AI touchpoint found in 5C, determine:

| Touchpoint | Captures Signal? | Persists to DB? | Consumed by Learning? | Corrections Fed Back? |
|---|---|---|---|---|
| Sheet classification | ? | ? | ? | ? |
| Field mapping | ? | ? | ? | ? |
| Plan interpretation | ? | ? | ? | ? |
| Workbook analysis | ? | ? | ? | ? |
| Period detection | ? | ? | ? | ? |

### 5E: Heuristic fallback detection

```bash
echo "========================================="
echo "PHASE 5E: HEURISTIC FALLBACKS"
echo "========================================="

echo "=== SILENT FALLBACKS (masquerading as AI) ==="
grep -rn "fallback\|Fallback\|heuristic\|Heuristic\|default.*confidence\|catch.*confidence" \
  web/src/lib/ --include="*.ts" | grep -v node_modules | head -20

echo ""
echo "=== CONFIDENCE SCORES ASSIGNED WITHOUT AI CALL ==="
grep -B5 "confidence" web/src/lib/ --include="*.ts" | grep -v "await\|fetch\|api\|AIService" | head -30
```

### 5F: Generate AI/ML Audit Report

Create `OB-66_05_AI_ML_AUDIT.md` at project root:

1. **AI Service Architecture** — provider pattern, abstraction layer status
2. **AI Touchpoint Inventory** — every call site with capture/persist/consume status
3. **Training Signal Pipeline** — capture → persist → consume. What's connected, what's broken
4. **Closed-Loop Scorecard** — per-touchpoint: signal captured? persisted? consumed? corrections fed back?
5. **Heuristic Fallbacks** — code that assigns confidence without AI call
6. **Direct API Calls** — bypasses of AIService abstraction
7. **Compliance vs AI_ML_Architecture_Briefing.docx** — gap analysis

**Commit:** `OB-66 Phase 5: AI/ML signal mesh audit — touchpoints, signals, closed-loop status`

---

## PHASE 6: FUNCTIONALITY GAP ANALYSIS

### 6A: Define core user workflows

The platform must support these end-to-end workflows for a user to meaningfully engage:

**Workflow 1: Admin — First-time Setup (Login → First Calculation)**
1. Login as tenant admin
2. Import/activate a rule set (plan)
3. Import data file
4. Map fields (AI-assisted)
5. Validate and detect periods
6. Commit import
7. Select period
8. Run calculation
9. Review results
10. Approve/publish

**Workflow 2: Admin — Ongoing Period Close**
1. Login
2. Navigate to current period
3. Import new data for period
4. Run calculation
5. Review changes vs previous period
6. Handle exceptions/disputes
7. Approve
8. Publish/export payouts

**Workflow 3: Manager — Team Oversight**
1. Login
2. See team performance dashboard
3. Drill into individual entity results
4. Review pending approvals
5. Approve or flag issues

**Workflow 4: Entity/Rep — Self-Service**
1. Login
2. See personal performance
3. See payout details with transaction-level drill-down
4. Compare to targets
5. Submit dispute if needed
6. Track dispute status

**Workflow 5: Platform Admin (VL Admin) — Multi-tenant**
1. Login to Observatory
2. See tenant fleet status
3. Create/manage tenants
4. Monitor platform health
5. Toggle feature flags
6. View cross-tenant analytics

### 6B: Walk each workflow through the codebase

For each workflow step, determine:

```bash
echo "========================================="
echo "PHASE 6B: WORKFLOW WALKTHROUGH"
echo "========================================="

echo "=== WORKFLOW 1: SETUP ==="
echo "Step 1: Login page exists?"
ls web/src/app/login/page.tsx 2>/dev/null && echo "YES" || echo "NO"

echo "Step 2: Plan import page?"
find web/src/app -path "*plan*import*" -o -path "*design*plan*" | head -5

echo "Step 3: Data import page?"
find web/src/app -path "*import*enhanced*" -o -path "*data*import*" | head -5

echo "Step 7: Period selection?"
grep -rn "period.*select\|selectPeriod\|periodPicker\|PeriodSelector" web/src/ --include="*.tsx" | grep -v node_modules | head -10

echo "Step 8: Run calculation?"
find web/src/app -path "*calculate*" | head -5
grep -rn "runCalculation\|executeCalculation\|startCalculation" web/src/ --include="*.ts" | grep -v node_modules | head -10

echo "Step 9: Results page?"
find web/src/app -path "*result*" -o -path "*insights*" | head -5

echo "Step 10: Approval flow?"
find web/src/app -path "*approv*" | head -5
grep -rn "approve\|Approve\|APPROVE" web/src/app/ --include="*.tsx" | grep -v node_modules | head -10

echo ""
echo "=== WORKFLOW 4: ENTITY SELF-SERVICE ==="
echo "My Pay / My Performance page?"
find web/src/app -path "*my-pay*" -o -path "*my-performance*" -o -path "*perform/compensation*" | head -5

echo "Dispute submission?"
find web/src/app -path "*dispute*" | head -5
grep -rn "submitDispute\|createDispute\|disputeForm" web/src/ --include="*.tsx" --include="*.ts" | grep -v node_modules | head -10
```

### 6C: Classify each workflow step

For each step in each workflow:

| Status | Meaning |
|---|---|
| **COMPLETE** | Page exists, data queries work, renders real content |
| **PARTIAL** | Page exists but data doesn't load, or key functionality missing |
| **STUB** | Page exists but is placeholder/empty |
| **MISSING** | No page, no route, no component |
| **BLOCKED** | Exists but broken by schema mismatch or other bug |

### 6D: Generate Functionality Gap Report

Create `OB-66_06_FUNCTIONALITY_GAPS.md` at project root:

1. **Workflow Completion Matrix** — 5 workflows × steps, each with status
2. **Critical Gaps** — steps that are MISSING and block entire workflow
3. **Partial Gaps** — steps that exist but don't work
4. **What Must Be Built** — prioritized list of missing functionality
5. **What Must Be Fixed** — prioritized list of broken functionality
6. **Minimum Viable Platform** — the smallest set of working workflows for demo/validation

**Commit:** `OB-66 Phase 6: Functionality gap analysis — 5 workflows, completion matrix`

---

## PHASE 7: DESIGN PRINCIPLE COMPLIANCE

### 7A: TMR compliance check

```bash
echo "========================================="
echo "PHASE 7A: TMR COMPLIANCE"
echo "========================================="

echo "=== THERMOSTAT vs THERMOMETER ==="
echo "Pages that DISPLAY data but don't ACT on it:"
# Pages with data display but no action buttons, recommendations, or alerts
grep -rL "onClick\|action\|recommend\|alert\|suggest" web/src/app/*/page.tsx 2>/dev/null | head -20

echo ""
echo "=== CARRY EVERYTHING, EXPRESS CONTEXTUALLY ==="
echo "Import pipeline: does it preserve all raw data?"
grep -rn "filter\|exclude\|skip\|ignore\|discard" web/src/app/api/import/ --include="*.ts" | head -20

echo ""
echo "=== CALCULATION SOVEREIGNTY ==="
echo "Does calculation engine read from plan, not import-time decisions?"
grep -rn "import.*decision\|mapping.*time\|field.*mapping" web/src/lib/calculation/ --include="*.ts" | head -10
```

### 7B: VVSPv3 brand compliance

```bash
echo "========================================="
echo "PHASE 7B: BRAND COMPLIANCE"
echo "========================================="

echo "=== CLEARCOMP REFERENCES ==="
grep -rn "ClearComp\|clearcomp\|clear-comp\|clear_comp" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -20

echo ""
echo "=== BRAND COLORS (Deep Indigo #2D2F8F, Gold #E8A838) ==="
grep -rn "2D2F8F\|E8A838\|#2d2f8f\|#e8a838" web/src/ --include="*.tsx" --include="*.css" | grep -v node_modules | head -10

echo ""
echo "=== INTER FONT ==="
grep -rn "Inter\|inter\|font-family" web/src/ --include="*.tsx" --include="*.css" | grep -v node_modules | head -10
```

### 7C: Generate Design Compliance Report

Create `OB-66_07_DESIGN_COMPLIANCE.md` at project root:

1. **TMR Principle Compliance** — per-principle assessment with evidence
2. **VVSPv3 Brand Compliance** — colors, fonts, naming, legacy references
3. **ClearComp References** — every remaining instance
4. **Design System Adherence** — DS-001 through DS-005 compliance

**Commit:** `OB-66 Phase 7: Design principle compliance — TMR, VVSPv3, brand audit`

---

## PHASE 8: CONSOLIDATED AUDIT REPORT

### 8A: Create master report

Create `OB-66_PLATFORM_AUDIT_MASTER.md` at project root combining key findings from all seven audits:

```markdown
# Vialuce Platform Audit — Master Report
## OB-66, February 2026

### Executive Summary
- Total pages: ___
- Active pages (real data): ___
- Stub/dead pages: ___
- IAP Gate failures: ___
- Hardcoding violations: ___
- Schema mismatches: ___
- AI touchpoints: ___ (___% with closed-loop)
- Workflow completion: ___/5 complete, ___/5 partial, ___/5 blocked
- ClearComp references remaining: ___

### Top 10 Critical Findings
[Numbered list, severity-ordered]

### Recommended Action Plan
[Prioritized list of what to fix, in what order]

### Pages to CUT (sprawl reduction)
[Pages that add no value — remove entirely]

### Pages to MERGE
[Pages that duplicate functionality — consolidate]

### Pages to BUILD
[Missing functionality required for core workflows]

### Pages to FIX
[Existing but broken — schema mismatches, loading failures, etc.]
```

### 8B: Proof gates

| # | Gate | Pass Criteria | Method |
|---|------|--------------|--------|
| PG-1 | Navigation audit complete | OB-66_01 exists with route map | File check |
| PG-2 | Every page.tsx tested | Route resolution results for all | grep |
| PG-3 | IAP Gate scorecard complete | OB-66_02 exists with scores for every page | File check |
| PG-4 | Hardcoding audit complete | OB-66_03 exists with violation counts | File check |
| PG-5 | Schema audit complete | OB-66_04 exists with every query checked | File check |
| PG-6 | AI/ML audit complete | OB-66_05 exists with touchpoint inventory | File check |
| PG-7 | Functionality gaps identified | OB-66_06 exists with workflow matrix | File check |
| PG-8 | Design compliance checked | OB-66_07 exists with principle assessment | File check |
| PG-9 | Master report synthesized | OB-66_PLATFORM_AUDIT_MASTER.md exists | File check |
| PG-10 | Zero code changes | git diff shows only new .md files | git diff |
| PG-11 | Every finding has file:line evidence | Spot check 10 random findings | Review |
| PG-12 | Build still clean | npm run build exit 0 | Terminal |

### 8C: Completion report

Create `OB-66_COMPLETION_REPORT.md` at project root.

### 8D: PR

```bash
git add -A && git commit -m "OB-66 Phase 8: Consolidated audit report + completion"
git push origin dev
gh pr create --base main --head dev \
  --title "OB-66: Comprehensive Platform Audit — 7 dimensions, zero code changes" \
  --body "## What
Full platform audit across 7 dimensions: navigation, page quality, hardcoding, 
schema alignment, AI/ML signal mesh, functionality gaps, design compliance.

## Output
8 audit reports (7 dimensional + 1 master) with evidence-backed findings.
Zero code changes — audit only.

## Key Metrics
- Total pages audited: ___
- IAP Gate failures: ___
- Hardcoding violations: ___  
- Schema mismatches: ___
- Workflow gaps: ___

## Proof Gates: 12 — see OB-66_COMPLETION_REPORT.md"
```

---

## CRITICAL REMINDERS

1. **THIS OB CHANGES ZERO CODE.** It only produces audit reports.
2. Every finding must have file path + line number evidence.
3. Do not fix anything you find. Document it accurately.
4. The master report informs what to build next — it is the blueprint for OB-67+.
5. Accuracy over speed. A wrong finding wastes more time than a slow audit.
6. If the schema dump from Supabase requires manual execution, provide the SQL and document what you need.

---

*OB-66 — February 19, 2026*
*"You can't fix what you haven't measured. Measure everything. Fix nothing. Report truth."*
