# OB-98 Architecture Decision Record

## Problem
AI intelligence exists in the backend (anomaly detection, plan interpretation, classification signals) but is invisible to users. Need to surface actionable insights on every dashboard and provide reps with earning trajectory guidance.

## Option A: Real-time LLM calls per page load
- Every dashboard page makes an LLM call on mount
- Freshest possible insights
- Scale test: NO — 150K users x daily logins x LLM calls = cost explosion
- AI-first: YES
- **REJECTED**: Too expensive, too slow for page loads

## Option B: Pre-computed insights stored in Supabase
- After each calculation run, one LLM call generates narrative insights
- Insights stored in a new `agent_insights` table
- Dashboard surfaces read cached insights — zero LLM calls on page load
- Rep trajectory computed deterministically from component_results + rule_set tiers
- Scale test: YES
- AI-first: YES
- **REJECTED**: Requires new table and background job infrastructure

## Option C: Hybrid — Deterministic + Optional LLM Enhancement
- Compute all metrics deterministically (distribution stats, tier thresholds, comparisons)
- Store structured insight data in JSON
- UI renders insight cards from structured data
- Optional: LLM call to generate natural language summary from structured data
- If LLM unavailable, structured data still renders meaningfully
- Scale test: YES
- AI-first: YES with graceful degradation
- LLM-Primary, Deterministic Fallback, Human Authority

## CHOSEN: Option C — Hybrid with graceful degradation

**Reason:** Deterministic computation ensures insights always render (even without LLM). LLM adds natural language narrative when available. Matches the "LLM-Primary, Deterministic Fallback, Human Authority" principle. No new tables required — insights computed on-demand from existing calculation_results, component_results, and rule_set data. Rep trajectory is pure math — no LLM needed at all.
