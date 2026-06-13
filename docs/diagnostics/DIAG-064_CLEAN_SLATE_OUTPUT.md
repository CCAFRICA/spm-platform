# DIAG-064 — Clean-Slate Wipe Output (closes the DIAG-064 incident chain)

**Date:** 2026-06-12 · **Ruling:** `docs/vp-prompts/OB-203_PHASE-6B_CLEAN_SLATE_RULING_20260612.md` (4145fb2c)
**Scripts:** `web/scripts/diag/diag064-clean-slate-wipe.ts` (DRY_RUN-first, scope-guarded) · `diag064-clean-slate-verify.ts` (read-only verification) — both run from the witness worktree, service-role.
**Verdict:** **VERIFICATION PASS** — tenant `3d354bfa…` at ZERO in all seven ruled categories; other tenants' learning and data state intact (read-only counts pasted). The slate is clean for the §2 cold rebuild.

## Scope proof (census + assertions, identical in DRY RUN and live run)

```
structural_fingerprints: 72 total = 17 sheet-level + 55 atom-level
  all 17 sheet hashes asserted IN the known set (the 16 repaired + the
  morning-created second Portada fingerprint 9aa35481eb9c) — any unknown
  sheet-level hash would have ABORTED with zero writes
classification_signals: 807 rows; types: classification:outcome:81,
  comprehension:atom_recognition:184, comprehension:composition:16,
  comprehension:session_lifecycle:10, comprehension:tier_resolution:80,
  comprehension:unit_state:426, comprehension:workbook_graph:3,
  cost:event:1, interaction:import:5, plan_skeleton:1
committed_data: 325757 | import_batches: 26 | entities: 356 |
import_session_telemetry: 1 | processing_jobs: 0
storage proposals (named sessions): d8085364….json, fc2318fe….json (2 of 6 listed)
```
The two non-`comprehension:*` outlier types were provenance-verified import-lineage BEFORE
widening the scope check (first DRY RUN aborted on them by design):
```
cost:event    context {capturedAt: 2026-06-12T15:21:11.942Z, sciVersion: 1.0}    — SCI cost capture,
plan_skeleton context {model: claude-sonnet-4-…, tokenUsage {1456/193}, …}        — plan-interpretation
both created_at 2026-06-12T15:21:12Z — inside the morning warm run's window.       LLM record
```

## Wipe progression (every statement tenant-guarded; two by-design aborts, then complete)

1. First live run: `classification_signals` + `import_session_telemetry` wiped; **ABORT** at
   `committed_data` — single-statement DELETE of 325k rows exceeded the Small tier's statement
   timeout. Script idempotent; re-run.
2. Second: **ABORT** at the chunked delete — a 5,000-UUID IN-list exceeds the PostgREST URL limit;
   re-chunked at the standing 200 (Section G).
3. Third: `committed_data` wiped (325,757 rows, chunked at 200); **ABORT** at `import_batches` —
   live FK `structural_fingerprints_import_batch_id_fkey` (HF-213 lineage back-link): fingerprints
   must precede batches. Reordered (both fully in scope).
4. Final run, complete:
```
wiped classification_signals            // §1.3 (807 rows incl. all session state)
wiped import_session_telemetry          // §1.6
wiped committed_data (325,757, chunked) // §1.4a
wiped structural_fingerprints           // §1.1 + §1.2 (17 sheet + 55 atoms — no partial memory survives)
wiped import_batches                    // §1.4b (26)
wiped entities                          // §1.5 (356)
wiped processing_jobs                   // §1.7 (0)
wiped 2 storage proposal objects        // §1.7 (d8085364, fc2318fe; e0f86141 had none remaining)
```

## Post-wipe verification (read-only, fresh run)

```
--- wiped tenant 3d354bfa…: seven-category zero check ---
structural_fingerprints    ZERO          import_batches             ZERO
classification_signals     ZERO          entities                   ZERO
committed_data             ZERO          import_session_telemetry   ZERO
processing_jobs            ZERO          storage proposals (named)  none

--- other tenants: learning + data state INTACT ---
tenant                         | fingerprints | signals | committed_data | entities
Banco Cumbre del Litoral       |            6 |     113 |            595 |       85
Cascade Revenue Partners       |            0 |      50 |              0 |        0
Meridian Logistics Group       |            4 |      82 |            608 |       79
(+ EPG scratch tenants, Sabor, Tomi/Trial tenants — all populated as expected)

VERIFICATION PASS: wiped tenant at zero in all seven categories; other tenants
populated and untouched (every wipe statement carried the tenant guard).
```

## Hand-off (ruling §2)

The slate is zero. Next: **COLD RUN (architect)** — import `datos-cadena-restaurantes-mx.xlsx` on
the witness worktree server; expect full comprehension (LLM on all sheets, atoms learned,
fingerprints created, bindings written), all 16 units committed — the cold-start baseline the arc
never had, exercising Phase 6B machinery cold. Then the architect checkpoint (proposal
classifications vs ground truth; assign action is product behavior), then the **WARM WITNESS** at
full criteria including binding injection. Observation to carry (ruling §3): watch the cold run's
in-progress atom/telemetry counters — absent ⇒ Phase D display defect (own HF); present ⇒
attempt 5's blanks were truthful zeros.
