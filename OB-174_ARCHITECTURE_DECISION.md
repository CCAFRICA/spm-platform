# ARCHITECTURE DECISION RECORD — OB-174

## Problem
Synchronous import pipeline fails at N>4 files. Cannot scale to production workloads (52 weekly files, 250K rows, millions of records). Current: N files x 12s LLM call = linear timeout.

## Approach
DS-016 async architecture + DS-017 structural fingerprinting. 6-phase implementation.

## Worker Trigger Decision

### Option A: Database trigger + Supabase Edge Function
- Scale test: Works at 10x — triggers fire per-insert, Edge Functions scale independently
- Complexity: HIGH — Deno runtime (not Node.js), separate deployment pipeline, different auth model, new infrastructure dependency
- Latency: ~1-2s (trigger delay + function cold start)

### Option B: Vercel Cron polling (5-10s interval)
- Scale test: LIMITED — single cron invocation processes all pending jobs sequentially. At 52 files, one cron cycle cannot process all.
- Complexity: Low — standard Vercel feature, cron.json config
- Latency: 5-10s average (polling interval), unacceptable for UX

### Option C: Client-initiated parallel processing calls
- Scale test: Works at 10x — each file = independent Vercel serverless invocation, native horizontal scaling (Vercel handles concurrent Lambdas)
- Complexity: LOW — uses existing Next.js API routes, existing auth, existing Supabase service role client
- Latency: ~100ms — client fires request immediately after job record creation

### CHOSEN: Option C
**Because:**
1. Uses existing infrastructure (Vercel serverless, Next.js API routes) — zero new deployment targets
2. Immediate processing — no polling delay, no trigger propagation latency
3. Natural parallelism — each file = separate HTTP request = separate Lambda invocation
4. Consistent with existing pipeline architecture (current SCI uses HTTP API calls)
5. Client maintains progress tracking naturally (polls processing_jobs table)
6. 52-file scenario: 52 parallel Lambdas, each processing independently. Tier 1 files complete in <1s, Tier 3 in ~12s. Total wall-clock ~12s for all 52.

### REJECTED: Options A and B
- A rejected: Edge Functions introduce a new runtime (Deno), deployment pipeline, and infrastructure dependency for marginal latency benefit over Option C
- B rejected: 5-10s polling delay degrades UX. Sequential processing within single cron cannot parallelize N files.

## Governing Principles Evaluation

### G1 (Standards)
- SOC2: Tenant isolation via RLS on processing_jobs (same pattern as committed_data)
- GAAP: Immutable job records — status transitions are append-only in semantic intent
- IEEE 754: Fingerprint hashing uses deterministic SHA-256 (reproducible across runtimes)

### G2 (Embodiment)
- RLS on processing_jobs IS the tenant isolation (not application-level tenant_id checks)
- Structural fingerprint IS the file recognition (not LLM re-classification)
- Nanobatch chunk_progress IS the resumability proof (not "we retry from the beginning")

### G3 (Traceability)
- DS-016 §3.1 (Upload Layer) → Phase 4 (async upload)
- DS-016 §3.4 (Commitment Layer) → Phase 5 (nanobatch)
- DS-016 §4 (processing_jobs schema) → Phase 1
- DS-017 §2 (Fingerprint algorithm) → Phase 2
- DS-017 §3 (Three Tiers) → Phase 3
- DS-017 §4.2 (Read Path) → Phase 3

### G4 (Discipline)
- Distributed systems: Producer-consumer pattern (upload produces jobs, workers consume)
- Immunology: Affinity maturation (structural fingerprints gain confidence with each successful match)
- Stream processing: Nanobatching (large files committed in resumable chunks)

### G5 (Abstraction)
- All patterns domain-agnostic. Fingerprints are structural (column count, types, ratios) not semantic (field names)
- Korean Test: A Korean company's data with Hangul columns produces a different fingerprint than English columns, but the SAME Korean company's second monthly file matches the first
- Works for any data, any domain, any language

### G6 (Evidence)
- Fingerprint-based classification: Content-based addressing (Merkle, 1979)
- Bayesian confidence update: Sequential Bayesian inference (Bernardo & Smith, 2000)
- Nanobatch processing: Stream processing research (Zaharia et al., 2013 — Spark Streaming micro-batch)

## CONSTRAINTS
- DO NOT modify calculation engine, convergence bindings, or any API that produces correct results
- Korean Test: all new tables, columns, and identifiers are domain-agnostic
- Supabase .in() ≤ 200 items
- Git from repo root (spm-platform), NOT web/
- VL Admin (platform@vialuce.com, tenant_id IS NULL) must survive ALL operations
