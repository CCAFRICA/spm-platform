# OB-106 Architecture Decision Record

## Problem
2 of 6 calculation components produce $0 for Retail Conglomerate Mexico ("Óptica Luminar").
Insurance Sales and Service/Warranty Sales both fail at the same point: the semantic
fallback in `buildMetricsForComponent()` can't find the base amount because the data
uses specific enriched key names that don't match the literal semantic type key.

Pipeline Proof Co (same data, different rule_set) works because its rule_set uses
metric names that exactly match the data keys.

## Option A: Fix the rule_set data in Supabase
- Update RCM's rule_set `appliedTo` fields: `"insurance_sales"` → `"reactivacion_club_proteccion_sales"`, `"warranty_sales"` → `"garantia_extendida_sales"`
- Scale test: N/A — data fix
- AI-first: VIOLATES — hardcodes customer-specific field names into rule_set
- Transport: N/A
- Atomicity: Easy rollback
- Risk to Performance Matrix: None
- **Problem**: Fixes one tenant but every future tenant with similar AI-interpreted generic metric names would have the same bug. Treats the symptom, not the disease.

## Option B: Improve semantic fallback in buildMetricsForComponent
- When direct key match and literal semantic key both fail, search ALL keys in entityMetrics for ones whose `inferSemanticType(key)` matches the expected semantic type
- Scale test: Works at 10x — O(n) over metric keys per component, typically <20 keys
- AI-first: YES — works for any metric name in any language
- Transport: N/A (in-memory only)
- Atomicity: N/A (pure function, no side effects)
- Risk to Performance Matrix: **NONE** — PM uses store-prefixed metrics that go through SHEET_COMPONENT_PATTERNS path (lines 444-483), not the non-store fallback being modified (lines 484-490)
- Korean Test: PASSES — if Korean data had a key 보험판매금액 that infers to "amount", the semantic search would find it

## Option C: Add a metric alias/remapping layer
- New `metricAliases` config in rule_set: `{ "insurance_sales": "reactivacion_club_proteccion_sales" }`
- Scale test: Works at 10x
- AI-first: Partially — needs AI to generate aliases
- Over-engineered for a one-line fix in the fallback

## CHOSEN: Option B
The semantic fallback should search by inferred type, not just literal key name.
This is how it should have worked from the start — the entire metric resolver
architecture is built on semantic type inference, but the final fallback step
skips it and uses literal keys only.

## REJECTED: Option A — Fixes data not logic. Violates AI-first principle. Every future tenant would need manual rule_set fixup.
## REJECTED: Option C — Over-engineered. Option B achieves the same result with less complexity.

## CRITICAL CONSTRAINT
Performance Matrix currently produces MX$1,280,465 aggregate (MX$1,250 for entity 93515855).
After this fix, the store-prefixed metric path is UNTOUCHED. PM value MUST be unchanged.
