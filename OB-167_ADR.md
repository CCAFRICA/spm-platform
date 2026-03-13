# OB-167 Architecture Decision Record

## Problem
Metric values stored as decimals (0-1) are compared against component bands expecting percentage scale (0-100+). The current normalization uses `inferSemanticType` (name-pattern matching) which misclassifies 2 of 5 metrics, causing $13,250 underpayment across 85 entities.

## Option A: Add patterns to inferSemanticType
Add `/pct/i` and `/indice/i` to ATTAINMENT_PATTERNS in metric-resolver.ts.
- Scale test: Works at 10x? Yes
- AI-first: Any hardcoding? **YES — adding language-specific patterns violates Korean Test**
- Transport: Data through HTTP bodies? N/A
- Atomicity: Clean state on failure? Yes

## Option B: Band-aware normalization (structural)
After metrics resolve, compare each metric value against the component's band ranges. If value is in decimal range (0-2) but band max > 10, normalize ×100.
- Scale test: Works at 10x? Yes — O(n) per component, no extra queries
- AI-first: Any hardcoding? **No — uses plan's own band structure, language-agnostic**
- Transport: Data through HTTP bodies? N/A
- Atomicity: Clean state on failure? Yes — normalization is in-memory, no DB writes

## Option C: Fix convergence bindings with scale_factor
Add `scale_factor: 100` to convergence bindings for percentage metrics. Fix resolver to handle `source: "committed_data"` without `source_batch_id`.
- Scale test: Works at 10x? Yes
- AI-first: Any hardcoding? Partially — requires import pipeline to set scale_factor correctly
- Transport: Data through HTTP bodies? N/A
- Atomicity: Clean state on failure? Yes

## CHOSEN: Option B because it uses the plan's own structural specification (band ranges) to determine scaling, making it fully language-agnostic and Korean Test compliant. No pattern additions needed. No import pipeline changes needed. Works immediately for all existing data.

## REJECTED: Option A because adding patterns is language-specific (violates Korean Test / AP-6). Option C because it requires import pipeline changes and re-import of data.

## Governing Principles Evaluation
- G1: IEEE 754/GAAP — Band-aware normalization preserves decimal precision; scaling happens before evaluation, not during.
- G2: Architecture structurally guarantees correct scaling by deriving it from the plan specification itself.
- G3: An auditor can verify: "metric value < 10, band max > 10, therefore ×100 was applied."
- G4: Numerical analysis — scale detection from structural specification, not naming convention.
- G5: Band-aware scaling applies to ANY measurement system that uses ranges. Domain-agnostic.
