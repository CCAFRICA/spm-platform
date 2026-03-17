# HF-113: AI COLUMN MAPPING — PROMPT FORMAT ENFORCEMENT
## Fix AIService Response Format for Column-to-Metric Mapping

**Priority:** P0 — Calculation Blocked
**Trigger:** HF-112 AI call returned `{"narrative": "Revenue performance shows..."}` instead of `{"revenue_attainment": "Cumplimiento_Ingreso", ...}`. All components fell through to boundary fallback (wrong columns). Same incorrect bindings as HF-111.
**Branch:** dev
**Ground truth:** MX$185,063 — Meridian Logistics Group, January 2025
**Tenant ID:** `5035b1e8-0754-4527-b7ec-9f93f85e4c79`
**Depends on:** HF-112 (PR #215) merged

AUTONOMY DIRECTIVE: NEVER ask yes/no. NEVER say "shall I." Just act. Execute every phase sequentially. Commit and push after every change. If a phase fails, diagnose and fix — do not stop and ask.

---

## READ FIRST

Read `CC_STANDING_ARCHITECTURE_RULES.md` in the repo root.

---

## WHY THIS HF EXISTS

HF-112's architecture is correct — one-time AI call, boundary validation, binding reuse (proven: execute 3 showed `Existing bindings complete — reusing (zero AI cost)`). But the AI returned a narrative analysis instead of a JSON mapping. The prompt didn't constrain the output format strongly enough, or the wrong AIService method was used.

**Production evidence:**
```
[Convergence] HF-112 AI mapping: {"narrative":"Revenue performance shows strong achievement with actual revenue averaging 321K..."}
[Convergence] HF-112 AI proposed 1 mappings
```

Expected: `{"revenue_attainment": "Cumplimiento_Ingreso", "hub_route_volume": "Volumen_Rutas_Hub", ...}` (7 mappings)
Actual: `{"narrative": "..."}` (1 key — a narrative, not a mapping)

---

## THE FIX — THREE TARGETED CHANGES

### Fix 1: Use AIService.generateJSON (not generic generate)

Verify that `resolveColumnMappingsViaAI` uses AIService's JSON-specific method with structured output enforcement. HC uses AIService with JSON repair and retry — column mapping must use the same path.

### Fix 2: Strengthen the prompt

The prompt must make the expected output format unambiguous. Add an explicit example. Remove any language that could be interpreted as requesting analysis.

**Current prompt issue:** The prompt says "You match compensation plan metric requirements to data columns" and lists all the data with descriptions. The AI interpreted this as a request to ANALYZE the data rather than MAP it.

**Fixed prompt structure:**
```
You are a data column mapper. Your ONLY job is to match metric field names to data column names.

METRIC FIELDS (what the plan needs):
1. "revenue_attainment"
2. "hub_route_volume"
3. "on_time_delivery_percentage"
4. "new_accounts_count"
5. "safety_incidents"
6. "total_hub_loads"
7. "total_hub_capacity"

DATA COLUMNS (what the data has):
1. "Cumplimiento_Ingreso" (identified as: revenue_compliance_percentage)
2. "Volumen_Rutas_Hub" (identified as: hub_route_volume)
3. "Pct_Entregas_Tiempo" (identified as: on_time_delivery_percentage)
4. "Cuentas_Nuevas" (identified as: new_accounts_count)
5. "Incidentes_Seguridad" (identified as: safety_incident_count)
6. "Cargas_Flota_Hub" (identified as: fleet_hub_loads)
7. "Capacidad_Flota_Hub" (identified as: fleet_hub_capacity)
8. "Ingreso_Meta" (identified as: target_revenue_amount)
9. "Ingreso_Real" (identified as: actual_revenue_amount)
10. "Entregas_Totales" (identified as: total_deliveries)
11. "Entregas_Tiempo" (identified as: on_time_deliveries_count)
12. "Tasa_Utilizacion_Hub" (identified as: hub_utilization_rate)

Match each metric field to the single best data column. Each column used at most once.

RESPOND WITH ONLY THIS JSON FORMAT, NOTHING ELSE:
{"revenue_attainment": "column_name", "hub_route_volume": "column_name", ...}

EXAMPLE OUTPUT:
{"revenue_attainment": "Cumplimiento_Ingreso", "hub_route_volume": "Volumen_Rutas_Hub"}
```

Key changes from HF-112 prompt:
- "Your ONLY job is to match" — not analyze
- Metric fields listed as simple names without boundary descriptions (removes analysis temptation)
- Explicit example output
- "RESPOND WITH ONLY THIS JSON FORMAT, NOTHING ELSE" — stronger constraint
- No narrative-inducing language (removed "compensation plan" context descriptions)

### Fix 3: Parse with validation and retry

After receiving the AI response, validate it's actually a mapping (keys are metric field names, values are column names). If it's a narrative or wrong format, retry once with an even more constrained prompt.

```typescript
function isValidColumnMapping(
  result: Record<string, unknown>,
  expectedMetrics: string[],
  validColumns: string[],
): boolean {
  // Must have at least 50% of expected metrics mapped
  const mappedCount = expectedMetrics.filter(m => 
    typeof result[m] === 'string' && validColumns.includes(result[m] as string)
  ).length;
  return mappedCount >= Math.ceil(expectedMetrics.length * 0.5);
}

// If first attempt returns narrative/invalid format:
if (!isValidColumnMapping(aiResult, metricFields, columnNames)) {
  console.warn('[Convergence] HF-113 AI response was not a valid column mapping — retrying with strict prompt');
  // Retry with even simpler prompt — just the field names and column names, no descriptions
  const retryResult = await aiService.generateJSON(strictRetryPrompt);
  if (isValidColumnMapping(retryResult, metricFields, columnNames)) {
    aiResult = retryResult;
  } else {
    console.error('[Convergence] HF-113 AI retry also failed — falling back to boundary matching');
  }
}
```

---

## WHAT NOT TO DO

1. **DO NOT change the convergence architecture.** HF-112's architecture is correct. This is a prompt fix only.
2. **DO NOT add multiple AI calls.** One call + one retry max. That's it.
3. **DO NOT remove boundary validation.** Keep HF-112's validation layer.
4. **DO NOT remove hasCompleteBindings.** Keep the binding reuse — it was proven working.

---

## PHASE 0: DIAGNOSTIC — FIND THE EXACT AI CALL

```bash
# Find how resolveColumnMappingsViaAI calls AIService
grep -rn "resolveColumnMappingsViaAI\|aiService\|AIService\|generateJSON\|generate(" \
  web/src/lib/intelligence/convergence-service.ts | head -20

# Find the prompt text
grep -rn "match.*metric\|column mapper\|RESPOND.*JSON\|metric.*field" \
  web/src/lib/intelligence/convergence-service.ts | head -10

# Find which AIService method is being called
grep -rn "\.generate\|\.generateJSON\|\.call\|\.complete" \
  web/src/lib/intelligence/convergence-service.ts | head -10
```

### PROOF GATE 0:
```
□ AIService call method identified (generateJSON vs generate vs raw)
□ Current prompt text located (file:line)
□ AI response parsing code located (file:line)
```

**Commit:** `HF-113 Phase 0: AI prompt diagnostic` + push

---

## PHASE 1: FIX PROMPT + PARSING + VALIDATION

Implement all three fixes. This is one phase — the changes are small and interdependent.

### PROOF GATE 1:
```
□ Prompt rewritten — "ONLY job is to match", explicit example, no analysis language (paste new prompt)
□ AIService method verified — uses generateJSON or equivalent JSON-enforcing method (paste call)
□ isValidColumnMapping validation added (paste function)
□ Retry logic on invalid response (paste retry code)
□ npm run build exits 0
```

**Commit:** `HF-113 Phase 1: AI prompt format enforcement + validation + retry` + push

---

## PHASE 2: BUILD + PR

```bash
kill dev server
rm -rf .next
npm run build
npm run dev

gh pr create --base main --head dev \
  --title "HF-113: AI column mapping prompt format enforcement" \
  --body "Fixes AI returning narrative instead of metric-to-column JSON mapping.

## Root Cause
HF-112 prompt was interpreted as analysis request. AI returned {narrative: '...'} instead of {metric: 'column', ...}.

## Fix
1. Prompt rewritten: 'Your ONLY job is to match' + explicit example + no analysis language
2. Response validation: isValidColumnMapping checks keys are metrics, values are columns
3. Retry on invalid format with stripped-down prompt

## Architecture unchanged — HF-112 binding reuse + boundary validation preserved."
```

### PROOF GATE 2:
```
□ npm run build exits 0 (paste)
□ PR created (paste URL)
□ Completion report saved as HF-113_COMPLETION_REPORT.md
```

---

## ANDREW'S PRODUCTION VERIFICATION

1. Reset: `UPDATE rule_sets SET input_bindings = '{}'::jsonb WHERE tenant_id = '5035b1e8-...'`
2. Re-import Meridian XLSX
3. Check Vercel logs for:
   - `HF-112 AI proposed 7 mappings` (not 1)
   - `component_0: row=Cumplimiento_Ingreso, column=Volumen_Rutas_Hub`
   - Each component binding a DIFFERENT, CORRECT column
   - NO `boundary fallback` entries
4. Calculate January 2025 → MX$185,063

---

*HF-113 — AI Column Mapping Prompt Format Enforcement | March 9, 2026*

*"The AI understood the data perfectly — it wrote a beautiful narrative about revenue performance and fleet utilization. It just answered the wrong question. Now it answers the right one."*
