# HF-195 FINDINGS — Cherry-Pick PR #340 onto Rebuilt Substrate

**Authored:** 2026-04-26
**Branch authored on:** `revert-pre-seeds-anchor`
**Scope (Rule 36):** PR #340 cherry-pick only; no #338 / #339 reapplied; no helper logic modified; no execution; no DB queries.

---

## HOTFIX SCOPE

| Field | Value |
|---|---|
| Predecessor | AUD-003 inline audit verdict on PR #340: REINSTATE (DROP / DROP / REINSTATE for PR #338 / #339 / #340) |
| Substrate anchor SHA | `283d4c24ec196b7f45052292367af895dbaabb1e` |
| Branch HEAD pre-cherry-pick | `1c79671d498e9effe4d1345333827752b42c1742` (AUD-003 Phase 0 commit on top of REVERT-001 doc commit on top of substrate anchor) |
| PR #340 merge commit on `main` | `a2921fbb9bdc95fd6e4093368c27fd98bbd364c8` (HF-194: Restore field_identities in execute-bulk pipeline) |

The architect's audit returned REINSTATE on PR #340 because its fix is a pure structural-symmetry change (extract `buildFieldIdentitiesFromBindings` helper; add `field_identities` writes at three execute-bulk insert sites) orthogonal to seeds and to signal surface. The fix addresses pipeline asymmetry that exists at the substrate anchor independently of #338 / #339.

---

## CHERRY-PICK TARGETS

The audit-candidate evidence (AUD-003 Phase 0) showed PR #340's merge had nine commits in its second-parent ancestry. Three touched production source under `web/src/`; the other six are docs / completion-reports / DIAG findings (out of scope for HF-195's production-source restoration).

| Order | Original SHA | New SHA on revert branch | Subject | Files |
|---|---|---|---|---|
| 1 | `d56f3e661e7dde7679e8261d02f2047881d00c2a` | `4029b2b085c08bc1671d5fae29b277288d56aeb4` | HF-194 Phase 1: extract buildFieldIdentitiesFromBindings to lib/sci | `web/src/lib/sci/field-identities.ts` (new file, +58) |
| 2 | `34f2c42d351a87bbea33d6ee13b286615284b4f6` | `1b4e4bdcc2c01197b73816ff1ed8de09b71081ea` | HF-194 Phase 2: migrate execute/route.ts to import from lib/sci | `web/src/app/api/import/sci/execute/route.ts` (+2 / -47) |
| 3 | `b784291cdc9ecfa1b61a9cce8be3db2acaeb8b74` | `455474a789bc9860bd7c06bf84e6cc0e38f34795` | HF-194 Phase 3: add field_identities to execute-bulk metadata | `web/src/app/api/import/sci/execute-bulk/route.ts` (+8) |

Six commits omitted from the cherry-pick (docs/diagnostics only):

- `c9f2015a` — HF-194 Phase 5: verification specs + completion report
- `2665b264` — HF-194 Phase 4: register AP-17 parallel metadata construction tech debt
- `cf84ee4e` — DIAG-022: pipeline architecture read
- `966c2abe` — DIAG-021 R1: caller-writer + matcher path + data_type drift diagnostic
- `4750e857` — DIAG-020-A: field_identities absence confirmation
- `882bc94c` — DIAG-020: component bindings drift diagnostic

These correspond to PR #340's docs files; the diagnostic chain context is preserved in the architect's audit record and is not required to walk forward into the rebuilt substrate.

---

## PRE-CHERRY-PICK STATE

State of HF-195-relevant files on `revert-pre-seeds-anchor` immediately before Phase 1.3:

| File | Pre-state |
|---|---|
| `web/src/lib/sci/field-identities.ts` | NOT_PRESENT (`ls` returned "No such file or directory") |
| `web/src/app/api/import/sci/execute-bulk/route.ts` — `field_identities` references | grep returned empty (no field_identities references) |
| `web/src/app/api/import/sci/execute/route.ts` — private `buildFieldIdentitiesFromBindings` | PRESENT at line 39 (`function buildFieldIdentitiesFromBindings(`) with 4 call sites at lines 585, 733, 879, 1010 |

This matches PR #340's stated baseline:
- Helper did not exist as shared module (PR #340 Phase 1 creates it)
- `execute-bulk` had no `field_identities` writes (PR #340 Phase 3 adds 3)
- `execute` had a private helper definition (PR #340 Phase 2 deletes the private definition and imports the shared one; 4 call sites preserved unchanged)

---

## CHERRY-PICK RESULT

Final HEAD on `revert-pre-seeds-anchor` after Phase 1.3: `455474a789bc9860bd7c06bf84e6cc0e38f34795`

`git log --oneline -10` showing the layered substrate (top → bottom):

```
455474a7 HF-194 Phase 3: add field_identities to execute-bulk metadata
1b4e4bdc HF-194 Phase 2: migrate execute/route.ts to import from lib/sci
4029b2b0 HF-194 Phase 1: extract buildFieldIdentitiesFromBindings to lib/sci
1c79671d AUD-003 Phase 0: audit evidence extraction — three diffs + anchor code-path trace; awaiting inline audit
52048184 REVERT-001: anchor identified + branch staged; awaiting directive audit
283d4c24 Merge pull request #337 from CCAFRICA/dev          ← substrate anchor
663ea103 HF-190 Phase 3: Build verification + completion report
8d90eaca HF-190 Phase 2: Spread enrichment dict into entity metadata
294be7ec HF-190 Phase 1: Architecture decision — enrichment to metadata
e5181ebc HF-190 Phase 0: Diagnostic — entity metadata enrichment code read
```

All three cherry-picks applied without conflict. `git cherry-pick` reported "Auto-merging" on Phase 2 and Phase 3 (three-way merge against slightly different parent file content from PR #340's branch base), but no manual resolution was required.

Phase 1.3 cherry-pick stats (from `git cherry-pick` output):
- `4029b2b0` — `1 file changed, 58 insertions(+); create mode 100644 web/src/lib/sci/field-identities.ts`
- `1b4e4bdc` — `1 file changed, 2 insertions(+), 47 deletions(-)`
- `455474a7` — `1 file changed, 8 insertions(+)`

---

## POST-STATE FILE INVENTORY

Verification at `revert-pre-seeds-anchor` HEAD `455474a7` (Phase 1.4):

| Check | Result | Evidence |
|---|---|---|
| `web/src/lib/sci/field-identities.ts` exists | PASS | 3034 bytes; 58 lines |
| Helper exported | PASS | `web/src/lib/sci/field-identities.ts:17 — export function buildFieldIdentitiesFromBindings(` |
| `execute-bulk/route.ts` imports helper | PASS | Line 26: `import { buildFieldIdentitiesFromBindings } from '@/lib/sci/field-identities';` |
| `execute-bulk/route.ts` field_identities call sites | PASS | 3 call sites at lines 547, 662, 822, all of form `field_identities: buildFieldIdentitiesFromBindings(unit.confirmedBindings),` |
| `execute/route.ts` private helper definition removed | PASS | grep `function\s+buildFieldIdentitiesFromBindings` returned empty |
| `execute/route.ts` imports shared helper | PASS | Line 35: `import { buildFieldIdentitiesFromBindings } from '@/lib/sci/field-identities';` |
| `execute/route.ts` 4 call sites preserved | PASS | Lines 540, 688, 834, 965 (all `) || buildFieldIdentitiesFromBindings(unit.confirmedBindings);`) — call site count matches PR #340's stated "Four call sites preserved unchanged"; line numbers shifted from substrate's 585/733/879/1010 because the ~40-line private helper definition was removed |

---

## BUILD VERIFICATION

`npm run build` from `web/`:

| Check | Result |
|---|---|
| Compilation | PASS — `✓ Compiled successfully` marker present in build log |
| TypeScript validity | Passed (Next.js runs `tsc` as part of the build linting/type-check phase) |
| Build artifact produced | YES — `web/.next/BUILD_ID = t-scSYnU_jQMyKo4_KqRH` |
| Errors specific to HF-195-touched files (`field-identities.ts`, `execute-bulk/route.ts`, `execute/route.ts`) | NONE — grep against build log returned empty |

Build log preserved at `/tmp/hf-195-build.log` (414.9 KB). Final build output ends with the route table and chunk listing; the only diagnostic-level entries during the build are pre-existing "Dynamic server usage" notices on cookie / `request.url` / `nextUrl.searchParams` routes, which are runtime hints printed during static-analysis of dynamic routes and do not constitute build failures (Next.js converts those routes to server-rendered).

The build's pre-existing lint warnings (e.g., `no-img-element` in `auth/mfa/enroll/page.tsx`, `react-hooks/exhaustive-deps` in several pages) are unrelated to HF-195 and existed at the substrate anchor before cherry-pick.

---

## TYPE COMPATIBILITY NOTE

ADG-7 confirmed the substrate's `web/src/lib/sci/sci-types.ts` provides the three types `field-identities.ts` imports:

| Type | Defined at | Required by HF-195's helper |
|---|---|---|
| `SemanticBinding` | `web/src/lib/sci/sci-types.ts:233` | YES — input parameter type |
| `ColumnRole` | `web/src/lib/sci/sci-types.ts:68` | YES — derived enum used in helper logic |
| `FieldIdentity` | `web/src/lib/sci/sci-types.ts:84` | YES — output map value type |

Substrate's `SemanticBinding` shape contains the three fields the helper reads:

```ts
export interface SemanticBinding {
  sourceField: string;                // customer vocabulary — immutable
  platformType: string;               // platform internal type
  semanticRole: SemanticRole;
  displayLabel: string;               // what the UI shows (defaults to sourceField)
  displayContext: string;             // generated explanation of purpose
  claimedBy: AgentType;
  confidence: number;
}
```

`sourceField`, `semanticRole`, and `confidence` are all present at the substrate anchor — the helper's contract is satisfied. The three-way merge during cherry-pick of Phase 2 (`1b4e4bdc`) and Phase 3 (`455474a7`) auto-resolved without conflict, consistent with the type contract being unchanged between PR #340's branch base and the substrate anchor.

---

## ARCHITECT NEXT STEPS

`origin/revert-pre-seeds-anchor` advances to include three HF-195 commits and an HF-195 documentation commit (final SHA reported in completion report and architect-channel reply). `main` remains untouched at `a2921fbb`.

The next gate is **Phase 1 verification** — execute calculation against the rebuilt substrate (`revert-pre-seeds-anchor + HF-195`) and prove BCL `\$312,033` and Meridian `MX\$185,063` reproduce. Phase 1 verification is a separate directive; CC takes no further action without explicit architect direction. After Phase 1 PASS, the architect drafts the cutover-to-main decision artifact.
