# DIAG-051 — BCL EJECUTIVO CAPTACIÓN INTENT + HEADER COMPREHENSION INSPECTION
## Status: Drafted, ready for execution
## Execution mode: Read-only — persisted JSONB inspection (no code changes, no data writes)
## Execution locus (DEFAULT): CC headless tsx via service-role read client. Architect-run Supabase SQL Editor available as alternative — see Routing Note.
## CC dispatch: REQUIRED in default mode. CC writes + runs the read script, reports RAW JSONB only, and commits `DIAG-051_COMPLETION_REPORT.md` to project root.
## Number: DIAG-051 (next after highest of record DIAG-050; see Number Provenance — confirm or bump)
## Expected duration: ~15–20 min CC-active + architect interpretation
## Pairs with: SESSION_HANDOFF_20260528.md (Path P1)

---

## NUMBER PROVENANCE

Assigned **DIAG-051** as the next sequential number after the highest DIAG of record. Project-knowledge enumeration of `DIAG-NNN` references yields a sparse series topping out at **DIAG-050** (flywheel-replay binding-attrition; status *eliminated*). No authoritative DIAG sequence counter exists in project knowledge (governance index / VG holds the counter of record). Because the series has gaps (...046, 047, 050) and sessions between 2026-05-15 and 2026-05-28 close may have spent DIAG numbers not reflected here, DIAG-051 is the best-evidence assignment, not a verified-unique one. **Architect: confirm 051 is free, or bump.** If a collision is known, rename before dispatch.

---

## ROUTING NOTE (architect disposition — one line to override)

Two SOP-valid execution loci exist for read-only diagnostics:

- **Default — CC headless tsx (this DIAG as written).** Capability-first routing routes read-only inspection to CC (service-role read is a CC capability; only migrations/browser/keychain/PR/sign-off are architect-only). Diagnostic Protocol Rule 22 (headless-first) and the human-as-debugger anti-pattern both prefer this. Handoff §15 also specifies CC-executed tsx for this inspection. CC reads via the Supabase JS service-role client (no `psql`, no `exec_sql` RPC, per VP constraint) and pastes raw JSONB; the architect interprets.
- **Alternative — architect-run read-only SQL in Supabase Editor (DIAG-018 precedent).** Handoff §20 phrased the inspection this way. If preferred, say so and the three reads below render to equivalent read-only `SELECT`/`jsonb` queries for the Editor.

The split between handoff §15 (CC-tsx) and §20 (architect-Editor) is the reason this is surfaced as a disposition rather than assumed. Default stands unless overridden.

---

## OBJECTIVE

Disposition between the four hypothesis branches for why the **Ejecutivo** variant's *Captación de Depósitos* component calculated **$0 across all 72 Ejecutivo entities** while the **Senior** variant of the same component reconciled (Senior is the dimensional-coherence baseline). The Ejecutivo intent composed a field bound to `Pct_Meta_Depositos` (a computed percentage) against a field bound to `Meta_Depositos` (currency-absolute), producing a near-zero attainment ratio that falls below the lowest band.

Read two persisted JSONB artifacts and compare **what the LLM emitted** (the CompositionalIntent) against **what header comprehension classified** (per-column `dataType`). Four candidate branches, each leading to a different narrow fix:

- **(a) Emission discipline** — the LLM had the dimensional classification (e.g. `Pct_Meta_Depositos` → `percentage`) available in the plan_component prompt and emitted the incommensurate ratio anyway.
- **(b) Prompt context propagation** — the classification exists in comprehension but never reached the plan_component prompt's data-context block.
- **(c) Comprehension classification** — comprehension misclassified `Pct_Meta_Depositos` (e.g. `decimal` not `percentage`), so propagation alone would not have helped.
- **(d) Something else** — the intent declares something other than a two-field ratio, or the artifacts do not cleanly fit (a)/(b)/(c). Live option; not to be collapsed into the nearest branch.

The branch→fix mapping is **architect-channel** and lives below the CC dispatch block (reconciliation-channel separation). CC produces raw artifacts only and proposes no branch.

---

## GOVERNING DOCUMENTS CONSULTED

- `SESSION_HANDOFF_20260528.md` §-1.4 (binding constraint), §3 (defect isolation), §18 (R1/R2/R4/R5), §20 (Path P1)
- `SCHEMA_REFERENCE_LIVE.md` — `rule_sets`, `import_batches`, `classification_signals`
- `CC_DIAGNOSTIC_PROTOCOL.md` — Rule 21 (trace actual path), Rule 22 (headless-first), Rule 24 (max 3 rounds), human-as-debugger anti-pattern
- HF-251 — CompositionalIntent persists at `rule_sets.components[i].metadata.compositional_intent`
- Decision 158 (LLM recognition + code construction), Decision 64 (single `classification_signals` surface), Decision 153 (no seeds; comprehension persisted as signals)

---

## PRE-EXECUTION SCHEMA VERIFICATION (COMPLETED — with Risk R4 adjustment)

Verified against `SCHEMA_REFERENCE_LIVE.md` this session:

- `rule_sets` (18 cols): `components` jsonb (array). CompositionalIntent path per HF-251: `components[i].metadata.compositional_intent`; `components[i].metadata.construction_method`; `components[i].name`. Read R1 confirms this path empirically before Read R2 relies on it.
- `classification_signals` (20 cols): carries a **dedicated `header_comprehension` jsonb column**, plus `sheet_name`, `source_file_name`, `signal_type`, `signal_value` jsonb, `context` jsonb, `source`, `scope`, `created_at`. **This is the primary location for Datos-sheet header comprehension.**
- `import_batches` (11 cols): `metadata` jsonb (nullable). Secondary fallback only.

**Adjustment (Risk R4):** the handoff's Q1.3 (`import_batches.metadata`) and Q1.4 (`classification_signals.signal_value` via `signal_type` filter) were drafted before schema verification. The live schema shows a dedicated `header_comprehension` column; Read R3 below targets it first, with `signal_value` and `import_batches.metadata` as ordered fallbacks. If R3 returns empty on all three, the persistence location is genuinely unexpected → STOP and re-derive before continuing (do not fabricate a location).

---

## ═══════════ CC DISPATCH BLOCK — paste from this line to "END CC DISPATCH BLOCK" ═══════════

**Standing rules:** Apply `CC_STANDING_ARCHITECTURE_RULES.md` (current version) in full for this task.

**Autonomy + reporting directive (read first):**
- This is a **read-only diagnostic**. No code changes. No `INSERT`/`UPDATE`/`DELETE`. No `exec_sql` RPC. No fix. No schema migration.
- Read via the Supabase **service-role JS client** (`NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`). Run with `npx tsx`. Git from repo root.
- **Report RAW JSONB only.** Do **not** interpret the artifacts, do **not** propose which branch is operative, do **not** draft a fix. Interpretation is architect-channel.
- Report only at: completion (all three reads done) or an unresolvable blocker. Passing reads are not events to narrate.
- Commit the script to `scripts/diag-ejecutivo-captacion-inspection.ts` (Rule 23 — keep for regression).

**Constants:**
- `RULE_SET_ID = 'ebfdc935-b86b-4b67-931d-69a873f3c04e'`
- `TENANT_ID   = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'`
- `SINCE       = '2026-05-28T16:50:00Z'`  (import window for the active rule_set)
- `COMPONENT_NAME = 'Captación de Depósitos'`
- Columns of interest (Datos sheet): `Pct_Meta_Depositos`, `Depositos_Nuevos_Netos`, `Meta_Depositos`

**Read R1 — Component metadata structural verification.**
Fetch `rule_sets` row `id = RULE_SET_ID`; from `components` (array), print:
- `components.length` (expect 8)
- for each component: `name`, `metadata.construction_method` (expect `"compositional_intent"` for all), `metadata.compositional_intent.applies_to`
If any `construction_method` is not `"compositional_intent"`, STOP and report — the rule_set was not produced by HF-252 (Risk R5 implication).

**Read R2 — The two Captación intents, VERBATIM.**
From the same `components` array, select the entries where `name === COMPONENT_NAME` (expect 2: Senior + Ejecutivo). For each, print the **complete** `metadata.compositional_intent` JSONB verbatim (pretty-printed), labelled by its `applies_to`. Do not summarize or extract fields — print the full intent object for both so the architect can diff Senior vs Ejecutivo directly.

**Read R3 — Datos-sheet header comprehension (ordered fallbacks).**
Primary: query `classification_signals` where `tenant_id = TENANT_ID` AND `created_at >= SINCE` AND `header_comprehension IS NOT NULL`, ordered by `created_at` desc. For rows whose `sheet_name` or `source_file_name` corresponds to the entity Datos sheet, print the **full `header_comprehension` JSONB** verbatim.
- If `header_comprehension` is empty for all rows → fallback A: same table/filter, print `signal_type`, `source`, `sheet_name`, and full `signal_value` for `signal_type IN ('comprehension:plan_interpretation','comprehension:header','classification:outcome')`.
- If fallback A is also empty → fallback B: `import_batches` where `tenant_id = TENANT_ID` AND `created_at >= SINCE`; print `jsonb_object_keys(metadata)` and any sub-object containing a `headerComprehension`/`header_comprehension` key.
- If all three are empty → STOP and report "comprehension persistence location not found in expected surfaces"; do not guess.

The architect will read R3 for, per column (`Pct_Meta_Depositos`, `Depositos_Nuevos_Netos`, `Meta_Depositos`): the `dataType` classification, any `distribution.min/max/mean`, and the `columnRole`. CC prints the raw block; CC does not extract or judge these.

**Script skeleton (adapt as needed; keep read-only):**
```ts
// scripts/diag-ejecutivo-captacion-inspection.ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const RULE_SET_ID = 'ebfdc935-b86b-4b67-931d-69a873f3c04e';
const TENANT_ID = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
const SINCE = '2026-05-28T16:50:00Z';
const COMPONENT_NAME = 'Captación de Depósitos';

const j = (o: unknown) => JSON.stringify(o, null, 2);

async function main() {
  // R1 + R2
  const { data: rs, error: rsErr } = await supabase
    .from('rule_sets')
    .select('id, components')
    .eq('id', RULE_SET_ID)
    .single();
  if (rsErr) throw rsErr;

  const components: any[] = rs!.components ?? [];
  console.log('=== R1: component metadata ===');
  console.log('component_count:', components.length);
  for (const c of components) {
    console.log(j({
      name: c?.name,
      construction_method: c?.metadata?.construction_method,
      applies_to: c?.metadata?.compositional_intent?.applies_to,
    }));
  }

  console.log('\n=== R2: Captación intents VERBATIM ===');
  for (const c of components) {
    if (c?.name === COMPONENT_NAME) {
      console.log(`--- applies_to: ${j(c?.metadata?.compositional_intent?.applies_to)} ---`);
      console.log(j(c?.metadata?.compositional_intent));
    }
  }

  // R3 primary: dedicated header_comprehension column
  console.log('\n=== R3: header_comprehension (primary) ===');
  const { data: sigs, error: sigErr } = await supabase
    .from('classification_signals')
    .select('id, signal_type, source, sheet_name, source_file_name, header_comprehension, signal_value, created_at')
    .eq('tenant_id', TENANT_ID)
    .gte('created_at', SINCE)
    .not('header_comprehension', 'is', null)
    .order('created_at', { ascending: false });
  if (sigErr) throw sigErr;

  if (sigs && sigs.length) {
    for (const s of sigs) {
      console.log(j({ id: s.id, sheet_name: s.sheet_name, source_file_name: s.source_file_name }));
      console.log(j(s.header_comprehension));
    }
  } else {
    console.log('header_comprehension empty — see fallback A/B (run signal_value query, then import_batches.metadata).');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
```

**Output to paste back (raw, no commentary):**
1. R1 block (component_count + per-component method/applies_to)
2. R2 block (both intents, full verbatim JSONB)
3. R3 block (full `header_comprehension` for Datos-sheet rows; or fallback A/B output if primary empty)

**Completion report rules (25–28) for this DIAG:**
- 25. The report file is created BEFORE the final commit/push, not after. Order: run all three reads → create the report file with raw read output embedded → `git add` + commit the report → push.
- 26. Mandatory structure (adapted for a read-only DIAG): Commits → Files → Read-Completion Gates (the criteria below, verbatim, with raw output as evidence) → Standing-Rule Compliance → Known Issues → Raw Read Output.
- 27. Evidence = pasted raw JSONB / pasted script output. NOT "the read succeeded," NOT "comprehension was found." A read-completion gate is PASS only if its raw output is present in the report.
- 28. One commit for the script; one commit for the report (this is a single-phase read; no per-phase fan-out).

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `DIAG-051_COMPLETION_REPORT.md` in PROJECT ROOT.
- Created BEFORE the final commit/push.
- Contains the VERBATIM read-completion criteria below with DONE/BLOCKED and PASTED raw output as evidence.
- Committed to git as part of this DIAG.
- If this file does not exist at DIAG end, the DIAG is considered INCOMPLETE regardless of whether the reads ran.

**Read-completion gates (copy verbatim into the report):**

| # | Criterion (verbatim) | DONE/BLOCKED | Evidence (paste raw) |
|---|---|---|---|
| 1 | R1: rule_set `ebfdc935-…` fetched; `components.length` printed; per-component `name` + `construction_method` + `compositional_intent.applies_to` printed | | |
| 2 | R1 STOP-check: every `construction_method` == `"compositional_intent"` (else STOP + report) | | |
| 3 | R2: both `Captación de Depósitos` intents printed VERBATIM (full `compositional_intent` JSONB, labelled by `applies_to`) | | |
| 4 | R3: Datos-sheet `header_comprehension` printed verbatim from primary location; OR fallback A output; OR fallback B output; OR explicit "location not found" STOP | | |

CC fills DONE/BLOCKED and pastes raw output per row. CC adds no interpretation, names no branch.

## ═══════════ END CC DISPATCH BLOCK ═══════════

---

## ARCHITECT-CHANNEL INTERPRETATION (NOT part of CC dispatch — reconciliation-channel separation)

After CC pastes R1–R3 raw, disposition proceeds **in a turn separate from the paste** (Risk R1). Claude reads the artifacts and proposes a branch; the architect dispositions; no HF until then.

| R2 (Ejecutivo intent) shows | R3 (comprehension) shows | + plan_component prompt context (OQ3) | Branch | Narrow fix shape |
|---|---|---|---|---|
| two-field ratio referencing the `Pct_Meta_Depositos`-bound field + the `Meta_Depositos`-bound field | `Pct_Meta_Depositos` → `dataType: 'percentage'` | classification **is** in the prompt | **(a)** Emission discipline | Prompt addition: dimensional-consistency check on ratio compositions |
| same | `Pct_Meta_Depositos` → `dataType: 'percentage'` | classification **is not** in the prompt | **(b)** Prompt context propagation | Propagate comprehension `dataType` into plan_component data-context |
| same | `Pct_Meta_Depositos` → non-percentage (`decimal`/other) | — | **(c)** Comprehension classification | Improve `dataType` detection for percentage-shaped columns |
| anything other than a two-field ratio | any | — | **(d)** Something else | Disposition required before any drafting |

- OQ3 (whether the classification reaches the prompt) is a code read of `anthropic-adapter.ts` plan_component data-context block — only needed to separate (a) from (b), and only if R3 shows `percentage`.
- Branch (d) is selected if R2 does not show a two-field ratio, OR if R2/R3 do not coherently map to (a)/(b)/(c). Do not force-fit (Risk R2).

---

## EXECUTION CONSTRAINTS

- **Read-only.** No `INSERT`/`UPDATE`/`DELETE`, no migration, no code change, no fix. Read-only verification reads are the entire scope.
- **CC reports raw JSONB; CC does not interpret.** Branch disposition is architect-channel.
- **SR-34 (No Bypass):** structural diagnosis only; no workaround, no reduced-scope substitute.
- **Rule 24 (max 3 diagnostic rounds):** if reads do not resolve the location/shape after 3 rounds, write a failure analysis, not a 4th round.
- **Risk R5:** if R1 shows non-`compositional_intent` construction methods, the active rule_set has moved — STOP and re-verify state before continuing.

---

## SCOPE BOUNDARY (what this DIAG does NOT do)

- Does **not** draft an HF (gated until the architect dispositions a branch — Risk R1)
- Does **not** modify convergence (proven anchor), the constructor, comprehension classification, or the engine
- Does **not** touch the 54 deferred `scale_annotation` warnings (hygiene; out of scope)
- Does **not** invoke IRA, author a DS, or open a Design Gate (premature here)
- Does **not** force inspection results into (a)/(b)/(c) — branch (d) stays live

---

## COMPLIANCE CHECKLIST

- ☑ Governance domain: Plan Intelligence / CompositionalIntent emission + Header Comprehension (Decision 158, Decision 64)
- ☑ Governing documents cited (handoff §-1.4/§3/§18/§20, schema, diagnostic protocol, HF-251)
- ☑ No locked decision contradicted (read-only)
- ☑ Schema verified against `SCHEMA_REFERENCE_LIVE.md`; comprehension probe re-pointed to dedicated `header_comprehension` column (Risk R4)
- ☑ Korean Test: structural JSONB paths + persistent named-entity match (`name === 'Captación de Depósitos'`); no language-string classification heuristic
- ☑ Reconciliation-channel separation: no GT values in the DIAG; interpretation matrix quarantined from CC dispatch block
- ☑ SR-34 (No Bypass); Diagnostic Protocol Rule 22 (headless-first) + human-as-debugger anti-pattern addressed
- ☑ Premature-numbering avoidance: DIAG-051 assigned as next-of-record (provenance documented; architect confirms/bumps); fix is provisional HF-253 post-disposition
- ☑ Evidentiary gates: pasted script + pasted raw output (no self-attestation)
- ☑ Completion-report enforcement (Rules 25–28): `DIAG-051_COMPLETION_REPORT.md` required in project root, created before final push, verbatim read-completion gates with pasted raw output; structure adapted for read-only DIAG (proof gates → read-completion gates, DONE/BLOCKED not PASS/FAIL)

---

*vialuce.ai · Intelligence. Acceleration. Performance.*
*DIAG-051 — DIAG_BCL_EJECUTIVO_CAPTACION_INSPECTION.md — drafted 2026-05-28*
*Read-only inspection of two persisted JSONB artifacts to disposition branches (a)/(b)/(c)/(d). Execution gates HF-253 drafting; no HF until disposition lands.*
