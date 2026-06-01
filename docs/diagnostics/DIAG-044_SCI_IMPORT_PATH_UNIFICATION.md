# DIAG-044: SCI Import Path Unification Analysis

**Type:** Read-only code archaeology (no modification)
**Predecessors:** AUD-001 (SCI pipeline audit), OB-160G (convergence wiring), OB-182 (bulk path creation, CLT-181 F10)
**Purpose:** Two SCI import execution paths exist: `/api/import/sci/execute` (non-bulk) and `/api/import/sci/execute-bulk` (bulk). OB-182 removed convergence from the bulk path (CLT-181 F10: sequence dependency violation). The non-bulk path retains convergence. This diagnostic surfaces what each path does, where they diverge, and whether they can be unified into a single path per AP-17 (two separate code paths for same feature = anti-pattern) and Decision 151 (single unified processing path).
**Output:** Single consolidated file at `docs/diagnostics/DIAG-044_SCI_IMPORT_PATH_UNIFICATION_OUTPUT.md`

## Standing rules (read first, every CC turn)

Read `CC_STANDING_ARCHITECTURE_RULES.md` in full. All rules apply.

Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". Just act. Execute every phase sequentially. Commit after each phase. Push after each commit.

## Phase 0 -- Repo orientation and output file scaffold

Confirm working directory is the VP repo root (`spm-platform`).

```bash
pwd
git checkout main
git pull origin main
git log --oneline -5
git rev-parse HEAD
```

Create the output file:

```bash
mkdir -p docs/diagnostics
```

Write the scaffold to `docs/diagnostics/DIAG-044_SCI_IMPORT_PATH_UNIFICATION_OUTPUT.md`:

```markdown
# DIAG-044 -- SCI Import Path Unification Analysis Output

**Date:** [CC inserts]
**Branch:** main
**HEAD commit:** [CC inserts]
**Scope:** Two SCI import execution paths -- inventory, divergence analysis, unification assessment

CC pastes verbatim code at every section. No interpretation. No PASS/FAIL. No design proposals.
```

```bash
git checkout -b diag-044-sci-import-path-unification
git add docs/diagnostics/DIAG-044_SCI_IMPORT_PATH_UNIFICATION_OUTPUT.md
git commit -m "DIAG-044 Phase 0: output file scaffold"
git push origin diag-044-sci-import-path-unification
```

Paste `git log -1 --oneline` verbatim.

## Phase 1 -- File inventory and entry points

### 1.1 Locate both routes

```bash
find web/src/app/api/import -name "route.ts" -type f
```

### 1.2 Measure each file

```bash
wc -l web/src/app/api/import/sci/execute/route.ts
wc -l web/src/app/api/import/sci/execute-bulk/route.ts
```

### 1.3 Identify all import-related routes

```bash
find web/src/app/api/import -name "route.ts" -type f | sort
```

List every import route file with line count. Append under `## Phase 1 -- File inventory`.

### 1.4 Identify which route the UI calls

```bash
grep -rn "import/sci/execute\|import/sci/execute-bulk" web/src/app/ web/src/components/ web/src/lib/ --include="*.ts" --include="*.tsx" | grep -v "route.ts" | grep -v node_modules
```

This shows which UI components or API callers invoke each path. Append verbatim under `## Phase 1.4 -- UI callers`.

```bash
git add docs/diagnostics/DIAG-044_SCI_IMPORT_PATH_UNIFICATION_OUTPUT.md
git commit -m "DIAG-044 Phase 1: file inventory and entry points"
git push origin diag-044-sci-import-path-unification
```

## Phase 2 -- Non-bulk path functional anatomy

Read the non-bulk SCI execute route in full. This is the path that retains OB-160G convergence.

### 2.1 Full file structure

```bash
grep -n "export\|function\|async\|converge\|Convergence\|pipeline\|commit\|import\|addLog\|Phase\|OB-\|HF-\|CLT-" web/src/app/api/import/sci/execute/route.ts | head -80
```

### 2.2 Convergence call site

```bash
grep -n -B5 -A15 "converge\|Convergence\|convergeBindings" web/src/app/api/import/sci/execute/route.ts
```

Paste verbatim. This is the OB-160G wiring that needs to be identified for removal.

### 2.3 Post-pipeline operations

```bash
grep -n "Entity Resolution\|PostCommitConstruction\|rule_set_assignments\|HF-126\|convergence\|signal" web/src/app/api/import/sci/execute/route.ts
```

Identify everything that runs after the main import pipeline completes. Append verbatim.

### 2.4 Full function list

```bash
grep -n "^async function\|^function\|^export async function\|^export function" web/src/app/api/import/sci/execute/route.ts
```

Append verbatim under `## Phase 2 -- Non-bulk path anatomy`.

```bash
git add docs/diagnostics/DIAG-044_SCI_IMPORT_PATH_UNIFICATION_OUTPUT.md
git commit -m "DIAG-044 Phase 2: non-bulk path anatomy"
git push origin diag-044-sci-import-path-unification
```

## Phase 3 -- Bulk path functional anatomy

Same analysis for the bulk path.

### 3.1 Full file structure

```bash
grep -n "export\|function\|async\|converge\|Convergence\|pipeline\|commit\|import\|addLog\|Phase\|OB-\|HF-\|CLT-" web/src/app/api/import/sci/execute-bulk/route.ts | head -80
```

### 3.2 Convergence presence check

```bash
grep -n "converge\|Convergence\|convergeBindings" web/src/app/api/import/sci/execute-bulk/route.ts
```

Expected: zero hits (OB-182 removed convergence). Paste verbatim to confirm.

### 3.3 Post-pipeline operations

```bash
grep -n "Entity Resolution\|PostCommitConstruction\|rule_set_assignments\|HF-126\|convergence\|signal" web/src/app/api/import/sci/execute-bulk/route.ts
```

### 3.4 Full function list

```bash
grep -n "^async function\|^function\|^export async function\|^export function" web/src/app/api/import/sci/execute-bulk/route.ts
```

Append verbatim under `## Phase 3 -- Bulk path anatomy`.

```bash
git add docs/diagnostics/DIAG-044_SCI_IMPORT_PATH_UNIFICATION_OUTPUT.md
git commit -m "DIAG-044 Phase 3: bulk path anatomy"
git push origin diag-044-sci-import-path-unification
```

## Phase 4 -- Divergence analysis

### 4.1 Shared imports

```bash
head -50 web/src/app/api/import/sci/execute/route.ts > /tmp/diag044-nonbulk-head.txt
head -50 web/src/app/api/import/sci/execute-bulk/route.ts > /tmp/diag044-bulk-head.txt
diff /tmp/diag044-nonbulk-head.txt /tmp/diag044-bulk-head.txt
```

### 4.2 Shared function calls

Identify functions called by both paths:

```bash
grep -ohE "[a-zA-Z]+\(" web/src/app/api/import/sci/execute/route.ts | sort -u > /tmp/diag044-nonbulk-fns.txt
grep -ohE "[a-zA-Z]+\(" web/src/app/api/import/sci/execute-bulk/route.ts | sort -u > /tmp/diag044-bulk-fns.txt
comm -12 /tmp/diag044-nonbulk-fns.txt /tmp/diag044-bulk-fns.txt
comm -23 /tmp/diag044-nonbulk-fns.txt /tmp/diag044-bulk-fns.txt
comm -13 /tmp/diag044-nonbulk-fns.txt /tmp/diag044-bulk-fns.txt
```

Three outputs: shared functions, non-bulk-only functions, bulk-only functions. Append all three under `## Phase 4.2 -- Function divergence`.

### 4.3 POST handler shape comparison

Read the main POST handler from each file:

```bash
grep -n "export async function POST\|export const POST" web/src/app/api/import/sci/execute/route.ts
grep -n "export async function POST\|export const POST" web/src/app/api/import/sci/execute-bulk/route.ts
```

For each, read the first 100 lines of the POST handler to understand the request shape and pipeline sequence:

Non-bulk:
```bash
sed -n '<POST_start>,<POST_start+100>p' web/src/app/api/import/sci/execute/route.ts
```

Bulk:
```bash
sed -n '<POST_start>,<POST_start+100>p' web/src/app/api/import/sci/execute-bulk/route.ts
```

Append verbatim under `## Phase 4.3 -- POST handler comparison`.

### 4.4 Other import routes

For each additional import route found in Phase 1.3 (e.g., `/api/import/commit/route.ts`, `/api/import/analyze/route.ts`), run:

```bash
grep -n "converge\|Convergence\|convergeBindings" <path>
```

Identify whether convergence exists in any other import path. Append verbatim under `## Phase 4.4 -- Convergence in other import routes`.

```bash
git add docs/diagnostics/DIAG-044_SCI_IMPORT_PATH_UNIFICATION_OUTPUT.md
git commit -m "DIAG-044 Phase 4: divergence analysis"
git push origin diag-044-sci-import-path-unification
```

## Phase 5 -- Calculation-time convergence path

### 5.1 Locate the HF-165 calc-time convergence trigger

```bash
grep -n -B5 -A15 "HF-165\|converge\|Convergence\|convergeBindings" web/src/app/api/calculation/run/route.ts | head -60
```

This is the path where convergence SHOULD run (at calculation time, when both plan and data are present). Append verbatim under `## Phase 5.1 -- Calc-time convergence`.

### 5.2 What triggers calc-time convergence

```bash
grep -n "input_bindings.*empty\|hasConvergenceBindings\|isEmpty\|convergence_bindings" web/src/app/api/calculation/run/route.ts | head -20
```

Append verbatim under `## Phase 5.2 -- Calc-time convergence trigger condition`.

```bash
git add docs/diagnostics/DIAG-044_SCI_IMPORT_PATH_UNIFICATION_OUTPUT.md
git commit -m "DIAG-044 Phase 5: calc-time convergence path"
git push origin diag-044-sci-import-path-unification
```

## Phase 6 -- Completion

Append to the output file:

```markdown
## Phase 6 -- DIAG-044 Complete

All five phases executed. Output file contains verbatim current-codebase extractions for:
- File inventory of all import routes with line counts
- UI callers identifying which path the browser invokes
- Non-bulk path full anatomy including OB-160G convergence call site
- Bulk path full anatomy confirming convergence absence
- Divergence analysis (shared vs path-specific functions, POST handler shapes)
- Convergence presence in all other import routes
- Calc-time convergence path (HF-165 trigger)

CC does not interpret findings. Architect dispositions in architect channel.
```

```bash
git add docs/diagnostics/DIAG-044_SCI_IMPORT_PATH_UNIFICATION_OUTPUT.md
git commit -m "DIAG-044 Phase 6: complete"
git push origin diag-044-sci-import-path-unification
```

Paste `git log -6 --oneline` verbatim (all six DIAG-044 commits should appear).

Create the PR:

```bash
gh pr create --base main --head diag-044-sci-import-path-unification \
  --title "DIAG-044: SCI import path unification analysis" \
  --body "Read-only diagnostic. Surfaces the two SCI import execution paths (non-bulk and bulk), documents functional anatomy of each, identifies divergence points, and maps the calc-time convergence path. No code changes."
```

Paste the PR URL verbatim.

Kill dev server. `rm -rf .next`. `npm run build`. `npm run dev`. Confirm localhost:3000.

End of diagnostic.
