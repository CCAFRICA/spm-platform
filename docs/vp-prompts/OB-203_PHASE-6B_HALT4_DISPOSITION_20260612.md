# OB-203 Phase 6B — HALT-4 Disposition: Phase D Telemetry Record (Architect)

**Date:** 2026-06-12
**Disposes:** Phase D HALT-4 (D.1 ADG `63c79c91`; migration + verifier `867d15c3`)
**Amends:** `docs/vp-prompts/OB-203_PHASE-6B_AMENDMENT2_PHASE-D_TMB_20260612.md`
**File location:** `docs/vp-prompts/OB-203_PHASE-6B_HALT4_DISPOSITION_20260612.md` (CC commits with its next commit)

## §1 — Rulings

1. **D.1 ratified:** dedicated `import_session_telemetry` table, one row per (tenant_id, import_session_id), written exclusively through the atomic increment-upsert function. The evidence-sweep rationale (classification_signals is per-unit append-only; PostgREST cannot express atomic additive SET) is accepted.
2. **D.2 hybrid ratified — exactness by construction:** additive columns ONLY for genuinely append-only quantities (total_signals_written, signals_per_type); all unit-scoped quantities stored as per-unit latest-state snapshots, assignment-merged, idempotent. The literal-counter alternative with compensating decrements is REJECTED as a registry-pattern instance: every compensation site is an enumerated shape, and the first unenumerated emission silently diverges display from truth (Decision 95). Panel numbers are stored values or folds over the one fetched row.
3. **Funnel-level hooks ratified:** accumulation instruments the canonical signal writer and the content-unit pulse path (one RPC per pulse, never per row; rollback zeroes the unit snapshot). Phase C's entity pulses inherit the spine with no new vocabulary.
4. **RPC exception principle (platform-wide, rides this ADR):** `.rpc()` is a narrow exception class for atomicity-requiring writes that PostgREST cannot express — not a general pathway. Any future `.rpc()` introduction requires its own ADR entry naming the PostgREST inexpressibility. Korean Test note: the function is dispatch-surface registered DDL, not string-dispatched logic.
5. **Settle audit posture confirmed:** deriveImportTelemetry removed from all polling routes; once-per-session idempotent settle audit; divergence emitted as `data.import_telemetry_audit_divergence` platform_event and rendered as a reconciliation flag on the completion screen — truth-telling, never silent self-correction.
6. **Incidental finding recorded:** the pre-fix poll executed five table reads per 2s tick (derive re-running rebuildSessionState after the route already ran it) — DIAG-062 understated A5. Noted for the completion report; no separate fix, the class dies with the redesign.

## §2 — Architect action (SR-44)

Architect pastes `web/supabase/migrations/20260612200000_ob203_phase6b_phase_d_import_session_telemetry.sql` into the Supabase Dashboard SQL Editor (project bayqxeiltnpjrvflksfa) and runs it. The migration is transactional and self-rolls-back on assertion failure. Architect reports the result verbatim.

## §3 — CC sequence after migration applied

1. Run `npx tsx web/scripts/verify-ob203-phase-d-telemetry.ts`; paste full output (additive exactness, 25-way concurrent burst landing as exactly 25, write-once semantics) BEFORE any implementation code.
2. Implement in the ADR's stated order against the D.4 Scale Contract; D.5 EPG evidence as specified in Amendment 2.
3. Then Phase C, then Phase B, per Amendment 2 §5. HALT-3 remains live for any per-row × unbounded-frequency cell.
