ARCHITECTURE DECISION RECORD — HF-275
=====================================
Problem: Convergence column matcher is not population-aware. A column with
values only on excluded rows (grouping/hub rows, entity_id IS NULL — dropped
from the calculation population by HF-263) can win over a column with values on
calculation-population (individual) rows, because the AI semantic match prefers
name similarity. Meridian c4: `cargas_totales_hub` matched `Cargas_Totales`
(0/268 individual rows non-null) over `Cargas_Flota_Hub` (201/268 non-null);
the engine reads null for every individual entity → c4 = 0.

Option A: Hard-filter columns with 100% null on individual rows
  - Scale test: Yes
  - AI-first: No — removes candidates before AI sees them
  - Risk: a column might be legitimately sparse (new hires, partial data)
  - Rejected: hard filter is a gate, not a quality signal

Option B: Population-null-rate as a confidence adjustment   [CHOSEN]
  - Scale test: Yes — any tenant with excluded grouping rows
  - AI-first: Yes — AI picks; confidence is adjusted post-AI by data quality,
    the same layer where boundary validation and confidence already live
  - Korean Test: Yes — structural null-rate over the calculation population
    (entity_id IS NOT NULL); no column/component/tenant literal
  - AP-17: Yes — extends the existing generateAllComponentBindings scoring;
    no parallel matcher
  - Mechanism: adjusted_confidence = original_confidence × (1 - individual_null_rate).
    A column 100% null on individual rows → factor 0 → cannot win. A column at
    0% null → unaffected. Partial null → proportional penalty. In the binding
    loop, the AI-proposed column is NOT accepted directly when it is 100% null on
    the calculation population (it genuinely cannot produce a value); the boundary
    candidate scores are each multiplied by (1 - null_rate) so a non-null column
    wins for the same metric slot.
  - Chosen

Option C: Include population stats in the AI prompt so the LLM decides
  - Scale test: Yes
  - AI-first: Maximally — LLM gets the information
  - Risk: prompt bloat, non-determinism, the LLM may still prefer name
    similarity over data presence
  - Deferred: valid enhancement but higher variance than Option B

Phase-0 confirmations:
- HALT-0 NOT triggered: the AI receives column names and proposes one column per
  metric (resolveColumnMappingsViaAI), but a post-AI scoring/validation step
  exists in generateAllComponentBindings (boundary validation via
  scoreColumnForRequirement + boundary fallback). Fix lands post-AI as specified.
- HALT-2 NOT triggered: generateAllComponentBindings already receives `tenantId`
  and `supabase` (+ capabilities carry batchIds), so the calculation-population
  row data is reachable at binding time. No new plumbing needed.
- ColumnValueStats carries {min,max,mean,sampleCount} only (no null counts) and
  is computed GLOBALLY; the per-population null rate is computed by a dedicated
  bounded read partitioned by entity_id IS NOT NULL.
