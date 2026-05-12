# E2.3 — TypeScript references to c4 / Fleet Utilization (verbatim)

## Direct c4 / fleet / utilization grep

**Command:**
```bash
grep -rni "c4|fleet.utilization|fleet_utilization|FleetUtilization" web/src/ --include="*.ts"
```

**Output:**
```
web/src/app/api/financial/data/route.ts:170:const BRAND_PALETTE = ['#ef4444', '#22c55e', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899'];
web/src/lib/data/results-loader.ts:22:  '#ec4899', // pink
```

CC observation (verbatim): the two matches contain the substring `c4` only within color hex codes (`#ec4899`). No TypeScript file declares an identifier that contains `c4`, `fleet_utilization`, or `FleetUtilization`.

## Grep for c4-derived identifiers from the E2.2 declaration

**Command:**
```bash
grep -rn "fleet_utilization_senior|fleet_utilization_standard|hub_total_loads|hub_total_capacity|component_4|Fleet Utilization" web/src/ --include="*.ts"
```

**Output:** (empty — zero matches)

**Halt status per directive:** "Any discovery query returns 0 rows where >0 was expected — surface the empty result + the verbatim query, do not retry with assumed alternatives." CC surfaces. No TypeScript file references `fleet_utilization_senior`, `fleet_utilization_standard`, `hub_total_loads`, `hub_total_capacity`, the literal `component_4`, or the string `"Fleet Utilization"`.

## Grep for the operation / source vocabulary the c4 declaration uses

The E2.2 c4 declaration uses `operation: "scalar_multiply"` with `input.source: "ratio"`. The TS-side handling of these tokens:

**Command:**
```bash
grep -rn "source: 'ratio'|\"ratio\"|scalar_multiply|source_pattern.*transaction|ComponentIntent.*ratio" web/src/lib/calculation/ --include="*.ts"
```

**Output (29 lines):**
```
web/src/lib/calculation/pattern-signature.ts:10: *   "scalar_multiply:metric:rate_num:entity"
web/src/lib/calculation/pattern-signature.ts:11: *   "scalar_multiply:metric:rate_op(bounded_lookup_1d):entity"
web/src/lib/calculation/pattern-signature.ts:15:import type { ComponentIntent, IntentOperation, IntentSource } from './intent-types';
web/src/lib/calculation/pattern-signature.ts:50:    case 'scalar_multiply': {
web/src/lib/calculation/pattern-signature.ts:54:      return `scalar_multiply:${describeInput(op.input)}:${rateDesc}`;
web/src/lib/calculation/intent-executor.ts:97:        source: 'ratio',
web/src/lib/calculation/intent-executor.ts:495:    case 'scalar_multiply':   return executeScalarMultiply(op, data, inputLog, trace);
web/src/lib/calculation/run-calculation.ts:258:    case 'scalar_multiply':
web/src/lib/calculation/run-calculation.ts:289:      // OB-120: Transform postProcessing.rateFromLookup into scalar_multiply wrapper.
web/src/lib/calculation/run-calculation.ts:292:      // Transform: bounded_lookup_1d{postProcessing:{scalar_multiply, rateFromLookup}}
web/src/lib/calculation/run-calculation.ts:293:      //         → scalar_multiply{input: volume, rate: bounded_lookup_1d}
web/src/lib/calculation/run-calculation.ts:300:          operation: 'scalar_multiply',
web/src/lib/calculation/intent-validator.ts:86:    case 'scalar_multiply':
web/src/lib/calculation/intent-validator.ts:344:  validateSourceOrOp(obj.input, 'scalar_multiply.input', errors, warnings);
web/src/lib/calculation/intent-validator.ts:351:    errors.push(...nestedResult.errors.map(e => `scalar_multiply.rate(nested): ${e}`));
web/src/lib/calculation/intent-validator.ts:352:    warnings.push(...nestedResult.warnings.map(w => `scalar_multiply.rate(nested): ${w}`));
web/src/lib/calculation/intent-validator.ts:354:    errors.push('scalar_multiply: rate must be a number or nested operation');
web/src/lib/calculation/intent-types.ts:25:  | { source: 'ratio'; sourceSpec: { numerator: string; denominator: string } }
web/src/lib/calculation/intent-types.ts:114:  operation: Op<'scalar_multiply'>;
web/src/lib/calculation/intent-transformer.ts:38:    case 'scalar_multiply':
web/src/lib/calculation/intent-transformer.ts:81: * AI format for ratios:   { source: "ratio", sourceSpec: { numerator: "X", denominator: "Y" } }
web/src/lib/calculation/intent-transformer.ts:82: *                         → { operation: "ratio", numerator: IntentSource, denominator: IntentSource }
web/src/lib/calculation/intent-transformer.ts:147:  } else if (rawIntent.operation === 'scalar_multiply' && rawIntent.rate != null) {
web/src/lib/calculation/intent-transformer.ts:149:      operation: 'scalar_multiply',
web/src/lib/calculation/decimal-precision.ts:144:    case 'scalar_multiply': {
web/src/lib/calculation/primitive-registry.ts:41: * scope aggregation as `scalar_multiply { input.source: 'scope_aggregate' }`.
web/src/lib/calculation/primitive-registry.ts:48:  'scalar_multiply',
web/src/lib/calculation/primitive-registry.ts:141:    id: 'scalar_multiply',
web/src/lib/calculation/results-formatter.ts:520:  if (componentType === 'scalar_multiply' || componentType === 'conditional_gate') {
```

CC surfaces these as the TypeScript sites that read the `scalar_multiply` operation token or the `'ratio'` source token. The architect reads which sites participate in the c4 execution path against the E1.4 function surface and the E4 boundary table.
