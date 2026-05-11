# E3.2 — `classification_signals` Constraints

**Per directive Section 0 halt-and-surface convention:** the `pg_constraint`/`pg_class`/`pg_namespace` query requires direct PostgreSQL access. Postgrest does not expose `pg_*` system catalogs and the `execute_sql` RPC does not exist.

**Verbatim Postgrest response:**

```
E3.2 RPC unavailable: Could not find the function public.execute_sql(sql) in the schema cache
```

CC has NOT been able to read CHECK / FK / UNIQUE / NOT NULL constraints from the live database in this environment. Architect-channel direct SQL access required for this evidence item.

Migration-file content (Postgres DDL) is surfaced separately at E3.5; that captures constraint text as authored, not as currently in the running database.
