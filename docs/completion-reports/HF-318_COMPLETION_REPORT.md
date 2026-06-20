# HF-318 Completion Report — Import Flow Redesign (Information Hierarchy + User Language)

**Date:** 2026-06-20 · **Branch:** `hf-318-import-flow-redesign` · **Implementation SHA:** `ef91b2cd`
**Status:** Built, tsc clean, `next build` exit-0 (198/198), Korean-Test PASS, adversarial review 4/4 gates PASS. **NOT merged** (SR-44 — architect browser-verifies + merges). 3 files, +227/−50.

> Naming note: the OB-226 gray-card CSS prong was internally comment-labeled "HF-318" in `globals.css` (a stale CC label predating this directive). This official **HF-318 = import flow redesign**. The CSS comment collision is cosmetic (comment text only) and was left as-is to avoid churning the merged file.

---

## Terminology mapping applied (Vialuce-facing labels)

| Internal term (was) | User-facing label (now) |
|---|---|
| Atoms recalled / Memory saved | **Recognized Patterns** (Complete) / **Fields Recognized** (Analyze) |
| Atoms learned (novel) | **New Patterns Learned** |
| Bindings injected | **Field Mappings Applied** |
| LLM calls made | **AI Analysis Steps** |
| Fingerprints stored / recognized | **Data Signatures Stored** / **Data Signatures** (Analyze) |
| Signals captured | **Quality Signals Captured** |
| Rows committed | **Records Committed** |
| Pulses | **removed entirely** |
| Sheets comprehended | **Sheets Comprehended** (kept; now a headline KPI with progress) |
| "What just happened" | **Intelligence Summary** |
| "Review Bindings →" | **Review Data Quality →** |
| "View in Stream →" | **View in Intelligence →** |

Jargon (`Atoms`/`Bindings`/`Pulses`/`Fingerprints`/`recalled`/`bypassed`) remains ONLY in the Dark/Bliss else-branches (byte-identical, unchanged) — zero in any Vialuce-facing label.

## Component changes

**`ImportTelemetryPanel.tsx`** (Analyze intelligence; +42, 0 deletions — purely additive):
- New `useIsVialuce()` + a Vialuce branch. `analyzing` phase → design-spec `.kpi` cards: **Sheets Comprehended** (X / Y + progress bar), **Fields Recognized**, **New Patterns Learned**, **Data Signatures** — no gray gradient footer. `executing` phase → a clean `.card` commit-progress (records committed + bar). Dark/Bliss else-branch unchanged.

**`operate/import/page.tsx`** (Analyze hierarchy inversion; +12):
- Under Vialuce, the intelligence `ImportTelemetryPanel` renders **ABOVE** `SCIUpload` (the file list = reference detail). The original bottom telemetry render is gated to `!isVialuce` (no duplicate; Dark/Bliss keep the footer-below order). Mutually exclusive by theme.

**`ImportReadyState.tsx`** (Complete state, Vialuce branch only; ±88):
- KPI hero → **Records Imported / Entities Found / Content Units** (`entityCount` prop wired; source-date-range + component-count moved to the context rows).
- "What just happened" → **Intelligence Summary** card in user language (mapping above); **Pulses removed**.
- **Carrier Intelligence** = gold `.insight` banner; the quality **percentage + recommendation** is the prominent signal (success/gold/danger color by confidence). Its inline pipeline-readiness CTA block was removed (CTAs consolidated below).
- **Prioritized CTAs:** PRIMARY `.btn-gold` **"Go to Calculate →"** → `router.push('/operate')` (the Lifecycle Cockpit, OB-226 — the natural next step; the cockpit guides Configure/Import/Calculate). SECONDARY `.btn-pri` **"Review Data Quality →"** → `/operate/import/quarantine`. TERTIARY `.btn-sec` **"Import More Data"** + ghost **"View in Intelligence →"** → `/stream`.

## Proof gates (CC-verifiable)

- `tsc --noEmit` clean; `npm run build` exit-0 (198/198); **Korean-Test PASS**.
- Jargon grep on Vialuce-facing labels → **zero** (`Atoms`/`Bindings`/`Pulses`/`Fingerprints` only in Dark/Bliss else-branches).
- Cockpit-gating: all cockpit content behind `useIsVialuce()`; gold CTA `router.push('/operate')` confirmed (not `/operate/calculate`).
- Else-branches byte-identical: `ImportTelemetryPanel` 0 deletions (additive); `ImportReadyState` dark branch (lines 351-548) no added/removed lines.

## Adversarial verification

Independent skeptical review (find-problems mandate) against all proof gates: **4/4 PASS, no FAILs**.
- Analyze: Vialuce telemetry above file list, bottom footer gated `!isVialuce`, `.kpi` cards (not gray panel) — PASS.
- Complete: KPI hero correct; Intelligence Summary user-language (no leaked jargon in Vialuce branch); gold "Go to Calculate" → `/operate`; "Review Bindings"/"View in Stream" gone — PASS.
- Dark/Bliss byte-identical (both files) — PASS.
- Correctness: hooks unconditional/top-level; `entityCount` wired; no dangling props (`onNavigateToCalculate` still used in dark branch); no unused imports — PASS.
- Two UX observations flagged (label "Go to Calculate" routes to the cockpit; primary CTA always enabled) — both are the directive's specified behavior (constraint 4), not defects.

## Architect browser-verifies (SR-44)
Import Analyze: intelligence cards at TOP, file list below, zero gray surfaces · Import Complete: `.kpi` hero, user-language labels, gold "Go to Calculate →" · navigates to `/operate` · Carrier as `.insight` · Dark/Bliss unchanged.

---

## ARTIFACT SYNC
```
ARTIFACT SYNC
MC: CLT-225 → CLOSED (import flow hierarchy inverted, user language applied, gold CTA to cockpit)
REGISTRY: Design & Experience → HF-318 SHA ef91b2cd
SUBSTRATE: SR-34 (one design-spec surface, jargon→user language); T1-E910 (Vialuce-facing labels); honest user language over internal jargon
```

## PR
`gh pr create --base main --head hf-318-import-flow-redesign` — see PR for final push SHA.

---

*HF-318 · CC build complete · awaiting SR-44 architect browser-verify + merge.*
