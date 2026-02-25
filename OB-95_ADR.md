# OB-95 ADR: Financial Agent — Domain-Agnostic via Existing Entity Model

## Problem

Build a Financial Agent (restaurant franchise performance management) that runs on the same engine as ICM, demonstrating domain-agnostic architecture. Data must be in Supabase (not localStorage). One tenant must support both modules.

## Option A: Dedicated financial_* Supabase tables

New tables: `financial_locations`, `financial_cheques`, `financial_staff`.

- Scale test: YES
- AI-first: YES
- Transport: NO HTTP bodies
- Atomicity: YES
- Problem: Creates parallel infrastructure. Violates domain-agnostic principle (Rule 8).

## Option B: Use EXISTING entity/committed_data model with domain-specific metadata

- Locations, brands, staff = entities with entity_type and metadata JSONB
- POS cheques = committed_data rows with data_type='pos_cheque'
- Performance framework = rule_set with tier_classification outcome
- Server commissions = rule_set with monetary outcome
- Scale test: YES — same tables, different data_type discriminator
- AI-first: YES — no domain-specific schema
- Transport: Same bulk import pipeline as ICM
- Atomicity: YES — same transaction boundaries
- Advantage: PROVES domain-agnostic. Same queries, same pages, same engine.

## Option C: Hybrid — entities model + dedicated cheques table

Entities for locations/staff, but cheques get their own indexed table.

- Scale test: YES
- AI-first: YES
- Transport: NO HTTP bodies
- Atomicity: YES
- Problem: 46,700 cheques in committed_data is trivial. Dedicated table is premature optimization.

## CHOSEN: Option B — Existing entity/committed_data model

This IS the domain-agnostic proof. If the Financial Agent needs separate tables, the architecture claim is false. 46K cheques in committed_data with JSONB row_data is well within PostgreSQL capabilities. Entity metadata JSONB handles brand/region/format without schema changes. The calculation engine processes rule_sets regardless of domain.

## REJECTED: Option A — Creates the parallel infrastructure it claims to not need.

## REJECTED: Option C — Premature optimization. Revisit only if scale testing shows bottleneck.
