# DIAG-073 — Convergence Unified-Path Root-Cause Forensic

**DIAG number:** DIAG-073 (architect-assigned — verify against live `docs/diagnostics/` before writing; if collision, halt and report)
**Repo:** `CCAFRICA/spm-platform` · **Base:** `main` (current HEAD; record SHA in §3.1)
**Directive path:** `docs/diagnostics/DIAG-073_DIRECTIVE_20260618.md`
**Output path:** `docs/diagnostics/DIAG-073_CONVERGENCE_UNIFIED_ROOT_CAUSE_OUTPUT.md`
**Type:** DIAGNOSTIC — **READ-ONLY. NO CODE CHANGES. NO BRANCH. NO FIX.** Evidence + classification only.
**Effort directive:** Run this with **ULTRATHINK / maximum reasoning effort.** This diagnostic is the sole basis for a single unified OB that must not fragment. Depth of trace here directly determines the EECI of the resulting build. Do not abbreviate. Do not sample where enumeration is asked.

---

## §0 — CC Standing Rules

Read `CC_STANDING_ARCHITECTURE_RULES.md` in full before starting. Binding for this diagnostic:
- **READ-ONLY.** No edits, no commits except the single output artifact at the end. No branch.
- **Evidence = pasted live code + pasted runtime/query output (Rule 27).** No self-attestation. No "I believe." Every claim carries a pasted code block with file path + line numbers, or pasted query output.
- **Live code only.** Read source as it exists on `main` at the recorded HEAD. **DO NOT rely on, cite, or reason from `AUD-001_CODE_EXTRACTION.md` or any `docs/` extract/audit artifact — those are stale point-in-time snapshots and are explicitly disqualified as a basis for any finding.** If a claim cannot be grounded in a freshly-read live file, mark it UNKNOWN.
- **Korean Test (Decision 154):** report structural identifiers; no reasoning that depends on column-name string literals being special.
- **No ground-truth values appear in this diagnostic** (reconciliation-channel separation). CC reports code structure and observed runtime values verbatim; architect reconciles against ground truth in the architect channel.

---

## §1 — Problem Statement

On `main` (HF-302 + HF-303 merged), a fresh clean MIR import (`972c8eb0-e3ae-4e4c-ad30-8b34804c893a`, 5 plans, 34 entities, 75,227 rows, 75,197 resolved to entities) calculates all five January plans. **Infrastructure is healthy** (RC-3 rollup fires `membership=1.00` on all batches; 99.96% entity resolution). **Every plan fails at convergence column binding**, in three observed modes:

1. **Wrong-file binding (all plans):** the `HF-114` AI mapping binds every plan's metrics onto `Monto_Cobrado` / `Saldo_Pendiente` — columns that exist only in the Cobranza data. Sales plans, the new-client plan, and the clawback all collapse onto the two Cobranza measures. Observed `HF-114 AI mapping` lines:
   - Plan 1 (Comisiones Venta Mayorista): `{"Monto_Total":"Saldo_Pendiente","Categoria":"Saldo_Pendiente"}` + `HF-222 Categoria → Monto_Cobrado`
   - Plan 2 (Bono Cuota Mensual): `{"ventas_brutas_mensuales":"Monto_Cobrado","cuota_mensual_asignada":"Saldo_Pendiente"}`
   - Plan 3 (Incentivo Cobranza): `{"Monto_Cobrado":"Monto_Cobrado","Saldo_Pendiente":"Saldo_Pendiente"}` (nominally correct — Plan 3 IS the Cobranza plan)
   - Plan 4 (Cartera Nueva): `{"Verificado":"Monto_Cobrado"}`
   - Plan 5 (Ajustes/Devoluciones — CLAWBACK): `{"Monto_Original":"Monto_Cobrado","Tasa_Comision_Original":"Saldo_Pendiente","Multiplicador_Acelerador_Original":"Saldo_Pendiente"}`

2. **Resolution failure on a correct binding (Plan 3):** Plan 3 binds correctly yet the engine logs `resolveColumnFromBatch:exit … column=Monto_Cobrado … reason=column_in_no_batch returned=null` for every entity → grand total 0. The binding and the per-entity batch resolver disagree about which batch holds the column.

3. **Crash on a text column (Plan 1):** `Categoria` (values ALI/BEB/LIM…) bound via `HF-222 distribution-distinct` into a numeric path → `[DecimalError] Invalid argument: ALI` → calc aborts.

**Three workstreams must be resolved by a SINGLE unified OB (no fragmentation):**
- **Track A — Column binding / candidate construction / data_type matching:** why every plan binds to Cobranza measures.
- **Track A′ — Developer-threshold elimination:** the 6 bare-float thresholds in `convergence-service.ts` (Decision-110 prohibited class, surfaced by `no-developer-numbers-scan.sh`) must be replaced with dynamic/relative (CRR-derived or argmax) authority — in the SAME path rewrite, so the corrected matching decision is threshold-free in one pass.
- **Track B — Clawback accommodation:** Plan 5 is net-new functionality (negative outcome, conditional firing on return events, inputs sourced from devolution-link attributes). Never built.

**DIAG-073 answers, from live code only:** What is the current candidate-construction and data_type-matching logic? Is the wrong-file binding caused by candidate construction (correct column never offered), by the data_type matcher (wrong file scoped), by the AI mapper itself, or by the thresholds rejecting correct candidates? Are the 6 thresholds causal or merely present? What does the clawback actually require, and is it computable within-period from devolution-row columns or does it need cross-period reversal? **The output must be sufficient to scope ONE unified OB with certainty.**

---

## §2 — Substrate-Bound Discipline Applications

- **T1-E905 (Prove Don't Describe):** every finding = pasted live code (path + lines) or pasted runtime/query output.
- **T1-E910 (Korean Test):** findings classify structurally; the diagnostic must determine whether the live code's candidate/match decisions are structural or string-literal-dependent.
- **SR-34 (No Bypass / structural-class layer):** the diagnostic must locate each defect at its structural-class layer (candidate construction, match selection, resolution) — not at the instance (MIR) layer.
- **Decision 110 (flywheel authority):** for each of the 6 thresholds, the diagnostic determines whether it is an AUTHORITY value (must become CRR-derived/relative) or a numerical-precision TOLERANCE (ratifiable). It does NOT fix them — it classifies and maps them to the unified path.
- **AUD-001 DISQUALIFIED:** stale. Live source only.

---

## §3 — Phase 1: Reference Points & Live File Inventory

### §3.1 Record HEAD
```bash
git checkout main && git pull
git log --oneline -1
```
Paste SHA + message. Confirm it contains HF-302 (`e8d37b70`) and HF-303 (`968759fc`):
```bash
git log --oneline | grep -E "HF-302|HF-303" | head -5
```

### §3.2 Locate the live convergence + calc files
```bash
find web/src -name "convergence*" -o -name "resolver.ts" -o -name "contextual-reliability.ts" -o -name "seed-priors.ts" 2>/dev/null
wc -l web/src/lib/sci/convergence-service.ts web/src/app/api/calculation/run/route.ts
```
Paste paths + line counts. These are the authoritative sources for all subsequent phases. **If `convergence-service.ts` is not at this path, search and use the found path; record it.**

### §3.3 Confirm CRR substrate exists (Decision 110 / OB-161)
```bash
ls -la web/src/lib/sci/resolver.ts web/src/lib/sci/contextual-reliability.ts web/src/lib/sci/seed-priors.ts 2>/dev/null
grep -rn "contextualReliabilityLookup\|resolveClassification\|getObservedAccuracy\|CRL\|seed.?prior" web/src/lib/sci/ --include='*.ts' | head -30
```
Paste. **HALT-A:** if these files do NOT exist on live `main`, record that the CRR mechanism named in OB-161 is absent/renamed/superseded, and enumerate what classification-authority mechanism DOES exist live (the unified OB must extend the real live mechanism, not a documented-but-absent one). This is critical: Track A′ depends on knowing the actual live dynamic-authority substrate.

---

## §4 — Phase 2: Track A — Candidate Construction & Data_Type Matching (LIVE)

**This phase ratifies or refutes the (provisional, AUD-001-derived, NOW DISQUALIFIED) hypothesis that the candidate pool excludes non-measure columns. Read the live code; do not assume.**

### §4.1 The data_type matcher — how `matches` (component → dataType) is produced
In live `convergence-service.ts`, find the function(s) that produce the component-to-dataType matches (the `BindingMatch` / `matchConfidence` / `dataType` structures). Likely entry `convergeBindings`; trace to where each component is assigned a `dataType`.

Paste the full function body that decides which `dataType` a component matches. Answer, with pasted evidence:
1. What signal decides the data_type a component binds to? (component metric names vs data_type's columns? a score? the AI?)
2. Where do the 6 thresholds (if any) sit in THIS decision? Paste each threshold line in context.
3. For a component whose metrics are NOT measures (e.g., the clawback's `Monto_Original`, or Cartera Nueva's `Verificado`), what data_type does this logic select, and why? Trace the actual code path.

### §4.2 Candidate-column construction — what columns are offered to the AI mapper
Find, in live code, where the candidate column set for AI mapping is built (the array passed to the AI-mapping call — provisionally `measureColumns`, but **verify the live name and live filter**).

Paste the exact construction block. Answer, with pasted evidence:
1. **What is the live filter on candidate columns?** Is it `structuralType === 'measure'`? Something else? Paste the predicate.
2. **Are non-measure columns (attribute, identifier, count) ever admitted as candidates?** If `Verificado` (attribute) or `Pedidos_Primeros_60_Dias` (the count the plan needs) are excluded, paste the line that excludes them.
3. **Is the candidate pool scoped per-data_type (only the matched data_type's columns) or tenant-wide (all columns)?** This determines whether cross-file binding is even structurally possible. Paste the scoping.

### §4.3 The AI mapping call — what the model is given and what it returns
Find the live AI-mapping function (provisionally `resolveColumnMappingsViaAI`; verify). Paste:
1. The exact column list and metric list assembled and sent to the model.
2. The system prompt key used (e.g., `convergence_mapping` in `anthropic-adapter.ts`) — paste the live system prompt.
3. The validation applied to the response (provisionally `isValidColumnMapping` with a `0.5` ceil — verify live; if a hardcoded ratio exists here it is a 7th threshold — flag it).

**The decisive question for Track A, answered with pasted code:** When Plan 4 binds `Verificado → Monto_Cobrado`, is it because (a) `Verificado` was never in the candidate list given to the AI [candidate-construction root], (b) the data_type matcher scoped the pool to Cobranza so only Cobranza columns were candidates [matcher root], (c) the AI was given the right candidates and chose wrong [prompt/model root], or (d) a threshold rejected the correct candidate [threshold root]? **Name which, cite the live lines, and show the path.** This single answer determines the shape of the unified OB.

### §4.4 Empirical confirmation against live data
Run (read-only) to confirm what columns actually exist per batch/data_type for MIR January, so the code finding is grounded in the real candidate universe:
```sql
SELECT
  ib.id AS batch_id,
  cd.data_type,
  cd.metadata->>'entity_id_field' AS eid_field,
  array_agg(DISTINCT k ORDER BY k) AS columns
FROM committed_data cd
JOIN import_batches ib ON ib.id = cd.import_batch_id
CROSS JOIN LATERAL jsonb_object_keys(cd.row_data) AS k
WHERE cd.tenant_id = '972c8eb0-e3ae-4e4c-ad30-8b34804c893a'
  AND cd.source_date BETWEEN '2025-01-01' AND '2025-01-31'
GROUP BY ib.id, cd.data_type, cd.metadata->>'entity_id_field'
ORDER BY cd.data_type, batch_id;
```
(If `data_type` is not a column on `committed_data`, adjust to read it from wherever the live schema stores it — verify via `information_schema.columns` first per the SQL Verification Gate.)

Paste output. Confirm: are `Monto_Total`/`Categoria` (Plan 1), `Verificado`/`Pedidos_Primeros_60_Dias` (Plan 4), and the devolution columns (Plan 5) in DIFFERENT batches/data_types than `Monto_Cobrado`/`Saldo_Pendiente`? This proves whether binding crossed files.

---

## §5 — Phase 3: Track A′ — Threshold Classification (LIVE, against the path)

For EACH of the 6 `convergence-service.ts` thresholds, read it live and classify. Paste each in its live surrounding function.

```bash
grep -n "matchConfidence < 0.5\|score > 0.2\|bestMatch.score > 0.3\|bestScore > 0.2\|boundaryScore > 0.1\|bestCatScore < 0.3" web/src/lib/sci/convergence-service.ts
```

| # | Live line | Threshold | Containing function | Decision it gates | On the Track-A defect path? (Y/N + why) | AUTHORITY or TOLERANCE | Replacement form (argmax / CRL-derived / ratify) |
|---|---|---|---|---|---|---|---|

For each: (a) paste the live code block; (b) state precisely what decision the constant gates; (c) determine from §4's trace whether this constant is ON the path that produces the wrong-file binding or the crash (Plan 1's `Categoria` crash specifically implicates the category-score threshold — confirm); (d) classify AUTHORITY (developer-assigned decision boundary → must become relative/CRL-derived) vs TOLERANCE (float-precision epsilon → ratifiable); (e) name the dynamic replacement consistent with the live CRR substrate found in §3.3.

Also scan for any threshold the named six miss:
```bash
grep -nE "[<>]=?\s*0\.[0-9]+|[<>]=?\s*1\.[0-9]+" web/src/lib/sci/convergence-service.ts | grep -v "RATIFIED" | head -40
```
Paste; add any newly-found bare-float comparison to the table.

**Critical finding required:** Is threshold elimination ALONE sufficient to fix Track A, or is it orthogonal (candidate construction is the root and thresholds are innocent gates)? State definitively from §4 + §5 evidence. This determines whether the unified OB's threshold work is *the* fix or *a co-resident* fix.

---

## §6 — Phase 4: Track C — `column_in_no_batch` Resolution Failure (LIVE)

Plan 3 binds correctly yet resolves null. Find `resolveColumnFromBatch` in live `run/route.ts`. Paste the full function.

Answer, with pasted evidence:
1. What does `column_in_no_batch` mean precisely — what is the function looking for and why does it not find `Monto_Cobrado` for an entity even though Plan 3's binding names it and the Cobranza data exists?
2. Trace the `source_batch_id` on the binding vs the batches available at resolution time. Is the binding pointing at a batch that doesn't contain the column (the SCALE-ANOMALY / architectural-inversion pattern), or is the batch selection at resolution time diverging from the binding's batch?
3. Is this the SAME root as Track A (boundary matcher scoped wrong → binding's batch is wrong), or INDEPENDENT (resolution-time batch selection differs from binding-time)? State which, with evidence. This determines whether the unified OB's Track-A fix also closes Track C, or whether Track C needs its own correction within the same OB.

---

## §7 — Phase 5: Track B — Clawback Accommodation Requirements (LIVE structure)

The clawback (Plan 5, `2f615968`) is unbuilt. Establish from live data + live plan structure what it requires — so the unified OB can build it on the corrected path.

### §7.1 The clawback plan's declared structure
Read the live `rule_sets` row for `2f615968`:
```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const { data } = await s.from('rule_sets').select('id,name,components').eq('id','2f615968-7f8f-4405-9788-bf58d02e0dcd').single();
console.log(JSON.stringify(data, null, 2));
"
```
Paste the component structure. Identify: the operation (is it a negative/subtraction prime? a conditional?), the declared input metrics (`Monto_Original`, `Tasa_Comision_Original`, `Multiplicador_Acelerador_Original`), and whether the component encodes a sign or a filter.

### §7.2 The clawback's source data — devolution rows
The devolution columns appeared in the Ventas files (`Folio_Original`, `Fecha_Original`, `Motivo_Devolucion`). Read what actually committed:
```sql
SELECT cd.data_type, cd.metadata->>'entity_id_field' AS eid,
       array_agg(DISTINCT k ORDER BY k) AS columns,
       count(*) AS rows
FROM committed_data cd
CROSS JOIN LATERAL jsonb_object_keys(cd.row_data) AS k
WHERE cd.tenant_id = '972c8eb0-e3ae-4e4c-ad30-8b34804c893a'
  AND (k ILIKE '%Original%' OR k ILIKE '%Devolucion%' OR k ILIKE '%Motivo%')
GROUP BY cd.data_type, cd.metadata->>'entity_id_field';
```
Paste. Then sample actual devolution rows (read-only):
```sql
SELECT row_data
FROM committed_data
WHERE tenant_id = '972c8eb0-e3ae-4e4c-ad30-8b34804c893a'
  AND row_data ? 'Folio_Original'
LIMIT 10;
```
Paste. **The decisive Track-B question:** Do the devolution rows carry `Monto_Original`, `Tasa_Comision_Original`, `Multiplicador_Acelerador_Original` (or equivalents) as their OWN columns?
- **If YES** → the clawback is computable WITHIN the period as `−(Monto_Original × Tasa × Multiplicador)` from the row's own columns. Track B is a self-contained negative computation (much smaller). 
- **If NO** (the row only has `Folio_Original` linking back) → the clawback requires cross-period reversal: look up the original sale's computed commission from a prior period. Track B is a cross-period mechanism (larger; Design-Gate).

State which, with the pasted row evidence. This sizes Track B definitively.

### §7.3 Negative-outcome + conditional-firing handling
From the live engine path (`run/route.ts`), determine:
1. Does the prime-DAG / outcome materialization handle a NEGATIVE `total_payout` correctly (carry the sign through `calculation_results` and `entity_period_outcomes`)? Cite the live write path.
2. Does the engine support a component that fires only for rows matching a condition (a return occurred) and is 0 otherwise? Cite where conditional/filtered components are handled, or state it's absent.

---

## §8 — Phase 6: Unified-Path Synthesis (the whole point)

Synthesize §4–§7 into the specification basis for ONE OB. Produce:

### §8.1 Ratified root-cause statement
One paragraph, live-code-grounded, naming the single corrected path that resolves Tracks A, A′, C together. Must answer: is the unified fix (i) correct candidate construction + (ii) correct data_type match + (iii) threshold→CRR replacement + (iv) resolution-batch alignment — and are these one decision or four co-resident decisions on one path? Cite the live functions each touches.

### §8.2 The unified path (no registry, no thresholds)
Name the live functions the OB will rewrite, in order along the convergence→resolution path. For each: current behavior (pasted), required behavior, and how it stays Korean-Test-clean and threshold-free (relative/CRL-derived). Confirm a SINGLE path — no per-plan special-casing, no MIR-specific branch, no lookup registry.

### §8.3 Clawback integration point
State exactly where on the unified path the clawback's needs attach (candidate construction must admit its devolution-attribute inputs; outcome path must carry negative; conditional firing). Confirm the clawback builds ON the corrected path, not beside it. If §7.2 showed self-contained computation, state the within-period formula path; if cross-period, flag as a Design-Gate sub-component of the same OB.

### §8.4 EECI pre-assessment of the proposed unified OB
- **Efficiency:** is it ONE invariant rewrite or N patches? Name the single general mechanism.
- **Efficacy:** will it make all 5 plans bind to correct columns AND compute (the 4 non-clawback to their values, the clawback to its negative)? Name the function whose correctness guarantees each.
- **Comprehensive:** does the corrected candidate/match path cover all structuralTypes (measure, attribute, count, identifier) and all plan shapes (commission, bonus, ratio, clawback)? Name any uncovered shape.
- **Innovation:** does extending CRR to convergence matching advance Decision 110 (flywheel authority over convergence, not just classification)? State the constitutional advance.

### §8.5 Open risks / residual unknowns
Anything §4–§7 could NOT establish from live code (mark UNKNOWN, do not guess). These become the only items the OB must probe at build time.

---

## §9 — HALT Conditions
- **HALT-A (§3.3):** CRR substrate files absent/renamed on live `main` → record the real live dynamic-authority mechanism; do not assume OB-161 names exist.
- **HALT-B (§4.2):** if candidate-construction logic is not locatable in `convergence-service.ts`, search the full `web/src/lib/sci/` + calc path and trace wherever the AI-mapping candidate list is built; record the real location.
- **HALT-C (§7.2):** if devolution rows are absent from committed_data entirely (clawback has no source data imported), STOP Track B analysis and report — the clawback cannot be built without source data and this becomes an import-scope finding, not a convergence finding.
- **HALT-D:** any single file read exceeds practical size → summarize by function with signatures + the specific decision blocks, not full paste.
- **General:** any claim not groundable in freshly-read live code → mark UNKNOWN. Never substitute AUD-001 or any extract.

---

## §10 — Reporting

Write all findings to `docs/diagnostics/DIAG-073_CONVERGENCE_UNIFIED_ROOT_CAUSE_OUTPUT.md`:
1. **Reference** — HEAD SHA, live file paths + line counts, CRR-substrate presence (§3).
2. **Track A** — data_type matcher trace, candidate-construction trace, AI-mapping trace, the decisive (a)/(b)/(c)/(d) root with pasted lines, empirical column-per-batch confirmation (§4).
3. **Track A′** — the 6-threshold classification table with pasted code, causal-vs-present determination, sufficiency finding (§5).
4. **Track C** — `resolveColumnFromBatch` trace, same-root-or-independent determination (§6).
5. **Track B** — clawback structure, devolution-row evidence, self-contained-vs-cross-period determination, negative/conditional engine-support finding (§7).
6. **Unified synthesis** — ratified root cause, the single corrected path, clawback integration, EECI pre-assessment, residual unknowns (§8).
7. **Summary line:** `DIAG-073 COMPLETE. HEAD=[sha]. Track A root=[candidate/matcher/prompt/threshold]. Thresholds: [N] AUTHORITY, [N] TOLERANCE, causal=[Y/N]. Track C root=[same/independent]. Clawback=[self-contained/cross-period]. Unified OB scope=[one path/N decisions]. [N] residual UNKNOWNs.`

Commit + push the single artifact:
```bash
mkdir -p docs/diagnostics
git add docs/diagnostics/DIAG-073_DIRECTIVE_20260618.md docs/diagnostics/DIAG-073_CONVERGENCE_UNIFIED_ROOT_CAUSE_OUTPUT.md
git commit -m "DIAG-073: Convergence unified-path root-cause forensic — directive + output"
git push origin main
```
The output file IS the completion report (SR-43). No separate report.

---

## §6A — Out of Scope
- No code changes, no fix, no branch. The unified OB is drafted separately AFTER this diagnostic is reviewed.
- No threshold edits (classify only).
- No clawback build (requirements only).
- No ground-truth values in the output (architect reconciles).
- No reliance on AUD-001 or any extract.

---

## §6B — Residuals / Feed-Forward
- DIAG-073's §8 synthesis is the direct input to the single unified OB (Tracks A + A′ + C + B).
- If §7.2 shows the clawback is cross-period, the OB carries a Design-Gate sub-component; if self-contained, it's a within-period prime.
- The 6-threshold table (§5) becomes the OB's threshold-elimination checklist; `no-developer-numbers-scan.sh` going green is part of the OB's definition of done.
- Any §8.5 UNKNOWN is the only thing the OB may need to probe at build time — everything else must be settled here.

---

*DIAG-073 · Convergence Unified-Path Root-Cause Forensic · 2026-06-18 · vialuce.ai — Intelligence. Acceleration. Performance.*
