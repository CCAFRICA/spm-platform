# HF-200 — SCI Canonicalization Closure (Korean Test Compliance)

**Repo:** `CCAFRICA/spm-platform`
**Working directory:** `~/spm-platform`
**Branch:** create `hf-200-sci-canonicalization` from main HEAD `373579e4`
**Supersedes:** prior HF-200 Path 2 Structural framing (canceled per DIAG-025_TIPO_DRIFT findings — Bridge A rewrite was bypass; SR-34 operative)
**Substrate authority:** DIAG-025_TIPO_DRIFT empirical findings; T1-E910 Korean Test; Decision 154; T1-E907 Fix Logic Not Data
**Verification anchors (architect-channel; not in CC paste):** BCL $312,033; CRP $566,728.97 pre-clawback; Meridian closure target MX$185,063

## Closure scope

Four sites, all in SCI canonicalization layer. Replace substring-match (`ROLE_TARGETS.some(t => fieldLower.includes(t))`) with structural detection using `confirmedBindings.semanticRole === 'entity_attribute'` (already present in code).

| Site | File | Current pattern | Closure |
|---|---|---|---|
| 1 | `web/src/app/api/intelligence/wire/route.ts:46` | ROLE_TARGETS substring-match | Remove ROLE_TARGETS; canonicalize via semanticRole |
| 2 | `web/src/app/api/import/commit/route.ts:338` | ROLE_TARGETS substring-match | Remove ROLE_TARGETS; canonicalize via semanticRole |
| 3 | `web/src/app/api/import/sci/execute-bulk/route.ts:59` (constant) + `:391-392` (enrichment normalizedKey) + `:443 + :497` (metadata spread) | ROLE_TARGETS + meta.enrichment dual-write preserving source field names + metadata spread propagating literal keys | Remove ROLE_TARGETS; write canonical key only (no literal-derived keys to metadata or enrichment) |
| 4 | `web/src/lib/sci/entity-resolution.ts` (HF-199 D3 path; raw column names in temporal_attributes) | Raw column-name preservation | Canonicalize before write to temporal_attributes |

After closure: any tenant's variant column (Spanish `tipo_coordinador`, English `Role`, Korean `역할`) canonicalizes identically to `meta.role`. Bridge A at `calculate/run/route.ts:1322` works without modification.

## Korean Test discipline

Detection mechanism MUST be structural — `semanticRole`, `structuralType`, value distribution. NO substring lists. NO language-specific tokens. If implementation reaches for any string-literal allowlist, halt and surface.

## Phases

**Phase 0 — Branch + diagnostic baseline.** Create branch. Read pre-fix state of all four sites (paste line ranges as evidence anchor for post-fix delta).

**Phase 1 — Site closures.** Close all four sites in single PR. Build + lint pass.

**Phase 2 — Korean Test grep verification.** Grep for substring-match anti-patterns across repo: `ROLE_TARGETS`, hardcoded role/position/puesto/title/cargo arrays elsewhere. Report findings; do not auto-fix outside scope.

**Phase 3 — Local verification.** Build clean. Localhost smoke test.

**Phase 4 — PR open.** Architect performs clean-slate truncation (separate operation; not CC). Tenants re-import under HF-200 code.

**Phase 5 — Post-merge verification.** CC reports calculated values verbatim for BCL, CRP, Meridian. Architect reconciles against verification anchors in architect channel (T2-E46).

## Out of scope

- Bridge A rewrite (no longer needed; canonicalization upstream makes Bridge A's existing `if (meta.role)` logic correct for all tenants)
- Bridge B alternate site closure (same — accommodation removed by upstream fix)
- effective_from semantic alignment (E953; separate concern, separate HF)
- Substrate-promotion of Canonicalization-Layer Korean Test Failure primitive (VG-side; separate)

## Completion report

Per Rule 26 mandatory structure. Save to `docs/completion-reports/HF-200_COMPLETION_REPORT_<YYYYMMDD>.md`.

## Reporting discipline

T1-E905 verbatim output every phase. T2-E46 reconciliation channel: CC reports calculated values; architect reconciles. T5-E1064: HALT conditions stated once, no per-phase ceremony.

Proceed.
