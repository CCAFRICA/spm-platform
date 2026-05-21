# DIAG-056 — Plan Interpretation LLM Response Capture (Diagnostic)

**Branch:** `dev` (commit `161e3678`)
**Date:** 2026-05-21
**Type:** Read-only diagnostic — adds ONE log line. No behavioral change.

This report formalizes findings already reported in chat per the directive. Rules 25-28 require a completion-report file at the canonical path; chat-only reporting does not satisfy the requirement.

---

## Section 1 — LLM response receive site

`web/src/lib/ai/providers/anthropic-adapter.ts:806-814` (pre-log, verbatim):

```typescript
    const data = await response.json();
    const content = data.content?.[0]?.text;

    if (!content) {
      throw new Error('No content in Anthropic response');
    }

    // Parse JSON from response
    const result = this.parseJsonResponse(content);
```

`content` is the raw LLM text output. `result` is the parsed JSON (or the silent-fallback shape on parse failure — see Section 3).

---

## Section 2 — Component extraction sites

### Stage 1 — top-level extraction

`web/src/lib/compensation/ai-plan-interpreter.ts:259-275` (`validateAndNormalizePlanInterpretation`, verbatim):

```typescript
export function validateAndNormalizePlanInterpretation(rawResult: unknown): PlanInterpretation {
  const parsed = (rawResult ?? {}) as Record<string, unknown>;
  const rawTopConf = Number(parsed.confidence);
  return {
    ruleSetName: String(parsed.ruleSetName || 'Unnamed Plan'),
    ruleSetNameEs: parsed.ruleSetNameEs ? String(parsed.ruleSetNameEs) : undefined,
    description: String(parsed.description || ''),
    descriptionEs: parsed.descriptionEs ? String(parsed.descriptionEs) : undefined,
    currency: String(parsed.currency || 'USD').toUpperCase(),
    employeeTypes: normalizeEmployeeTypes(parsed.employeeTypes),
    components: normalizeComponents(parsed.components),
    requiredInputs: normalizeRequiredInputs(parsed.requiredInputs),
    workedExamples: normalizeWorkedExamples(parsed.workedExamples),
    confidence: Number.isFinite(rawTopConf) ? rawTopConf : 0,
    reasoning: String(parsed.reasoning || ''),
  };
}
```

The fallback at line 263 (`'Unnamed Plan'`) is the source of the rule_set name observed for the zero-component imports — confirms `parsed.ruleSetName` was missing or empty.

### Stage 2 — component-list coercion

`web/src/lib/compensation/ai-plan-interpreter.ts:186-216` (`normalizeComponents`, verbatim):

```typescript
function normalizeComponents(components: unknown): InterpretedComponent[] {
  if (!Array.isArray(components)) return [];

  return components.map((c, index) => {
    // OB-199 Phase 1: confidence arrives ratio-form post-producer-normalization
    // at anthropic-adapter.ts. Direct Number() read; fallback 0.5 preserved for
    // missing/invalid (matches prior B2 fallback semantic for component-level).
    const rawConf = Number(c.confidence);
    const comp: InterpretedComponent = {
      id: String(c.id || `component-${index}`),
      name: String(c.name || `Component ${index + 1}`),
      nameEs: c.nameEs ? String(c.nameEs) : undefined,
      type: normalizeComponentType(c.type),
      appliesToEmployeeTypes: Array.isArray(c.appliesToEmployeeTypes)
        ? c.appliesToEmployeeTypes.map(String)
        : ['all'],
      calculationMethod: normalizeCalculationMethod(c.type, c.calculationMethod),
      // OB-77: Preserve AI-produced structural intent (validated downstream)
      calculationIntent: c.calculationIntent && typeof c.calculationIntent === 'object'
        ? c.calculationIntent as Record<string, unknown>
        : undefined,
      // HF-244 Phase 2: integer cell-count declaration for rate-table components.
      rateTableCellCount: typeof c.rateTableCellCount === 'number' && c.rateTableCellCount > 0
        ? Math.floor(c.rateTableCellCount)
        : undefined,
      confidence: Number.isFinite(rawConf) ? rawConf : 0.5,
      reasoning: String(c.reasoning || ''),
    };
    return comp;
  });
}
```

Line 187 is the load-bearing silent path: any non-array `components` becomes `[]` with no logging. The `normalizeComponentType` call at line 198 can throw `UnconvertibleComponentError` on an unrecognized `type` value, but the throw would propagate out of `.map`, out of `validateAndNormalizePlanInterpretation`, out of `bridgeAIToEngineFormat`, and fail the upsert at the call site. The BCL evidence (upsert succeeded with `components: []`) rules out this path — `normalizeComponents` saw a non-array.

---

## Section 3 — Silent failure path

`web/src/lib/ai/providers/anthropic-adapter.ts:1074-1099` (`parseJsonResponse`, verbatim):

```typescript
  private parseJsonResponse(content: string): Record<string, unknown> {
    let jsonStr = content;

    // Try to extract JSON from markdown code blocks
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    // Try to extract JSON object
    const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      jsonStr = objectMatch[0];
    }

    try {
      return JSON.parse(jsonStr);
    } catch {
      // If parsing fails, return the raw content
      return {
        rawContent: content,
        parseError: true,
        confidence: 0,
      };
    }
  }
```

**The silent path:**

1. `JSON.parse` throws (truncated output / hitting `max_tokens` / malformed structure / unbalanced braces).
2. `parseJsonResponse` swallows the throw and returns `{ rawContent: content, parseError: true, confidence: 0 }`. No `components` field. No `ruleSetName` field. No log line.
3. That object becomes `response.result` and is passed to `bridgeAIToEngineFormat` → `validateAndNormalizePlanInterpretation` → `normalizeComponents(parsed.components)` where `parsed.components` is `undefined`. Line 187 returns `[]` silently.
4. End state: rule_set upserted with `components: []` and `ruleSetName: 'Unnamed Plan'` (the line 263 fallback in `validateAndNormalizePlanInterpretation`). No throw. No log. Matches the live BCL evidence (`f5003390` / `0c98b701` / `f5c42ff2` — all `Unnamed Plan` with 0 components).

**The SCI plan-interpretation guard does NOT cover this path.** `web/src/lib/sci/plan-interpretation.ts:156-167` (verbatim):

```typescript
  const interpretation = response.result;

  if (interpretation.fallback || interpretation.error) {
    return planUnits.map(u => ({
      contentUnitId: u.contentUnitId,
      classification: 'plan' as const,
      success: false,
      rowsProcessed: 0,
      pipeline: 'plan-interpretation',
      error: String(interpretation.error || 'AI interpretation returned no results'),
    }));
  }
```

The guard checks `interpretation.fallback || interpretation.error`. `parseJsonResponse` sets `parseError: true`, NOT `error`. The branch never fires. The silent-fallback shape proceeds to `bridgeAIToEngineFormat` and persists as a zero-component rule_set.

---

## Section 4 — Diagnostic log line added

`web/src/lib/ai/providers/anthropic-adapter.ts:806-822` (post-fix, verbatim):

```typescript
    const data = await response.json();
    const content = data.content?.[0]?.text;

    if (!content) {
      throw new Error('No content in Anthropic response');
    }

    // DIAG-056: capture raw LLM text BEFORE parseJsonResponse runs, so the
    // silent parse-error fallback (`{rawContent, parseError: true}` at
    // parseJsonResponse:1083-1090) cannot hide the actual emission shape.
    // Gated on plan_interpretation to avoid leaking workbook/sheet bodies.
    if (request.task === 'plan_interpretation') {
      console.log('[DIAG-LLM-RAW] Plan interpretation response:', JSON.stringify(content).substring(0, 3000));
    }

    // Parse JSON from response
    const result = this.parseJsonResponse(content);
```

ONE log line. Gated on `request.task === 'plan_interpretation'` to avoid leaking workbook or sheet content for other tasks. Truncation at 3000 chars keeps the log readable while preserving the diagnostically interesting head of the response (`ruleSetName`, `employeeTypes`, first one or two components).

---

## Section 5 — Hypothesis

**Most likely path: case (A) — response not parseable as JSON, truncation at `max_tokens` mid-`calculationIntent` tree.**

The grammar block now teaches scale-annotated constants on every compare position plus exhaustive emission on rate tables. A BCL Senior Executive variant carrying four components — one with a 6×5 = 30-cell matrix (Credit Placement) plus three with 1D bands — emits a lot of tokens per component. The model begins emitting the JSON, runs out of output-token budget partway through a `calculationIntent` tree, and the response ends with an unterminated structure.

`parseJsonResponse`'s `objectMatch` regex (`/\{[\s\S]*\}/`) grabs from the first `{` to the last `}`. If the truncated response ends mid-token without any matching closing brace, the regex either captures up to a stray `}` deeper in the tree (producing partial garbage JSON) or fails to balance braces at the right depth — either way `JSON.parse` throws and the silent fallback fires.

Confirmation will come from the `[DIAG-LLM-RAW]` log on the next BCL plan reimport:

- If the raw response ends mid-token (e.g., `... "calculationIntent": { "prime": "conditi`), case A is confirmed. Fix is raising `max_tokens` in the plan_interpretation request, or splitting the emission into smaller passes (e.g., one component per call).
- If the raw response is short and valid JSON with `components: []` or `components: null`, case B is confirmed. Fix is prompt tightening — the LLM is interpreting the input as "not a plan" or failing to emit components for a known reason.
- If the raw response is valid JSON with populated `components` but every entry has a rejected `type` value, case C is confirmed — but this path would have thrown at `normalizeComponentType` and surfaced as an upsert failure, which contradicts the observed silent-zero-components state. Case C is ruled out by current evidence.

---

## Section 6 — Build verification

```
$ npx tsc --noEmit
(no output — clean)
$ rm -rf .next && npm run build
✓ Compiled successfully
$ npm run dev (then curl localhost:3000)
HTTP 307
```

Adapter API surface unchanged. The log line is the only behavioral change.

---

## Section 7 — Commit reference

```
$ git log --oneline -1
161e3678 DIAG-056: diagnostic log for raw LLM plan interpretation response
```

Pushed to `dev`. Will reach `main` on the next `dev → main` merge along with whatever fix the DIAG-LLM-RAW capture motivates.

---

## Section 8 — Next action

This is a diagnostic. **No PR.** The architect-manual procedure:

1. Reimport the BCL plan through the browser (or any plan-interpretation flow that exercises the path).
2. Capture the `[DIAG-LLM-RAW] Plan interpretation response: ...` line from the server-side log.
3. Inspect: does the raw response (a) end mid-token, (b) contain valid JSON with `components: []`, or (c) contain valid JSON with populated components?
4. Direct the fix as a separate HF based on which path is confirmed.

The diagnostic log is gated on `plan_interpretation` only and is safe to leave in place — but once the root cause is identified and fixed, the architect may want to remove the log line in the same HF that ships the fix to avoid leaking the LLM's plan-text emissions to platform logs.
