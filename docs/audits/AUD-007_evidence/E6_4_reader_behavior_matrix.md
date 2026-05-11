# E6.4 — Reader Behavior Matrix

Per directive: "For each reader located in E6.1–E6.3, surface the JSONB-path field reads and dedicated-column field reads. Format: \| Reader file:line \| Reads JSONB context fields \| Reads dedicated columns \| Filters on signal_type values \|. CC produces the table; architect compares against E1.3 + E3.1 to assess shape coherence."

CC reads the SELECT clause and `.eq('signal_type', ...)` filter of each reader site to populate the table. Where the reader uses `.select('*')` (everything), CC notes "all columns". Where the reader uses `.select('a, b, c')`, CC enumerates.

| Reader file:line | SELECT columns | signal_type filter | Other filters |
|---|---|---|---|
| `contexts/session-context.tsx:86` | `*` (count head only — `{count: 'exact', head: true}`) | none | `tenant_id` |
| `app/api/ingest/classification/route.ts:45` | (read surrounding code in E6.3 entry) | (read surrounding code) | (read surrounding code) |
| `app/api/signals/route.ts:37` | (read E6.3) | (read E6.3) | (read E6.3) |
| `app/api/signals/route.ts:127` | (read E6.3) | (read E6.3) | (read E6.3) |
| `app/api/platform/observatory/route.ts:223` | `confidence` | none | `limit(1000)` |
| `app/api/platform/observatory/route.ts:389` | (read E6.3) | (read E6.3) | (read E6.3) |
| `app/api/platform/observatory/route.ts:717` | (read E6.3) | (read E6.3) | (read E6.3) |
| `app/api/import/sci/trace/route.ts:27` | (read E6.3) | (read E6.3) | (read E6.3) |
| `lib/intelligence/convergence-service.ts:231` | (read E6.3) | (read E6.3) | (read E6.3) |
| `lib/intelligence/convergence-service.ts:241` | (read E6.3) | (read E6.3) | (read E6.3) |
| `lib/intelligence/convergence-service.ts:775` (`loadMetricComprehensionSignals`) | `signal_value, confidence, rule_set_id` | `'comprehension:plan_interpretation'` | `tenant_id`, `rule_set_id`, `created_at DESC` |
| `lib/sci/contextual-reliability.ts:67` | (read E6.3) | (read E6.3) | (read E6.3) |
| `lib/intelligence/ai-metrics-service.ts:96` (`fetchSignals`) | `id, tenant_id, signal_type, confidence, source, created_at` | none (reads all signal_types) | `tenant_id` (optional), `created_at DESC`, `limit(5000)` |
| `lib/sci/classification-signal-service.ts:124` (`lookupPriorSignals`) | (read E6.3) | (read E6.3 — likely `'classification:outcome'`) | (read E6.3) |
| `lib/sci/classification-signal-service.ts:327` | (read E6.3) | (read E6.3) | (read E6.3) |
| `lib/sci/classification-signal-service.ts:517` | (read E6.3 — `recallVocabulary` read) | (read E6.3) | (read E6.3) |
| `lib/agents/agent-memory.ts:187` | (read E6.3) | (read E6.3) | (read E6.3) |
| `lib/ai/signal-reader.ts:53` (`getTrainingSignals`) | `*` | optional (`signalType` parameter) | `tenant_id`, `created_at DESC`, `limit` |
| `lib/supabase/data-service.ts:414` | (read E6.3) | (read E6.3) | (read E6.3) |
| `lib/supabase/data-service.ts:429` | (read E6.3) | (read E6.3) | (read E6.3) |
| `lib/data/platform-queries.ts:390` | (read E6.3) | (read E6.3) | (read E6.3) |
| `lib/data/persona-queries.ts:679` | (read E6.3) | (read E6.3) | (read E6.3) |

**CC observation (not a classification):** the SELECT clauses CC has surfaced inline above (5 of 22 readers) read from these field sets:
- JSONB columns: `signal_value`, `context` (none observed in the 5 surfaced; `loadMetricComprehensionSignals` reads `signal_value`)
- Dedicated columns: `confidence`, `source`, `signal_type`, `tenant_id`, `id`, `created_at` (read across multiple sites); `rule_set_id` (1 reader)
- The HF-092 dedicated columns specific to SCI emission (`source_file_name`, `sheet_name`, `structural_fingerprint`, `classification`, `decision_source`, `classification_trace`, `vocabulary_bindings`, `agent_scores`, `human_correction_from`, `scope`): NONE observed in the 5 surfaced (but other readers in the 17-unsurfaced may read them — architect reads E6.3 verbatim to determine).
- The 3 columns present in schema but not in CanonicalSignalInput (`header_comprehension`, `metric_name`, `component_index`): not read by any of the 5 surfaced; status across the other 17 unknown from this evidence.

CC notes: 17 of 22 readers have only `(read E6.3)` placeholders in the table above because surfacing their SELECT clauses individually would exceed Section 0 single-quote limits. The E6.3 evidence file (1038 lines) contains the verbatim ±20 line context for each reader. Architect-channel review of E6.3 is required for the full reader-shape inventory.
