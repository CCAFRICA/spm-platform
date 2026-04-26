# HF-194 Stage 1 Verification — Matcher Inputs Restored
## Run AFTER Vercel deploys `hf-193-signal-surface` containing HF-194 commits (Phases 1–4).

## Hypothesis under test

With HF-194 in place, BCL's `committed_data.metadata` will carry `field_identities` after re-import via the bulk-storage path. The matcher's structural-FI Pass 1 will then have non-empty inputs and produce `convergence_bindings` with 4 component bindings (matching the March-19-proven count).

Stage 1 PASS does NOT imply Stage 2 PASS. The engine path from `convergence_bindings` → calculation total has multiple HF interactions since March 19 (HF-188 intent executor, HF-191 seeds, HF-193 signal-surface cutover) that may produce a different total even with restored bindings.

## Steps

1. Architect navigates to vialuce.ai (production deploy of `hf-193-signal-surface`).
2. **BCL tenant** (`b1c2d3e4-aaaa-bbbb-cccc-111111111111`): re-import the BCL plan + 6 monthly Datos sheets + Personnel sheet via the bulk-storage path (the same path that produced the current zero-`field_identities` state).
3. After re-import completes, run via supabase-js (per `scripts/audit/` pattern):

   ```typescript
   // metadata key presence by informational_label
   const { data } = await sb
     .from('committed_data')
     .select('metadata')
     .eq('tenant_id', 'b1c2d3e4-aaaa-bbbb-cccc-111111111111');

   // Group: { label, has_fi } → row_count
   const buckets = new Map<string, number>();
   for (const r of data ?? []) {
     const meta = (r.metadata ?? {}) as Record<string, unknown>;
     const label = (meta.informational_label as string) ?? '∅';
     const has_fi = 'field_identities' in meta;
     const k = `${label}::${has_fi}`;
     buckets.set(k, (buckets.get(k) ?? 0) + 1);
   }
   ```

   **Expected:** every (label, has_fi=true) row count > 0.
   **Failure:** any (label, has_fi=false) row remains for non-zero count.

4. Run convergence check:

   ```typescript
   const { data } = await sb
     .from('rule_sets')
     .select('id, name, status, input_bindings')
     .eq('tenant_id', 'b1c2d3e4-aaaa-bbbb-cccc-111111111111');
   for (const r of data ?? []) {
     const ib = (r.input_bindings ?? {}) as Record<string, unknown>;
     const has_cb = 'convergence_bindings' in ib;
     const cb = ib.convergence_bindings as Record<string, unknown> | undefined;
     const cb_count = cb ? Object.keys(cb).length : 0;
     console.log(`${r.id} | has_cb=${has_cb} | cb_count=${cb_count}`);
   }
   ```

   **Expected:** `has_cb = true`; `cb_count = 4` (matching March 19 proven component bindings count for BCL).

## Stage 1 PASS criteria

- `field_identities` populated on all BCL `committed_data` rows (every label group has `has_fi=true` rows; zero `has_fi=false` rows)
- `convergence_bindings` produced by convergence (`has_cb=true` on the active rule_set)
- `cb_count = 4`

If Stage 1 PASSES → architect proceeds to Stage 2.
If Stage 1 FAILS → halt. HF-194 did not restore the matcher's input pipeline as expected; surface to architect for re-diagnosis.

## Stage 1 vs Stage 2

Stage 1 verifies the **input-pipeline regression** is closed.
Stage 2 verifies the **calculation produces the expected total**.

Stage 1 PASS does NOT imply Stage 2 PASS; the engine path from `convergence_bindings` → calculation has multiple HF interactions since March 19 that may produce a different total even with restored bindings.

## Cross-references

- DIAG-020-A Section 9 — `field_identities` universally absent on BCL (70/70 sampled rows before HF-194)
- DIAG-021 R1 Section 10 — caller-writer drift verdict NEW_WRITER_OMITS_FI
- DIAG-022 Section 11 — pipeline architecture verdict PARALLEL_SPECIALIZED
- HF-194 Phase 3 — patches at execute-bulk/route.ts:547, 666, 830
