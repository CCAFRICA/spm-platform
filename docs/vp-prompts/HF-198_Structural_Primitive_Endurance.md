# HF-198 — Structural Primitive Endurance: Vertical Slice Implementation

**Sequence:** HF-198 (next available — HF-196 closed PR #359, HF-197B merged PR #360)
**Type:** Hotfix — Vertical Slice (engine + experience evolve together; one PR)
**Substrate:** `AUD_004_Remediation_Design_Document_v3_20260427.md` (LOCKED 2026-04-27)
**Objective (locked):** *"If a new structural primitive appears, the platform still works."* AUD_004 v3 §1 verbatim problem.
**Repo:** `CCAFRICA/spm-platform` (working dir: `~/spm-platform`)
**Branch:** `hf-198-structural-primitive-endurance` from `main` HEAD
**Final step:** `gh pr create --base main --head hf-198-structural-primitive-endurance`

---

## AUTONOMY DIRECTIVE

NEVER ask yes/no. NEVER say "shall I". Just act. (Standing Rule 10)

Proceed through phases continuously without architect re-confirmation EXCEPT at named CRITICAL HALT conditions. Otherwise execute.

---

## CRITICAL HALT CONDITIONS

If any of the following occur, HALT immediately, output the condition verbatim to architect-channel, and await disposition:

1. AUD_004 v3 not retrievable from project knowledge or `docs/`
2. Audit findings F-001 through F-012 not locatable in repo
3. Code paths AUD_004 v3 §2 names not present at expected file paths
4. Build failure (suggests environment issue, not HF-198 issue)
5. Lint failure introduced by HF-198 (pre-existing OK)
6. Test failure introduced by HF-198
7. Schema discovery diverges from FP-49 verification
8. Mid-phase scope-was-wrong discovery
9. New table or schema migration becomes required (Decision 64 v2 guard — architect dispositions whether migration is acceptable or refactor needed)
10. New signal_type required that doesn't fit registry-driven schema
11. Reconciliation gate failure on any of the three proof tenants
12. Substrate-introduction-detected (drift from registry-mediated dispatch)

---

## STANDING RULES (Section A — Design Principles, NON-NEGOTIABLE)

Per `CC_STANDING_ARCHITECTURE_RULES.md` v2.0:

1. **AI-First, Never Hardcoded.** No hardcoded field names, column patterns, language-specific strings. AI semantic inference; downstream code reads mappings.
2. **Scale by Design, Not Retrofit.** Every decision works at 10x current volume. File Storage → Server Processing → Database. Bulk operations.
3. **Fix Logic, Not Data.** Never provide answer values. Systems derive correct results.
4. **Be the Thermostat, Not the Thermometer.** Act on data; don't just display.
5. **Closed-Loop Learning.** Platform activity generates training signals.
6. **Security, Scale, Performance by Design.** Designed in from the start.
7. **Prove, Don't Describe.** Evidence not claims. LIVE, RENDERED, RUNNING state.
8. **Domain-Agnostic Always.** Works across any domain.
9. **IAP Gate.** Every UI measure scores on Intelligence/Acceleration/Performance.

---

## SECTION B — ARCHITECTURE DECISION GATE (MANDATORY)

**This phase MUST complete and commit BEFORE Phase α implementation.**

### PHASE ADR — Architecture Decision Record

Author and commit `docs/architecture-decisions/HF-198_ADR.md`:

```
ARCHITECTURE DECISION RECORD — HF-198
============================
Problem: AUD_004 v3 §1 verbatim — "If a new structural primitive appears,
would the platform still work? The answer today is no." Six audit findings
(F-001/F-005/F-007/F-008 closed by E1+E4; F-002 cascade closed by E2; F-003
closed by E2; F-004 closed by E2; F-006 closed by E3+E5; F-009 closed by E2;
F-011 closed by E3) document mechanism. AUD_004 v3 LOCKED 2026-04-27 specifies
six extensions E1-E6 and Decisions 154+155 as the closure design.

Option A: Single-PR vertical slice implementing all six extensions atomically
  per Decision 153 atomic cutover discipline.
  - Scale test: Works at 10x? YES — registry surface scales by entry; structured
    failure at boundaries scales by O(1) per dispatch
  - AI-first: Any hardcoding? NO — registry uses structural identifiers; Korean
    Test enforced at registration time
  - Transport: Data through HTTP bodies? NO — registry is in-process module;
    signal surface is database-backed
  - Atomicity: Clean state on failure? YES — registry registration is idempotent;
    structured failure at dispatch produces named errors, never silent partial state

Option B: Phased deliverables (Phase B inventory → Mechanism Spec → Vertical
  Slice) per AUD_004 v3 §9 successor sequence.
  - Scale test: Same answer (Option B and Option A produce identical operative code)
  - AI-first: Same answer
  - Transport: Same answer
  - Atomicity: Lower — phased PRs leave intermediate states; violates Decision 153
    atomic cutover discipline

Option C: Targeted closure of just Meridian-blocking findings (F-001, F-005, F-006).
  - Scale test: Works at 10x for closed findings, FAILS for unclosed findings —
    next tenant exposes F-002/3/4/9 paths
  - AI-first: Partial — registry surface only partially populated
  - Transport: Same as Option A
  - Atomicity: Violates SR-34 No Bypass — leaves known defects unclosed

CHOSEN: Option A because (a) AUD_004 v3 §1 problem closure requires all six
extensions operative — partial closures leave the verbatim problem ANSWER STILL
NO; (b) Decision 153 atomic cutover discipline mandates one PR no parallel paths;
(c) procedural theater minimization (architect direction) requires single
deliverable not three; (d) Vertical Slice Rule preserves engine + experience
co-evolution.

REJECTED: Option B because phased delivery violates Decision 153 + adds session
overhead without producing distinct verifiable substrate; AUD_004 v3 §9 phasing
exists for cognitive scaffolding when architect needed it pre-lock — post-lock
the spec IS the design.

REJECTED: Option C because targeted closure leaves known structural defects;
SR-34 No Bypass; closes Meridian without closing platform endurance objective.
```

Commit before Phase α:
```
$ git add docs/architecture-decisions/HF-198_ADR.md
$ git commit -m 'HF-198 ADR: Architecture Decision Record (Option A — single-PR vertical slice)'
```

---

## SCOPE

**In scope (E1 through E6 atomic implementation):**
- E1 + Decision 155 — primitive registry surface
- E2 — dispatch surface integrity (structured failure)
- E3 — read-before-derive structurally partitioned (signal-registry; L1/L2/L3 read coupling)
- E4 — round-trip closure (Carry Everything extension)
- E5 — plan-agent comprehension as L2 signal
- E6 — Korean Test extended to operation/primitive vocabulary (Decision 154)

**Findings closed:** F-001, F-002, F-002b, F-002c, F-002d, F-003, F-004, F-005, F-006, F-007, F-008, F-009, F-011

**Out of scope (carry-forward):**
- F-010 (LOW, out of structural scope per AUD_004 v3 §2)
- F-012 (positive control — reference pattern preserved)
- N4 comprehension dimension substrate (D1/D2/D3) — deferred per AUD_004 v3 §5
- IGF amendments T1-E910/T1-E902/T1-E906 — `vialuce-governance` separate workflow
- Format polymorphism (PDF/JSON/API ingestion) — forward
- Domain pack architecture — forward (foundation laid by Decision 155 federation)
- Self-correction cycle audit (DS-017 §4.3) — flagged carry-forward

---

## ANTI-PATTERN REGISTRY SWEEP (Section C — relevant APs)

Verify zero violations of:
- **AP-1** Send row data as JSON in HTTP bodies → File Storage transport
- **AP-5** Add field names to hardcoded dictionaries → AI semantic inference
- **AP-6** Pattern match on column names in specific languages → AI analyzes data values + context
- **AP-7** Hardcode confidence scores → Calculate real confidence
- **AP-8** Create migration without executing → Execute + verify with DB query
- **AP-9** Report PASS based on file existence → Verify RENDERED/LIVE state
- **AP-13** Assume column names match schema → Query information_schema (FP-49)

---

## EVIDENTIARY DISCIPLINE

Every proof gate criterion in the Completion Report requires PASTED EVIDENCE:
- Code evidence: actual code snippet (grep output, function signature)
- Build evidence: build exit code + relevant output
- Curl evidence: HTTP response code + body
- Korean Test evidence: grep command + output (showing zero hits)
- Script evidence: script output

Evidence does NOT mean "this was implemented" or "all labels from plan data" — those are descriptions/claims. Evidence = paste.

---

## PHASES

### PHASE 0 — Setup, Substrate Read, Schema Verify, Branch

0.1 Working directory + repo:
```
$ pwd
$ git remote -v
$ git status --short
$ git log --oneline origin/main -5
```
PASTE all output. If wrong repo or dirty tree, HALT.

0.2 Locate and read AUD_004 v3 (422 lines):
```
$ find . -name 'AUD_004*' 2>/dev/null
$ ls /mnt/project/ 2>/dev/null | grep -i aud_004
```
Read in full. Confirm Section 2 E1-E6 named code paths, Section 5 N1-N3 substrate items, Section 9 successor handoff scope.
PASTE: confirmation.

0.3 Locate AUD-004 Phase 0 inventory + Phase 0G gap closure:
```
$ find . -name 'AUD_004_Phase_0*' 2>/dev/null
```
PASTE: file list (or explicit absence).

0.4 Locate audit findings F-001 through F-012:
```
$ grep -rln 'F-001\|F-002\|F-003\|F-004\|F-005\|F-006\|F-007\|F-008\|F-009\|F-011' docs/ 2>/dev/null | head -20
```
PASTE: file list. Read each finding's evidence section.

0.5 Confirm AUD_004 v3 §2 named code paths exist:
```
$ ls -la web/src/lib/calculation/intent-types.ts
$ ls -la web/src/lib/ai/providers/anthropic-adapter.ts
$ ls -la web/src/lib/compensation/ai-plan-interpreter.ts
$ ls -la web/src/lib/calculation/intent-executor.ts
$ ls -la web/src/lib/calculation/run-calculation.ts
$ ls -la web/src/lib/calculation/intent-transformer.ts
$ ls -la web/src/app/api/calculate/run/route.ts
$ ls -la web/src/lib/intelligence/convergence-service.ts
```
PASTE: file existence + line counts. If any absent, HALT.

0.6 Schema verification (FP-49 / AP-13 guard):
Author `web/scripts/diag-hf-198-schema-verify.ts`:
- Service-role client
- Query `information_schema.columns` for: `classification_signals`, `rule_sets`, `committed_data`, `structural_fingerprints`
- Print column inventory

```
$ cd web && npx tsx scripts/diag-hf-198-schema-verify.ts
```
PASTE: column inventory for all four tables.
If schema diverges from AUD_004 v3 expectations, HALT.
Delete script after pasting (FP-49 evidence captured; no commit).

0.7 Build clean baseline:
```
$ cd web && rm -rf .next && npm run build 2>&1 | tail -30
$ cd web && npm run lint 2>&1 | tail -20
```
PASTE: tails. Both must succeed (Section D Rule 2).

0.8 Create branch:
```
$ git checkout main
$ git pull origin main
$ git checkout -b hf-198-structural-primitive-endurance
$ git rev-parse HEAD
$ git rev-parse main
```
PASTE: confirmation. Branch HEAD === main HEAD.

0.9 Commit this prompt to git per Rule 14:
Save this directive document as `vp-prompts/HF-198_Structural_Primitive_Endurance.md` in repo root if not already there.
```
$ ls vp-prompts/HF-198* 2>/dev/null
$ git add vp-prompts/HF-198_Structural_Primitive_Endurance.md
$ git commit -m 'HF-198 0.9: prompt committed to git (Rule 14)'
```

### PHASE ADR — Architecture Decision Record (Section B mandate)

ADR.1 Author `docs/architecture-decisions/HF-198_ADR.md` with Architecture Decision Record content from Section B above (verbatim).

ADR.2 Commit BEFORE proceeding to implementation:
```
$ git add docs/architecture-decisions/HF-198_ADR.md
$ git commit -m 'HF-198 ADR: Architecture Decision Record (Option A — single-PR vertical slice)'
```

DO NOT proceed to Phase α until this is committed.

### PHASE α — E1 + Decision 155: Primitive Registry Surface

α.1 Author `web/src/lib/calculation/primitive-registry.ts`:

Module exports:
- `PrimitiveDeclaration` interface: `{ identifier, domain, structural_shape, declared_writers, declared_readers, validation_predicate }`
- `register(declaration: PrimitiveDeclaration): void`
- `lookup(identifier: string): PrimitiveDeclaration | null`
- `all(domain?: string): PrimitiveDeclaration[]`
- `validate(identifier: string, payload: unknown): ValidationResult`
- `PrimitiveNotRegisteredError` (named structured error per E2)

Korean Test enforcement (Decision 154 + AP-25):
- `register()` validates identifier is structurally well-formed; not language-specific lexicon
- `lookup()` returns null on unknown; never throws
- `validate()` compares payload against `structural_shape`; never matches payload field names against language-specific lexicon

Federation per Decision 155:
- Declarations carry `domain` field (`'foundational' | 'icm' | <future>`)
- Registry surface domain-agnostic; domain agents own their domain entries

α.2 Identify operation primitive vocabulary:
```
$ grep -nE 'type|interface|union' web/src/lib/calculation/intent-types.ts | head -40
```
PASTE matches.

For each operation primitive observed verbatim in `intent-types.ts`, register declaration with:
- `identifier`: structural tag (verbatim from intent-types.ts)
- `domain`: `'foundational'`
- `structural_shape`: TypeScript type from intent-types.ts
- `declared_writers`: `['ai-plan-interpreter']`
- `declared_readers`: `['intent-executor', 'run-calculation']`
- `validation_predicate`: type guard from intent-types.ts

α.3 Wire `intent-types.ts` to derive from registry:
- Replace literal type unions with registry-derived type unions
- Literal vocabulary moves out of `intent-types.ts`
- `intent-types.ts` becomes structural-shape definition consumer of registry

α.4 Build verify:
```
$ cd web && rm -rf .next && npm run build 2>&1 | tail -30
$ cd web && npm run lint 2>&1 | tail -20
```
PASTE: tails. Must succeed.

α.5 Commit:
```
$ git add web/src/lib/calculation/primitive-registry.ts web/src/lib/calculation/intent-types.ts
$ git commit -m 'HF-198 α: E1+D155 primitive registry surface (foundational declarations)'
```

### PHASE β — E2: Dispatch Surface Integrity (Structured Failure)

β.1 Refactor `intent-executor.ts:438-450` (F-002 cascade origin):
```
$ sed -n '430,460p' web/src/lib/calculation/intent-executor.ts
```
Before: switch with default returning silent fallback.
After: switch derived from registry; default throws `PrimitiveNotRegisteredError` with rich context (`operation_type`, `calling_function`, `available_primitives`).

β.2 Refactor `resolveSource` lines 61-140 (F-002b):
```
$ sed -n '55,145p' web/src/lib/calculation/intent-executor.ts
```
Before: silent `?? 0` on unresolvable source.
After: throws `SourceResolutionError` (named structured); upstream catch determines disposition.

β.3 Refactor `noMatchBehavior` switch lines 591-603 (F-002c, F-002d):
```
$ sed -n '585,610p' web/src/lib/calculation/intent-executor.ts
```
Registry-validated; structured failure on unrecognized.

β.4 Refactor `run-calculation.ts:362-408` (F-003):
```
$ sed -n '355,415p' web/src/lib/calculation/run-calculation.ts
```
Per Decision 153 atomic cutover, legacy switch DELETED; route to `intent-executor.ts` only. Per Decision 151 intent executor sole authority. Migrate any legacy consumers in same commit.

β.5 Refactor `convertComponent` default lines 681-708 (F-004):
```
$ sed -n '675,715p' web/src/lib/compensation/ai-plan-interpreter.ts
```
Throws `UnconvertibleComponentError` (named structured).

β.6 Outer try/catch at `calculate/run/route.ts:61` (F-002 outer):
```
$ sed -n '55,80p' web/src/app/api/calculate/run/route.ts
```
Wrap POST handler. Catch path: structured error log with primitives encountered; structured 500 with named error type; never silent partial completion.

β.7 Build + lint:
```
$ cd web && rm -rf .next && npm run build 2>&1 | tail -30
$ cd web && npm run lint 2>&1 | tail -20
```
PASTE: tails. Must succeed.

β.8 Commit:
```
$ git add -A
$ git commit -m 'HF-198 β: E2 dispatch surface integrity (F-002+F-003+F-004+F-009 closed)'
```

### PHASE γ — E3: Read-Before-Derive Structurally Partitioned

γ.1 Extend primitive registry to include signal_type as registrable primitive class. Each signal_type declaration:
- `identifier` (e.g., `'metric_comprehension'`, `'tier_matrix'`, `'binding_evaluation'`)
- `signal_level`: `'L1' | 'L2' | 'L3'`
- `originating_flywheel`: `'tenant' | 'foundational' | 'domain'`
- `declared_writers`: `string[]`
- `declared_readers`: `string[]`
- Validation at registration: ≥1 reader matches `signal_level` rules:
  - L1: at least one reader within originating flywheel
  - L2: readers within originating flywheel AND cross-flywheel
  - L3: readers across all three flywheels

Implementation: extend `primitive-registry.ts` OR new module `web/src/lib/intelligence/signal-registry.ts` composing with primitive-registry.

γ.2 Inventory existing signal_types:
```
$ grep -rnE "signal_type:\s*'[^']+'" web/src/ --include='*.ts' | head -30
```
PASTE matches. For each, register declaration. Verify reader exists per signal_level rules. If reader absent, HALT — surfaces F-006/F-011 finding scope requiring architect disposition.

γ.3 Refactor `convergence-service.ts`:
```
$ wc -l web/src/lib/intelligence/convergence-service.ts
$ grep -nE 'persistSignal|signal_type|writeSignal' web/src/lib/intelligence/convergence-service.ts | head -20
```
Each signal write validates against signal-registry before persist; throws `SignalNotRegisteredError` on unknown.

γ.4 Refactor `calculate/run/route.ts:1840-1862` (`training:dual_path_concordance` — F-011):
```
$ sed -n '1835,1870p' web/src/app/api/calculate/run/route.ts
```
Per E3: declared reader required. Either register reader or remove write.

γ.5 Build + lint:
```
$ cd web && rm -rf .next && npm run build 2>&1 | tail -30
$ cd web && npm run lint 2>&1 | tail -20
```
PASTE: tails.

γ.6 Commit:
```
$ git add -A
$ git commit -m 'HF-198 γ: E3 read-before-derive structurally partitioned (F-006+F-011 closed)'
```

### PHASE δ — E4: Round-Trip Closure

δ.1 Refactor `convertComponent` 5-tuple lines 667-679:
```
$ sed -n '660,690p' web/src/lib/compensation/ai-plan-interpreter.ts
```
Validate against registry at emission. Throw on unregistered (architect-channel signal that registry needs new entry — NOT silent acceptance).

δ.2 Refactor `transformFromMetadata`:
```
$ wc -l web/src/lib/calculation/intent-transformer.ts
$ grep -nE 'transformFromMetadata|metadata\.intent' web/src/lib/calculation/intent-transformer.ts | head -10
```
Validate `metadata.intent` shape against registry on read. Throw on unrecognized. Match emission shape (δ.1) consumption shape (here) by structural contract.

δ.3 In-memory verification probe (Korean-Test-clean):
Author `web/scripts/diag-hf-198-roundtrip-verify.ts`:
- Construct synthetic primitive (registered in registry)
- Pass through emit → `metadata.intent` → `transformFromMetadata` → executor input
- Assert no identifier loss; structural shape preserved
- Use generic synthetic identifier (`'test_primitive_alpha'`); no domain or language specific

```
$ cd web && npx tsx scripts/diag-hf-198-roundtrip-verify.ts
```
PASTE: probe output. All assertions PASS.

Commit script (regression infrastructure).

δ.4 Build + lint:
```
$ cd web && rm -rf .next && npm run build 2>&1 | tail -30
$ cd web && npm run lint 2>&1 | tail -20
```
PASTE: tails.

δ.5 Commit:
```
$ git add -A
$ git commit -m 'HF-198 δ: E4 round-trip closure (F-001+F-008 closed; verification probe)'
```

### PHASE ε — E5: Plan-Agent Comprehension as L2 Signal

ε.1 Plan-agent prompt comprehension emission:
```
$ grep -nE 'plan|interpret|comprehension' web/src/lib/ai/providers/anthropic-adapter.ts | head -20
```
At plan-agent prompt construction surface, emit `metric_comprehension` signal per metric:
- `signal_type: 'metric_comprehension'`
- `signal_level: 'L2'`
- `signal_data: { metric_label, metric_op, metric_inputs, semantic_intent, source_evidence }`

Signal_type registered in Phase γ.

ε.2 Convergence reads `metric_comprehension` before AI derivation:
```
$ grep -nE 'Pass 4|deriveSemantic|aiDerive' web/src/lib/intelligence/convergence-service.ts | head -10
```
Pass 4 reads `metric_comprehension` signals for active rule_set BEFORE constructing AI prompt for column-to-metric mapping. AI prompt includes signal data as authoritative semantic intent. AI prompt output validates against registered metrics — no hallucinated metric names accepted; structured failure on unregistered.

ε.3 Build + lint:
```
$ cd web && rm -rf .next && npm run build 2>&1 | tail -30
$ cd web && npm run lint 2>&1 | tail -20
```
PASTE: tails.

ε.4 Commit:
```
$ git add -A
$ git commit -m 'HF-198 ε: E5 plan-agent comprehension as L2 signal (F-006 architectural closure)'
```

### PHASE ζ — Reconciliation Gate Test (Decision 95)

CC reports calculated values verbatim. NO comparison to GT values. NO PASS/FAIL assertion. Architect reconciles in architect channel.

ζ.1 Deploy locally per Section D Rule 2:
```
$ cd web && rm -rf .next && npm run build 2>&1 | tail -10
$ cd web && npm run dev 2>&1 &
```
Wait for localhost:3000 response. PASTE: confirmation localhost responding 200.

ζ.2 Reconciliation execution against three tenants present in substrate. For BCL (`b1c2d3e4-aaaa-bbbb-cccc-111111111111`) and Meridian (`5035b1e8-0754-4527-b7ec-9f93f85e4c79`) and CRP (architect-provided tenant_id if needed for query):

For each tenant with active rule_set + period(s):
```
$ curl -X POST http://localhost:3000/api/calculate/run \
    -H 'Content-Type: application/json' \
    -d '{"tenant_id":"<id>","rule_set_id":"<id>","period_id":"<id>"}'
```
OR equivalent invocation per existing test pattern.

For each tenant, PASTE:
- HTTP response status
- `calculation_results` aggregate (grand total, per-component subtotals, entity count)
- Local console logs from convergence + executor traces

DO NOT compare to GT. DO NOT assert pass/fail. Architect reconciles.

ζ.3 If any tenant's calculation throws structured error from registry/dispatch surfaces (Phases α-ε), document error verbatim in Phase ζ output. Architect determines whether structured failure is expected (registry surface exposing missing primitive) or unexpected (regression).

### PHASE η — Completion Report (Rule 25 — FIRST DELIVERABLE BEFORE FINAL BUILD)

η.1 Author `docs/completion-reports/HF-198_Structural_Primitive_Endurance_COMPLETION_REPORT.md` with VERBATIM Rule 26 mandatory structure:

```markdown
# HF-198 COMPLETION REPORT
## Date
2026-05-04

## Execution Time
<start time> – <end time>

## COMMITS (in order)
| Hash | Phase | Description |
|---|---|---|
| <SHA> | 0.9 | HF-198 0.9: prompt committed to git (Rule 14) |
| <SHA> | ADR | HF-198 ADR: Architecture Decision Record (Option A) |
| <SHA> | α | HF-198 α: E1+D155 primitive registry surface |
| <SHA> | β | HF-198 β: E2 dispatch surface integrity |
| <SHA> | γ | HF-198 γ: E3 read-before-derive structurally partitioned |
| <SHA> | δ | HF-198 δ: E4 round-trip closure + verification probe |
| <SHA> | ε | HF-198 ε: E5 plan-agent comprehension as L2 signal |
| <SHA> | ζ | HF-198 ζ: reconciliation gate test (architect reconciles) |
| <SHA> | η | HF-198 η: completion report (Rule 25 first-deliverable) |
| <SHA> | FINAL_BUILD | HF-198 final build verification appended |

## FILES CREATED
| File | Purpose |
|---|---|
| `vp-prompts/HF-198_Structural_Primitive_Endurance.md` | Directive prompt (Rule 14) |
| `docs/architecture-decisions/HF-198_ADR.md` | Architecture Decision Record (Section B) |
| `web/src/lib/calculation/primitive-registry.ts` | E1+D155 registry surface |
| `web/src/lib/intelligence/signal-registry.ts` | E3 signal-type registry (if separate module) |
| `web/scripts/diag-hf-198-roundtrip-verify.ts` | E4 in-memory verification probe |
| `docs/completion-reports/HF-198_Structural_Primitive_Endurance_COMPLETION_REPORT.md` | This report |

## FILES MODIFIED
| File | Change |
|---|---|
| `web/src/lib/calculation/intent-types.ts` | E1 derive types from registry |
| `web/src/lib/calculation/intent-executor.ts` | E2 structured failure at switch + resolveSource + noMatchBehavior |
| `web/src/lib/calculation/run-calculation.ts` | E2 legacy switch deleted (D153 atomic cutover) |
| `web/src/lib/compensation/ai-plan-interpreter.ts` | E2+E4 convertComponent registry validation + structured error |
| `web/src/lib/calculation/intent-transformer.ts` | E4 transformFromMetadata registry validation |
| `web/src/app/api/calculate/run/route.ts` | E2 outer try/catch + E3 training:dual_path_concordance reader |
| `web/src/lib/intelligence/convergence-service.ts` | E3 signal-registry-validated writes + E5 read-before-derive |
| `web/src/lib/ai/providers/anthropic-adapter.ts` | E5 metric_comprehension signal emission |

## PROOF GATES — HARD
| # | Criterion (VERBATIM from prompt) | PASS/FAIL | Evidence |
|---|---|---|---|
| 1 | Phase 0 schema verification: column inventory pasted for all four tables | PASS | <pasted column inventory> |
| 2 | Phase 0 build clean baseline: `npm run build` exits 0 | PASS | <pasted tail> |
| 3 | Phase 0 lint clean: `npm run lint` exits 0 | PASS | <pasted tail> |
| 4 | Phase 0 branch HEAD === main HEAD | PASS | <pasted git rev-parse> |
| 5 | Phase ADR: HF-198_ADR.md committed BEFORE Phase α | PASS | <pasted commit SHA + log> |
| 6 | Phase α: primitive-registry.ts authored with all required exports | PASS | <pasted grep showing exports> |
| 7 | Phase α: foundational primitives registered for every operation in intent-types.ts | PASS | <pasted registry population> |
| 8 | Phase α: build + lint pass | PASS | <pasted tails> |
| 9 | Phase β: every dispatch surface throws structured error on unrecognized primitive | PASS | <pasted code at each refactor site> |
| 10 | Phase β: legacy switch in run-calculation.ts DELETED per D153 | PASS | <pasted git diff showing deletion> |
| 11 | Phase β: outer try/catch at calculate/run/route.ts:61 | PASS | <pasted code> |
| 12 | Phase β: build + lint pass | PASS | <pasted tails> |
| 13 | Phase γ: signal-registry validates ≥1 reader per signal_type before write | PASS | <pasted validation code> |
| 14 | Phase γ: every existing signal_type registered with declared readers | PASS | <pasted registration evidence> |
| 15 | Phase γ: build + lint pass | PASS | <pasted tails> |
| 16 | Phase δ: in-memory probe assertions all PASS | PASS | <pasted probe output> |
| 17 | Phase δ: round-trip primitive identifier preserved | PASS | <pasted assertion output> |
| 18 | Phase δ: build + lint pass | PASS | <pasted tails> |
| 19 | Phase ε: anthropic-adapter emits metric_comprehension signal per metric | PASS | <pasted code at emission point> |
| 20 | Phase ε: convergence-service Pass 4 reads metric_comprehension before AI derivation | PASS | <pasted code at read point> |
| 21 | Phase ε: build + lint pass | PASS | <pasted tails> |
| 22 | Phase ζ: localhost:3000 responds 200 | PASS | <pasted curl> |
| 23 | Phase ζ: calc executes against three tenants; values pasted | PASS | <pasted aggregates and traces> |
| 24 | FINAL BUILD: `npm run build` exits 0 after all phases | <PASS or FAIL> | <pasted tail — APPENDED in Phase FINAL_BUILD> |
| 25 | FINAL LINT: `npm run lint` exits 0 after all phases | <PASS or FAIL> | <pasted tail — APPENDED in Phase FINAL_BUILD> |

## PROOF GATES — SOFT
| # | Criterion (VERBATIM from prompt) | PASS/FAIL | Evidence |
|---|---|---|---|
| S1 | Korean Test (AP-25 / Decision 154): grep for hardcoded operation literals at dispatch sites returns zero | PASS | <pasted grep output> |
| S2 | Anti-Pattern Registry: zero violations of AP-1, AP-5, AP-6, AP-7, AP-8, AP-9, AP-13 | PASS | <per-AP evidence> |
| S3 | Scale test: registry surface and signal-registry surface scale by O(1) entry-add | PASS | <reasoning + code citation> |
| S4 | F-001 through F-009 + F-011 closed by E1-E5 mappings | PASS | <per-finding evidence chain> |

## STANDING RULE COMPLIANCE
- Rule 1 (commit+push each phase): PASS — <commit count> commits across <phase count> phases
- Rule 2 (cache clear after commit): PASS — kill dev → rm -rf .next → npm run build → npm run dev confirmed at each phase
- Rule 6 (Supabase migrations live + verified): N/A — HF-198 has no migrations (Decision 64 v2 guard preserved)
- Rule 14 (prompt committed to git): PASS — vp-prompts/HF-198_Structural_Primitive_Endurance.md committed at 0.9
- Rule 25 (report before final build): PASS — this report committed before FINAL_BUILD phase
- Rule 26 (mandatory structure): PASS — sections in Rule 26 order
- Rule 27 (paste evidence): PASS — every gate has pasted evidence
- Rule 28 (commit per phase): PASS — <verify commit count matches phase count>
- Rule 29 (CC paste last): PASS — directive prompt has implementation directive as final block

## KNOWN ISSUES
- F-010 (LOW, out of structural scope per AUD_004 v3 §2): NOT CLOSED; carry-forward
- F-012 (positive control reference pattern): preserved unchanged
- N4 comprehension dimension substrate (D1/D2/D3): deferred per AUD_004 v3 §5
- IGF amendments T1-E910/T1-E902/T1-E906: vialuce-governance separate workflow; do not block this PR
- Format polymorphism, domain pack architecture: forward
- Self-correction cycle audit (DS-017 §4.3): flagged; possibly resolved by per-sheet signal coherence post HF-197B+HF-198; verify post-merge

## VERIFICATION SCRIPT OUTPUT

### Phase 0.6 Schema Verify
<paste verbatim script output>

### Phase δ.3 Round-Trip Verify
<paste verbatim probe output>

### Phase ζ.2 Reconciliation Gate
<paste verbatim aggregate per tenant>

### Phase FINAL_BUILD (appended)
<paste verbatim build + lint tails>
```

η.2 Commit completion report BEFORE final build per Rule 25:
```
$ git add docs/completion-reports/HF-198_Structural_Primitive_Endurance_COMPLETION_REPORT.md
$ git commit -m 'HF-198 η: completion report (Rule 25 first-deliverable, before final build)'
```

### PHASE FINAL_BUILD — Final Build Verification (appended to existing report)

FB.1 Final build verification:
```
$ cd web && rm -rf .next && npm run build 2>&1 | tail -30
$ cd web && npm run lint 2>&1 | tail -20
```

FB.2 APPEND tails to existing completion report under "VERIFICATION SCRIPT OUTPUT > Phase FINAL_BUILD" section. Update PROOF GATES — HARD rows 24+25 with PASS/FAIL.

FB.3 Commit final build evidence:
```
$ git add docs/completion-reports/HF-198_Structural_Primitive_Endurance_COMPLETION_REPORT.md
$ git commit -m 'HF-198 FINAL_BUILD: appended final build evidence to completion report'
```

### PHASE θ — Push + PR

θ.1 Push branch:
```
$ git push -u origin hf-198-structural-primitive-endurance
```

θ.2 Create PR per Section D Rule 3:
```
$ gh pr create --base main --head hf-198-structural-primitive-endurance \
    --title 'HF-198: Structural primitive endurance — registry + structured failure + round-trip + read-before-derive (AUD-004 v3 closure)' \
    --body "$(cat <<'BODY'
## Summary
Implements AUD-004 v3 §1 verbatim problem closure: "If a new structural primitive
appears, the platform still works." Six substrate extensions (E1-E6) operative.
Ten findings F-001-F-009 + F-011 closed. Decisions 154+155 operatively realized.

## Substrate citation
AUD_004_Remediation_Design_Document_v3_20260427.md (LOCKED 2026-04-27).
Six extensions E1-E6 LOCKED.
Decisions 154+155 LOCKED.
HF-196 PR #359 (platform restoration) and HF-197B PR #360 (per-sheet cache keying)
preserved.

## Scope (vertical slice — engine + experience)
- Phase α — E1+D155: primitive registry surface (foundational declarations)
- Phase β — E2: dispatch surface integrity (structured failure, F-002/3/4/9)
- Phase γ — E3: read-before-derive structurally partitioned (F-006/11)
- Phase δ — E4: round-trip closure (F-001/8) + in-memory verification probe
- Phase ε — E5: plan-agent comprehension as L2 signal
- Phase ζ — reconciliation gate test (architect reconciles in architect channel)

## Out of scope (carry-forward)
- F-010 (LOW out of structural scope)
- N4 comprehension dimension substrate (deferred per AUD_004 v3 §5)
- IGF amendments T1-E910/T1-E902/T1-E906 (vialuce-governance separate workflow)
- Format polymorphism, domain pack architecture (forward)

## Architect actions
- Browser verification per completion report Section H
- Reconciliation: CRP / BCL / Meridian (architect-channel against test fixtures)
- Production sign-off
- Merge

## Compliance
Rules 1-29 observed (verbatim per CC_STANDING_ARCHITECTURE_RULES.md v2.0 +
COMPLETION_REPORT_ENFORCEMENT.md). Decisions 64v2/92/122/127/147A/151/152/153/154/155
preserved. HF-094/095/110/145/186/196/197B chain preserved. Korean Test extended
per Decision 154. SR-34/SR-39/SR-44 observed. FP-49/FP-80/FP-81 guards.
Premature Numbering Avoidance + Procedural Theater Minimization disciplines
honored.
BODY
)"
```
PASTE: PR URL.

θ.3 STOP. Output verbatim to architect:
```
HF-198 implementation complete. PR: <URL>.
Reconciliation evidence pasted in completion report Section "VERIFICATION SCRIPT OUTPUT".
Awaiting architect:
(1) Browser reconciliation against three proof tenants (CRP/BCL/Meridian)
(2) Production sign-off
(3) PR merge
AUD-004 v3 §1 verbatim problem closure pending architect verification.
```

---

## SECTION F — QUICK CHECKLIST (per Standing Rules; verify before submitting completion report)

```
Before submitting completion report, verify:
☐ Architecture Decision committed before implementation? (Phase ADR)
☐ Anti-Pattern Registry checked — zero violations? (Section C sweep)
☐ Scale test: works for 10x current volume? (Soft Gate S3)
☐ AI-first: zero hardcoded field names/patterns added? (Korean Test, Soft Gate S1)
☐ All Supabase migrations executed AND verified with DB query? (N/A — no migrations)
☐ Proof gates verify LIVE/RENDERED state, not file existence? (Hard Gates 22-25)
☐ Browser console clean on localhost? (Phase ζ)
☐ Real data displayed, no placeholders? (Phase ζ aggregates)
☐ Single code path (no duplicate pipelines)? (Phase β.4 legacy switch deleted per D153)
☐ Atomic operations (clean state on failure)? (E2 structured failure)
```

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `docs/completion-reports/HF-198_Structural_Primitive_Endurance_COMPLETION_REPORT.md`
- Created BEFORE final build verification (Phase η before Phase FINAL_BUILD)
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE regardless of how many phases executed successfully.

---

## OUT OF SCOPE FOR HF-198 (do not touch)

- F-010 (LOW, out of structural scope per AUD_004 v3 §2)
- F-012 (positive control — reference pattern preserved)
- N4 comprehension dimension substrate (deferred per AUD_004 v3 §5)
- IGF amendments T1-E910/T1-E902/T1-E906 (vialuce-governance separate)
- Schema migrations (Decision 64 v2 guard — HALT if required)
- HC primacy chain code (preserved unchanged)
- Resolver chain code (preserved unchanged)
- Fingerprint flywheel code (preserved unchanged; HF-197B fix preserved)
- Format polymorphism (forward)
- Domain pack architecture (forward; foundation laid by D155 federation)

These remain open carry-forward.

---

## REPORTING DISCIPLINE

- Every PASS claim has pasted evidence (FP-80 + Rule 27)
- Completion report file exists BEFORE final PR push (Rule 25)
- Reconciliation evidence pasted RAW; CC does not assert PASS/FAIL (Reconciliation-Channel Separation)
- No GT values in CC artifacts (Reconciliation-Channel Separation discipline)
- HALT at twelve named conditions; otherwise CONTINUOUS
- F-NNN findings referenced verbatim (Premature Numbering Avoidance — no inventing HF/OB numbers)

---

END OF DIRECTIVE.
