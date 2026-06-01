# SESSION HANDOFF — 2026-05-28
# BCL October Reconciliation: Inspection-First Disposition

**Session start:** 2026-05-28
**Session end:** 2026-05-28
**Repos touched:** `CCAFRICA/spm-platform` (VP main HEAD `327d3da4`)
**Decisions locked this session:** none
**Decisions to draft next session:** disposition of inspection findings (hypothesis branches a/b/c/d)

---

## SECTION -1 — CRITICAL PATH TO OBJECTIVE

### -1.1 What we are building

vialuce is a B2B Incentive Compensation Management (ICM) and Sales Performance Management (SPM) platform whose architectural distinguishing feature is **AI as infrastructure, not features**. The product accepts any compensation plan in any format, any compensation component at any scale, and computes correct entity-period payouts. The platform reads plan documents (XLSX, PDF, prose) and entity data, interprets the structure via LLM recognition, constructs deterministic calculation trees via code (Decision 158), converges plan references to data columns, and produces auditable, reconciled payouts. The grammar of nine compositional primes is canonical vocabulary on both sides of the LLM/code construction boundary.

### -1.2 Why it matters

Enterprise commission administration is brittle, manual, and trust-eroding. Plans encoded in spreadsheets break under scale; calculations are opaque; reps and managers lose confidence when payouts cannot be explained. The product centralizes complex compensation rules, automates calculation, handles clawbacks/reversals/retroactive adjustments natively, and exposes a fully auditable trail per transaction. The economic problem: large sales organizations spend material engineering and finance cycles maintaining commission spreadsheets and resolving disputes, with measurable losses in seller productivity and management trust. The product replaces that with a platform that interprets plans declaratively and recomputes deterministically.

### -1.3 Current commercial gate

User-Ready exit criteria. Test users within 2 weeks focused on Tenant Proof and Calculation Performance. First customer demos within 4 weeks using BCL, Meridian, and CRP Proof Tenants. The proximate milestone is **BCL October reconciliation to GT $44,590 under the Decision 158 construction architecture**, which proves the architectural pivot's end-to-end correctness on the canonical proof tenant. Subsequent milestones extend to full 6-period BCL ($312,033), then CRP Plans 2+4, then Meridian regression, then formal deprecation of the emission-pathway scaffolding.

### -1.4 Binding constraint

**BCL October calculates $36,190 vs GT $44,590, with the entire $8,400 delta isolated to one of eight per-variant CompositionalIntent emissions: the Ejecutivo variant's Captación de Depósitos.** All 72 Ejecutivo entities receive $0 for that component when they should collectively receive $8,400. Three of four components reconcile dollar-exact (Colocación $17,990, Productos Cruzados $8,480, Cumplimiento $7,950). The Senior variant of Captación reconciles dollar-exact ($1,770). The Ejecutivo Captación intent referenced `depositos_actuales` (which convergence bound to `Pct_Meta_Depositos`, an already-computed percentage) and `meta_depositos` (an absolute target) in a composition that produces a near-zero attainment ratio for every entity, falling below the lowest band and paying $0.

The binding constraint is not "fix the LLM" or "fix convergence" or "fix the constructor" yet. **The binding constraint is information: we do not yet know whether the LLM had unit/dimensional information available and ignored it, or whether comprehension never propagated that information forward.** Until inspection of two persisted JSONB artifacts establishes which branch is operative, any architectural reasoning is speculation.

### -1.5 Frame of reference for next session

Every action filters through one question: *does this advance from inspection to disposition to a narrow, focused fix that closes BCL October reconciliation?*

The session must NOT:
- Draft an HF before inspection completes
- Invoke IRA Class A before inspection establishes which branch is operative (procedural theater per the 2026-05-28 architect-named pattern)
- Propose architectural changes to convergence (proven anchor across three reconciliations: BCL $312,033, Meridian MX$185,063, CRP $364,457.84 — DO NOT MODIFY)
- Expand scope to address the 54 deferred scale_annotation warnings, CRP Plans 2+4, Meridian regression, or emission-pathway deprecation
- Pattern-match to "unit metadata is missing" or any other diagnosis derived from impression rather than from the two inspected artifacts

The session MUST:
- Open with the architect-channel inspection queries (Section 20)
- Read the persisted Ejecutivo Captación CompositionalIntent verbatim
- Read the persisted Datos sheet header comprehension output verbatim
- Compare what the LLM emitted against what comprehension knew
- Disposition between branches (a)/(b)/(c)/(d) based on what the artifacts show
- Draft a narrow fix HF only after disposition lands

This is the same discipline that closed Decision 158 successfully: STEP BACK from premature architectural drafting, inspect what is actually true, then act on evidence.

---

## SECTION 0 — FIVE CRITICAL FACTS

1. **Production deployment is at `327d3da4` (HF-252).** Vercel deployed `2026-05-28T16:27:43Z`. Construction pathway operative, single pipeline (no fallback), per-variant component emission active. 8/8 components persist with `construction_method=compositional_intent`.

2. **BCL October calculated $36,190 vs GT $44,590.** Delta $8,400 = entire shortfall isolated to Ejecutivo Captación de Depósitos ($0 calculated vs $8,400 GT, all 72 Ejecutivo entities affected). Three of four components reconcile exact; Senior Captación reconciles exact. Active rule_set: `ebfdc935-b86b-4b67-931d-69a873f3c04e`.

3. **The Ejecutivo Captación intent references `depositos_actuales` + `meta_depositos`; convergence bound `depositos_actuales → Pct_Meta_Depositos` and `meta_depositos → Meta_Depositos`.** The composition is dimensionally incommensurate (percentage ÷ currency-absolute). The Senior Captación intent references `depositos_netos` + `meta_depositos`; convergence bound `depositos_netos → Depositos_Nuevos_Netos`. That composition is dimensionally coherent and reconciles exact.

4. **Decision 158 is structurally proven end-to-end.** The construction pathway works: skeleton enumerates per-variant (8 components), each LLM call emits ~500B-5KB intents, constructor builds grammar-compliant trees deterministically, convergence binds metric references (0 gaps, 0 derivations, 8 bindings), engine evaluates trees correctly for three of four components. The pivot succeeded. The remaining defect is one specific intent's dimensional incoherence, not architectural.

5. **The next session's first action is inspection, not drafting.** Two SQL queries against the active rule_set's metadata and the import batches' comprehension output. The disposition between hypothesis branches a/b/c/d follows directly from the artifacts. No HF, no DS, no IRA invocation until inspection lands.

---

## SECTION 1 — REPOS AND DEPLOYMENT STATE

**VP repo (`CCAFRICA/spm-platform`):**
- `main` HEAD: `327d3da4` (HF-252)
- `dev` HEAD: `180ff167` (merged main into dev)
- Open PRs: none
- Vercel production: `327d3da4` (success)

**VG repo (`vialuce/vialuce-governance`):**
- No changes this session
- Last touch: IRA Decision 158 artifacts (prompt + response + completion report) from 2026-05-23 session

**Active BCL state (production):**
- Tenant ID: `b1c2d3e4-aaaa-bbbb-cccc-111111111111`
- Active rule_set: `ebfdc935-b86b-4b67-931d-69a873f3c04e` (2 variants × 4 components = 8 persisted)
- Prior rule_set: `ddb3aa26-e288-42c7-a8e3-ade74935abb4` (superseded during this session's import iterations)
- Calculated October batch: `4e83a850-33fe-43c6-a9f3-d0043383c4a5` (grandTotal=36190)
- Period: `57e5d67e-e463-4752-8544-b7883f85ea69` (monthly_2025-10-01_2025-10-31)

---

## SECTION 2 — ARCHITECTURAL DELTA SUMMARY

Per HANDOFF_TEMPLATE convention, full provenance lives in companion closing artifacts and prior session handoffs. This section carries only the forward-facing delta relevant to next session.

**HF-251 (2026-05-23) closed:** the architectural pivot to LLM Recognition + Code Construction. Six prior HFs of LLM tree-emission scaffolding (OB-200 through HF-250) replaced by a single construction pathway. Constructor unit-tested at 7/7 including the BCL C0 30-cell matrix shape.

**HF-252 (2026-05-28) closed:** the DS-024 scope gap (per-variant component intent emission, metric-only structures, role differentiation via `applies_to` at variant boundary, not internal categorical conditionals) and restored T0-E03 single pipeline (legacy emission-pathway fallback removed; missing `compositional_intent` raises `MissingCompositionalIntentError` retried through HF-248 cognition_failure taxonomy).

**Current architectural state:** the construction pathway is operative, single-pipeline, per-variant. The DecimalError from HF-251 ("Ejecutivo Senior" string at numeric position) is structurally precluded — no categorical references reach numeric positions. Three of four BCL components reconcile to the penny. The remaining defect is dimensional incoherence in one specific LLM-emitted intent.

**What did NOT happen this session:**
- No convergence changes. Convergence is the proven anchor.
- No constructor changes beyond HF-252's `applies_to` schema field.
- No header comprehension changes.
- No engine/evaluator changes.
- No deferred scale_annotation work (52 warnings persist on Colocación; 2 warnings on Cumplimiento; expected, hygiene).

---

## SECTION 3 — DEFECT ISOLATION (THE OPERATIVE EVIDENCE)

The October calculation log demonstrates the isolation. From production batch `4e83a850-33fe-43c6-a9f3-d0043383c4a5`:

**Convergence completed cleanly:**
```
[Convergence] Plan de Comisiones — Banca Minorista 2025-2026: 0 derivations, 0 gaps, 8 component bindings
```

**The two Captación bindings diverged structurally:**
```
[Convergence] HF-112 component_1: depositos_netos=Depositos_Nuevos_Netos, meta_depositos=Meta_Depositos
[Convergence] HF-112 component_5: depositos_actuales=Pct_Meta_Depositos, meta_depositos=Meta_Depositos
```

component_1 = Senior Captación. component_5 = Ejecutivo Captación.

**Per-component-per-variant totals (October):**

| Component | GT | Calculated | Delta |
|---|---|---|---|
| Colocación de Crédito (c0) | 17,990 | 17,990 | 0 — EXACT |
| Captación de Depósitos (c1) | 10,170 | 1,770 | −8,400 |
| Productos Cruzados (c2) | 8,480 | 8,480 | 0 — EXACT |
| Cumplimiento Regulatorio (c3) | 7,950 | 7,950 | 0 — EXACT |
| **Grand total** | **44,590** | **36,190** | **−8,400** |

**Captación split by variant:**
- Senior (13 entities): GT $1,770, Calculated $1,770. EXACT.
- Ejecutivo (72 entities): GT $8,400, Calculated $0. ENTIRE DELTA.

Source for GT: `BCL_Resultados_Esperados.xlsx`, sheet `Detalle por Entidad`, filtered to `Periodo='2025-10-01'`, summed per `Nivel`.

**The hypothesis space, deliberately preserved without premature collapse:**

The Ejecutivo Captación intent emitted a ratio composition of `depositos_actuales` (bound to `Pct_Meta_Depositos`, value distribution ~0-150% range) ÷ `meta_depositos` (bound to `Meta_Depositos`, value distribution in tens-of-thousands of currency units). The numerical result is approximately 0.0001-0.003 for every entity, falling below the lowest attainment band threshold, paying $0.

This is dimensionally incoherent. The question is WHY the LLM emitted this composition for one variant while emitting a dimensionally coherent composition (`depositos_netos / meta_depositos`) for the other variant. Four candidate branches, each leading to a different narrow fix:

- **(a)** The LLM had unit/dimensional information about `Pct_Meta_Depositos` (e.g., from header comprehension's `dataType: 'percentage'` classification) but ignored it. → emission discipline fix: the LLM prompt for plan_component needs to make dimensional consistency explicit, or carry comprehension's per-column dataType as context.
- **(b)** The LLM did not have that information because header comprehension's dataType classifications are not propagated into the plan_component prompt's data-context block. → propagate comprehension's dataType into the intent emission prompt context.
- **(c)** Header comprehension classified `Pct_Meta_Depositos` incorrectly (e.g., `dataType: 'decimal'` rather than `'percentage'`), so even propagating would not have helped. → comprehension classification fix.
- **(d)** Something not anticipated by branches a/b/c.

None of these is currently selectable from what we know. Inspection of two persisted artifacts disposes between them.

---

## SECTION 4 — SUBSTRATE STATE (VG)

No VG changes this session. Substrate state unchanged from 2026-05-23 close.

The architect-channel observation that may be substrate-relevant when this session's closure produces ICA capture material: **the pattern where the architect's repeated STEP BACK challenges this session caught Claude rushing to (a) tenant-specific Option A framing, (b) IRA Class A invocation before establishing what is unknown, (c) unfounded "convergence was never designed for this" assertion, (d) procedural-theater Design Gate framing.** Each catch reduced Claude's premature drift; the cumulative effect was disposition toward inspection-first discipline. This is candidate material for a future substrate entry on architectural-question diagnostic discipline, but no entries are locked or drafted this session.

---

## SECTION 5 — INCIDENT RESPONSE

None this session.

---

## SECTION 6 — VERIFICATION ARTIFACT INVENTORY

Production import + calculation evidence (this session):
- Production deployment `327d3da4` import logs (2026-05-28 16:54-16:56)
- Production calculation logs (2026-05-28 16:59-17:00)
- Per-entity component breakdowns in `[CalcRecon-T2]` lines (all 85 entities)
- `[CalcRecon-T1]` reconciliation footer: `entitiesCalculated=85 grandTotal=36190 componentTotals=[c0:17990 | c1:1770 | c2:8480 | c3:7950]`
- `BCL_Resultados_Esperados.xlsx` in project files (line-by-line GT, 6 periods × 85 entities)

GT extraction script (run during session, in conversation context):
```python
import openpyxl
wb = openpyxl.load_workbook('BCL_Resultados_Esperados.xlsx', data_only=True)
ws = wb['Detalle por Entidad']
# Filter Periodo='2025-10-01', sum per component and per Nivel
# Result: C1_Coloc=17990, C2_Capt=10170 (Senior 1770 + Ejecutivo 8400), C3_ProdCruz=8480, C4_Cumpl=7950, Total=44590
```

This GT extraction confirmed the defect isolation against canonical line-by-line ground truth. It is the empirical anchor for the binding constraint statement.

---

## SECTION 7 — IGF / GOVERNANCE STATE

No governance writes this session. No IRA invocations. No substrate amendments.

---

## SECTION 8 — TMR / META-RULES

None this session.

---

## SECTION 9 — CLT / CC LIVING TICKETS

None this session.

---

## SECTION 10 — TOOL ECOSYSTEM CONTRACTS

No tool contracts changed this session. CC operates per established discipline (SR-43 ship complete; structured failure on missing compositional_intent; no fallback dispatch).

---

## SECTION 11 — STANDING RULES STATE

`CC_STANDING_ARCHITECTURE_RULES.md` unchanged this session. SR-34 (No Bypass), SR-43 (Ship Completes Work Item), DD-7 (no smuggled expansion) actively applied and held throughout.

The architect-named pattern this session — *do not rush to IRA or design specification before inspection establishes what is unknown* — is candidate material for a future Standing Rule but is not promoted to one this session. Premature SR promotion would itself be the pattern the rule guards against.

---

## SECTION 12 — DEFECT CLASS ANALYSIS

**Root pattern caught this session: premature architectural framing before evidence.**

Three distinct surfaces where Claude began to drift, each caught by an architect STEP BACK:

1. **Option A "cross-variant intent consistency" framing.** Claude proposed an architectural constraint (variants share component structure, only outputs differ) derived from BCL's specific shape rather than from product-level reasoning. Catch: architect named "you are not solving for a tenant — we are building a product capability." Correction: reframed defect as dimensional incoherence (tenant-agnostic) rather than cross-variant consistency (BCL-shaped).

2. **IRA Class A invocation framing.** Claude proposed an IRA invocation on "carrying unit semantics through SCI/comprehension into convergence." Catch: architect named "the invocation needs to be specific and the output material… are there assumptions you have made or are you rushing to an unfounded issue?" Correction: retracted the IRA framing; acknowledged that the assumption "comprehension does not propagate unit metadata" was not substantiated against the actual `FieldProfile`/`ContentProfile` schemas, which DO carry `dataType: 'percentage' | 'currency' | ...`. The question becomes inspection, not IRA.

3. **"Convergence was never designed for this" assertion.** Claude initially framed the defect as exposing a missing convergence capability. Catch: architect named the convergence has been substantiated across multiple reconciliations. Correction: searched conversation history; found HF-111 + HF-115 historical machinery (scale_factor on bindings, percentage-scale detection, cross-component plausibility checking with scale-anomaly correction) that handled an analogous class historically. Convergence is the proven anchor; the defect lives upstream.

**Why the catches worked:** the architect's STEP BACK challenges did not specify the correct framing; they named the failure mode (tenant-solving, procedural theater, unfounded assertion) and required Claude to re-derive. Each catch reduced drift one step. The cumulative effect was disposition toward an inspection-first approach grounded in two specific JSONB artifacts.

**Latent risk for next session:** the same pattern could reproduce — Claude reading inspection results and drafting an HF before architect dispositions which branch is operative. The next session must hold inspection separate from disposition separate from drafting. Three discrete turns minimum.

---

## SECTION 13 — FILES CREATED OR MODIFIED THIS SESSION

**Created (documentation, committed to VP):**
- `docs/vp-prompts/HF-252_DIRECTIVE_20260524.md` (drafted in architect channel, dispatched to CC)
- `docs/completion-reports/HF-252_COMPLETION_REPORT.md` (CC-produced after HF-252 ship)

**Modified (VP code, via HF-252):**
- `web/src/lib/plan-intelligence/compositional-intent.ts` (added `applies_to` field, `MissingCompositionalIntentError`)
- `web/src/lib/ai/providers/anthropic-adapter.ts` (plan_component emission discipline section; plan_skeleton per-variant enumeration instruction)
- `web/src/lib/sci/plan-orchestration.ts` (legacy fallback removed; `applies_to` override at component-push site)

**Created (this batch):**
- This handoff file

**Not created this session:** no DS, no DG, no IRA artifacts, no inspection scripts (the inspection runs against production data in next session).

---

## SECTION 14 — CONVERSATION PATTERN OBSERVATIONS

**Productive patterns this session:**

- Inspection of GT in project files (BCL_Resultados_Esperados.xlsx) before continuing diagnostic. Line-by-line GT extraction transformed an inferred defect surface ("$8,400 miss in C1") into a precise defect statement ("Ejecutivo variant of Captación, 72 entities, $0 calculated vs $8,400 GT").
- STEP BACK challenges from architect repeatedly retrieved Claude from premature drafting. Three distinct catches in one session; each reduced drift.
- Conversation history search (`conversation_search`) surfaced HF-111 / HF-115 historical machinery that prevented an unfounded "convergence was never designed for this" assertion from solidifying.
- Project file search (`project_knowledge_search`) on `FieldProfile` and `ContentProfile` schemas surfaced that header comprehension's data structure DOES carry `dataType: 'percentage' | 'currency' | ...`, retracting an unfounded "comprehension doesn't carry units" assumption.

**Unproductive patterns caught and corrected mid-session:**

- Claude proposing Option A (cross-variant intent consistency) as a tenant-agnostic capability when it was BCL-shaped.
- Claude proposing IRA Class A invocation before establishing what was unknown vs what was inspectable.
- Claude asserting "comprehension does not carry unit metadata" without inspecting the schema first.
- Claude asserting "convergence was never designed for this" without searching history.

**Drift risks for next session:**

- Reading inspection artifacts and immediately drafting an HF without architect disposition.
- Pattern-matching the inspection results to a familiar diagnosis rather than reading them precisely.
- Expanding scope from the narrow Ejecutivo Captación fix to a broader "dimensional verification framework" because the topic feels important.
- Treating the 54 deferred scale_annotation warnings as urgent because they touch the same topic area. They are hygiene; the binding constraint is BCL October reconciliation.

---

## SECTION 15 — CC EXECUTION OBSERVATIONS

CC executed HF-252 cleanly per SR-43:
- PR #440 created
- Squash-merge at `2026-05-28T16:25:54Z`
- Vercel auto-deploy fired (no HF-249-class anomaly)
- Production verification SHA matches main HEAD
- Dev synced
- Completion report committed
- EPG grep confirmed fallback dispatch absent from active code

CC's behavior was at baseline. No false stops, no incorrect diagnoses. The completion report's §6 (BCL plan import on production) correctly identified that browser-only steps were architect-manual and provided log signatures to look for.

CC will be involved in next session's inspection. Specifically: CC executes SQL queries via service-role tsx-script against the active rule_set and import_batches tables. Architect runs queries and pastes raw output back to architect channel. Discipline per Reconciliation-Channel Separation: CC reports raw JSONB; architect interprets.

---

## SECTION 16 — GOVERNANCE ENGINE POSITION

No IGF substrate work this session. Wave 1 locked at commit `e2fbcc4` (prior). Wave 2 (T2-E09, T2-E30) pending; not advanced.

---

## SECTION 17 — HANDOFF BEST-PRACTICE OBSERVATIONS

Corrections applied during this handoff drafting:
- **Correction 19 (Section -1 Critical Path):** populated with all five sub-sections, substantive content.
- **Correction 5 (Section 19 minimum-viable Turn 2):** single git command + verbal confirmation. No expanded verification rituals.
- **Correction 2 (Section 19 execution locus explicit):** "Andrew runs locally" vs "Claude reads handoff" vs "Claude drafts CC directive" — never ambiguous.

**Length and scope rationale:** this handoff is moderate length because Section -1 is substantive (Decision 158 plus the disposition discipline requires articulation), Section 3 (Defect Isolation) requires the precise per-variant breakdown to ground the binding constraint, Section 20 (Path Detail) carries the inspection-query content that is the operative next-session action. No ceremonial sections. Sections 5/7/8/9/16 are short because nothing happened on those axes this session.

**Reconciliation-channel discipline:** GT values DO appear in this handoff (Sections -1.4, 0.2, 3.1, 6.1). This handoff is an architect-channel artifact. The inspection queries in Section 20 are designed to be run by architect (or CC under architect direction) against production; the queries themselves contain no GT values.

---

## SECTION 18 — RISKS AND OPEN QUESTIONS FOR NEXT SESSION

### Risks

1. **Risk R1 — Premature HF drafting after inspection.** The strong pattern of this session is that Claude wants to draft an HF as soon as it has a theory. The inspection artifacts will produce a theory immediately. Architect must hold disposition separate from drafting; Claude must not draft an HF in the same turn as inspection result interpretation.

2. **Risk R2 — Pattern-matching inspection results to prior assumptions.** Claude has now articulated branches (a)/(b)/(c)/(d). Risk: inspection results that don't cleanly fit one branch get forced into the closest one rather than producing a (d) "something else" disposition.

3. **Risk R3 — Scope expansion to dimensional-verification framework.** The defect surface touches "units flowing through the system." It is tempting to elevate to a framework-level capability. The binding constraint is BCL October reconciliation; framework-level work is not gated by this session.

4. **Risk R4 — The inspection itself fails (data not where expected).** The persisted CompositionalIntent should live in `rule_sets.components[i].metadata.compositional_intent` per HF-251. Header comprehension output should live either in `import_batches.metadata` or in `classification_signals` with `signal_type='comprehension:plan_interpretation'` or `'classification:outcome'`. Schema verification is the first step of inspection; if the data is in an unexpected location, the inspection plan adjusts before continuing.

5. **Risk R5 — A reimport happens before inspection.** If anyone re-imports BCL between session close and next session start, the active rule_set changes and the inspection target moves. The handoff names `ebfdc935-b86b-4b67-931d-69a873f3c04e` as the inspection target; if a different rule_set is active at next session start, that's a signal to re-verify state before inspecting.

### Open questions

1. **OQ1 — Which branch (a/b/c/d) is operative?** Answered by inspection.

2. **OQ2 — Where does header comprehension persist its output?** Likely `import_batches.metadata` per the `HF-141` log convention, but the field path inside that JSONB is not asserted in memory. The inspection query (Section 20) probes both `import_batches` and `classification_signals` to locate it.

3. **OQ3 — What does the plan_component prompt actually pass to the LLM as data context?** The prompt is in `anthropic-adapter.ts`. If branch (b) is operative, inspecting the prompt's data-context block (what columns and column metadata get included in the user message) is the second step of disposition.

4. **OQ4 — Does the deferred scale_annotation warning class connect to this defect, or is it independent?** Working hypothesis: connected (both touch unit metadata flow), but inspection may show them independent. Do not act on this question until OQ1 is dispositioned.

---

## SECTION 19 — IMMEDIATE NEXT SESSION START SCRIPT

### Turn 1: Orientation confirmation (Claude reads handoff)

Claude reads pre-read materials in this order:
1. This handoff Section -1 (Critical Path, including binding constraint statement)
2. This handoff Section 0 (five critical facts)
3. This handoff Section 3 (defect isolation evidence)
4. This handoff Section 20 (path detail with inspection queries)
5. This handoff Section 18 (risks, particularly R1-R3)

Claude produces orientation statement that explicitly references Section -1.3 (commercial gate: BCL October reconciliation) and Section -1.4 (binding constraint: Ejecutivo Captación intent emitted dimensionally incommensurate ratio; disposition requires inspection of two persisted JSONB artifacts). Architect confirms or corrects.

### Turn 2: Minimum-viable verification (architect runs locally)

Architect runs:
```bash
cd ~/spm-platform && git log --oneline -1 origin/main
```

Expected: `327d3da4 HF-252: Per-Variant Component Intent Emission + Fallback Removal (#440)`. If mismatch, escalate to verify production state before any inspection.

Verbal confirmation: "Active BCL rule_set is `ebfdc935-b86b-4b67-931d-69a873f3c04e` per Section 0 fact 2; no reimport has occurred since session close." If architect cannot confirm, Section 18 Risk R5 fires and inspection target may need re-verification before queries.

### Turn 3: Path execution

Claude executes Path P1 (Inspection) per Section 20. Architect-channel work; no CC directive drafted in this turn.

---

## SECTION 20 — PATH DETAIL

### Path P1 — Inspection: Persisted Ejecutivo Captación Intent + Datos Sheet Header Comprehension

**Identifier:** P1 (Inspection; no HF/OB number assigned; pre-disposition work)

**Scope:** Read two persisted JSONB artifacts from production Supabase to disposition between hypothesis branches (a)/(b)/(c)/(d) named in Section 3.

**Dependencies:** Section 0 fact 2 (active rule_set ID), Section 0 fact 1 (production deployment SHA), Risk R5 verification (no reimport since session close).

**Execution locus:** Architect runs queries via Supabase SQL Editor (architect-only capability per memory; CC has no SQL Editor access for VP). Claude drafts queries; architect executes; architect pastes raw output to architect channel; Claude interprets and dispositions.

**Query Q1.1 — Schema location verification (component metadata):**

```sql
-- Verify that components are stored with metadata.compositional_intent per HF-251.
-- Expected: 8 rows, each with non-null compositional_intent JSONB.
SELECT
  jsonb_array_length(components) AS component_count,
  jsonb_path_query_array(
    components,
    '$[*].metadata.construction_method'
  ) AS construction_methods,
  jsonb_path_query_array(
    components,
    '$[*].metadata.compositional_intent.applies_to'
  ) AS applies_to_values
FROM rule_sets
WHERE id = 'ebfdc935-b86b-4b67-931d-69a873f3c04e';
```

Expected result: `component_count=8`, all construction_methods = `"compositional_intent"`, applies_to values showing per-variant assignment.

If construction_methods contain any non-compositional_intent value, Section 18 Risk R5 fires implicitly (rule_set was not produced by HF-252).

**Query Q1.2 — Ejecutivo Captación CompositionalIntent verbatim:**

```sql
-- Extract the persisted Ejecutivo Captación intent JSONB in full.
-- This is the primary inspection artifact.
SELECT
  components->index->'name' AS component_name,
  components->index->'metadata'->'compositional_intent' AS intent_verbatim
FROM rule_sets,
LATERAL generate_series(0, jsonb_array_length(components) - 1) AS index
WHERE id = 'ebfdc935-b86b-4b67-931d-69a873f3c04e'
  AND components->index->>'name' = 'Captación de Depósitos'
ORDER BY index;
```

Expected: 2 rows (Senior + Ejecutivo). Compare the two `intent_verbatim` values structurally.

**What to read from the artifact (when paste arrives):**
- The Ejecutivo intent's `structure.shape` value (likely `banded_lookup`)
- The Ejecutivo intent's `structure.dimensions[0].reference_source` — what field type the LLM declared (`metric` vs `ratio` vs `attribute`)
- If `reference_source.type === 'ratio'`: the `numerator` and `denominator` field names the LLM chose
- The Senior intent's same fields, for direct comparison
- Any unit/scale/dataType metadata that may live in the intent's `metadata` block

**Query Q1.3 — Header comprehension persistence location probe:**

```sql
-- Probe import_batches.metadata for comprehension output.
SELECT
  id,
  jsonb_path_query_array(
    metadata,
    '$.** ? (@.type() == "object" && exists(@.headerComprehension))'
  ) AS comprehension_blocks,
  jsonb_object_keys(metadata) AS top_level_keys
FROM import_batches
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
  AND created_at >= '2026-05-28T16:50:00Z'
ORDER BY created_at DESC
LIMIT 10;
```

If comprehension blocks return non-empty: header comprehension lives here. Extract the per-column interpretations and dataType for the `Datos` sheet's columns (`Pct_Meta_Depositos`, `Depositos_Nuevos_Netos`, `Meta_Depositos`).

If empty: fall through to Q1.4.

**Query Q1.4 — Header comprehension via classification_signals (fallback location):**

```sql
SELECT
  signal_type,
  source,
  context,
  jsonb_pretty(signal_value) AS signal_value
FROM classification_signals
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
  AND created_at >= '2026-05-28T16:50:00Z'
  AND signal_type IN (
    'comprehension:plan_interpretation',
    'comprehension:header',
    'classification:outcome'
  )
ORDER BY created_at DESC
LIMIT 20;
```

**What to read from the comprehension artifact:**
- For `Pct_Meta_Depositos`: what `dataType` did comprehension classify? (`percentage` | `decimal` | `currency` | other)
- For `Depositos_Nuevos_Netos`: what `dataType`? (Expected: `currency`)
- For `Meta_Depositos`: what `dataType`? (Expected: `currency`)
- For each: what is the `distribution.min/max/mean` if persisted?
- For each: `columnRole` value (already visible in the import logs as `measure@confidence`, but full per-column block may carry more)

**Disposition table — once both artifacts are read:**

| LLM intent shows (Q1.2) | Comprehension shows (Q1.3/Q1.4) | Branch | Narrow fix shape |
|---|---|---|---|
| Ejecutivo intent declares ratio composition referencing `depositos_actuales` + `meta_depositos` | `Pct_Meta_Depositos` has `dataType: 'percentage'` AND that metadata IS in the plan_component prompt | (a) Emission discipline | Prompt addition: dimensional consistency check on ratio compositions |
| Ejecutivo intent declares ratio composition referencing `depositos_actuales` + `meta_depositos` | `Pct_Meta_Depositos` has `dataType: 'percentage'` AND that metadata IS NOT in the plan_component prompt | (b) Prompt context propagation | Propagate comprehension dataType into plan_component user-message data context |
| Ejecutivo intent declares ratio composition referencing `depositos_actuales` + `meta_depositos` | `Pct_Meta_Depositos` has `dataType: 'decimal'` or another non-percentage classification | (c) Comprehension classification | Comprehension fix: improve dataType detection for percentage-shaped columns |
| Ejecutivo intent declares something other than a two-field ratio | any | (d) Something else | Disposition required before drafting |

**Meta rules baked in:**
- Inspection does NOT include any reasoning or hypothesis collapse before both artifacts are read.
- Disposition does NOT happen in the same turn as inspection result paste.
- Drafting does NOT happen in the same turn as disposition.
- Architect dispositions which branch is operative; Claude does not unilaterally pick.

**Estimated session time:** 30 minutes (5 min Q1.1 verify, 5 min Q1.2 extract, 10 min Q1.3/Q1.4 locate comprehension, 10 min architect-Claude joint interpretation and disposition). Subsequent HF drafting is its own subsequent path.

**Recommended sequencing:** P1 is the only path for next session's first phase. After disposition, Path P2 follows.

---

### Path P2 — Narrow Fix HF (post-disposition)

**Identifier:** HF-253 (provisional — number assigned by architect at draft time per premature-numbering avoidance discipline)

**Scope:** Implement the narrow fix corresponding to the dispositioned branch (a/b/c/d). Scope is bounded by the branch — no expansion to dimensional-verification framework, no convergence changes, no constructor changes beyond what the branch requires.

**Dependencies:** Path P1 disposition complete. Architect has named the operative branch and the fix shape.

**Gates structure:**
- Phase 1 — implement the narrow fix per branch
- Phase 2 — clean-slate BCL import + October calculation
- Phase 3 — reconciliation check: October grand total = $44,590, all four component totals match GT
- Phase 4 — SR-43 ship: PR + merge + production verify + dev sync + completion report

HALT conditions per branch will be drafted at directive time.

**Estimated session time:** ~60-90 minutes depending on branch complexity. Branch (a) is the narrowest (prompt addition); branch (c) is the most involved (comprehension classification logic).

**Recommended sequencing:** runs after P1 completes and architect dispositions. Same session if time permits; next session if not.

---

### Path P3 — Full BCL Six-Period Verification

**Identifier:** post-HF-253 verification, no separate HF number

**Scope:** Once October reconciles, run November through March; confirm 6-period total matches GT $312,033 exact.

**Dependencies:** P2 closes with October at $44,590.

**Out of scope this session.**

---

### Recommendation across paths

Execute P1 first. Disposition. Then P2. Do not preview P3 in the same session.

The single most important discipline: **inspection does not produce drafting in the same turn**. Architect dispositions the branch; only then does P2 begin.

---

## VOCABULARY APPENDIX

- **CompositionalIntent**: the compact JSON schema the LLM emits per component under Decision 158; describes structure using grammar vocabulary; the constructor builds the PrimeNode tree from it.
- **Ejecutivo Captación**: the Ejecutivo variant's Captación de Depósitos component. component_5 in the calculation log. The persisted intent is the primary inspection artifact for next session.
- **Senior Captación**: the Ejecutivo Senior variant's Captación de Depósitos component. component_1. Reconciles exact; serves as the dimensional-coherence baseline for comparison.
- **Branches (a)/(b)/(c)/(d)**: the four hypothesis branches for what causes Ejecutivo Captación to compose incommensurate fields. Preserved without premature collapse.
- **Dimensional incoherence**: a composition (typically a ratio) of two fields whose units do not compose into a meaningful result (e.g., percentage ÷ currency-absolute). The Ejecutivo Captación intent's specific defect.
- **Active rule_set**: `ebfdc935-b86b-4b67-931d-69a873f3c04e`. The rule_set produced by the HF-252-deployed plan import that is currently bound to BCL's October calculation.
- **HF-252**: shipped per-variant component intent emission (8 per-variant components instead of 4 per-plan components) plus removal of legacy emission-pathway fallback (T0-E03 single pipeline restored). Production at `327d3da4`.
- **Reconciliation-channel separation**: GT values appear in architect-channel artifacts (this handoff, project files like BCL_Resultados_Esperados.xlsx). GT values do NOT appear in CC directives or inspection queries. Inspection queries are written to be safe for CC execution.

---

*vialuce.ai · Intelligence. Acceleration. Performance.*
*SESSION_HANDOFF_20260528.md — Session close 2026-05-28*
*BCL October calculates $36,190 vs GT $44,590; $8,400 delta isolated to Ejecutivo Captación intent dimensional incoherence; next session opens with two-artifact inspection to disposition between four hypothesis branches before any drafting.*
