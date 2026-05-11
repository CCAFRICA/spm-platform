# E3.4 — `classification_signals` Indexes

**Per directive Section 0 halt-and-surface convention:** the `pg_indexes` query requires direct PostgreSQL access. Postgrest does not expose this system catalog.

**Verbatim Postgrest response:**

```
E3.4 RPC unavailable: Could not find the function public.execute_sql(sql) in the schema cache
```

CC has NOT been able to read indexes from the live database in this environment. Architect-channel direct SQL access required.

Migration-file content (`CREATE INDEX` statements) is surfaced at E3.5 from the migration files listed as touching `classification_signals`.
