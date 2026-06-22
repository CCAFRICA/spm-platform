VP SESSION CONTINUATION from 2026-06-20 handoff.

PLATFORM: Vialuce (vialuce.ai), B2B ICM/SPM, LATAM enterprise
REPO: CCAFRICA/spm-platform
TENANTS: BCL (b1c2d3e4), Meridian (5035b1e8), MIR (972c8eb0)

WHAT HAPPENED LAST SESSION:
OB-217 through OB-225 merged (7 PRs). Per-transaction audit substrate,
clawback engine, commission statement UI, string comparison fix, temporal
binding, filtered aggregation, Decision 158 pipeline completion.

Three-tenant clean-slate executed. BCL regressed from $312,033 to ~$244,000.
Root cause diagnosed: the LLM re-interpretation emitted aggregate/count
(counts rows, always 1) instead of reference (reads the numeric value) for
the Productos Cruzados component. Plan says "$25 por producto" meaning
value x rate; interpreter says count(rows) x rate. c0, c1, c3 all match GT
exactly. Only c2 is wrong.

IRA invocation (ded357c9, $1.18) bound 11 substrate entries. Key finding:
three OB remediation attempts (OB-222/223/223-R2) = pattern, not bug (E920).
The prompt-loading approach is registry propagation (E910 Korean Test
violation). Three supersession candidates: E910 (construction boundary),
E902 (convergence round-trip closure), E906 (signal-accumulation contract).

OB-225 HALT-DIAG corrected two foundational premises: (1) the LLM does NOT
produce prime_dag directly; constructTree in intent-constructor.ts (686 lines)
builds DAGs deterministically. (2) intent-transformer.ts is a 268-line legacy
marshaller, not unused. Corrected scope added filtered_aggregate ReferenceSource
+ categorized structure shape. 9/9 synthetic tests. BCL+Meridian
DAG-equivalence byte-identical.

WHAT NEEDS TO HAPPEN NOW:
1. The BCL c2 defect is a generalized interpreter pattern: the interpreter
   does not distinguish between "count of items" (aggregate/count) and
   "read the numeric value of a field" (reference). When a plan says
   "$X per unit" where the unit count is a numeric field, the correct
   primitive is reference x constant, not count x constant. This is NOT
   an SQL fix. The platform must interpret this correctly on re-import.

2. After the interpreter fix: clean-slate BCL, re-import, verify $312,033.

3. Clean-slate MIR, re-import through improved interpreter (OB-225 merged),
   calculate January, reconcile against MIR_Resultados_Esperados.xlsx.

STANDING RULES (enforced this session):
- No em-dashes or en-dashes, ever.
- No table updates to correct platform behavior. The platform must work.
- Schema must be READ before authoring SQL.
- SCHEMA_REFERENCE_LIVE.md (2026-05-07) is stale. Verify live schema.
- Directory paths, file names: substrate or ask, never infer.

REGRESSION ANCHORS:
- BCL: $312,033 (REGRESSED, sole defect c2 Productos Cruzados)
- Meridian: $556,985 (KI-1 C5 Fleet Utilization open)
- MIR: reconcile against MIR_Resultados_Esperados.xlsx

IRA SUPERSESSION CANDIDATES (pending architect disposition):
- E910: extend Korean Test to cover construction boundary
- E902: instantiate round-trip closure at convergence-to-resolver boundary
- E906: govern intent-transformer signal-accumulation contract

GENERALIZED DEFECT CLASS (the binding constraint):
The plan interpretation pipeline recognizes WHAT a plan means but
incorrectly constructs HOW to compute it. Three specific pattern failures:
(a) Scalar-per-unit: "$X per unit" where units are a numeric field.
    Interpreter emits count(rows) x rate instead of value x rate.
    BCL evidence: c2 Productos Cruzados produces constant $1,621/period
    instead of varying $8,480 to $10,646.
(b) Category-differentiated rates: per-row attribute filtering must happen
    before aggregation. Interpreter emits conditional at aggregate level.
    MIR P1 evidence: 1.86x vs ground truth.
(c) Count of qualified rows: filter(condition) then count then multiply.
    Interpreter emits scalar reference. MIR P4 evidence: 199x vs ground truth.

All three are recognition-correct, construction-wrong. The IRA identifies
this as a structural pattern requiring a structural response (E920), not
another prompt fix.

FILES TO UPLOAD: BCL_Resultados_Esperados.xlsx, BCL_Plan_Comisiones_2025.xlsx,
MIR_Resultados_Esperados.xlsx, IRA_OB214_Pipeline_Completion_Scope_Coherence_20260620.md,
OB-225_COMPLETION_REPORT.md, OB-214_DIRECTIVE_20260618.md
