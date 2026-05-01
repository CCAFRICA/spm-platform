# Phase 4 Audit — Cluster D (Schema Architectural Constraints) Evidence

**Audit:** DS-021 v1.0 / DIAG-DS021-Phase4 / Plan v1.1
**Branch:** `ds021-substrate-audit`
**Scope:** Code-and-Schema. Runtime probe deferred per environment scope.
**Date:** 2026-04-30

---

## 8.D — PF-06 Probes (G10 DELETE-before-INSERT + UNIQUE Coverage)

### Probe ID: S-CODE-G10-01 (DELETE-before-INSERT pattern)

**Subject:** Inspect persistent expression surfaces for DELETE-before-INSERT pattern.

**Execution:**
```bash
grep -rnE "\\.delete\\(\\)" web/src/lib/calculation/ web/src/app/api/calculation/ web/src/lib/intelligence/
grep -rnE "\\.upsert\\(" web/src/lib/calculation/ web/src/app/api/calculation/ web/src/lib/supabase/calculation-service.ts
grep -rn "calculation_traces\\|calculation_batches" web/src/lib/calculation/ web/src/app/api/calculation/ web/src/lib/supabase/calculation-service.ts | grep -E "\\.delete\\(|\\.insert\\(|\\.upsert\\(|\\.update\\("
```

**Output — DELETE-before-INSERT call sites (calculation flow):**

1. **`web/src/app/api/calculation/run/route.ts:1268`** — `period_entity_state` (materialization audit trail):
   ```typescript
   if (materializedState.size > 0) {
     await supabase.from('period_entity_state').delete().eq('tenant_id', tenantId).eq('period_id', periodId);
     // ... build pesRows ...
     for (let i = 0; i < pesRows.length; i += PES_BATCH) {
       await supabase.from('period_entity_state').insert(pesRows.slice(i, i + PES_BATCH));
     }
   }
   ```
   DELETE scope: `(tenant_id, period_id)`. INSERT scope: per-entity rows.

2. **`web/src/app/api/calculation/run/route.ts:1891`** — `calculation_results` (OB-121 marker):
   ```typescript
   // ── 7. Write calculation_results (OB-121: DELETE before INSERT to prevent stale accumulation) ──
   const { error: cleanupErr } = await supabase
     .from('calculation_results')
     .delete()
     .eq('tenant_id', tenantId)
     .eq('rule_set_id', ruleSetId)
     .eq('period_id', periodId);
   // ... insertRows ... insert
   ```
   DELETE scope: `(tenant_id, rule_set_id, period_id)`. INSERT scope: per-entity rows for that plan/period. Comment cites OB-121.

3. **`web/src/app/api/calculation/run/route.ts:2045`** — `entity_period_outcomes` (materialized outcomes):
   ```typescript
   // Delete existing outcomes for this tenant+period first
   await supabase
     .from('entity_period_outcomes')
     .delete()
     .eq('tenant_id', tenantId)
     .eq('period_id', periodId);
   // ... batched insert
   ```
   DELETE scope: `(tenant_id, period_id)` — note: does NOT scope to rule_set_id, so multiple rule_sets writing outcomes for the same period would clear each other.

4. **`web/src/lib/calculation/run-calculation.ts:1392`** — `calculation_results` (HF-078 marker, legacy `runCalculation` path):
   ```typescript
   // ── 7. Write results (HF-078: DELETE before INSERT to prevent UNIQUE constraint violations) ──
   const { error: cleanupErr } = await supabase
     .from('calculation_results')
     .delete()
     .eq('tenant_id', tenantId)
     .eq('rule_set_id', ruleSetId)
     .eq('period_id', periodId);
   ```
   DELETE scope: same as the API route's calculation_results DELETE. Comment cites HF-078.

**Output — UPSERT call sites (calculation flow):**
- `web/src/lib/calculation/synaptic-density.ts:131`:
  ```typescript
  await supabase.from('synaptic_density').upsert(chunk, { onConflict: 'tenant_id,signature' });
  ```
  Direct UPSERT against synaptic_density. UNIQUE constraint exists on `(tenant_id, signature)`.

**Output — append-only surfaces (no DELETE):**
- `web/src/lib/supabase/calculation-service.ts:450` — `calculation_traces.insert(chunk)`. No DELETE site found for `calculation_traces`. Trace rows accumulate per result; cleared only via cascading delete from `calculation_results.id` (FK with `ON DELETE CASCADE`).
- `calculation_batches`: insert-only at run-start; lifecycle managed via UPDATE on lifecycle_state column. Each calculation run produces a new batch row (immutable financial-assertion design per Rule 30 cited in 003 migration line 87).
- `classification_signals`: append-only writes per Cluster A evidence.

**CC observation:** Three persistent expression surfaces in the active calculation flow follow the DELETE-before-INSERT pattern:
- `period_entity_state` — DELETE scope `(tenant_id, period_id)`
- `calculation_results` — DELETE scope `(tenant_id, rule_set_id, period_id)`
- `entity_period_outcomes` — DELETE scope `(tenant_id, period_id)` (broader than UNIQUE constraint scope)

The pattern is intentional and historically grounded — comment markers cite OB-121 (calculation_results inflation incident) and HF-078 (UNIQUE constraint pre-cleanup). One UPSERT call site exists (`synaptic_density`) using `onConflict` against the `(tenant_id, signature)` UNIQUE.

The `entity_period_outcomes` DELETE scope `(tenant_id, period_id)` does not include `rule_set_id`, while the UNIQUE constraint on entity_period_outcomes is `(tenant_id, entity_id, period_id)` — also scope-without-rule_set. This is consistent (DELETE matches UNIQUE granularity) but does mean a second calculation run for a different rule_set on the same period would wipe the first run's outcome rows.

---

### Probe ID: S-SCHEMA-G10-01 (UNIQUE constraint coverage)

**Subject:** Verify UNIQUE constraint coverage on persistent expression surfaces. Source: migration files.

**Execution:**
```bash
grep -rnE "UNIQUE|unique constraint|UNIQUE INDEX|create unique index" web/supabase/migrations/*.sql | grep -v "^[^:]*:--"
```

**Output — UNIQUE constraint inventory by table:**

| Table | UNIQUE constraint | Migration | Notes |
|---|---|---|---|
| tenants | `slug TEXT UNIQUE` | 001:25 | Tenant slug |
| profiles | `(tenant_id, auth_user_id)` | 001:51 | One profile per (tenant, user) |
| entities | `(tenant_id, external_id)` | 001:71 | Tenant-scoped external IDs |
| rule_set_assignments | `(tenant_id, rule_set_id, entity_id, effective_from)` | 002:90 | Time-versioned assignments |
| 002 unnamed table at line 150 | `(tenant_id, canonical_key)` | 002:150 | (likely periods or labels) |
| platform_settings | `key TEXT UNIQUE` | 012:5 | Singleton settings keys |
| **period_entity_state** | **`(tenant_id, entity_id, period_id)`** | 004:21 | Persistent expression surface |
| profile_scope | `(tenant_id, profile_id)` | 004:80 | One scope per profile |
| **entity_period_outcomes** | **`(tenant_id, entity_id, period_id)`** | 004:148 | Persistent expression surface |
| **calculation_results** | **`(tenant_id, entity_id, period_id, rule_set_id)`** | **017:22** | Added post-OB-121; original 003 had no UNIQUE |
| synaptic_density | `(tenant_id, signature)` | 015:23 | Run-to-run learning store |
| foundational_patterns | `pattern_signature TEXT UNIQUE` | 016:10 | Cross-tenant flywheel |
| domain_patterns | `(pattern_signature, domain_id, vertical_hint)` | 016:33 | Domain flywheel |
| reference_data | `(tenant_id, name, version)` | 018:39 | Reference data versions |
| reference_items | `(reference_data_id, external_key)` | 018:57 | Reference items |
| alias_registry | `(tenant_id, reference_item_id, alias_normalized)` | 018:77 | Alias mapping |
| structural_fingerprints | `(tenant_id, fingerprint_hash)` | 023:101 | Fingerprint flywheel |

**Output — persistent expression surfaces WITHOUT UNIQUE constraint:**
- `calculation_batches` (003:90): No UNIQUE. Each batch is a UUID-PK row representing a single calculation run. Lifecycle/supersession links via `superseded_by`/`supersedes` foreign keys. Comment line 87: "Rule 30: Financial Assertion Immutability". Append-only by design.
- `calculation_traces` (003:193): No UNIQUE. Per-result trace rows linked via `result_id` FK with `ON DELETE CASCADE`. Append-only; cleared transitively when the parent `calculation_results` row is deleted.
- `classification_signals` (003:312): No UNIQUE. Append-only signal accumulation per Cluster A evidence.

**Output — historical context for calculation_results UNIQUE (migration 017):**
```sql
-- OB-121: Prevent stale calculation result accumulation
--
-- Problem: The calculation engine inserts new results without deleting old ones.
-- Multiple runs for the same entity+period+plan accumulate duplicate rows,
-- inflating totals by 138% (850 rows instead of 320, $7.75M instead of $3.26M).
--
-- Fix: Add unique constraint on (tenant_id, entity_id, period_id, rule_set_id).
-- The engine now DELETEs before INSERT (belt), and this constraint prevents
-- duplicates at the DB level (suspenders).

DELETE FROM calculation_results
WHERE id NOT IN (
  SELECT DISTINCT ON (tenant_id, entity_id, period_id, rule_set_id) id
  FROM calculation_results
  ORDER BY tenant_id, entity_id, period_id, rule_set_id, created_at DESC
);

ALTER TABLE calculation_results
ADD CONSTRAINT calculation_results_unique_entity_period_plan
UNIQUE (tenant_id, entity_id, period_id, rule_set_id);
```

**CC observation:** UNIQUE constraint coverage of persistent expression surfaces in the calculation flow:
- `period_entity_state`: UNIQUE on `(tenant_id, entity_id, period_id)` ✓ (matches DELETE scope at app layer)
- `calculation_results`: UNIQUE on `(tenant_id, entity_id, period_id, rule_set_id)` ✓ — added in 017 after a real production incident (138% overcount, $7.75M vs $3.26M correct). Belt-and-suspenders pairing of app-layer DELETE-before-INSERT and DB-layer UNIQUE.
- `entity_period_outcomes`: UNIQUE on `(tenant_id, entity_id, period_id)` ✓ — but rule_set is NOT in the constraint, mirroring the app-layer DELETE scope.

Append-only surfaces (`calculation_batches`, `calculation_traces`, `classification_signals`) intentionally lack UNIQUE constraints and rely on append-and-cascade semantics.

The 017 historical evidence demonstrates: UNIQUE constraints were ADDED to calculation_results AFTER a real-world failure was observed (financial inflation from row duplication). The original schema (003) shipped without that UNIQUE.

---

### Probe ID: S-RUNTIME-G10-01 — DEFERRED

**Status:** DEFERRED — environment scope
**Reason:** Per directive Section 0, S-RUNTIME-G10-01 (duplicate-execution test) requires a runnable calculation. This environment has 0 rows in `committed_data`, `rule_sets`, `calculation_results`, `calculation_batches`, `entity_period_outcomes`. A calculation run cannot be executed and observed for duplicate-row behavior.
**Re-execution requires:** populated `rule_sets`, `committed_data`, and `rule_set_assignments` such that a calculation can be run twice in succession to observe whether duplicate rows accumulate, whether DELETE-before-INSERT clears them, and whether the UNIQUE constraint catches any leak that bypasses the DELETE.

---

## Summary — Cluster D factual inventory

**G10 (DELETE-before-INSERT pattern + UNIQUE coverage):**

- Three persistent expression surfaces in the active calculation flow follow the DELETE-before-INSERT pattern: `period_entity_state`, `calculation_results`, `entity_period_outcomes`. The pattern is intentional with explicit comment markers (OB-121, HF-078).
- `synaptic_density` uses UPSERT with `onConflict` against its UNIQUE constraint as an alternative idempotency primitive.
- Append-only surfaces (`calculation_batches`, `calculation_traces`, `classification_signals`) intentionally lack UNIQUE constraints; idempotency is preserved via UUID PKs + cascade-delete links + append-and-supersede semantics.
- `calculation_results` UNIQUE was added in migration 017 after a real production incident (138% inflation, $7.75M vs $3.26M correct). The migration text explicitly states "engine now DELETEs before INSERT (belt), and this constraint prevents duplicates at the DB level (suspenders)" — pairing app-layer and DB-layer protection.
- `entity_period_outcomes` DELETE scope `(tenant_id, period_id)` is broader than `rule_set_id`-scoped DELETEs on `calculation_results`. UNIQUE constraint on outcomes does not include rule_set_id either; the materialization is shared per period, which means a second calculation run for a different rule_set on the same period will wipe the first run's outcome rows. Whether this is a defect or intentional shared-period materialization is a disposition question; CC reports the factual scope mismatch.

CC reports findings. CC does NOT disposition magnitude.
