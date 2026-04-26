# AP-17 — Parallel Metadata Construction
## Registered: 2026-04-25 via HF-194 disposition
## Status: Open
## Scope:
- `web/src/app/api/import/sci/execute/route.ts`
- `web/src/app/api/import/sci/execute-bulk/route.ts`

## Description

Both `execute/route.ts` and `execute-bulk/route.ts` construct `committed_data.metadata` objects via inline object literals at each `committed_data` insert site. The two routes are **PARALLEL_SPECIALIZED** (DIAG-022) — they have legitimately different responsibilities (execute = plan AI interpretation + fallback for browser-parsed data; execute-bulk = Storage-transport bulk parse per OB-156 / AP-1 / AP-2) and should NOT be consolidated. However, their metadata-construction surfaces drifted between MARCH_19 and HF-184 / OB-195 Layer 1, with execute-bulk omitting `field_identities` until HF-194.

## Defect class manifested

Six-week silent regression: BCL `committed_data.metadata` lacked `field_identities`, breaking the matcher's Pass 1 for any tenant routed through the bulk path. Detected only after architect-driven diagnostic chain (DIAG-020 → 020-A → 021 R1 → 022) and never caught by any automated check because the metadata contract was not centralized.

Concretely, at HEAD before HF-194:

| Pipeline (route, insert site) | Wrote `field_identities`? |
|-------------------------------|---------------------------|
| execute/route.ts target (line ~623)         | YES |
| execute/route.ts transaction (line ~771)    | YES |
| execute/route.ts entity (line ~905)         | YES |
| execute/route.ts reference (line ~1036)     | YES |
| execute-bulk/route.ts entity (line ~547)    | **NO** (closed by HF-194) |
| execute-bulk/route.ts transaction (line ~666) | **NO** (closed by HF-194) |
| execute-bulk/route.ts reference (line ~830) | **NO** (closed by HF-194) |

The other metadata keys also drift between routes:

| Key                | execute writes? | execute-bulk writes? |
|--------------------|-----------------|----------------------|
| `field_identities` | YES             | YES (after HF-194)   |
| `informational_label` | YES (4 sites) | YES (entity, reference); **NO** (transaction) |
| `classification`   | YES             | NO                   |
| `sourceFile`       | YES             | NO                   |
| `tabName`          | YES             | NO                   |
| `source` (literal) | (not stamped)   | YES (`'sci-bulk'`)   |
| `proposalId`       | NO              | YES                  |
| `semantic_roles`   | NO              | YES                  |
| `resolved_data_type` | NO            | YES                  |
| `entity_id_field`  | NO              | YES                  |

The two writers therefore produce DIFFERENT metadata shapes for the same logical pipeline. HF-194 closes the most consequential drift (field_identities), but the surface is still parallel.

## Remediation candidate (DEFERRED — not in HF-194 scope)

Extract `buildCommittedDataMetadata(unit, label, classification)` into a shared module that both routes consume. The function would take the route's local context plus a small set of route-specific parameters and produce the canonical metadata object. Each route retains its specialization in WHAT data is processed and HOW it is transported, but neither route owns the metadata contract.

Sketch (NOT a fix proposal — sketch only):

```ts
// web/src/lib/sci/committed-data-metadata.ts
export interface CommittedDataMetadata {
  // shared (always present)
  field_identities: Record<string, FieldIdentity>;
  semantic_roles?: Record<string, unknown>;
  entity_id_field?: string | null;
  // pipeline-specific (one of these)
  informational_label: 'target' | 'transaction' | 'entity' | 'reference';
  // upstream attribution (varies)
  source?: 'sci' | 'sci-bulk' | 'commit';
  proposalId?: string;
  contentUnitId?: string;
  // file/sheet provenance
  sourceFile?: string;
  tabName?: string;
  resolved_data_type?: string;
  classification?: 'plan' | 'entity' | 'transaction' | 'target' | 'reference';
}

export function buildCommittedDataMetadata(...): CommittedDataMetadata { ... }
```

## Acceptance criteria for future cleanup

- Single source-of-truth for `committed_data.metadata` shape
- All metadata keys named in one place (a TypeScript interface or Zod schema)
- Adding a new key requires changes only in the shared module
- Removing a key triggers TypeScript errors at every consumer
- Both `execute/route.ts` and `execute-bulk/route.ts` invoke the same helper at every insert site
- Helper accepts the union of route-specific contexts and produces the canonical metadata via discriminated-union construction

## Why deferred

HF-194 closes the immediate regression. Consolidating metadata construction is a larger refactor that should be designed with full visibility into both routes' specialized contexts. Deferring to a future SD or HF avoids scope creep on the regression fix.

## Cross-references

- DIAG-022 Section 11 (responsibility-division verdict: PARALLEL_SPECIALIZED; helper extraction was the indicated narrow framing)
- DIAG-021 R1 Section 10 (caller-writer drift verdict: NEW_WRITER_OMITS_FI; introducing commits HF-184 `2203fc93` 2026-03-31, OB-195 Layer 1 `261bd9d0` 2026-03-30)
- DIAG-020-A Section 9 (`field_identities` universally absent on BCL — 70/70 sampled rows)
- DIAG-020 Section 3 (matcher byte-identical March 19 → HEAD; not the regression vector)
- HF-194 (the narrow patch that closed the manifestation; commits `d56f3e66`, `34f2c42d`, `b784291c`, plus this debt-registration commit)
