# HF-277 Completion Report — Omit Scale Propagation for Evaluator-Side DAG-Computed Ratios

**Date:** 2026-06-09
**Branch:** `hf-277-omit-evaluator-ratio-scale` (pushed; **PR withheld pending BCL safety gate**)
**Status:** Code implemented + built; Meridian fix + DD-7 proven; **BCL Test 2 (merge gate) BLOCKED — both tenants mid re-import.**

---

## Commits
| SHA | Subject |
|---|---|
| `e46e6be1` | Phase 1: ADR |
| `928c8724` | Phase 2: omit meta.scale for evaluator-side DAG-computed ratios |
| (verify) | Phase 3: verification (Meridian fix + DD-7; BCL gate blocked) |

## Phase 0 — post-revert state confirmed (HALT-1 clear)
`buildConstantWithScale` has HF-274's convergence branch (`scale.side === 'convergence' && ratio` → attach) and the plain evaluator-side attach; **no HF-276 pre-multiply** (revert PR #464 landed). 

## Phase 2 — implementation (`intent-constructor.ts`)
The evaluator-side `attach` now excludes DAG-computed ratios:
```
const attach = (scale.side === 'evaluator' && !otherSideIsRatio)
  || (scale.side === 'convergence' && otherSideIsRatio);
```
When `scale.side === 'evaluator'` AND the compare operand is a ratio (`reference_source.type === 'ratio'`), **no `meta.scale` is attached** → the evaluator compares the raw ratio against the raw breaks. A DAG-computed ratio defines its own space, so there is nothing to scale. Single-column evaluator-side bands (non-ratio) keep scale; convergence-side (HF-274) unchanged. Korean Test: structural `scale.side` + ratio-operand check; no magnitude heuristic, no proofread, no registry. **Build:** korean-test gate PASS · ✓ Compiled successfully · tsc exit 0.

## Phase 3 — verification (`scripts/hf277-omit-scale-verify.ts`)
The script prefers REAL persisted intents and auto-runs the real Test 2 once BCL re-imports; both tenants are currently wiped, so it ran the synthetic path (Meridian config from the prior HF-276 read):
```
Meridian c0 (evaluator+ratio, value=100, ratio breaks):
  NEW DAG has NO meta.scale on the ratio break (HF-277 omits)        PASS
  OLD (meta.scale=100)=400 tiers HIGHER than NEW=300 (corrected)     PASS
DD-7 (evaluator+ratio, value=1): OLD=300 === NEW=300 (omit = ×1 no-op) PASS
3/3 pass.
```

## ⚠️ BCL Test 2 — the merge gate — is BLOCKED
The directive (§3C Test 2) requires confirming **BCL c1 OLD === NEW (DD-7)** against its **real** persisted intent. **BCL has no active rule_set** (mid re-import), so this cannot run. The two-hypothesis demo shows why it is load-bearing:
```
A) BCL c1 ratio-space breaks, value=1   → OLD=100, NEW=100  → SAFE (omit is a no-op)
B) BCL c1 percent-space breaks, value=100 → OLD=100, NEW=0  → ⚠️ HF-277 REGRESSES (mirror of HF-276)
```
HF-277 is correct **iff** BCL c1's evaluator-ratio breaks are RATIO-space. The HF-276 regression proves BCL c1 *is* evaluator+ratio (so HF-277 touches it), but its break-space has never been read. **Do not merge until Test 2 runs against BCL's real c1.**

## Disposition
- **PR withheld.** Branch pushed and ready. The moment BCL re-imports, re-run `scripts/hf277-omit-scale-verify.ts` (it auto-detects the real intent and runs Test 2). If `BCL Test 2: OLD === NEW` passes, the PR is safe to open/merge. If it fails, HF-277 must be re-scoped (BCL c1 would need its breaks read; a percent-space evaluator-ratio band would require the recognition-layer fix, not this omission).

## Standing-rule compliance
| Rule | Status |
|---|---|
| Korean Test | PASS — structural scale.side + ratio operand; no magnitude/literal |
| AP-17 | PASS — one conditional in buildConstantWithScale |
| DD-7 | PASS for value=1 + Meridian; **BCL UNVERIFIED (gate blocked)** |
| SR-34 | Intended class fix; pending BCL confirmation |
| SR-41 (revert discipline, predecessor) | HF-276 reverted cleanly before this |

## Residual
- Single-column evaluator-side bands (pre-computed column, not a DAG divide) — `otherSideIsRatio` is false → meta retained, unchanged.
