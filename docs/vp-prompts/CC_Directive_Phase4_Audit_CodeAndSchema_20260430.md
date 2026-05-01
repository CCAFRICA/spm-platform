# CC Directive — Phase 4 Audit Execution (Code-and-Schema Scope)

**Issued:** 2026-04-30
**Channel:** Architect → CC
**Repo:** `~/spm-platform` (operate from repo root for git ops; `~/spm-platform/web` for code paths)
**Branch:** `ds021-substrate-audit` (already created off main, clean — verified Section 13)
**Scope:** Code and schema audit. Runtime probes requiring populated `committed_data` / `rule_sets` are deferred (this environment has empty proof-data tables; deferral is environment-scope, not workaround).

**Authority artifacts on disk:**
- DS-021 v1.0 LOCKED → `docs/design-specifications/DS-021_Substrate_Architecture_Biological_Lineage_v1_0_LOCKED_20260430.md`
- DIAG-DS021-Phase4 → `docs/diagnostics/DIAG_DS021_Phase4_Comprehensive_Audit_Specification_20260430.md`
- Plan v1.1 → `docs/vp-prompts/PHASE_4_AUDIT_EXECUTION_PLAN_v1_1_20260430.md`

Where Plan v1.1 conflicts with DIAG, Plan v1.1 governs. R-1 (G7-02 structural reframe), R-2 (G11-01 split), R-3 (P5 substrate-bounded thresholds) are authoritative.

---

## 0. Scope and Discipline

**In scope:**
- All S-CODE-* probes (source-on-disk inspection)
- S-SCHEMA-* probes via static analysis of migration files in `web/supabase/migrations/` (NOT live `information_schema` — environment lacks direct Postgres surface)
- S-SIGNAL-* probes against current `classification_signals` (14 rows; sufficient for signal-type distribution observability)
- Architecture-Trace static portions
- IRA invocation on Cluster A (deliverable-internal per Plan v1.1 Section 5.bis)

**Deferred (document, do not execute):**
- S-RUNTIME-G9-02 reconciliation (requires CRP committed_data; absent)
- S-RUNTIME-G11-01 run-to-run learning (requires two-run sequence; insufficient data)
- S-RUNTIME-G10-01 duplicate-execution test (requires runnable calculation; absent)
- S-RUNTIME-G3-01, G4-01, G4-02, G1-01 (require fixtures)
- S-UI-G2-01 (no browser automation surface)
- Property tests requiring runtime observation

**CC discipline:**
- Paste evidence; do not disposition; do not interpret
- HALT on blocker; do not bypass (SR-34)
- Per-cluster checkpoint with token budget report
- IRA invocation captures packet verbatim; no modification

---

## 1. Standing Rule 34 — Verbatim

> Diagnose and fix structurally. No workarounds, configuration changes, reduced scope tests, or interim measures that avoid a blocker.

For probes deferred under Section 0: deferral is **environment scope**, not bypass. The probe specification is unchanged; the environment lacks the populated state the probe requires. CC documents the deferral with reason; CC does NOT execute against synthetic substitute data.

For probes in scope: SR-34 applies probe-by-probe. HALT triggers below.

---

## 2. HALT Triggers

- **HALT-A.** Probe spec ambiguous; multiple readings produce different evidence
- **HALT-B.** Probe requires capability not in CC's surface (per inventory)
- **HALT-C.** Code path inspected does not exist where probe expects
- **HALT-D.** Code path exists but with structure radically different from probe assumption
- **HALT-E.** Evidence collected does not fit the verdict matrix (R-2 G11) or other refined-probe matrices
- **HALT-G.** IRA invocation tool unavailable from CC environment for Phase 4.A.4
- **HALT-H.** IRA cost field absent from packet (Correction 6 violation)

On HALT: CC pastes probe ID, trigger letter, what CC tried, what CC did NOT try (bypasses considered and rejected). Waits for architect disposition.

---

## 3. Per-Cluster Checkpoint Protocol

After completing each cluster (A, B, C, D, Remaining):

1. Submit complete evidence package: probe IDs, pasted evidence per probe, IRA packet for Cluster A only, deferred-probe inventory for that cluster
2. Report token budget remaining as percentage
3. PAUSE — wait for architect signal `RESUME_CLUSTER_<X>` or `HALT_AUDIT`

If token budget falls below 30% at any checkpoint: explicitly flag.

---

## 4. Phase 4.A — Cluster A (Signal Surface Coherence)

### 4.A.1 — PF-02 Probes (G11)

**S-CODE-G11-01a (within-run read-path).** Inspect convergence service for code paths that query `classification_signals` filtered to current run's `run_id` (or equivalent run-scoping identifier).

Suggested entry points (CC verifies actual paths):
- `web/src/lib/convergence/*`
- `web/src/lib/calculation/convergence/*`
- Search: `grep -rn "classification_signals" web/src/lib/`
- Search: `grep -rn "from('classification_signals')" web/src/`

Required output: pasted code excerpts showing within-run signal consumption, OR pasted grep results showing absence.

**S-CODE-G11-01b (cross-run read-path).** Inspect convergence service for code paths that query `classification_signals` with no run_id filter, or with explicit cross-run aggregation (joining to prior runs' signals, querying signal history, applying flywheel learning across runs).

Required output: pasted code excerpts, OR pasted grep results showing absence.

**S-CODE-G11-02 (flywheel aggregation read-path).** Inspect flywheel aggregation code (if present) for read-path that queries `classification_signals` and aggregates across runs. Required output: pasted code excerpts or absence-evidence.

Suggested entry points: `web/src/lib/flywheel/*` if present; else search `grep -rn "flywheel" web/src/`.

**S-SIGNAL-G11-01 (cross-run aggregation evidence in signals).** Query `classification_signals` for evidence of cross-run aggregation (signals from prior runs being referenced or aggregated by subsequent runs).

Suggested approach: write tsx script in `web/scripts/audit_g11_signal_inspection.ts` using existing `@supabase/supabase-js` createClient pattern with `SUPABASE_SERVICE_ROLE_KEY`. Query:

```typescript
// Inspect signal-type distribution and run-scoping
const { data: signals } = await supabase
  .from('classification_signals')
  .select('*')
  .limit(50);
console.log('Total rows:', signals?.length);
console.log('Distinct signal_type values:', [...new Set(signals?.map(s => s.signal_type))]);
console.log('Sample row structure:', JSON.stringify(signals?.[0], null, 2));
console.log('run_id presence:', signals?.filter(s => s.run_id != null).length, 'of', signals?.length);
```

CC verifies actual schema column names (signal_type, run_id may be named differently) by inspecting first row first. Required output: pasted script + pasted output.

Note: only 14 rows present. Probe assesses *signal-surface architectural shape*, not population magnitude.

**Verdict matrix readout (CC populates from above evidence):**

| 11-01a result | 11-01b result | Aggregate G11 magnitude per R-2 |
|---|---|---|
| ABSENT | ABSENT | blocking |
| PRESENT | ABSENT | severe |
| ABSENT | PRESENT | severe |
| PRESENT | PRESENT | candidate ADHERED |

CC reports the cell. CC does NOT disposition.

### 4.A.2 — PF-01 Probes (G7)

**S-CODE-G7-01 (SCI agent signal-write paths).** Inspect every SCI agent for signal-write code. Verify all writes target `classification_signals`.

Suggested entry points: `web/src/lib/sci/*` per agent (Plan, Entity, Target, Transaction, Reference). Search: `grep -rn "classification_signals" web/src/lib/sci/`. Also search for any `.insert(` calls inside SCI directories.

Required output: pasted code excerpts of signal-write paths per SCI agent, OR pasted grep results showing each agent's write patterns.

**S-CODE-G7-02 (private signal channel detection — R-1 structural-not-lexical).**

This environment lacks direct Postgres surface for live `information_schema` queries. R-1's structural intent is preserved through migration-file inspection (the source of truth for schema):

**Step 1 — JSONB column enumeration from migration files.**

```bash
# From repo root
grep -rn "jsonb\|JSONB\|json " web/supabase/migrations/*.sql | grep -i "create table\|add column\|alter table"
```

For each match, identify: table name, column name, the migration file that introduced it.

If migration files don't fully inventory current state (some columns may have been altered or dropped), supplement with:

```typescript
// In web/scripts/audit_g7_jsonb_inventory.ts
// Probe each known table for JSONB columns by attempting to read one row
// and inspecting types of returned values. Inferential, not authoritative.
```

Primary source-of-truth: migration files. Inferred supplement only if migrations show ambiguous current state.

Required output: pasted JSONB column inventory: `[(table_name, column_name, introducing_migration)]`.

**Step 2 — Per-column key vocabulary inspection.**

For each JSONB column from Step 1, query distinct top-level keys present in the live data (the service-role JS client supports this via row inspection):

```typescript
// In web/scripts/audit_g7_jsonb_keys.ts
const tables = [/* from Step 1 */];
for (const {table, column} of tables) {
  const { data } = await supabase.from(table).select(column).not(column, 'is', null).limit(50);
  const allKeys = new Set<string>();
  data?.forEach(row => {
    if (row[column] && typeof row[column] === 'object') {
      Object.keys(row[column]).forEach(k => allKeys.add(k));
    }
  });
  console.log(`${table}.${column}:`, [...allKeys]);
}
```

For each distinct key, classify by inspection: *(a)* configuration data, *(b)* user-supplied content, *(c)* agent-to-agent or run-to-run intelligence transport.

Required output: pasted per-column key inventory + classification rationale per key.

**Bypass key list.** Any (c)-classified key is a candidate G7 violation regardless of name. plan_agent_seeds in `rule_sets.input_bindings` is one such key (known prior to audit). CC enumerates additional via this probe.

**Korean Test discipline.** CC does NOT use field-name string matching as primary detection. Probe is structural: enumerate columns, inspect actual key vocabulary, classify by inspection. Name-based filtering of the *resulting* classification list is permissible; name-based filtering of *which columns to inspect* is not.

**S-SCHEMA-G7-01 (classification_signals three-level support).** Verify schema supports three signal levels (signal_type vocabulary covering classification / comprehension / convergence prefixes per Decision 64 v2 architecture).

Source: migration file that creates `classification_signals` table. Search:

```bash
grep -rn "create table.*classification_signals" web/supabase/migrations/*.sql
grep -A 30 "create table.*classification_signals" web/supabase/migrations/*.sql
```

Plus runtime distribution from S-SIGNAL-G11-01 script.

Required output: pasted schema definition + pasted signal_type distribution from current data.

**S-SIGNAL-G7-01 (signal-type distribution across SCI agents).** Extension of S-SIGNAL-G11-01. Query for source_agent (or equivalent) distribution.

```typescript
// Extend the audit_g11 script
const bySource = signals?.reduce((acc, s) => {
  const key = `${s.signal_type}::${s.source_agent || s.source || s.created_by || 'unknown'}`;
  acc[key] = (acc[key] || 0) + 1;
  return acc;
}, {} as Record<string, number>);
console.log(JSON.stringify(bySource, null, 2));
```

CC verifies actual column name for source attribution by inspecting a row first.

Required output: pasted query result.

### 4.A.3 — Pre-IRA Evidence Assembly

CC assembles `cluster_a_evidence.md` in working directory containing:
- All PF-02 probe results (4.A.1)
- All PF-01 probe results (4.A.2)
- 11-01a / 11-01b verdict-matrix readout
- Bypass key list from G7-02 Step 2

### 4.A.4 — IRA Invocation (Deliverable-Internal, per Plan v1.1 Section 5.bis)

CC executes IRA invocation as part of Cluster A close. CC does NOT pause for architect to run it.

**Working directory:** `~/vialuce-governance` (CC has cross-repo nav verified)

**Invocation prompt CC drafts (template — fill bracketed placeholders from collected evidence):**

```
Cluster A (signal surface coherence) substrate-coherence review.

The Phase 4 audit collected the following evidence against G7 (Single Canonical Signal Surface) and G11 (Read-Path Coherence at the Signal Surface):

[PF-02 PASTED EVIDENCE: full output of S-CODE-G11-01a, S-CODE-G11-01b, S-CODE-G11-02, S-SIGNAL-G11-01]

[PF-01 PASTED EVIDENCE: full output of S-CODE-G7-01, S-CODE-G7-02 Step 1+Step 2, S-SCHEMA-G7-01, S-SIGNAL-G7-01]

Per the verdict matrix in Plan v1.1 Section 3.2 (R-2):
- 11-01a (within-run read-path) result: [PRESENT | ABSENT]
- 11-01b (cross-run read-path) result: [PRESENT | ABSENT]
- Aggregate G11 magnitude per matrix: [blocking | severe | candidate ADHERED]

Per R-1 (structural-not-lexical G7-02): plan_agent_seeds confirmed via JSONB key inspection of migration files + live column data. Additional bypass keys identified: [list of (c)-classified keys, or "none"].

Architect-channel question for IRA review:

Given this evidence and the substrate's commitment to G7 + G11, is Cluster A's compliance gap (a) remediable through architectural pattern change (severe magnitude — migrate plan_agent_seeds + any other bypass keys to classification_signals; build cross-run read-path on convergence service in place; coordinated remediation), OR (b) requires rebuild of the convergence service (blocking magnitude — current convergence service architecture cannot support read-path coherence in place)?

Substrate-bounded authority note: G11 enforcement mechanism specification is forward-looking architectural work (DS-021 v1.0 Section 14 FLI-1, Plan v1.1 Section 7 deferred). IRA review should flag if its disposition depends on enforcement-mechanism content not yet in substrate.

Note on audit scope: this audit operates on code-and-schema evidence. Runtime confirmation (S-RUNTIME-G11-01 cross-run learning test) is deferred pending populated proof-data environment. IRA review should weight code-and-schema evidence accordingly.

Bindings to load:
- DS-021 v1.0 Section 6 G7 commitment text
- DS-021 v1.0 Section 6 G11 commitment text
- DS-021 v1.0 Section 12 Substrate Bounded Authority methodology
- DIAG-DS021-Phase4 Section 4.7 G7 probe specifications
- DIAG-DS021-Phase4 Section 4.11 G11 probe specifications
- DIAG-DS021-Phase4 Section 8.5 Cluster A interconnection
- Plan v1.1 Section 3.1 R-1 G7-02 structural reframe
- Plan v1.1 Section 3.2 R-2 G11-01 within-run vs cross-run split
- AUD-002 v2 plan_agent_seeds finding
- AUD-002 v2 write-only signal surface finding (24% Decision 155 compliance)

Expected output: substrate-grounded reasoning on (a) vs (b), with named bindings, magnitude justification, and any substrate-bounded-authority flags.
```

**Invocation execution:**

```bash
cd ~/vialuce-governance
# Save the prompt to a file first to avoid shell escaping issues
cat > /tmp/ira_cluster_a_prompt.txt << 'EOF'
[PROMPT TEXT WITH PLACEHOLDERS FILLED]
EOF
npm run ira -- "$(cat /tmp/ira_cluster_a_prompt.txt)"
```

**Capture:**
- IRAPacket: full stdout from `=== IRA PACKET ===` through `=== COST: $... ===`
- Save verbatim to `cluster_a_ira_packet.json` in spm-platform working directory
- Cost: extract from packet, record explicitly

**HALT conditions:**
- Invocation throws → HALT-G; do not retry without architect direction
- Cost field absent → HALT-H
- Packet truncated/malformed → HALT, paste raw output

CC does NOT disposition the IRA verdict. CC does NOT modify the IRAPacket.

### 4.A.5 — Cluster A Checkpoint

CC submits:
- 4.A.1 PF-02 evidence
- 4.A.2 PF-01 evidence
- 4.A.3 Pre-IRA assembly file
- 4.A.4 IRA invocation prompt-as-drafted + IRAPacket verbatim + cost
- Token budget remaining (%)

CC PAUSES. Waits for `RESUME_CLUSTER_B`.

---

## 5. Phase 4.B (Removed in Plan v1.1) — IRA folded into 4.A.4

---

## 6. Cluster B — Processing Boundary Discipline

After `RESUME_CLUSTER_B`:

### 6.B.1 — PF-03 Probes (G5)

**S-CODE-G5-01 (dispatch sites).** Identify dispatch sites operating on primitive identifiers. Verify identifier vocabulary derives from canonical registry. Search:
```bash
grep -rn "primitive-registry" web/src/
grep -rn "PRIMITIVE_TYPE\|primitiveType" web/src/
```

**S-CODE-G5-02 (validation surfaces).** Identify primitive-identifier validation surfaces. Verify reference to canonical registry.

**S-SCHEMA-G5-01 (canonical registry table).** Find migration that creates the registry table. Source: migration file inspection.

### 6.B.2 — PF-04 Probes (G8)

**S-CODE-G8-01 (foundational code field-name literals).** Grep foundational code for natural-language field-name string literals. Search:
```bash
grep -rn -E "(['\"](?:nombre|apellido|comision|monto|fecha|cliente|vendedor|territorio|producto)['\"])" web/src/lib/sci/
grep -rn -E "(['\"](?:name|amount|date|customer|salesperson|territory|product|commission)['\"])" web/src/lib/sci/foundational/
```

This probe is name-based detection of name-based-detection violations. Permissible per Korean Test discipline (auditing for Korean-Test violations may use name patterns to surface candidates; IDENTIFICATION must remain structural).

**S-CODE-G8-02 (SCI field-identification logic).** Inspect SCI field-identification methodology per agent.

**S-CODE-G8-03 (AI prompt construction).** Inspect AI prompt construction. Verify structural classification request, not name-based.

### 6.B.3 — Cluster B Checkpoint

CC submits evidence + token budget. PAUSES. Waits for `RESUME_CLUSTER_C`.

---

## 7. Cluster C — Calculation Engine Discipline (Code-and-Schema only)

After `RESUME_CLUSTER_C`:

**S-CODE-G9-01 (AI/math code organization).** Verify code organization separates AI-call code from math code.

**S-CODE-G9-02 (calculation engine plan-loading lifecycle).** Inspect calculation engine entry point. Verify plan-load-once-at-run-start pattern.

Suggested entry points:
- `web/src/lib/calculation/`
- Search: `grep -rn "plan_id" web/src/lib/calculation/`

**S-RUNTIME-G9-01 — DEFERRED.** Documented; not executed (no runtime test infrastructure for mid-run plan modification in this environment).

**S-RUNTIME-G9-02 — DEFERRED.** Documented; not executed (no CRP committed_data in this environment).

CC submits Cluster C evidence + deferred-probe inventory + token budget. PAUSES. Waits for `RESUME_CLUSTER_D`.

---

## 8. Cluster D — Schema Architectural Constraints

After `RESUME_CLUSTER_D`:

**S-CODE-G10-01 (DELETE-before-INSERT pattern).** Inspect persistent expression surfaces for DELETE-before-INSERT pattern.

**S-SCHEMA-G10-01 (UNIQUE constraint coverage).** Source: migration file inspection. Search:
```bash
grep -rn "UNIQUE\|unique constraint\|create unique index" web/supabase/migrations/*.sql
```

**S-RUNTIME-G10-01 — DEFERRED.** Documented; not executed (no runnable calculation in this environment).

CC submits Cluster D evidence + deferred-probe inventory + token budget. PAUSES. Waits for `RESUME_REMAINING`.

---

## 9. Remaining — G1, G2, G3, G4, G6 + Property Tests (Code-and-Schema portions)

After `RESUME_REMAINING`:

CC executes code-and-schema portions of remaining commitments:
- G1 S-CODE-* and S-SCHEMA-* probes
- G2 S-CODE-* and S-SCHEMA-* probes (S-UI-G2-01 deferred — no browser surface)
- G3 S-CODE-* and S-SCHEMA-* (S-RUNTIME-G3-01 deferred)
- G4 S-CODE-* (S-RUNTIME-G4-01, G4-02 deferred)
- G6 S-CODE-* probes

Property observability tests P1–P11: code-observable portions only (mechanism-presence per R-3 P5 thresholds; runtime-observable portions deferred).

Architecture-Trace static portions (16-probe per TMR Addendum 10): code-observable portions only.

CC submits final evidence + complete deferred-probe inventory + token budget.

---

## 10. Evidence Format (per probe)

```
### Probe ID: <probe ID>
**Subject:** <what the probe inspects>
**Execution:** <command, query, or grep CC ran>
**Output:**

<pasted output verbatim>

**CC observation:** <factual only — what was found>
**Verdict matrix readout:** <e.g., for G11, the 11-01a/11-01b cell>
```

For deferred probes:

```
### Probe ID: <probe ID>
**Status:** DEFERRED — environment scope
**Reason:** <specific environment limitation, e.g., "committed_data table empty; CRP fixture not present">
**Re-execution requires:** <what environment state would enable execution>
```

CC observation discipline:
- Factual statements about code presence/absence: permissible
- Verdict assignment: NOT permissible
- Magnitude characterization: NOT permissible

---

## 11. Commit Discipline

CC commits at every cluster checkpoint:

```bash
git add <evidence files>
git commit -m "Phase 4 audit: Cluster <X> evidence collected"
git push origin ds021-substrate-audit
```

SR-41 applies: contamination on pushed commit = `git revert <SHA>`, NOT reset+force-push.

No PR until architect signals audit close.

---

## 12. Audit Close

CC produces at completion:
- All cluster evidence on `ds021-substrate-audit` branch (committed, pushed)
- Final token budget
- Inventory of HALT events (probe ID, trigger, architect disposition)
- Inventory of DEFERRED probes (probe ID, reason, re-execution requirements)
- Inventory of probes executed cleanly
- IRA invocation cost summary
- `gh pr create --base main --head ds021-substrate-audit --title "Phase 4 substrate audit (code-and-schema scope)" --body "Audit evidence per DS-021 v1.0, DIAG, Plan v1.1. Cluster A IRA-reviewed. Runtime probes deferred per environment scope."`

CC's final message: "Phase 4 audit (code-and-schema scope) complete. Evidence on PR <#NNN>. <N> HALT events resolved. <M> probes executed cleanly. <K> probes deferred (environment scope). IRA invocation cost: $<X>. Awaiting architect direction."

---

## 13. Pre-Execution Verification (Already Completed)

Per the staging directive, Section 13 verification is already complete:
- ✓ Repo: spm-platform
- ✓ Branch: ds021-substrate-audit (clean off main)
- ✓ Authority artifacts at canonical paths
- ✓ vialuce-governance accessible; npm run ira loadable
- ✓ DB read access via service-role JS client (live verification: classification_signals=14 rows; committed_data=0; rule_sets=0)
- ✓ Standing rules accessible

CC begins Phase 4.A directly on `BEGIN_PHASE_4_A` signal.

---

## 14. Plan v1.1 Refinements (Authoritative Where Conflicting)

- **R-1** supersedes DIAG Section 4.7 S-CODE-G7-02. Two-step structural probe (migration-file inventory + live-data key inspection), NOT name-based grep.
- **R-2** supersedes DIAG Section 4.11 S-CODE-G11-01. Split into 11-01a (within-run) and 11-01b (cross-run) with verdict matrix.
- **R-3** supersedes DIAG Section 5.1 P5 row. PRESENT / ABSENT-BOUNDED / ABSENT-UNBOUNDED verdict thresholds, NOT "property absence is substrate violation."

---

## 15. Single-Page Reference

- Branch: `ds021-substrate-audit`
- Plan v1.1 governs probe semantics
- Paste evidence; do not disposition
- HALT on blocker; SR-34 — no bypass
- Per-probe HALT triggers A-E, G, H
- Per-cluster checkpoint: pause for RESUME signal
- Token budget reported each checkpoint
- Deferred probes documented with reason + re-execution requirements
- IRA invocation deliverable-internal in Phase 4.A.4
- Audit close: PR via gh pr create

---

*Phase 4 Audit Directive · Code-and-Schema Scope · Capability-Matched · 2026-04-30*
*Awaiting `BEGIN_PHASE_4_A` signal to start Phase 4.A.*
