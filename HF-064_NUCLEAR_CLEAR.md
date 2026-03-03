# HF-064: NUCLEAR CLEAR — ÓPTICA LUMINAR
## Wipe All Domain Data, Preserve Tenant + Profiles

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md`
2. `SCHEMA_REFERENCE.md`

---

## CONTEXT

Andrew is about to test the full SCI import pipeline manually in the browser. The Óptica Luminar tenant has accumulated data from OBs 144-148 — manually created entities, script-bound rows, SQL-injected derivation rules. All of it needs to go. The tenant and login profiles stay.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. **Commit this prompt to git as first action.**
4. **Git from repo root (spm-platform), NOT web/.**

---

# PHASE 0: DOCUMENT BEFORE STATE

### 0A: Tenant ID

```sql
SELECT id, slug, name FROM tenants WHERE slug LIKE '%optica%' LIMIT 1;
```

Save the tenant ID. Every subsequent query uses it.

### 0B: Current counts

```sql
WITH t AS (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
SELECT 
  (SELECT COUNT(*) FROM entities WHERE tenant_id = t.id) as entities,
  (SELECT COUNT(*) FROM periods WHERE tenant_id = t.id) as periods,
  (SELECT COUNT(*) FROM rule_sets WHERE tenant_id = t.id) as rule_sets,
  (SELECT COUNT(*) FROM rule_set_assignments WHERE tenant_id = t.id) as assignments,
  (SELECT COUNT(*) FROM committed_data WHERE tenant_id = t.id) as committed_rows,
  (SELECT COUNT(*) FROM calculation_results WHERE tenant_id = t.id) as calc_results,
  (SELECT COUNT(*) FROM import_batches WHERE tenant_id = t.id) as import_batches
FROM t;
```

### 0C: Profiles (MUST SURVIVE)

```sql
SELECT id, display_name, email, role
FROM profiles
WHERE tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1);
```

Paste output. These MUST exist after the clear.

**Commit:** `HF-064 Phase 0: Pre-clear state documented`

---

# PHASE 1: NUCLEAR CLEAR

Run in Supabase SQL Editor. Single transaction.

```sql
DO $$
DECLARE
  tid uuid;
BEGIN
  SELECT id INTO tid FROM tenants WHERE slug LIKE '%optica%' LIMIT 1;
  
  IF tid IS NULL THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  -- Layer 6: Outcomes + results
  DELETE FROM entity_period_outcomes WHERE tenant_id = tid;
  DELETE FROM calculation_results WHERE tenant_id = tid;

  -- Layer 5: Calculation batches
  DELETE FROM calculation_batches WHERE tenant_id = tid;

  -- Layer 4: Assignments
  DELETE FROM rule_set_assignments WHERE tenant_id = tid;

  -- Layer 3: Relationships (if table exists)
  BEGIN
    DELETE FROM entity_relationships WHERE tenant_id = tid;
  EXCEPTION WHEN undefined_table THEN
    NULL; -- table doesn't exist, skip
  END;

  -- Layer 2: Domain data
  DELETE FROM committed_data WHERE tenant_id = tid;
  DELETE FROM rule_sets WHERE tenant_id = tid;
  DELETE FROM entities WHERE tenant_id = tid;
  DELETE FROM periods WHERE tenant_id = tid;

  -- Layer 1: Import history
  DELETE FROM import_batches WHERE tenant_id = tid;

  RAISE NOTICE 'Nuclear clear complete for tenant %', tid;
END $$;
```

**NOTE:** If any DELETE fails due to FK constraints not covered above, identify the blocking table, add the DELETE in the correct order, and re-run. Do NOT skip tables — everything must be cleared.

**Commit:** `HF-064 Phase 1: Nuclear clear executed`

---

# PHASE 2: VERIFY CLEAN STATE

### 2A: All counts zero

```sql
WITH t AS (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
SELECT 
  (SELECT COUNT(*) FROM entities WHERE tenant_id = t.id) as entities,
  (SELECT COUNT(*) FROM periods WHERE tenant_id = t.id) as periods,
  (SELECT COUNT(*) FROM rule_sets WHERE tenant_id = t.id) as rule_sets,
  (SELECT COUNT(*) FROM rule_set_assignments WHERE tenant_id = t.id) as assignments,
  (SELECT COUNT(*) FROM committed_data WHERE tenant_id = t.id) as committed_rows,
  (SELECT COUNT(*) FROM calculation_results WHERE tenant_id = t.id) as calc_results,
  (SELECT COUNT(*) FROM import_batches WHERE tenant_id = t.id) as import_batches
FROM t;
```

**ALL must be 0.**

### 2B: Profiles intact

```sql
SELECT id, display_name, email, role
FROM profiles
WHERE tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1);
```

**Must match Phase 0C exactly.**

### 2C: Tenant intact

```sql
SELECT id, slug, name FROM tenants WHERE slug LIKE '%optica%';
```

**Must return the same row as Phase 0A.**

**Commit:** `HF-064 Phase 2: Clean state verified — all zeros, profiles intact`

---

# PHASE 3: VERIFY BROWSER

### 3A: Build and start

```bash
cd web && rm -rf .next && npm run build && npm run dev
```

### 3B: Browser check

```
1. Open localhost:3000
2. Log in as Óptica Luminar admin (credentials from Phase 0C)
3. Verify: dashboard loads without errors
4. Navigate to Operate section
5. Verify: empty states display (no plans, no data, no results)
6. Navigate to Import — should be ready to accept files
7. No console errors blocking functionality
```

**Proof gate PG-03:** Login works. Empty states render. Import page accessible.

**Commit:** `HF-064 Phase 3: Browser verified — login works, empty states clean`

---

# PHASE 4: COMPLETION REPORT

```markdown
# HF-064 COMPLETION REPORT
## Nuclear Clear — Óptica Luminar

### Before
entities: [X]
periods: [X]
rule_sets: [X]
assignments: [X]
committed_rows: [X]
calc_results: [X]
import_batches: [X]

### After
entities: 0
periods: 0
rule_sets: 0
assignments: 0
committed_rows: 0
calc_results: 0
import_batches: 0

### Preserved
- Tenant: [slug] ✓
- Profiles: [count] ✓
- Login: ✓
- Empty states: ✓

### Ready for manual import testing
```

**Commit:** `HF-064 Phase 4: Completion report`

---

## ANTI-PATTERNS

| Don't | Do |
|-------|-----|
| Delete the tenant record | Delete only domain data |
| Delete profiles | Profiles are login accounts — preserve |
| Delete auth.users | Never touch Supabase auth tables |
| Skip the verification queries | Every zero must be confirmed |
| Skip browser verification | Andrew needs to log in immediately after |
| Create seed data | The whole point is EMPTY. Zero data. |
