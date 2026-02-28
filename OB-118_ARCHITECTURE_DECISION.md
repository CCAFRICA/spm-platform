ARCHITECTURE DECISION RECORD — OB-118
======================================
Problem: Insurance Referral produces $0 because the engine cannot derive numeric metrics
from categorical/string data in committed_data rows. The data has 188 rows with
ProductCode (string) and Qualified (string) fields. The calculationIntent needs numeric
counts: "how many qualified referrals for product INS-VIDA?"

This is the "Measurable Dimension" concept from Decision 64 (C-45): a quantity that can
be DERIVED from data through count, filter, and group operations, not just read as a raw
numeric field.

Option A: Metric derivation at calculation time — when resolveSource encounters an unknown
metric, query committed_data and derive the metric via count/filter/group on the fly
  - Scale test: Works at 10x? CONCERN — per-entity per-period database queries during calc
  - AI-first: Any hardcoding? Depends on how filter criteria are specified
  - Transport: Data through HTTP bodies? NO
  - Atomicity: Clean state on failure? YES — read-only derivation
  - Pro: No pre-computation needed
  - Con: Performance at scale, derivation logic embedded in calc path

Option B: Pre-compute derived metrics during import/commit — when data is committed,
identify derivable metrics and store as pre-aggregated values alongside raw data
  - Scale test: Works at 10x? YES — computed once at import, read many times at calc
  - AI-first: Depends on how derivation rules are determined
  - Transport: NO
  - Atomicity: YES — computed metrics are idempotent
  - Pro: Fast calculation, metrics available for inspection before calc
  - Con: Requires knowing what to derive at import time (chicken-and-egg without plan)

Option C: Derive at calculation time using in-memory data already loaded — the engine
already loads committed_data rows for each entity. Extend the metric builder to also
derive count/filter/group metrics from the already-loaded rows without additional DB queries
  - Scale test: Works at 10x? YES — data already in memory, no extra DB calls
  - AI-first: Depends on how filter criteria are specified
  - Transport: NO
  - Atomicity: YES
  - Pro: No extra DB queries, works with existing data loading pattern
  - Con: Derivation rules need to be specified somehow

CHOSEN: Option C because:
1. Data is ALREADY loaded into memory by the engine (committed_data rows per entity per sheet)
2. Zero additional database queries — derivation runs on in-memory rows
3. Works at scale — 188 insurance rows at 10x = 1,880 rows, trivial in-memory operation
4. The calculationIntent ALREADY specifies what metrics are needed (field names)
5. The metric field names in calculationIntent follow a naming convention that encodes
   the derivation rule: "ins_vida_qualified_referrals" = product prefix + qualifier + count type

REJECTED: Option A because per-entity DB queries during calculation violate scale principle.
REJECTED: Option B because it requires knowing what to derive at import time (chicken-and-egg).

DERIVATION RULE SOURCE: input_bindings on the rule_set (existing JSONB column).
The input_bindings will contain a metric_derivations array that specifies:
- target metric name (what the calculationIntent expects)
- source data_type pattern (which committed_data sheet to derive from)
- count_where: filter conditions as {field, operator, value} pairs
- group_by: entity identifier field

This is auditable (stored in rule_set JSONB), inspectable (visible in admin), and
domain-agnostic (works for any field names in any language — Korean Test passes).

SPECIFIC CHANGES:
1. Define derivation rule schema in input_bindings for Insurance Referral rule set
2. Extend buildMetricsForComponent to apply metric_derivations from input_bindings
3. Derivation logic: count rows matching filter conditions, per entity, from loaded data
4. Pass input_bindings through the calculation pipeline (already fetched but unused)
5. No changes to evaluators, intent executor, or existing metric resolution paths
