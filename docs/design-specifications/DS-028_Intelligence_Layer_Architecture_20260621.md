# DS-028: Intelligence Layer Architecture — Agent-Native Data Serving for Financial Analytics at Scale

**Vialuce Platform Architecture Brief**
**Date:** 2026-06-21
**Author:** Architect Channel
**Status:** DRAFT — Exploration Document for Focused Technical Discussion
**Provenance:** DIAG-075 performance profiling → spatial assessment → TMB scale analysis → agent-native architecture design
**Related:** Decision 158 (LLM recognizes / deterministic code constructs), Convergence Layer specification, Progressive Performance thesis, IAP (Inter-Agent Protocol), Three ML Flywheel model

---

## 1. DIAGNOSTIC ORIGIN — THE PERFORMANCE DEFECT THAT REVEALS AN ARCHITECTURE GAP

### 1.1 What DIAG-075 Found

The Sabor Grupo Gastronomico financial agent's route handler (`fetchRawDataServer`, route.ts:77-125) fetches every `pos_cheque` row with full JSONB `row_data` into JavaScript and aggregates in-process. At 263,250 rows this produces:

- **163.9 MB** transferred from Supabase to the route handler
- **264 sequential round-trips** (PostgREST 1000-row response cap)
- **~96.7 seconds** cold start time
- **4–35 KB** response payload (the actual data the page needs)

The data-moved-to-data-needed ratio is **20,000:1**. A SQL `COUNT(*)` of the same dataset returns in **250 ms**. The BCL tenant (0 pos_cheque rows) loads in **333 ms** — confirming the defect is 100% volume-driven.

### 1.2 Why This Matters Beyond Performance

The performance defect reveals a deeper architectural gap: **Vialuce treats data as inert storage that the application queries at render time.** Raw records sit in `committed_data`. When a user loads a page, the application fetches all of them, aggregates in JavaScript, and renders the result. This is the architecture of a prototype — correct for proving the product, unsustainable for production.

Every Business Intelligence tool ever built — Looker, Tableau, Power BI, Metabase — solves this with some variant of pre-aggregation, caching, or OLAP engines. But they all share a ceiling: **the system only knows what you ask it.** It pre-computes what the developer anticipated. It never anticipates, discovers, or tells you what you didn't think to ask.

Vialuce's agent infrastructure creates an opportunity to go beyond this ceiling.

---

## 2. CONVENTIONAL APPROACHES AND THEIR LIMITATIONS

### 2.1 Tier-by-Tier Landscape

**Tier 0: Application-level aggregation (current state)**
`SELECT * FROM committed_data` → JavaScript reduce/group/sum → response. Cost: O(n) per page load. Dies at ~2.6M rows (OOM). No caching. Every page load recomputes from scratch.

**Tier 1: SQL-level aggregation**
Push `GROUP BY` / `SUM` / `COUNT` to PostgreSQL via views or RPC. Returns 20-40 aggregated rows instead of 263K raw rows. ~100x improvement. Works to ~5-10M rows per tenant.

Limitation: still computes on every request. Field names (from the convergence mapping) must be embedded in SQL — creating a per-tenant SQL maintenance burden that conflicts with the domain-agnostic thesis.

**Tier 2: Pre-computed summary tables**
Compute daily/weekly/monthly aggregations at import time. Store in typed summary tables. Visualization reads summaries (3,600 rows max for 20 locations × 180 days). Reads become O(1) regardless of raw data volume.

Limitation: static. Summarizes what the developer designed. Cannot discover patterns or generate insights. A faster BI tool, not an intelligent system.

**Tier 3: Semantic / metrics layer**
A dedicated layer (Cube, dbt Metrics, LookML) defines metrics once and serves them at any aggregation level. Multi-tenant caching, automatic invalidation, dimension/measure API. The frontend queries with semantic concepts ("revenue by location by month") rather than SQL.

Limitation: powerful but generic. The semantic layer doesn't understand the domain. It can serve "revenue by location" but can't tell you "Cocina Dorada Cancún's leakage pattern is unusual compared to other full-service restaurants in the network."

**Tier 4: Purpose-built OLAP + streaming**
ClickHouse, Apache Druid, Apache Pinot, DuckDB — column-oriented engines handling billions of rows with sub-second aggregation. Streaming ingestion via Kafka for real-time data. The infrastructure layer for TMB scale.

Limitation: infrastructure complexity. Operationally heavy. Solves the read performance problem completely but adds significant engineering surface area.

### 2.2 The Ceiling All Conventional Approaches Share

Every tier above treats data as inert. The innovation is in how fast you can read it, not in what you do with it. The system waits for a user to ask a question, then computes the answer. It never proactively says: "Here's what you should know before you even asked."

This is the ceiling Vialuce's agent infrastructure can break through.

---

## 3. THE AGENT-NATIVE APPROACH — INTELLIGENCE LAYER

### 3.1 Core Insight

**What if the system doesn't just store data faster — what if it understands data at import time?**

The closet-in-warehouse metaphor: raw data is the warehouse (everything stored, nothing discarded, source of truth). The intelligence layer is the closet — a curated, organized, immediately accessible surface that an agent maintains. The agent decides what goes in the closet (pre-computed summaries), how it's organized (aggregation granularity), and what's hanging on the door with a note (observations, anomalies, attention signals).

The user never enters the warehouse. They open the closet. Everything they need is right there — pre-computed, pre-analyzed, pre-narrated. If they need to go deeper (drill-through to individual cheques), the agent opens a specific warehouse shelf (filtered raw data query) and hands them exactly the box they need.

### 3.2 The Four-Step Import-Time Intelligence Flow

**Step 1: Convergence (exists today)**

Raw tenant data arrives (POS cheques, sales transactions, commission data). The convergence layer maps tenant-specific fields to platform metrics. `total` → revenue, `propina` → tips, `total_alimentos` → food revenue, `mesero_id` → server attribution. Output: semantically typed data in `committed_data.row_data`.

This step already exists. It defines the data vocabulary for everything downstream.

**Step 2: Summary Artifact Computation (deterministic, import-time)**

The agent computes summary artifacts — pre-aggregated data at multiple granularity levels. This is deterministic computation (SQL GROUP BY, SUM, COUNT), not LLM inference. Per Decision 158: deterministic code constructs and guarantees.

Summary artifacts include:

- **Daily summaries per location:** revenue, check count, food/bev split, tips, leakage (discounts + comps + cancellations), guest count, avg check, avg service time, server count
- **Period rollups:** weekly and monthly aggregations
- **Cross-location benchmarks:** network averages, percentile rankings, standard deviations
- **Trend vectors:** period-over-period deltas, moving averages, velocity (rate of change of rate of change)

The convergence mapping IS the instruction set for summarization. When convergence maps `total_alimentos` → food revenue, the summary agent knows to `SUM(total_alimentos)` per location per day. No per-tenant code — the convergence mapping defines both the data vocabulary AND the aggregation schema.

**Step 3: Insight Artifact Generation (LLM-powered, import-time)**

The Financial Agent examines the freshly computed summaries and generates human-readable insights. Per Decision 158: LLM recognizes patterns, deterministic code constructs. The agent never does math — it reads pre-computed summaries and interprets them.

Insight artifacts include:

- **Anomaly observations:** "Cocina Dorada Cancún leakage jumped 340% vs prior period. 47 discount cheques concentrated on Thursday evening shifts. Server: María López."
- **Trend narratives:** "Network tip rate declining 0.3% per month across Taco Veloz locations. Bucking trend: Taco Veloz Guadalajara +1.2%."
- **Coaching triggers:** "Mar y Brasa Polanco average check dropped 12% since April. Guest count stable. Hypothesis: lower beverage attachment."
- **Comparative intelligence:** "Sabor's 2.3% leakage rate is below the 2.5% threshold. Industry benchmark for Mexican casual dining: 3.1% — Sabor is outperforming."

These observations are **stored as artifacts** — structured records with type, severity, entity references, and narrative text. They are NOT computed at render time. The page renders pre-generated text instantly.

**Step 4: Adaptive Curation (agent-learned, ongoing)**

The agent observes usage patterns — which pages users visit, which filters they apply, which drill-through paths they follow — and adjusts what's pre-computed. If the operator always filters by brand, the agent pre-computes brand-level summaries. If drill-through to server-level is the common workflow, the agent creates server-level daily summaries. If nobody uses the hourly heatmap, the agent deprioritizes hourly granularity.

This is Progressive Performance at the data architecture level. The system gets faster and smarter the more you use it — because the agent learns what to pre-compute. The recognition curve applies to data serving: same-query second encounter at near-zero cost, and the agent anticipates which queries will come next.

### 3.3 Intelligence Layer Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        IMPORT / INGESTION                              │
│   POS System → Upload/API → Convergence Layer → committed_data (JSONB) │
│                              (field mapping)     (raw, source of truth)│
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ (import-time trigger)
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     INTELLIGENCE LAYER (Agent)                         │
│                                                                        │
│  ┌─────────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │  SUMMARY ENGINE      │  │  INSIGHT ENGINE   │  │  CURATION ENGINE │  │
│  │  (Deterministic)     │  │  (LLM-powered)    │  │  (ML-learned)    │  │
│  │                      │  │                   │  │                  │  │
│  │  Daily aggregates    │  │  Anomaly detection │  │  Usage patterns  │  │
│  │  Period rollups      │  │  Trend narratives  │  │  Pre-compute     │  │
│  │  Benchmarks          │  │  Coaching triggers │  │  prioritization  │  │
│  │  Trend vectors       │  │  Attention signals │  │  Adaptive cache  │  │
│  └──────────┬───────────┘  └────────┬──────────┘  └────────┬─────────┘  │
│             │                       │                       │            │
│             ▼                       ▼                       ▼            │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                    ARTIFACT STORE                                │   │
│  │  summary_daily  │  insight_artifacts  │  curation_config         │   │
│  │  summary_period │  attention_signals  │  usage_telemetry         │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ (reads pre-computed artifacts)
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        VISUALIZATION LAYER                             │
│                                                                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                 │
│  │  /financial/* │  │  /stream     │  │  /perform    │                 │
│  │  (Financial   │  │  (Intelligence│  │  (Performance│                 │
│  │   pages)      │  │   feed)      │  │   dashboard) │                 │
│  └──────┬───────┘  └──────────────┘  └──────────────┘                 │
│         │                                                              │
│         │ (drill-through only, filtered slice)                         │
│         ▼                                                              │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  committed_data (raw) — filtered by location/date/category       │  │
│  │  Max ~500 rows per drill-through query                           │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. ALIGNMENT WITH VIALUCE'S EXISTING ARCHITECTURE

### 4.1 Decision 158 Compliance

The intelligence layer respects the LLM/deterministic boundary:

- **Summary Engine:** Entirely deterministic. SQL GROUP BY, SUM, COUNT, AVG. No LLM involvement. The output is mathematically guaranteed.
- **Insight Engine:** LLM recognizes patterns in pre-computed summaries and generates human-readable narratives. The LLM never does math — it reads numbers the Summary Engine already computed and interprets them. If the LLM says "leakage jumped 340%," the 340% was computed deterministically; the LLM chose to highlight it and frame it as an insight.
- **Curation Engine:** ML-based (not necessarily LLM). Learns usage patterns, predicts which queries will come next, adjusts pre-computation priority. Standard recommendation/prediction ML, not generative AI.

### 4.2 Convergence Layer as Summarization Schema

The convergence layer already maps tenant-specific fields to platform metrics. This mapping doubles as the summarization instruction set:

```
Convergence mapping for Sabor:
  total → revenue        →  SUM(total) per location per day
  propina → tips          →  SUM(propina) per location per day
  total_alimentos → food  →  SUM(total_alimentos) per location per day
  mesero_id → server      →  GROUP BY mesero_id for server attribution
  cancelado → cancellation → COUNT(CASE WHEN cancelado = 1) for leakage
  fecha → timestamp       →  DATE(fecha) for daily granularity
```

A new tenant's convergence mapping automatically defines what gets summarized. No per-tenant SQL functions, no per-tenant code. The Summary Engine reads the mapping and generates the aggregation.

### 4.3 Progressive Performance at the Data Layer

The Platform's billing thesis — the Verified Payout — already embodies Progressive Performance: same-fingerprint second encounter at near-zero cost. The Intelligence Layer extends this principle to data serving:

- **First import:** convergence + summarization + insight generation. Full cost.
- **Subsequent page loads:** read pre-computed artifacts. Near-zero cost.
- **Same-period re-visit:** cached summaries, cached insights. Zero computation.
- **New period import:** only the new period is summarized. Incremental cost.
- **Cross-tenant pattern recognition (Domain Flywheel):** insights generated for Tenant A inform pattern detection for Tenant B. The agent gets smarter with each tenant.

### 4.4 Two-Tier Agent System

The Intelligence Layer maps to the existing agent architecture:

- **Foundational Agent (domain-agnostic):** handles the Summary Engine — deterministic aggregation that applies to any data domain (SUM, COUNT, GROUP BY are domain-agnostic operations).
- **Domain Financial Agent:** handles the Insight Engine — understands what "leakage" means in a restaurant context, what a healthy tip rate looks like, what coaching recommendation fits a declining average check.
- **IAP (Inter-Agent Protocol):** the Summary Engine passes pre-computed summaries to the Insight Engine via IAP. The Insight Engine doesn't need raw data — it receives structured summaries.

### 4.5 Three ML Flywheel Integration

- **Tenant Flywheel:** learns this specific operator's patterns. "Sabor's operators always check leakage on Monday morning → pre-compute weekend leakage summary Sunday night."
- **Foundational Flywheel:** learns general data-serving optimization patterns. "Across all tenants, drill-through to location detail is 5x more common than drill-through to server detail → prioritize location-level pre-computation."
- **Domain Financial Flywheel:** learns Financial Agent-specific insight patterns. "Mexican casual dining operators respond to coaching triggers about beverage attachment 3x more than triggers about check count → weight beverage insights higher."

---

## 5. ARTIFACT STORE SCHEMA DESIGN (CONCEPTUAL)

### 5.1 Summary Artifacts

```
financial_summary_daily
  tenant_id          UUID
  location_id        UUID        (→ entities)
  summary_date       DATE
  -- Revenue
  gross_revenue      NUMERIC
  food_revenue       NUMERIC
  beverage_revenue   NUMERIC
  net_revenue        NUMERIC     (gross - discounts - comps)
  -- Volume
  check_count        INTEGER
  guest_count        INTEGER
  cancel_count       INTEGER
  -- Leakage
  discount_total     NUMERIC
  comp_total         NUMERIC
  cancel_total       NUMERIC
  -- Service
  tip_total          NUMERIC
  avg_check          NUMERIC
  avg_service_min    NUMERIC
  avg_guests_per_chk NUMERIC
  -- Payment
  cash_total         NUMERIC
  card_total         NUMERIC
  -- Metadata
  server_count       INTEGER     (distinct servers active that day)
  computed_at        TIMESTAMPTZ
  convergence_hash   TEXT        (fingerprint of the convergence mapping used)
  
  PRIMARY KEY (tenant_id, location_id, summary_date)
  INDEX ON (tenant_id, summary_date)
```

Period-level rollups can be materialized views over `financial_summary_daily` or separate tables populated by the Summary Engine:

```
financial_summary_period
  tenant_id, location_id, period_id,
  [same metric columns as daily],
  period_start, period_end,
  PRIMARY KEY (tenant_id, location_id, period_id)
```

Network-level (cross-location) summaries:

```
financial_summary_network
  tenant_id, summary_date,
  [aggregated metrics across all locations],
  location_count, above_avg_count, below_avg_count,
  PRIMARY KEY (tenant_id, summary_date)
```

### 5.2 Insight Artifacts

```
intelligence_artifacts
  id                 UUID
  tenant_id          UUID
  artifact_type      TEXT        ('anomaly', 'trend', 'coaching', 'benchmark', 'attention')
  severity           TEXT        ('critical', 'warning', 'info', 'positive')
  entity_id          UUID        (nullable — location, server, brand, or network-level)
  entity_type        TEXT        ('location', 'individual', 'organization', 'network')
  period_id          UUID        (nullable — which period this insight covers)
  title              TEXT        ("Leakage spike at Cocina Dorada Cancún")
  narrative          TEXT        (full insight text with data references)
  data_references    JSONB       ({metric: 'leakage_rate', value: 0.047, delta: 3.4, ...})
  recommended_action TEXT        (nullable — coaching text)
  generated_at       TIMESTAMPTZ
  generated_by       TEXT        ('financial_agent_v1', model identifier)
  expires_at         TIMESTAMPTZ (nullable — insights for past periods don't expire)
  acknowledged       BOOLEAN     (user dismissed/reviewed)
  
  INDEX ON (tenant_id, artifact_type, generated_at DESC)
  INDEX ON (tenant_id, entity_id)
```

### 5.3 Curation Configuration (future — adaptive layer)

```
curation_config
  tenant_id          UUID
  dimension          TEXT        ('location', 'server', 'brand', 'time')
  granularity        TEXT        ('hourly', 'daily', 'weekly', 'monthly')
  priority           INTEGER     (1=highest, computed from usage telemetry)
  last_access        TIMESTAMPTZ
  access_count       INTEGER
  pre_compute        BOOLEAN     (should the Summary Engine pre-compute this granularity?)
  
  PRIMARY KEY (tenant_id, dimension, granularity)
```

---

## 6. SCALE EVOLUTION PATH

### 6.1 Implementation Tiers

**Phase 1: NOW — Summary Tables in PostgreSQL (Tier 2)**
Immediate fix for the DIAG-075 performance defect. Deterministic only. No LLM involvement. No agent infrastructure changes.

Scope:
- Create `financial_summary_daily` and `financial_summary_network` tables via schema migration
- Build an import-time summary computation step (Supabase function or API endpoint)
- Refactor `fetchRawDataServer` to read from summary tables
- Drill-through unchanged (reads filtered `committed_data`)
- Expected: ~97s → <500ms for all financial pages

Scale ceiling: ~50M rows, ~100 tenants. PostgreSQL handles this with proper indexing and partitioning.

**Phase 2: 6-12 MONTHS — Insight Generation (agent-powered)**
Add the Insight Engine. The Financial Agent reads summaries post-import and generates `intelligence_artifacts`. The Intelligence page (`/stream`) and financial page OBSERVATIONS sections render pre-generated insights.

Scope:
- Create `intelligence_artifacts` table
- Financial Agent post-import hook generates insights
- `/stream` FinancialStream reads from `intelligence_artifacts`
- OBSERVATIONS sections on financial pages read pre-generated text
- LLM generates narrative; deterministic code computes the underlying numbers (Decision 158)

Scale ceiling: same as Phase 1 (database layer unchanged). The LLM cost is per-import, not per-page-load — amortized across all reads.

**Phase 3: 12-24 MONTHS — Semantic API Layer**
Abstract the summary/insight query interface into a semantic layer. The visualization requests dimensions and measures ("revenue by location by month"), the semantic layer resolves to the optimal data source (summary table, materialized view, or live query). Multi-tenant caching with automatic invalidation.

Candidates: Cube (open-source, designed for embedded analytics), custom semantic layer aligned with convergence concepts.

Scale ceiling: ~500M rows, ~500 tenants. The semantic layer handles cache management, query routing, and multi-tenant isolation.

**Phase 4: 24+ MONTHS — OLAP + Streaming (TMB Scale)**
PostgreSQL remains the OLTP / source-of-truth store. A columnar OLAP engine (ClickHouse, DuckDB-on-Parquet) serves the read path. Streaming ingestion (Kafka + Flink) for real-time POS data. Summary tables become OLAP materialized views.

Candidates:
- **ClickHouse Cloud:** managed, column-oriented, sub-second on billions of rows. Used by Uber, Cloudflare, GitLab.
- **DuckDB-on-Parquet:** in-process OLAP, reads Parquet files from S3. Zero infrastructure. Interesting for Vercel serverless — the function starts, DuckDB reads partitioned Parquet, aggregates, returns. No separate database.
- **Apache Pinot:** designed for user-facing analytics at LinkedIn scale. Handles thousands of concurrent queries.

Scale ceiling: effectively unlimited. Billions of rows, thousands of tenants, sub-second queries.

### 6.2 Architectural Compatibility Across Tiers

The key design constraint: **each tier's API contract is compatible with the next.** The route handler requests "revenue by location for period X" → receives aggregated rows. Whether those rows come from a PostgreSQL summary table (Phase 1), a Cube pre-aggregation (Phase 3), or a ClickHouse query (Phase 4) is transparent to the visualization layer.

```
Phase 1: Route Handler → PostgreSQL summary table → Response
Phase 2: Route Handler → PostgreSQL summary table + intelligence_artifacts → Response  
Phase 3: Route Handler → Semantic Layer → (summary table | materialized view | live query) → Response
Phase 4: Route Handler → Semantic Layer → (ClickHouse | Parquet | PostgreSQL) → Response
```

The visualization code never changes. The data-serving layer evolves underneath.

---

## 7. COMPETITIVE POSITIONING

### 7.1 What This Gives Vialuce That Competitors Don't Have

Traditional ICM platforms (Xactly, CaptivateIQ, Varicent, SAP Commissions) serve dashboards. They compute when you ask. They show what the developer designed. They don't learn, don't anticipate, don't tell you what you didn't think to ask.

Traditional BI tools (Looker, Tableau) add a semantic layer but remain generic — they don't understand the domain. They can chart "revenue by location" but can't say "this leakage pattern is unusual for a Mexican casual dining chain."

Vialuce's Intelligence Layer combines:
- **Domain-specific insight generation** (Financial Agent understands restaurant operations, ICM agent understands sales compensation)
- **Import-time intelligence** (observations generated before anyone asks)
- **Adaptive pre-computation** (the system learns what to pre-compute from usage)
- **Progressive Performance** (every subsequent read is faster than the first)
- **Multi-domain convergence** (the same architecture serves ICM and Financial tenants through domain-specific agents reading the same convergence mappings)

### 7.2 The "Intelligence" in Intelligence, Acceleration, Performance

The platform tagline maps directly:
- **Intelligence:** the Insight Engine generates domain-specific observations at import time
- **Acceleration:** the Summary Engine ensures sub-second visualization at any data volume
- **Performance:** the Curation Engine learns usage patterns and optimizes pre-computation, making the system faster the more it's used

---

## 8. OPEN QUESTIONS FOR DISCUSSION

### 8.1 Convergence-Driven Summarization
How tightly should the convergence mapping define the summarization schema? Options range from "the convergence mapping IS the summarization instruction set" (tightest — zero per-tenant configuration) to "the convergence mapping provides field names, a separate summary configuration defines aggregation rules" (more flexible — supports custom metrics).

### 8.2 Insight Freshness and Lifecycle
When a new period's data imports, do prior period's insights expire? Or do they persist as historical observations? Should the agent revise insights when new data arrives that changes the context? ("Last week I said leakage spiked — it turned out to be a data entry error, now corrected.")

### 8.3 Decision 158 Boundary for Insight Generation
The Insight Engine uses an LLM to generate narrative text. The LLM reads pre-computed numbers and interprets them. But the line between "interpreting" and "computing" can blur. If the LLM says "this pattern suggests seasonal variation," is that recognition (allowed) or analysis (needs deterministic backing)? Where exactly does the boundary sit for Financial Agent insights?

### 8.4 Multi-Tenant Isolation at the Summary Layer
Summary tables are multi-tenant (keyed by `tenant_id`). At TMB scale, should summaries be partitioned by tenant for isolation? PostgreSQL's native partitioning supports this. But the curation engine may need cross-tenant pattern recognition (Domain Flywheel) — how does isolation interact with cross-tenant learning?

### 8.5 Real-Time vs Batch Intelligence
Phase 1-2 use batch processing (import-time summarization). Phase 4 introduces streaming. Is there a middle path? For POS data that trickles in throughout the day, should summaries update incrementally as cheques close, or in daily batches?

### 8.6 Serverless Architecture Compatibility
Vialuce runs on Vercel (serverless). The Summary Engine runs at import time (triggered by the import pipeline). The Insight Engine runs post-summarization (could be a background job or a serverless function). How does this interact with Vercel's execution time limits? Should the Intelligence Layer run on a separate compute surface (Supabase Edge Functions, dedicated worker)?

### 8.7 DuckDB-on-Parquet for the Serverless Path
DuckDB's in-process model aligns with Vercel serverless — no separate database connection, no connection pooling issues. If summary data is stored as Parquet files in cloud storage (Supabase Storage, S3), the route handler could run DuckDB queries in-process. Is this worth prototyping as an alternative to PostgreSQL summary tables?

---

## 9. IMMEDIATE NEXT STEP — OPTIMIZATION HF SCOPE

Independent of the longer-term Intelligence Layer vision, the immediate performance defect (DIAG-075) requires a fix. The recommended Phase 1 scope:

**A: Summary table schema** — `financial_summary_daily` and `financial_summary_network`, designed per §5.1. Multi-tenant, keyed by `(tenant_id, location_id, summary_date)`. Schema migration via SQL Editor (SR-44).

**B: Import-time summary computation** — a deterministic TypeScript function that reads `committed_data` (pos_cheque) for a tenant, computes daily aggregates per location, and writes to the summary table. Called after data import completes. Idempotent (re-run replaces existing summaries for the same dates).

**C: Route handler refactor** — `fetchRawDataServer` reads from `financial_summary_daily` instead of raw `committed_data`. Each mode queries the summary with appropriate `GROUP BY` for its granularity. Returns 20-40 rows per query instead of 263K.

**D: Drill-through preserved** — `ChequeList` component and `cheques` route mode continue to query raw `committed_data`, filtered by location + date + category. This is the only path to raw data, and it's always a small filtered slice.

**E: Convergence mapping as summarization schema** — the summary computation reads the `ChequeRowData` interface (or a configuration artifact derived from the convergence mapping) to know which fields to aggregate. This is the seed of the convergence-driven summarization described in §3.2 Step 2.

Expected result: all 9 financial pages load in <500ms for any data volume that fits in PostgreSQL (~50M rows). Architecture compatible with the full Intelligence Layer evolution.

---

*DS-028, Architecture Brief. Draft for exploration.*
*vialuce.ai — Intelligence. Acceleration. Performance.*
