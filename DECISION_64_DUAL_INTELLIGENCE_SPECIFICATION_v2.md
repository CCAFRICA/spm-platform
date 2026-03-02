# Decision 64: Dual Intelligence Architecture
## Independent Data Intelligence and Plan Intelligence with Convergence Matching
### Vialuce Performance Intelligence Platform
### v2 — March 1, 2026 (Updated post-OB-117)

---

## Decision Statement

Decision 64 establishes the architectural principle that Data Intelligence and Plan Intelligence are two autonomous capabilities that operate independently, produce value independently, and converge when both are present for a tenant. The platform does not require transactional data to interpret a performance model, nor does it require a performance model to understand data. The convergence layer matches what data CAN provide against what a model NEEDS, surfacing matches, gaps, and opportunities.

Semantic Binding is a function within each intelligence — not a separate layer — that elevates classification into comprehension. Signal capture operates at three levels (Classification, Comprehension, Convergence) feeding three flywheel scopes (Tenant, Foundational, Domain), creating compounding intelligence multipliers.

The architecture is domain-agnostic. ICM, Financial, and any future module are applications of the same intelligence — not separate systems.

**Status: LOCKED**

---

## The Problem

The platform successfully classifies data fields and interprets plan structures. However, four failures in Caribe (MBC) exposed an architectural gap between classification ("I know WHAT this is") and comprehension ("I understand HOW it behaves and WHY it matters"):

1. **Consumer Lending Commission** — worked only via hardcoded pattern matching (OB-116). Not scalable.
2. **Mortgage Origination Bonus** — AI interpreted tier rates (0.002–0.004) as flat payouts instead of rates × volume. **RESOLVED by OB-117:** Rate detection heuristic, $0.18 → $985,410.
3. **Insurance Referral Program** — AI produced empty tier configs. calculationIntent fallback infrastructure added (OB-117) but metric derivation gap remains: engine cannot count/filter/group string-valued rows.
4. **Deposit Growth Incentive** — Plan requires attainment (delta / goal). Data has balance snapshots but no goal values. Legitimate gap to surface, not silently produce $0.

---

## Core Architecture

### The Dual Intelligence Principle

**Data Intelligence and Plan Intelligence are autonomous capabilities.** Each produces value independently. Neither depends on the other to function. When both exist, Convergence produces match intelligence.

This applies identically across all domains. A "plan" in ICM is a compensation plan. In Financial, it's an operational target framework. In any future module, it's whatever document defines how performance is measured. The intelligence architecture doesn't change — only the domain vocabulary does.

### Semantic Binding (Function, Not Layer)

Semantic Binding is the function within each intelligence that transforms classification into comprehension:

**Within Data Intelligence:**
```
Classification:  "LoanAmount" → currency
Semantic Binding: "LoanAmount" → per-transaction disbursement amount, aggregatable 
                  as sum/count/average per entity per period
                  Behavioral class: event (not snapshot)
```

**Within Plan Intelligence:**
```
Classification:  3 tiers with boundaries and values
Semantic Binding: tier values 0.002/0.003/0.004 are rates to multiply against 
                  volume (not flat payouts)
                  Behavioral class: rate × base (not lookup → return)
```

The depth of semantic binding determines the quality of each intelligence's output and therefore the accuracy of convergence matching. Classification alone produces crude type-matching. Comprehension produces intelligent matching.

### Three-Level Signal Capture

Signals capture what the AI predicted and what the user decided. They operate at three levels, each feeding back into its respective function:

**Level 1 — Classification Signal (exists today):**
AI says "LoanAmount is currency." User confirms or overrides.
Measures: Can the AI identify what things are?
Feeds: Future classification accuracy.

**Level 2 — Comprehension Signal (new):**
AI says "LoanAmount is a per-transaction disbursement, aggregatable as sum." User confirms or overrides: "Actually this is a credit limit — you can't sum these meaningfully."
Measures: Can the AI understand how things behave?
Feeds: Future semantic binding quality.

For Plan Intelligence: AI says "tier values 0.002–0.004 are rates to multiply against volume." User confirms or overrides: "These are basis points, multiply by 10,000 first."
Measures: Can the AI interpret what values mean?
Feeds: Future plan interpretation quality.

**Level 3 — Convergence Signal (future):**
Platform matches "per-transaction disbursement (sum)" to "needs quarterly origination volume (currency sum)." User confirms or overrides: "Wrong — that field is consumer lending, not mortgage origination."
Measures: Can the AI connect the right data to the right requirement?
Feeds: Future convergence matching accuracy.

### Signal Capture Infrastructure — Wire Now, Measure Always

Signal capture at all three levels must be wired from alpha. Waiting until Stage 2 to capture Level 2 signals means arriving at Stage 2 with zero comprehension signal history. The volume will be low initially — that's fine. The infrastructure must exist before the measurement matters. This follows "Carry Everything, Express Contextually."

### Three-Scope Flywheel Integration

Each signal level feeds all three flywheel scopes:

| Signal Level | Tenant Scope | Foundational Scope | Domain Scope |
|-------------|-------------|-------------------|-------------|
| Classification | "This customer's LoanAmount = currency" | "Fields named *Amount* are currency 97% of the time" | "In banking, LoanAmount is always currency" |
| Comprehension | "This customer's LoanAmount = disbursement event, sum" | "Amount fields in transactional files are events 89% of the time" | "In banking, loan amounts are per-transaction events" |
| Convergence | "This customer's LoanAmount maps to origination volume" | "Currency event fields match volume requirements at 0.91 confidence" | "In banking, loan amounts typically satisfy origination volume requirements" |

**The multiplier principle:** One user correction at Level 2 improves Data Intelligence for that tenant (Tenant scope), gets anonymized into structural patterns (Foundational scope), feeds vertical expertise (Domain scope), AND makes future Convergence matches more accurate. One correction, four improvements.

---

## Data Intelligence (Standalone, Domain-Agnostic)

### What It Does

When a tenant imports a data file, the platform independently produces a complete intelligence profile — without any performance model context. This is valuable on its own.

### Intelligence Output: Data Profile

The Data Profile contains:

**Field Inventory** — every field with its classification AND semantic binding:
- Field name, classified type, semantic meaning (behavioral description)
- Behavioral class: event (individual occurrences), snapshot (point-in-time state), dimension (categorical/structural), identifier (entity/period key)
- Sample values for disambiguation

**Measurable Dimensions** — what can be computed from this data:
- Raw: direct aggregation of numeric fields (sum, count, average)
- Computed: derived metrics (growth via delta between snapshots, ratios, conversion rates, counts filtered by criteria)
- The distinction matters: computed dimensions require the Semantic Binding function to recognize that "balance snapshots" enable "growth calculation" even though no growth field exists

**Entity Structure** — who or what the data is about, hierarchical relationships

**Temporal Structure** — period coverage, granularity, event-based vs. periodic

**Performance Structure Potential** — what performance measurement models this data could support (Use Case 1). Framed in domain-agnostic terms: "volume-based measurement," "threshold-based tiering," "growth tracking," "conversion measurement" — not "compensation plans" or "operational metrics"

### Key Design Points

1. **No performance model knowledge required.** The profile is produced entirely from the data.
2. **Semantic meaning, not just type.** The Semantic Binding function elevates "currency" to "per-transaction disbursement amount for individual events, aggregatable as sum/count/average per entity per period."
3. **Computed dimensions are first-class.** Growth rates, conversion ratios, delta calculations — the platform identifies what CAN be derived, not just what exists raw.
4. **Domain-agnostic language.** The profile says "supports volume-based measurement with threshold tiers" not "supports commission plans." The domain module translates to domain vocabulary at the presentation layer.

### Signal Capture Points

| Decision | Signal Level | Example |
|----------|-------------|---------|
| Field type assignment | Level 1 (Classification) | LoanAmount → currency (confidence: 0.95) |
| Behavioral meaning | Level 2 (Comprehension) | LoanAmount = "per-transaction disbursement event" (confidence: 0.88) |
| Computed dimension | Level 2 (Comprehension) | "deposit growth computable from balance snapshot deltas" |
| Performance potential | Level 2 (Comprehension) | "supports volume-based tiered measurement" (confidence: 0.82) |

---

## Plan Intelligence (Standalone, Domain-Agnostic)

### What It Does

When a tenant provides a performance model document — compensation plan, operational target framework, SLA structure, franchise agreement, or any document defining how performance is measured — the platform independently produces a complete intelligence profile without any data context.

### Intelligence Output: Plan Profile (Domain-Agnostic)

**Component Structure** — what distinct measurement/reward units exist, their calculation logic

**Requirements Manifest** — what data characteristics each component needs, described behaviorally:
- Not field names ("needs LoanAmount") but semantic requirements ("needs currency amount representing individual transaction events, aggregated as sum per entity per period")
- Includes the behavioral class needed: event data vs. snapshot data vs. dimensional data

**Interpretation Quality** — self-assessment of extraction confidence, flagging ambiguities:
- Rate vs. amount disambiguation (the OB-117 fix: values < 1.0 are rates)
- Complete vs. partial extraction (Insurance Referral: "5 components extracted but tier configurations incomplete")
- External dependencies ("requires goal/target values not typically in transactional data")

**Calculation Intent Mapping** — components mapped to structural primitives per the Calculation Intent Specification (bounded_lookup_1d, scalar_multiply, etc.)

### Key Design Points

1. **No data knowledge required.** The profile comes entirely from the performance model document.
2. **Requirements are behavioral, not nominal.** "Needs currency events aggregated as sum" — not "needs LoanAmount field."
3. **Rate vs. amount disambiguation is a Semantic Binding function.** OB-117 proved this: tier values 0.002/0.003/0.004 must be bound to their behavioral meaning (rates) not just their structural role (tier output values). The rate detection heuristic (all non-zero values < 1.0 = rates) is the first implementation of Semantic Binding in Plan Intelligence.
4. **Domain-agnostic framing.** A "compensation plan" and an "operational performance framework" both decompose into components with calculation logic and input requirements. The intelligence is identical.

### Signal Capture Points

| Decision | Signal Level | Example |
|----------|-------------|---------|
| Component identification | Level 1 (Classification) | "Component: Mortgage Origination — tiered structure" |
| Rate vs. amount | Level 2 (Comprehension) | "0.003 = rate, not flat amount" (confidence: 0.87) |
| Calculation type mapping | Level 2 (Comprehension) | "bounded_lookup_1d → scalar_multiply (rate × volume)" |
| External dependency | Level 2 (Comprehension) | "requires goal value not in standard transactional data" |

---

## Convergence Layer (Domain-Agnostic)

### What It Does

When both a Data Profile and a Plan Profile exist for a tenant, the Convergence Layer performs intelligent matching using the semantically-bound outputs from both intelligences.

### Convergence Principles

1. **Matching is comprehension-to-comprehension.** Not "currency matches currency" (classification-level) but "per-transaction disbursement event (sum per entity per period) satisfies quarterly origination volume requirement (currency sum per entity per period)" (comprehension-level). The richer the semantic binding on each side, the more accurate the match.

2. **Gaps are actionable.** Every gap includes recommended action in domain-appropriate language.

3. **Unmatched data is opportunity.** Data dimensions no model references are surfaced as intelligence — potential new components, risk signals, efficiency indicators.

4. **Confidence drives workflow.** High-confidence matches auto-resolve. Medium surface for review. Low flag for manual mapping. Alpha: all human review.

5. **Convergence output IS the input_bindings source.** Confirmed matches write input_bindings on the rule set. Engine consumes deterministically.

### Confidence Thresholds

| Level | Confidence | Workflow |
|-------|-----------|----------|
| HIGH | ≥ 0.85 | Auto-confirm (future). Alpha: human review. |
| MEDIUM | 0.50 – 0.84 | Surface for human review. |
| LOW | < 0.50 | Flag as manual mapping required. |

### Signal Capture at Convergence

| Decision | Signal Level | Example |
|----------|-------------|---------|
| Match proposed | Level 3 (Convergence) | "LoanAmount → origination volume requirement" (confidence: 0.94) |
| Match confirmed/rejected | Level 3 (Convergence) | User confirms or overrides match |
| Gap surfaced | Level 3 (Convergence) | "Goal values required, not present" |
| Opportunity identified | Level 3 (Convergence) | "Default data unused — consider risk component" |

**Backward trace on correction:** When a Level 3 signal corrects a match, the platform traces: was the Data Intelligence comprehension wrong (Level 2)? Was the Plan Intelligence comprehension wrong (Level 2)? Or was the matching logic wrong (Level 3 only)? This trace produces targeted improvement at the specific function that failed.

---

## Use Cases (Domain-Agnostic)

### Use Case 1: "What performance models can we support with this data?"

**Trigger:** Tenant imports data, no performance model exists.
**Domain-agnostic:** Data Intelligence produces measurable dimensions and performance structure potential.
**ICM example:** "Your data supports volume-based commission, tiered bonuses, growth incentives, referral bonuses, and clawback provisions."
**Financial example:** "Your data supports revenue tracking by location, labor cost ratios, ticket average trending, and peak/off-peak staffing analysis."
**Any domain:** Same intelligence, different vocabulary at presentation layer.

### Use Case 2: "Recommend adjustments to improve outcomes" (Future — Alpha 8+)

**Trigger:** Tenant has months of results.
**Domain-agnostic:** Analyze result distributions, identify clustering at thresholds, recommend model adjustments.
**ICM example:** "Lowering Tier 2 threshold moves 12% of reps into active pursuit range."
**Financial example:** "Adjusting staffing target from 8 to 7 during Tuesday lunch reduces labor cost ratio by 3.2% with no service impact."
**Architectural accommodation:** Data Profile captures measurable dimensions. Historical result analysis is extension, not redesign.

### Use Case 3: "My model requires X but my data doesn't have it"

**Trigger:** Both model and data exist. Convergence finds gap.
**Domain-agnostic:** Requirements manifest compared to data profile, gaps surfaced with action.
**ICM example:** "Plan requires product quantity. Data contains only revenue totals. Provide transaction-level data or adjust plan."
**Financial example:** "Target framework requires customer satisfaction scores. Data contains only transaction volumes. Integrate survey data or use proxy metric."

---

## OB-117 Results and Updated Sequence

### What OB-117 Delivered

| Change | Result |
|--------|--------|
| Rate detection heuristic in evaluateTierLookup | Mortgage: $0.18 → $985,410. General heuristic: all non-zero tier values < 1.0 = rates. |
| calculationIntent fallback in evaluateComponent | Infrastructure for intent-based evaluation when legacy path fails. Insurance Referral: still $0 (metric derivation gap, not evaluator gap). |
| Consumer Lending regression check | PASSED. $6,319,876 unchanged. |

### Current MBC State (Post OB-117)

| Plan | Payout | Status | Remaining Issue |
|------|--------|--------|----------------|
| Consumer Lending Commission | $6,319,876 | ✅ Working | Pattern-matched (tactical, replace with convergence) |
| Mortgage Origination Bonus | $985,410 | ✅ Fixed (OB-117) | Rate detection heuristic working |
| Deposit Growth Incentive | $0 | ⚠️ Data gap | No goal values. Convergence should surface this. |
| Insurance Referral Program | $0 | ❌ Metric derivation gap | Engine can't count/filter/group string rows. Needs metric derivation. |

### Updated Implementation Sequence

| OB | Focus | What It Delivers | Status |
|----|-------|-------------------|--------|
| OB-117 | Plan Intelligence quality — evaluator fixes | Rate detection, calculationIntent fallback | ✅ DONE (PR #128) |
| **OB-118** | **Metric derivation engine** | **Count/filter/group operations on raw data. Insurance Referral unblocked.** | **NEXT** |
| OB-119 | Data Intelligence Profile | Semantic field inventory, measurable dimensions, performance structure potential | TODO |
| OB-120 | Plan Requirements Manifest | Explicit behavioral input requirements per component | TODO |
| OB-121 | Convergence Layer | Match/gap/opportunity report, input_bindings generation | TODO |
| OB-122 | Engine input_bindings as primary path | Replace SHEET_COMPONENT_PATTERNS as primary resolution | TODO |

**Note:** OB-118 was re-scoped. Originally "input_bindings consumption for Deposit Growth." Deposit Growth is a legitimate data gap (no goals) — no code fix possible. Insurance Referral has a solvable metric derivation gap that unblocks real calculation results.

---

## Architecture Integration

### Relationship to Existing Components

```
DATA INTELLIGENCE (domain-agnostic)
  └── Field Classification (existing, working)
  └── Semantic Binding Function (NEW)
       └── Behavioral class assignment (event/snapshot/dimension/identifier)
       └── Computed dimension identification
  └── Data Profile output (NEW)
       └── Field inventory with comprehension
       └── Measurable dimensions (raw + computed)
       └── Performance structure potential
  └── Signal Capture: Level 1 (classification) + Level 2 (comprehension)

PLAN INTELLIGENCE (domain-agnostic)
  └── Plan Structure Extraction (existing)
  └── Semantic Binding Function (NEW)
       └── Rate vs. amount disambiguation (OB-117: first implementation)
       └── Calculation type mapping to structural primitives
  └── Plan Profile output (NEW)
       └── Component requirements manifest (behavioral)
       └── Interpretation quality self-assessment
  └── Signal Capture: Level 1 (classification) + Level 2 (comprehension)

CONVERGENCE (domain-agnostic)
  └── Semantic matching (comprehension-to-comprehension)
  └── Gap detection + actionable guidance
  └── Opportunity surfacing
  └── input_bindings generation
  └── Signal Capture: Level 3 (convergence)

CALCULATION ENGINE (existing, domain-agnostic)
  └── Reads input_bindings (existing)
  └── Executes Calculation Intent (existing)
  └── Rate detection heuristic (OB-117)
  └── calculationIntent fallback (OB-117)

THREE-SCOPE FLYWHEELS (existing infrastructure)
  └── Tenant: private per-customer learning
  └── Foundational: anonymized structural patterns
  └── Domain: anonymized vertical expertise
  └── Fed by: all three signal levels
```

### The Multiplier Architecture

Every interaction produces compounding value:

**One data import** produces: field inventory (convergence input) + measurable dimensions (Use Case 1) + behavioral comprehension (matching quality) + structural observations (anomaly detection) + performance potential (plan design intelligence). One import, five value outputs.

**One user correction** improves: that tenant's future accuracy (Tenant flywheel) + anonymized structural patterns (Foundational flywheel) + vertical expertise (Domain flywheel) + convergence matching quality (cross-function improvement). One correction, four improvements.

**One convergence match** teaches: what data characteristics satisfy what plan requirements (Level 3 signal) + confirms or corrects the Data Intelligence comprehension (Level 2 feedback) + confirms or corrects the Plan Intelligence comprehension (Level 2 feedback). One match, three signal captures.

This is the compounding thesis. The platform doesn't just process data — it gets smarter with every interaction, and the intelligence compounds across tenants, across domains, and across functions.

---

## Concepts Introduced / Updated

| # | Concept | Definition |
|---|---------|-----------|
| C-41 | Data Intelligence Profile | Autonomous intelligence output from data import: semantic field inventory, measurable dimensions, performance structure potential. Domain-agnostic. |
| C-42 | Plan Intelligence Profile | Autonomous intelligence output from performance model import: behavioral requirements manifest, calculation type mapping, interpretation quality. Domain-agnostic. |
| C-43 | Convergence Layer | Semantic matching of plan requirements to data dimensions at comprehension level, producing match/gap/opportunity reports |
| C-44 | Requirements Manifest | Explicit behavioral statement of what data characteristics each component needs — not field names but semantic requirements |
| C-45 | Measurable Dimension | A quantity derivable from data — raw fields plus computed metrics (growth, ratios, conversions, filtered counts) |
| C-46 | Convergence Report | Match/gap/opportunity output with confidence scores and actionable guidance |
| C-47 | Semantic Binding Function | The capability within each intelligence that elevates classification into comprehension — understanding behavior, not just type |
| C-48 | Three-Level Signal Capture | Classification (Level 1), Comprehension (Level 2), Convergence (Level 3) — each feeding back into its respective function |
| C-49 | Intelligence Multiplier | The compounding effect: one interaction produces multiple value outputs across multiple scopes and functions |
| C-50 | Behavioral Class | The operational characterization of a data field: event, snapshot, dimension, or identifier — determines valid aggregation operations |

---

## Relationship to Standing Principles

| Principle | How Decision 64 Honors It |
|-----------|--------------------------|
| Domain-agnostic | All intelligence operates on semantic meaning. Domain vocabulary applied only at presentation layer. |
| Korean Test | AI comprehends meaning regardless of language. No string matching, no patterns. |
| Three-Tier Resolution | AI proposes (all levels) → deterministic validation → human confirms |
| Carry Everything | All data characteristics preserved. All signal levels captured from alpha. Express when volume justifies. |
| Thermostat Principle | Platform acts: surfaces gaps, recommends models, identifies opportunities |
| Bloodwork Principle | Comprehension quality visible at summary level, detail on demand |
| Fix Logic Not Data | Intelligence fixes reasoning. Semantic Binding fixes comprehension. |
| Classification Signal | Extended to three levels: Classification, Comprehension, Convergence |
| Multiplier Principle (NEW) | Every interaction compounds across scopes and functions |

---

## Relationship to Intelligence Maturity Roadmap (Decision 32)

| Stage | Classification (L1) | Comprehension (L2) | Convergence (L3) | Flywheel Activity |
|-------|--------------------|--------------------|-------------------|-------------------|
| Stage 1 (current) | Active, signals captured | Emerging — OB-117 rate detection is first implementation | Not yet built | Tenant-level prompt enrichment |
| Stage 2 (10+ tenants) | Reliable | Active, signals captured | Emerging | Foundational patterns forming |
| Stage 3 (50+ tenants) | High accuracy | Reliable | Active, signals captured | Domain patterns reliable |
| Stage 4 (100+ tenants) | Near-autonomous | High accuracy | Reliable | All levels, all scopes. Fine-tuning consideration. |

---

*Decision 64 v2 — Locked. March 1, 2026.*
*Updated with: OB-117 results, Semantic Binding as function, three-level signal capture, domain-agnostic reframing, multiplier architecture.*

*"The data tells you what it can do. The model tells you what it needs. Intelligence is knowing what happens when they meet."*
*"Classification tells you WHAT. Comprehension tells you HOW and WHY. That's the difference between a lookup and intelligence."*
