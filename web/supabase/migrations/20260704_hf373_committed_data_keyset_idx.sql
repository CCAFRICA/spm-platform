-- HF-373 Phase F (D8) — the composite index the summary engine's keyset read walks.
--
-- committed_data has only (tenant_id) and (tenant_id, data_type) indexes; its PK id is
-- uuid_generate_v4(). Any tenant-scoped read ordered by id therefore walks the WHOLE 672K-row
-- shared table's PK index filtering for the tenant — live-reproduced: a 186-row tenant's PAGE 0
-- times out (8.1–8.3s > the ~8s statement timeout), and OFFSET-depth pagination kills large
-- tenants (263K rows: timeout at offset ≥ 50K). With this index, the summary engine's keyset
-- pages (tenant_id = X AND id > last ORDER BY id LIMIT 1000) are pure index range scans.
--
-- ARCHITECT (SR-44): CREATE INDEX CONCURRENTLY cannot run inside a transaction — run this
-- statement ALONE in the SQL editor (not batched with other migrations). On the 672K-row table
-- the build takes seconds; CONCURRENTLY avoids blocking live imports.

create index concurrently if not exists committed_data_tenant_id_id_idx
  on public.committed_data (tenant_id, id);
