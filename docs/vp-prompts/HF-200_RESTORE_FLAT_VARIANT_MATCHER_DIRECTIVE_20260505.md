# HF-200 — Restore Reconciliation-Era Variant-Matcher (Shape α)

**Class:** HF (VP code hot fix)
**Repo:** `~/spm-platform`
**Branch:** `hf-200-restore-flat-variant-matcher` (create from main HEAD `373579e4`)
**Authority:** DIAG-025 / DIAG-026 / DIAG-027 / DIAG-028 forensic chain
**Supersedes:** prior HF-200 Path 2 Structural framing (canceled — bypass per SR-34)
**Reconciliation anchors:** BCL $312,033 (already reconciled); CRP $566,728.97 pre-clawback (already reconciled); Meridian MX$185,063 (target — currently $0)
**Authored:** 2026-05-05

## ARCHITECT INTENT

Restore the reconciliation-era variant-matcher mechanism by deleting `materializedState` from the variant-matcher path. The reconciliation-era mechanism (`flatDataByEntity` token-overlap from `committed_data.row_data` via `entity_id` FK; HF-119 token-tokenize-everything) produced reconciled proof for all three tenants at SHAs `cbaacb12` and `1bd8100b`. OB-177 Phase 3 (`bbe8fd33`, 2026-03-18) demoted that mechanism to fallback by introducing `materializedState` as PRIMARY. HF-200 reverses that demotion.

`materializedState` is broken at the canonicalization layer (DIAG-025: literal source field names persist instead of canonical surfaces). Deleting it from variant-matcher removes a dependency on a broken layer for a marginal/aesthetic benefit. flatDataByEntity is source-of-truth, cross-language by mechanism, and proven to produce reconciled baselines.

## DECISIVE FORENSIC CHAIN (architect-channel reference)

- **DIAG-025:** canonicalization layer leaks literal field names; `tipo_coordinador` reaches metadata sibling-key instead of `meta.role` canonical
- **DIAG-026:** Meridian reconciled at `cbaacb12` (HF-123 P5, 2026-03-10) and `1bd8100b` (OB-169 P6, 2026-03-14); reconciliation predates OB-177 Phase 3 demotion
- **DIAG-027:** reconciliation mechanism is `flatDataByEntity.get(entityId)` token-overlap at calc/run/route.ts:1009 (cbaacb12) / :1046 (1bd8100b); cross-language by `variantTokenize` design (NFD-normalize + accent-strip + lowercase + word-split + length>2)
- **DIAG-028:** `committed_data.entity_id` FK fully populated for Meridian (608/608 rows; latest re-import 2026-05-04T23:47:06-07 UTC); zero variant-matcher SCORING commits between reconciliation and main; only 4 commits touch variant-matcher path (2 semantic — OB-177 P3 + OB-194 P1; 1 data-layer precursor — OB-177 P2; 1 non-semantic diagnostic — OB-190)

## OUT OF SCOPE (deferred)

- Canonicalization-layer closure (DIAG-025 four sites) — separate HF; does not block Meridian calc; substrate-promotion candidate Canonicalization-Layer Korean Test Failure
- Performance optimization at billion-record scale — separate DS; queued; flatDataByEntity has clear data-layer optimization paths (indexes, partitions, materialized views) that do NOT require application-layer pre-computation coupling to canonicalization
- OB-194 Phase 1 zero-score exclusion gate (`b3f22d3c`) — leave operative; under Shape α, flatDataByEntity produces non-empty tokens for Meridian, scoring is non-zero, exclusion gate does not fire; revert separately if regression surfaces
- `materializedState` construction code at OB-177 Phase 2 (`c9b34370`) — leave operative; wasted work but no calc-path effect after Shape α; cleanup deferred
- Clean slate of tenant data — not required; current 608/608 FK-populated state is sufficient evaluand

## CC PASTE BLOCK (everything below this line is CC-pasteable; nothing follows per Rule 29)

```markdown
# HF-200 — Restore Reconciliation-Era Variant-Matcher (Shape α)

**Repo:** `~/spm-platform`
**Branch:** create `hf-200-restore-flat-variant-matcher` from main HEAD
**Inheritance:** `CC_STANDING_ARCHITECTURE_RULES.md` Rules 1-28
**Bindings:**
- T1-E905 (Prove Don't Describe) — verbatim before/after diff in completion report
- T1-E907 (Fix Logic Not Data) — code change only; no data migration
- T1-E910 (Korean Test) — flatDataByEntity is structural cross-language by mechanism
- T2-E46 (Reconciliation-Channel Separation) — CC reports calc output; architect reconciles totals
- T5-E1064 (Procedural Theater Minimization) — single phase; no per-step ceremony
- SR-34 (No Bypass) — pure restoration of reconciliation-era mechanism

## SCOPE

Single change at `web/src/app/api/calculation/run/route.ts` lines 1413-1447 (per DIAG-028 Dimension 2 evidence):

**Delete:** the `materializedState` PRIMARY block (approximately lines 1422-1432) AND the `entityTokens.size === 0` fallback gate (approximately line 1435).

**Restore:** `flatDataByEntity` token-overlap as unconditional source for variant-matcher token extraction.

**Do NOT modify:** materializedState CONSTRUCTION code upstream (OB-177 Phase 2 data-layer precursor at `c9b34370`); leave operative as wasted-but-harmless work.

**Do NOT modify:** OB-194 Phase 1 zero-score exclusion gate (`b3f22d3c`) at lines ~1488-1492; leave operative.

**Do NOT modify:** any other concern in `calc/run/route.ts` or any other file.

## EXECUTION

### Phase 0 — Branch + baseline read

```bash
cd ~/spm-platform
git checkout main
git pull origin main
git checkout -b hf-200-restore-flat-variant-matcher
git rev-parse HEAD
```

PASTE output. Then capture pre-fix state of the variant-matcher block:

```bash
sed -n '1410,1450p' web/src/app/api/calculation/run/route.ts
```

PASTE output. This becomes the BEFORE state in the completion report.

### Phase 1 — Code change

Edit `web/src/app/api/calculation/run/route.ts`:

Delete the `materializedState` read block (the lines that read materializedState and populate entityTokens from it; verbatim source identifies which lines based on Phase 0 BEFORE state).

Delete the `if (entityTokens.size === 0)` conditional wrapping the `flatDataByEntity` block. Promote the inner `flatDataByEntity` loop to unconditional execution.

After edit, capture post-fix state:

```bash
sed -n '1410,1450p' web/src/app/api/calculation/run/route.ts
```

PASTE output. This becomes the AFTER state in the completion report.

### Phase 2 — Build + lint

```bash
cd web && npm run build 2>&1 | tail -30
npm run lint 2>&1 | tail -20
```

PASTE output. Both must pass before commit.

### Phase 3 — Commit + push

```bash
git add web/src/app/api/calculation/run/route.ts
git commit -m "HF-200: restore flatDataByEntity as unconditional variant-matcher source

Reverts OB-177 Phase 3 (bbe8fd33) variant-matcher source-priority demotion.

DIAG-027 + DIAG-028 forensic chain established that reconciliation-era
mechanism (flatDataByEntity token-overlap from committed_data via entity_id
FK) produced reconciled proof for BCL/CRP/Meridian at cbaacb12/1bd8100b.
OB-177 P3 demoted this mechanism to fallback gated on entityTokens.size === 0.
materializedState as PRIMARY is broken at canonicalization layer per DIAG-025.

This commit deletes materializedState read block and gate from variant-matcher;
flatDataByEntity becomes unconditional source. materializedState construction
upstream (OB-177 P2 c9b34370) and OB-194 P1 (b3f22d3c) are out of scope.

Bindings: T1-E905, T1-E907, T1-E910, SR-34
Forensic: DIAG-025, DIAG-026, DIAG-027, DIAG-028"
git push origin hf-200-restore-flat-variant-matcher
```

PASTE output.

### Phase 4 — Production verification

After PR opens (architect opens; CC does not), CC executes calc on production tenants and reports calculated values. Architect reconciles in architect channel per T2-E46.

```bash
# Architect-triggered: re-run calculation for BCL, CRP, Meridian via existing scripts or API
# CC pastes:
#   - calculation_results.total_payout sum per tenant
#   - calculation_batches.summary.total_payout per tenant
# CC does NOT compare to expected anchors. Architect reconciles.
```

If CC has scripts to invoke, list them; do not execute without architect signal.

### Phase 5 — Completion report

Write `docs/completion-reports/HF-200_RESTORE_FLAT_VARIANT_MATCHER_COMPLETION_REPORT_<YYYYMMDD>.md` per Rule 26 mandatory structure.

Hard Gates evidence:
- BEFORE state from Phase 0 (verbatim 40 lines)
- AFTER state from Phase 1 (verbatim 40 lines)
- Diff between them (verbatim `git diff HEAD~1` output)
- Build output PASS
- Lint output PASS
- Commit SHA + push confirmation

Soft Gates evidence:
- T1-E905 verbatim PASS
- T1-E907 code-not-data PASS (zero data migrations; one file modified)
- T2-E46 channel separation PASS (CC pastes calc output; no reconciliation)
- T5-E1064 single-phase PASS (one commit; one file)
- SR-34 no-bypass PASS (deletes accommodation; restores mechanism)

PASTE completion report content in chat.

## HALT CONDITIONS (single statement; T5-E1064)

HALT and surface to architect if:
- Phase 0 sed output does not match DIAG-028 Dimension 2 evidence shape (materializedState block + gate not at expected lines)
- Phase 2 build or lint fails
- Phase 4 calc invocation produces values architect cannot reconcile (architect signals after CC paste)

Otherwise: execute continuously through Phases 0-5. NO yes/no questions. NO per-phase pings.

## NO FURTHER SCOPE

Do not touch canonicalization-layer code. Do not touch OB-194. Do not touch materializedState construction. Do not refactor adjacent code. Do not "improve" what you find. Single change; verbatim restore.

END OF DIRECTIVE.
```
