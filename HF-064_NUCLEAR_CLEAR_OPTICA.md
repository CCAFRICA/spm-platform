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
