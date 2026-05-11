# E3.3 — `classification_signals` RLS Policies

**Per directive Section 0 halt-and-surface convention:** the `pg_policy` query requires direct PostgreSQL access. Postgrest does not expose this system catalog.

**Verbatim Postgrest response:**

```
E3.3 RPC unavailable: Could not find the function public.execute_sql(sql) in the schema cache
```

CC has NOT been able to read RLS policies from the live database in this environment. Architect-channel direct SQL access required.

Migration-file content (RLS policy CREATE statements) is surfaced at E3.5 (migration files `006_vl_admin_cross_tenant_read.sql`, `009_vl_admin_write_access.sql`, `024_ob197_signal_surface_rebuild.sql` — all listed as touching `classification_signals`).
