# HF-055: TRAINING SIGNAL PERSISTENCE

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST: CC_STANDING_ARCHITECTURE_RULES.md

Before reading further, open and read the COMPLETE file `CC_STANDING_ARCHITECTURE_RULES.md` at the project root. Every decision in this HF must comply with all sections (A through F).

Also read: `SCHEMA_REFERENCE.md` — the authoritative column reference for every Supabase query.

---

## ⚠️ CC COMPLIANCE ENFORCEMENT

### THE THREE VIOLATIONS THAT KEEP RECURRING

**VIOLATION 1: Inventing schema instead of checking it.**
RULE: Before writing ANY Supabase query, verify every column name against SCHEMA_REFERENCE.md AND the live database.

**VIOLATION 2: Creating parallel implementations instead of wiring existing code.**
RULE: Before creating ANY new file, `grep -rn` for existing implementations. Extend, don't duplicate.

**VIOLATION 3: Claiming PASS via code review instead of proving with live tests.**
RULE: Every proof gate marked "SQL query" must include PASTED OUTPUT.

### COMPLIANCE CHECKPOINTS (Mandatory at end of each Mission)

```
COMPLIANCE CHECK — Mission N
=============================
□ Every column name verified against SCHEMA_REFERENCE.md? [YES/NO — list tables]
□ Searched for existing implementations before creating new files? [YES/NO — list grep commands]
□ Every state change persists to Supabase? [YES/NO — list write operations]
□ Proof gates proven with pasted output, not described? [YES/NO]
□ Anti-Pattern Registry checked? [YES/NO — list AP#]
□ Scale test: would this work for 150K entities? [YES/NO]
```

---

## WHY THIS HF EXISTS

**Vialuce claims "compound learning" — corrections from Customer A improve suggestions for Customer B.** This claim requires:

1. AI makes a prediction (sheet classification, field mapping, plan interpretation)
2. User confirms or corrects the prediction
3. The signal (prediction + user decision + was_corrected) is **persisted to Supabase**
4. Future AI calls retrieve historical signals to improve predictions

**Current state:** Step 1 works. Step 2 partially works (field mapping corrections captured). Step 3 is BROKEN — signals are captured in an **in-memory buffer** that is lost on page reload, server restart, or deployment. `getTrainingSignals()` returns empty. Step 4 cannot work without Step 3.

**This HF closes the gap: in-memory buffer → Supabase `classification_signals` table.**

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000 responds
3. Final step: `gh pr create --base main --head dev`
4. **Fix logic, not data.** Do not insert test data.
5. **Commit this prompt to git as first action.**
6. **profiles.id ≠ auth.uid(). Use auth_user_id.**
7. **Check SCHEMA_REFERENCE.md before any Supabase query.**

---

## SCHEMA TRUTH

From SCHEMA_REFERENCE.md:

**classification_signals** (as documented):
| Column | Type |
|--------|------|
| id | uuid PK |
| tenant_id | uuid FK → tenants.id |
| entity_id | uuid FK → entities.id |
| signal_type | text |
| signal_value | jsonb |
| confidence | numeric |
| source | text |
| context | jsonb |
| created_at | timestamptz |

**⚠️ CRITICAL:** The live DB may have DIFFERENT columns than SCHEMA_REFERENCE.md documents. OB-50 designed the table with `event_id`, `ai_prediction`, `ai_confidence`, `user_decision`, `was_corrected` — different columns entirely. **Phase 0 MUST query the live database to determine the actual schema.** If the table doesn't exist, create it matching SCHEMA_REFERENCE.md.

---

## PHASE 0: DIAGNOSTIC (MANDATORY — BEFORE ANY CODE)

### 0A: Find the AI service and signal system

```bash
echo "============================================"
echo "HF-055 PHASE 0A: AI SERVICE AUDIT"
echo "============================================"

echo ""
echo "=== AIService files ==="
find web/src -name "*ai-service*" -o -name "*AIService*" -o -name "*ai_service*" | grep -v node_modules | sort

echo ""
echo "=== AIService class/singleton ==="
for f in $(find web/src -name "*ai-service*" -o -name "*AIService*" | grep -v node_modules | head -3); do
  echo "--- $f ---"
  grep -n "class \|export \|function \|signal\|buffer\|capture\|training\|persist" "$f" | head -30
done

echo ""
echo "=== Training signal files ==="
find web/src -name "*training*" -o -name "*signal*" | grep -v node_modules | sort

echo ""
echo "=== Signal capture points ==="
grep -rn "captureSignal\|recordSignal\|addSignal\|pushSignal\|signalBuffer\|trainingSignal\|captureAIResponse" \
  web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | head -20

echo ""
echo "=== getTrainingSignals function ==="
grep -rn "getTrainingSignals\|getSignals\|fetchSignals" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | head -10

echo ""
echo "=== In-memory buffer ==="
grep -rn "signalBuffer\|signals.*\[\]\|signals.*Map\|signals.*Array\|private.*signals" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | head -10
```

### 0B: Find all AI call sites that should capture signals

```bash
echo "============================================"
echo "HF-055 PHASE 0B: AI CALL SITES"
echo "============================================"

echo ""
echo "=== All Anthropic API calls ==="
grep -rn "anthropic\|claude\|messages\.create\|api\.anthropic\|ANTHROPIC_API" \
  web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".d.ts" | head -20

echo ""
echo "=== Sheet classification ==="
grep -rn "classifySheet\|sheet_classification\|sheetClassif" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | head -10

echo ""
echo "=== Field mapping ==="
grep -rn "fieldMapping\|field_mapping\|mapFields\|mapField" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | head -10

echo ""
echo "=== Plan interpretation ==="
grep -rn "interpretPlan\|plan_interpretation\|planInterpret" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | head -10

echo ""
echo "=== Assessment ==="
grep -rn "assessment\|generateAssessment\|aiAssessment\|api/ai/assessment" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | head -10

echo ""
echo "=== Entity resolution ==="
grep -rn "entityResol\|resolveEntity\|entity_resolution" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | head -10
```

### 0C: Check the live database for classification_signals table

```bash
echo "============================================"
echo "HF-055 PHASE 0C: DATABASE STATE"
echo "============================================"

echo ""
echo "=== Check if classification_signals table exists ==="
# Execute these SQL queries against Supabase:
#
# 1. Does the table exist?
# SELECT table_name FROM information_schema.tables 
# WHERE table_schema = 'public' AND table_name = 'classification_signals';
#
# 2. If yes, what are its actual columns?
# SELECT column_name, data_type, is_nullable 
# FROM information_schema.columns 
# WHERE table_name = 'classification_signals' 
# ORDER BY ordinal_position;
#
# 3. How many rows?
# SELECT COUNT(*) FROM classification_signals;
#
# 4. RLS policies?
# SELECT policyname, cmd, qual FROM pg_policies 
# WHERE tablename = 'classification_signals';

echo ""
echo "=== Supabase client references to classification_signals ==="
grep -rn "classification_signals" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | head -15
```

### 0D: Document findings

Create `HF-055_DIAGNOSTIC.md` at project root with:
1. **AIService architecture:** Where is the singleton? What methods does it expose? Where is the in-memory buffer?
2. **Signal capture points:** Which AI call sites capture signals? Which don't?
3. **In-memory buffer structure:** What data does it hold? How is it structured?
4. **Database state:** Does classification_signals exist? What are its ACTUAL columns? Any existing rows?
5. **getTrainingSignals:** Where is this function? Why does it return empty?
6. **Gap analysis:** What's missing between capture (working) and persistence (broken)?

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-0A | Diagnostic file exists | File check | All 6 sections with evidence |
| PG-0B | In-memory buffer location identified | Diagnostic section 3 | Specific file, line, data structure |
| PG-0C | Database schema verified | SQL output pasted | Table exists (with columns) or doesn't |

**Commit:** `HF-055 Phase 0: Diagnostic — AI signal system audit`

---

## MISSION 1: ENSURE classification_signals TABLE EXISTS

### 1A: Create or verify the table

Based on Phase 0 findings:

**If table exists:** Verify columns match SCHEMA_REFERENCE.md. Document any differences. Do NOT alter the table if it has data — adapt the code to match the actual schema.

**If table does NOT exist:** Create migration `web/supabase/migrations/014_classification_signals.sql`:

```sql
CREATE TABLE IF NOT EXISTS classification_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_id UUID REFERENCES entities(id),
  signal_type TEXT NOT NULL,
  signal_value JSONB NOT NULL DEFAULT '{}',
  confidence NUMERIC,
  source TEXT NOT NULL DEFAULT 'ai_prediction',
  context JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_classification_signals_tenant ON classification_signals(tenant_id);
CREATE INDEX idx_classification_signals_type ON classification_signals(signal_type);
CREATE INDEX idx_classification_signals_source ON classification_signals(source);

ALTER TABLE classification_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "signals_tenant_read" ON classification_signals
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin'
    )
  );

CREATE POLICY "signals_tenant_insert" ON classification_signals
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin'
    )
  );
```

**RLS notes:**
- Uses `auth_user_id = auth.uid()` (NOT `id = auth.uid()`) per Standing Rule #6
- Platform admins (vl_admin) can read/write all signals
- Tenant users can read/write their own tenant's signals

### 1B: Execute migration

Run the migration in Supabase SQL Editor. Then verify:

```sql
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'classification_signals' ORDER BY ordinal_position;

SELECT COUNT(*) FROM classification_signals;
```

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-1A | Table exists in live DB | SQL output pasted | Column listing matches |
| PG-1B | RLS policies active | SQL output pasted | At least read + insert policies |
| PG-1C | Migration file committed | git diff | File in supabase/migrations/ |

```
COMPLIANCE CHECK — Mission 1
=============================
□ Every column name verified against SCHEMA_REFERENCE.md? [YES/NO]
□ Searched for existing implementations before creating new files? [YES/NO]
□ Every state change persists to Supabase? [YES/NO — table created]
□ Proof gates proven with pasted output, not described? [YES/NO]
□ Anti-Pattern Registry checked? [YES/NO — AP-8 (migration executed)]
□ Scale test: would this work for 150K entities? [YES/NO — indexed]
```

**Commit:** `HF-055 Mission 1: classification_signals table — migration + RLS`

---

## MISSION 2: CREATE SIGNAL PERSISTENCE SERVICE

### 2A: Find the existing signal capture code

From Phase 0, identify where signals are currently buffered in memory. There should be a function or method that receives signal data from AI call sites.

### 2B: Create or extend a persistence service

Create `web/src/lib/ai/signal-persistence.ts` (or extend existing if found):

```typescript
import { createServerClient } from '@/lib/supabase/server';

interface SignalData {
  tenantId: string;
  signalType: string;        // 'sheet_classification' | 'field_mapping' | 'plan_interpretation' | 'assessment' | 'entity_resolution'
  signalValue: Record<string, any>;  // { ai_prediction, user_decision, was_corrected, ... }
  confidence?: number;
  source?: string;           // 'ai_prediction' | 'user_confirmed' | 'user_corrected'
  entityId?: string;
  context?: Record<string, any>;
}

export async function persistSignal(signal: SignalData): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createServerClient();
    const { error } = await supabase
      .from('classification_signals')
      .insert({
        tenant_id: signal.tenantId,
        entity_id: signal.entityId || null,
        signal_type: signal.signalType,
        signal_value: signal.signalValue,
        confidence: signal.confidence ?? null,
        source: signal.source ?? 'ai_prediction',
        context: signal.context ?? {},
      });

    if (error) {
      console.error('[SignalPersistence] Failed to persist signal:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    console.error('[SignalPersistence] Exception:', err);
    return { success: false, error: String(err) };
  }
}

export async function persistSignalBatch(signals: SignalData[]): Promise<{ success: boolean; count: number; error?: string }> {
  if (signals.length === 0) return { success: true, count: 0 };

  try {
    const supabase = createServerClient();
    const rows = signals.map(s => ({
      tenant_id: s.tenantId,
      entity_id: s.entityId || null,
      signal_type: s.signalType,
      signal_value: s.signalValue,
      confidence: s.confidence ?? null,
      source: s.source ?? 'ai_prediction',
      context: s.context ?? {},
    }));

    const { error } = await supabase
      .from('classification_signals')
      .insert(rows);

    if (error) {
      console.error('[SignalPersistence] Batch failed:', error.message);
      return { success: false, count: 0, error: error.message };
    }
    return { success: true, count: signals.length };
  } catch (err) {
    console.error('[SignalPersistence] Batch exception:', err);
    return { success: false, count: 0, error: String(err) };
  }
}

export async function getTrainingSignals(
  tenantId: string,
  signalType?: string,
  limit: number = 100
): Promise<SignalData[]> {
  try {
    const supabase = createServerClient();
    let query = supabase
      .from('classification_signals')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (signalType) {
      query = query.eq('signal_type', signalType);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[SignalPersistence] getTrainingSignals failed:', error.message);
      return [];
    }

    return (data || []).map(row => ({
      tenantId: row.tenant_id,
      signalType: row.signal_type,
      signalValue: row.signal_value,
      confidence: row.confidence,
      source: row.source,
      entityId: row.entity_id,
      context: row.context,
    }));
  } catch (err) {
    console.error('[SignalPersistence] Exception:', err);
    return [];
  }
}
```

**CRITICAL:** Adapt column names to match the ACTUAL live database columns discovered in Phase 0. The code above uses SCHEMA_REFERENCE.md columns. If the live table has different columns, use those instead.

### 2C: Wire getTrainingSignals to replace the empty return

Find the existing `getTrainingSignals()` function that returns empty. Replace its implementation with the new Supabase-backed version.

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-2A | signal-persistence.ts exists | File check | persistSignal, persistSignalBatch, getTrainingSignals |
| PG-2B | getTrainingSignals queries Supabase | grep output | `.from('classification_signals')` |
| PG-2C | Old empty return replaced | grep output | No more hardcoded `return []` for getTrainingSignals |

```
COMPLIANCE CHECK — Mission 2
=============================
□ Every column name verified against SCHEMA_REFERENCE.md? [YES/NO]
□ Searched for existing implementations before creating new files? [YES/NO]
□ Every state change persists to Supabase? [YES/NO]
□ Proof gates proven with pasted output, not described? [YES/NO]
□ Anti-Pattern Registry checked? [YES/NO — AP-17 (single persistence path)]
□ Scale test: would this work for 150K entities? [YES/NO — indexed, batch insert]
```

**Commit:** `HF-055 Mission 2: Signal persistence service — persistSignal + getTrainingSignals`

---

## MISSION 3: WIRE SIGNAL CAPTURE TO PERSISTENCE — SHEET CLASSIFICATION

### 3A: Find the sheet classification AI call

From Phase 0, identify where sheet classification happens. The AI receives sheet headers and sample rows, returns a classification (roster, transaction, summary, etc.) with confidence.

### 3B: After the AI returns, persist the signal

At the point where the AI classification result is received:

```typescript
await persistSignal({
  tenantId,
  signalType: 'sheet_classification',
  signalValue: {
    ai_prediction: classificationResult.sheetType,   // 'roster', 'transaction', etc.
    sheet_name: sheetName,
    column_count: headers.length,
    row_count: rowCount,
  },
  confidence: classificationResult.confidence,
  source: 'ai_prediction',
  context: {
    column_headers: headers.slice(0, 20),  // First 20 headers for context
    sample_row_count: sampleRows?.length,
    import_batch_id: importBatchId,
  },
});
```

### 3C: When user confirms or corrects, update signal

If the user confirms the classification → persist a second signal with `source: 'user_confirmed'`.
If the user overrides → persist with `source: 'user_corrected'` and the corrected value.

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-3A | Sheet classification calls persistSignal | grep output | `persistSignal` in classification code path |
| PG-3B | Signal includes prediction + confidence | Code review | signal_value has ai_prediction, confidence is numeric |

```
COMPLIANCE CHECK — Mission 3
=============================
□ Every column name verified against SCHEMA_REFERENCE.md? [YES/NO]
□ Searched for existing implementations before creating new files? [YES/NO]
□ Every state change persists to Supabase? [YES/NO — signal written]
□ Proof gates proven with pasted output, not described? [YES/NO]
□ Anti-Pattern Registry checked? [YES/NO]
□ Scale test: would this work for 150K entities? [YES/NO]
```

**Commit:** `HF-055 Mission 3: Wire sheet classification → signal persistence`

---

## MISSION 4: WIRE SIGNAL CAPTURE — FIELD MAPPING

### 4A: Find the field mapping AI call

Field mapping is the ONE proven closed loop (1/6). It already captures signals in memory. Find where the AI maps source fields to target fields and where user corrections are captured.

### 4B: Wire to persistence

Same pattern as Mission 3: after AI returns field mapping predictions, persist the signal. After user confirms or corrects, persist the update.

```typescript
// After AI field mapping:
await persistSignal({
  tenantId,
  signalType: 'field_mapping',
  signalValue: {
    ai_mapping: { sourceField: 'num_empleado', targetField: 'employee_id', confidence: 0.95 },
    sheet_name: sheetName,
  },
  confidence: 0.95,
  source: 'ai_prediction',
  context: { import_batch_id: importBatchId },
});

// After user confirms/corrects:
await persistSignal({
  tenantId,
  signalType: 'field_mapping',
  signalValue: {
    final_mapping: { sourceField: 'num_empleado', targetField: 'employee_id' },
    was_corrected: userChanged,
    original_prediction: aiMapping,
  },
  source: userChanged ? 'user_corrected' : 'user_confirmed',
  context: { import_batch_id: importBatchId },
});
```

### 4C: Wire getTrainingSignals into field mapping AI call

When the AI is about to make field mapping predictions, retrieve historical signals:

```typescript
const historicalSignals = await getTrainingSignals(tenantId, 'field_mapping', 50);
// Include in AI prompt context:
// "Previous field mappings for this tenant: ..."
```

This closes the loop: prediction → user feedback → persistence → retrieval → improved prediction.

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-4A | Field mapping calls persistSignal | grep output | `persistSignal` in field mapping code path |
| PG-4B | User corrections persist | Code review | `source: 'user_corrected'` path exists |
| PG-4C | getTrainingSignals called before AI prediction | grep output | `getTrainingSignals` in AI prompt construction |

```
COMPLIANCE CHECK — Mission 4
=============================
□ Every column name verified against SCHEMA_REFERENCE.md? [YES/NO]
□ Searched for existing implementations before creating new files? [YES/NO]
□ Every state change persists to Supabase? [YES/NO]
□ Proof gates proven with pasted output, not described? [YES/NO]
□ Anti-Pattern Registry checked? [YES/NO]
□ Scale test: would this work for 150K entities? [YES/NO]
```

**Commit:** `HF-055 Mission 4: Wire field mapping → signal persistence + closed loop retrieval`

---

## MISSION 5: WIRE REMAINING AI CALL SITES

### 5A: Plan interpretation signals

If plan interpretation AI exists (Phase 0 will confirm), wire signal capture:
- After AI extracts components → persist signal with extracted components + confidence
- signal_type: `'plan_interpretation'`

### 5B: Assessment signals

If `/api/ai/assessment` exists, wire signal capture:
- After AI generates assessment → persist signal
- signal_type: `'assessment'`

### 5C: Entity resolution signals

If entity resolution AI exists, wire signal capture:
- After AI resolves entities → persist signal
- signal_type: `'entity_resolution'`

**IMPORTANT:** If any of these AI call sites don't exist or aren't functional, document them in the completion report as "NOT WIRED — call site does not exist." Do not create stub AI call sites — only wire persistence to EXISTING, FUNCTIONAL AI calls.

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-5A | All functional AI call sites documented | Completion report | List of wired vs not-wired |
| PG-5B | Each wired site calls persistSignal | grep output | One persistSignal per AI call site |
| PG-5C | No signal capture without persistence | grep output | No in-memory-only buffers remaining |

```
COMPLIANCE CHECK — Mission 5
=============================
□ Every column name verified against SCHEMA_REFERENCE.md? [YES/NO]
□ Searched for existing implementations before creating new files? [YES/NO]
□ Every state change persists to Supabase? [YES/NO]
□ Proof gates proven with pasted output, not described? [YES/NO]
□ Anti-Pattern Registry checked? [YES/NO]
□ Scale test: would this work for 150K entities? [YES/NO]
```

**Commit:** `HF-055 Mission 5: Wire remaining AI call sites — plan interpretation, assessment, entity resolution`

---

## MISSION 6: SIGNAL OBSERVABILITY + BUILD + CLT

### 6A: Create API route for signal retrieval

Create `web/src/app/api/signals/route.ts`:

```typescript
// GET /api/signals?tenant_id=...&signal_type=...&limit=...
// Returns classification_signals for the tenant
// Used by: future AI dashboard, VL Admin signal monitoring
```

### 6B: Verify signals exist in DB

After all wiring is complete, verify that the signal persistence actually works by checking the database:

```sql
SELECT signal_type, COUNT(*), AVG(confidence) as avg_confidence
FROM classification_signals
GROUP BY signal_type
ORDER BY count DESC;

SELECT * FROM classification_signals 
ORDER BY created_at DESC LIMIT 5;
```

**Note:** If no import/classification has been triggered in this session, the table may be empty. That's OK — the wiring is proven by code review. But if you CAN trigger a classification (e.g., the import page has a test mode), do so and verify the signal appears.

### 6C: Remove or redirect in-memory buffer

If Phase 0 found an in-memory signal buffer, ensure it either:
- No longer exists (replaced entirely by Supabase persistence), OR
- Writes through to Supabase (in-memory serves as a write-ahead cache that flushes to DB)

There should be NO code path where signals are captured but NOT persisted.

### 6D: Build clean

```bash
cd web && rm -rf .next && npx tsc --noEmit && npm run build && npm run dev
```

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-6A | API route /api/signals exists | File check | GET returns signals from Supabase |
| PG-6B | Signals in DB (or table empty with wiring proven) | SQL output pasted | Query result |
| PG-6C | No orphan in-memory buffers | grep output | Zero in-memory-only signal storage |
| PG-6D | Build clean | npm run build | Exit 0 |
| PG-6E | Dev server responds | curl localhost:3000 | 200 or 307 |

```
COMPLIANCE CHECK — Mission 6
=============================
□ Every column name verified against SCHEMA_REFERENCE.md? [YES/NO]
□ Searched for existing implementations before creating new files? [YES/NO]
□ Every state change persists to Supabase? [YES/NO]
□ Proof gates proven with pasted output, not described? [YES/NO]
□ Anti-Pattern Registry checked? [YES/NO — AP-9, AP-10 (live verification)]
□ Scale test: would this work for 150K entities? [YES/NO]
```

**Commit:** `HF-055 Mission 6: Signal API route + observability + build clean`

---

## PHASE FINAL: COMPLETION REPORT + PR

Create `HF-055_COMPLETION_REPORT.md` at PROJECT ROOT with:

1. **Diagnostic Summary** — AIService architecture, signal buffer location, DB state
2. **Mission 1: Table** — Created or verified, columns, RLS
3. **Mission 2: Persistence Service** — persistSignal, persistSignalBatch, getTrainingSignals
4. **Mission 3: Sheet Classification** — Wired to persistence
5. **Mission 4: Field Mapping** — Wired to persistence + closed loop retrieval
6. **Mission 5: Remaining Sites** — Which wired, which not (with justification)
7. **Mission 6: Observability** — API route, DB verification, in-memory buffer removed
8. **AI Signal Inventory:**

| AI Call Site | Signal Type | Capture | Persist | Retrieve | Loop Closed? |
|---|---|---|---|---|---|
| Sheet classification | sheet_classification | ? | ? | ? | ? |
| Field mapping | field_mapping | ? | ? | ? | ? |
| Plan interpretation | plan_interpretation | ? | ? | ? | ? |
| Assessment | assessment | ? | ? | ? | ? |
| Entity resolution | entity_resolution | ? | ? | ? | ? |

9. **COMPLIANCE CHECKS** — All 6 mission blocks
10. **ALL PROOF GATES** — 22 total
11. **STANDING RULE COMPLIANCE**
12. **KNOWN ISSUES**

### PR

```bash
gh pr create --base main --head dev \
  --title "HF-055: Training Signal Persistence — In-Memory Buffer → Supabase" \
  --body "## What This HF Delivers

### Signal Persistence Infrastructure
- classification_signals table with RLS
- persistSignal() + persistSignalBatch() + getTrainingSignals()
- API route GET /api/signals for observability

### AI Call Sites Wired
- Sheet classification → signal persistence
- Field mapping → signal persistence + closed loop retrieval
- [Other sites as found]

### Closed Loop Status
- Field mapping: Prediction → User feedback → Persist → Retrieve → Improved prediction
- [Other loops as achieved]

## Proof Gates: 22 — see HF-055_COMPLETION_REPORT.md"
```

**Commit:** `HF-055 Final: Completion report + PR`

---

## MAXIMUM SCOPE

6 missions, 22 proof gates. This HF ONLY handles signal persistence. Do NOT:
- Build Assessment Panels (OB-71)
- Build anomaly detection (OB-71)
- Build Five Layers of Proof (OB-72)
- Refactor AIService architecture
- Add new AI call sites that don't exist

Wire what exists. Persist what's captured. Close the loop where possible. That's it.

---

## ANTI-PATTERNS TO WATCH

- **AP-8**: Migration executed and verified with DB query (not just file created)
- **AP-13**: Column names from live DB, not assumed
- **AP-17**: Single persistence path (no parallel signal storage)
- **AP-9/AP-10**: Proof gates with pasted evidence

---

*HF-055 — February 20, 2026*
*"A learning system that forgets everything on restart is not a learning system."*
