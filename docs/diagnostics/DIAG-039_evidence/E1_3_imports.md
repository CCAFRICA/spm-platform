# E1.3 — POST handler imports + invocation map (verbatim)

## Import statements (lines 16–64, verbatim)

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  evaluateComponent,
  aggregateMetrics,
  buildMetricsForComponent,
  applyMetricDerivations,
  getExpectedMetricNames,
  type ComponentResult,
  type AIContextSheet,
  type MetricDerivationRule,
  rowMatchesFilters,
} from '@/lib/calculation/run-calculation';
import { inferSemanticType } from '@/lib/orchestration/metric-resolver';
import { transformVariant } from '@/lib/calculation/intent-transformer';
import { executeIntent, type EntityData } from '@/lib/calculation/intent-executor';
import type { ComponentIntent, RoundingTrace } from '@/lib/calculation/intent-types';
import type { PlanComponent } from '@/types/compensation-plan';
import { toNumber, roundComponentOutput, inferOutputPrecision, ZERO } from '@/lib/calculation/decimal-precision';
import type { Json } from '@/lib/supabase/database.types';
import { convergeBindings } from '@/lib/intelligence/convergence-service';
// OB-199 Phase 4: canonical writer migration.
import { writeSignal, CanonicalWriteError } from '@/lib/intelligence/canonical-signal-writer';
// HF-196 Phase 2: calc-time entity resolution per Decision 92 + OB-182 stated intent.
// Closes Break #2 (entity binding gap) by populating committed_data.entity_id at
// calc time for any rows where the import-time path didn't already resolve.
import { resolveEntitiesAtCalcTime } from '@/lib/sci/calc-time-entity-resolution';
import { loadDensity, persistDensityUpdates } from '@/lib/calculation/synaptic-density';
import {
  createSynapticSurface,
  writeSynapse,
  getExecutionMode,
  consolidateSurface,
  initializePatternDensity,
} from '@/lib/calculation/synaptic-surface';
import { generatePatternSignature } from '@/lib/calculation/pattern-signature';
// OB-81: Agent memory, flywheel, and insight wiring
import { loadPriorsForAgent, type AgentPriors } from '@/lib/agents/agent-memory';
// OB-83: Domain Agent dispatch — wraps calculation through negotiation protocol
import { createCalculationRequest, scoreCalculationResult } from '@/lib/domain/domain-dispatcher';
import '@/lib/domain/domains/icm'; // Import ICM to trigger domain registration
import { postConsolidationFlywheel } from '@/lib/calculation/flywheel-pipeline';
import {
  checkInlineInsights,
  generateFullAnalysis,
  DEFAULT_INSIGHT_CONFIG,
  type InlineInsight,
  type CalculationSummary,
} from '@/lib/agents/insight-agent';
```

## Invoked-symbol grep — every symbol that appears as a callable in the POST body

**Command:**
```bash
awk 'NR>=66 && NR<=2507' web/src/app/api/calculation/run/route.ts | grep -oE '[a-zA-Z_][a-zA-Z0-9_]*\(' | sort -u
```

**Output (sorted unique):**
```
abs(
add(
addLog(
aggregateMetrics(
aggregateScopeRows(
applyMetricDerivations(
bufferTrace(
buildMetricsForComponent(
catch(
ceil(
checkInlineInsights(
consolidateSurface(
convergeBindings(
createCalculationRequest(
createServiceRoleClient(
createSynapticSurface(
Date(
delete(
entries(
eq(
error(
Error(
evaluateComponent(
executeIntent(
fetchSupersededBatchIds(
filter(
floor(
forEach(
from(
generateFullAnalysis(
generatePatternSignature(
get(
getExecutionMode(
getExpectedMetricNames(
getFullYear(
getMonth(
gte(
has(
import(
in(
includes(
inferOutputPrecision(
inferSemanticType(
initializePatternDensity(
insert(
is(
isArray(
isNaN(
join(
json(
keys(
limit(
loadDensity(
loadPriorsForAgent(
localeCompare(
log(
lt(
lte(
map(
Map(
max(
min(
neq(
normalize(
not(
now(
Number(
O(
order(
padStart(
parseFloat(
persistDensityUpdates(
plus(
POST(
postConsolidationFlywheel(
push(
randomUUID(
range(
readField(
reduce(
replace(
resolve(
resolveColumnFromBatch(
resolveEntitiesAtCalcTime(
resolveMetricsFromConvergenceBindings(
round(
roundComponentOutput(
rowMatchesFilters(
scoreCalculationResult(
select(
set(
Set(
shouldEmitTrace(
single(
slice(
some(
sort(
split(
startsWith(
String(
stringify(
then(
toFixed(
toISOString(
toLocaleString(
toLowerCase(
toNumber(
transformVariant(
trim(
update(
values(
variantTokenize(
warn(
writeSignal(
writeSynapse(
```
