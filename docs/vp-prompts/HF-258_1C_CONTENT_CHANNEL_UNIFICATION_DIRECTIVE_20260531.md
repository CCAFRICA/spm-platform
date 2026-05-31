# HF-258 — 1C Content-Channel Unification + Transport Retirement (Q2 + Q5)
# First implementation slice of the locked 1C path design (IRA Path_Comprehensive 2026-05-31)
# Repo: CCAFRICA/spm-platform (VP)
# Date: 2026-05-31
# Sequence: HF-258 (of-record; prior merged this session: HF-255, HF-256, HF-257)
# File path (this directive): docs/vp-prompts/HF-258_1C_CONTENT_CHANNEL_UNIFICATION_DIRECTIVE_20260531.md
# SSOT reference: docs/code-references/SCI_INGESTION_PLAN_EXECUTION_TRACE_LIVE_dede922b.md (AUD-0015)

---

## §0 — CC Standing Rules
Read CC_STANDING_ARCHITECTURE_RULES.md and COMPLETION_REPORT_ENFORCEMENT.md before starting.
Operating rules in force: ADR before code (Architecture Decision Gate); commit+push per phase;
final-build sequence (kill dev server → rm -rf .next → npm run build → npm run dev → confirm
localhost:3000) before the completion report; git from repo root (spm-platform), not web/;
`gh pr create --base main --head dev` as the final step. Evidence means PASTE, not describe.
zsh: single-quote every grep pattern.

This file IS the prompt (DD-11): no execution block, no paste block, no tail. It ends at §6A.

---

## §1 — Problem & Scope

### 1.1 — The design this HF implements (locked)
The comprehensive design for the ingestion→plan-interpretation path is locked as **1C (hybrid)**:
make whole for transport/dispatch; re-architect a bounded sub-region. This HF implements the
FIRST slice — the content-channel unification and the dead-transport retirement. It does NOT
implement idempotency, scale/parallelization, or supersession audit (those are the subsequent
slices — see §6). The slices are sequenced in the order the design's interdependency map dictates:
the unified content representation is the precedent the later slices build on (the idempotency
fingerprint must be computed on the unified representation), so it lands first.

### 1.2 — What is wrong today (the structural defect, not a symptom)
Plan content reaches the interpretation model through **two different channels depending on
format**: text formats (XLSX, PPTX, DOCX) are extracted to text and travel as in-band text; PDF
travels as a separate document-block (base64) channel. The orchestrator's per-phase model calls
were built to consume the in-band text; the document-block channel is attached for only two of the
interpretation task types, so for PDF the content is silently dropped on the orchestrator's primary
phases (skeleton + per-component). PDF plan interpretation — a proven, shipped capability (CRP/Caribe,
production 2026-05-18) — is therefore regressed. The root is **format functioning as a dispatch
branch** in the content channel: any new format or task type must be hand-wired. (AUD-0015 confirmed:
the gate at the adapter admits two of six tasks; the regression entered when the multi-phase
orchestrator introduced new task names without extending the channel.)

A redundant transport field compounds it: a base64 file-bytes field is set and forwarded in request
bodies but consumed by nothing at execute (the live path already materializes base64 server-side
from storage). This is a dead transport path and a data-handling-posture concern.

### 1.3 — The fix (the WHAT and the mechanism)
**Eliminate format-as-branch. Make content reach every interpretation phase through one normalized
representation, consumed identically regardless of source format, with no content loss for any
format.** The mechanism the design requires:

1. **A normalized content unit, produced once at ingestion**, carrying a content *type* —
   `text` (the payload is extracted text) or `document` (the payload is a storage reference to a
   source the model must read directly, e.g. a PDF whose fidelity depends on the model's text-layer
   + vision reading). Format-specific parsing is an ingestion concern; it happens once, upstream of
   the orchestrator.
2. **Every orchestrator phase consumes the content unit uniformly** — skeleton phase and every
   per-component phase. No phase branches on format.
3. **The adapter attaches content based on the content unit's TYPE, not on the task name.** A
   `text` unit's payload is sent as text; a `document` unit's payload is materialized to a document
   block (base64 read from storage server-side) and attached — **for every plan/document task**, not
   a hardcoded subset. This is the Korean-Test correction: dispatch on structural content identity,
   not format identity.
4. **Transport retirement (Q5):** the dead base64 field is removed. A `document` content unit
   carries a storage reference; the base64 is materialized server-side at adapter time from storage.
   No file bytes travel in request bodies (AP-1). Storage-reference-only is the transport invariant.

This restores PDF (its content unit is `document`-type and is attached on every phase), preserves
all text formats unchanged (their content unit is `text`-type), and is extensible (a new format
produces a content unit of the correct type at ingestion; nothing downstream changes).

### 1.4 — Why NOT the narrow gate-fix
Extending the document-block gate to more task names would fix the immediate PDF symptom but
**preserve format-as-branch** — the structural root. The design explicitly rejects that path. The
unification is the structural fix; the gate-extension is the workaround.

---

## §2 — Substrate-Bound Discipline (from the locked design)
- **Carry Everything — round-trip closure:** a structural primitive (plan content) recognized at the
  ingestion boundary must be recognizable at the interpretation boundary. The unified content unit is
  how content keeps its identity across that boundary. No content loss for any format is the test.
- **Korean Test:** format must not be a dispatch discriminator. The adapter branches on content-unit
  type (structural), never on format or task name. Zero format-name or task-name literals gating
  content attachment.
- **DD-7 / preserve the proven:** text-format interpretation (XLSX/PPTX/DOCX) currently works through
  the in-band text channel and MUST remain behaviorally identical. The structural-fingerprint moat,
  the single plan code path (HF-257), and the calc handoff are PRESERVED — untouched by this HF.
- **AP-1:** no file bytes in HTTP bodies; document content travels as a storage reference, base64
  materialized server-side. The dead field's removal serves this.
- **SR-34:** fix the class structurally (the channel), not the instance (the PDF gate).
- No locked rule dictates a change beyond this scope. Any locked-rule conflict surfaced during work →
  SR-42 (surface verbatim, name the action, HALT for architect disposition).

---

## §3 — Phases

### §3.1 — Phase 1: ADR (Architecture Decision Gate — BEFORE any edit)
Using the AUD-0015 trace as the map and confirming against live HEAD, CC produces an ADR
(docs/completion-reports/) that instantiates §1.3 against the ACTUAL code:
- The current per-format extraction sites (where PDF sets base64+placeholder; where XLSX sheet-walks;
  where PPTX/DOCX JSZip-extract to text) — confirm the real structure.
- The proposed normalized content-unit shape (the `type` + payload, where `document` carries a
  storage reference) — concrete field names against the live `documentMetadata` / content-unit types.
- The single point upstream of the orchestrator where the content unit is produced for all formats.
- How each orchestrator phase (skeleton + per-component) consumes the unit uniformly.
- The adapter change: attach on content-unit type for ALL plan/document tasks; remove the task-name
  gate as the attachment discriminator.
- The dead base64 field's removal and the storage-reference + server-side-materialization path.
- DD-7 proof plan: how text formats remain byte-identical.
**If the live structure cannot host this design without a change outside this scope → HALT (§4),
report the ADR, do not implement.** The ADR is the architect-confirmable design; implementation
proceeds only if the ADR confirms fit.

### §3.2 — Phase 2: Enumeration (DD-1/DD-2 — every site, before editing)
Enumerate and paste (from live HEAD; cite the AUD-0015 trace where it already maps a site):
- Every site that extracts/sets content per format (PDF base64+placeholder; XLSX; PPTX; DOCX).
- Every orchestrator phase call that consumes content (skeleton; each per-component; any chunk path).
- Every adapter site that branches on task name to attach (or not attach) a document block.
- Every reference to the dead base64 field (set, forward, read) across the whole spine — confirm
  there is no live consumer at execute (AUD-0015 found none; verify at HEAD before removal).
No edits in this phase. Output: the complete edit-site inventory.

### §3.3 — Phase 3: Implement the unified content channel
Per the ADR and enumeration:
- Produce the normalized content unit once at ingestion for every format (`text` | `document`).
- Thread it to every orchestrator phase; phases consume uniformly (remove any format/task branching
  on content).
- Adapter attaches by content-unit type for ALL plan/document tasks (skeleton, per-component, and
  any chunk variants) — `text` payload as text, `document` payload as a storage-materialized
  document block.
- Remove the dead base64 field; `document` units carry a storage reference; base64 materialized
  server-side from storage at adapter time.
Commit + push at the close of this phase.

### §3.4 — Phase 4: Verification (all three formats through the unified path)
This is the coverage gate that the prior chain skipped. Verify, with pasted evidence (logs +
browser), that interpretation succeeds end-to-end through the unified channel for:
- **PDF** — import CRP_Plan_1_Capital_Equipment.pdf (tenant e44bbcb1-...): skeleton phase receives
  real plan content (NOT the 34-char placeholder), components construct, rule_set saved, comprehension
  signals emitted.
- **PPTX** — import Meridian_Plan_Incentivos_2025.pptx: interpretation succeeds (text channel
  preserved). [NOTE: the duplicate-run observed on this import is a SEPARATE defect, out of scope here
  — see §6. Verify interpretation correctness; do not attempt the duplicate-run fix.]
- **XLSX** — a tabular plan: interpretation succeeds (text channel byte-identical to pre-HF behavior).
Paste the skeleton-phase char counts and the per-format rule_set/signal outcomes. PASS = all three
interpret through the one channel with no content loss and text formats unchanged.

### §3.5 — Phase 5: Final build + PR
Final-build sequence (§0), confirm localhost:3000, then `gh pr create --base main --head dev` with a
descriptive title/body. Completion report FIRST (Rule 25), evidence pasted, before the final build is
appended.

---

## §4 — HALT Conditions
- **HALT-1 (ADR misfit):** the live structure cannot host the unified content unit without a change
  outside Q2/Q5 scope → report the ADR, HALT for architect disposition. Do not expand scope unilaterally.
- **HALT-2 (DD-7 risk):** if the unification cannot be done without altering text-format interpretation
  behavior → HALT and report; the proven text path must not regress.
- **HALT-3 (live consumer of the "dead" field):** if enumeration finds a LIVE consumer of the base64
  field at execute (contradicting AUD-0015) → do NOT remove it; report and HALT for re-scope.
- **HALT-4 (SR-42):** any locked rule appears to dictate an out-of-scope change → surface verbatim,
  name the action, HALT.

---

## §5 — Reporting Discipline
Completion report (docs/completion-reports/), report-first, evidence pasted:
HEAD SHA → ADR (the instantiated design) → enumeration inventory → the implemented unified-channel
diff (pasted) → the transport-retirement diff (pasted) → Phase-4 verification (PDF + PPTX + XLSX, with
skeleton char counts and rule_set/signal outcomes pasted) → final build output → PR link.
CC reports calculated/observed values verbatim; no reconciliation interpretation (architect-channel).

---

## §6 — Out of Scope (the subsequent 1C slices — do NOT touch here)
- **Idempotency + supersession audit (Q3 + Q6)** — the next HF: two-layer guard (single-flight +
  content-fingerprint idempotent upsert) so one import yields exactly one rule_set, plus explicit
  audited supersession. The duplicate-run observed on the PPTX import belongs to this slice. NOT here.
- **Scale / parallel phases (Q4)** — the slice after: bounded-concurrency parallel component phases in
  a thin async envelope. NOT here.
- **Calc-execution internals** — owned by AUD-005; untouched.
- **The three VG substrate extensions (SCI / content-hash primitive / AP-17) and the three substrate
  gap-captures** the IRA response flagged — VG/ICA governance work, separate channel.

## §6A — Residuals
- **JSON-parse-on-prose robustness:** an insufficient/invalid model response surfacing as a JSON parse
  error is a poor failure mode independent of this fix; once content reaches the model uniformly it
  should rarely fire, but a clean "plan content could not be read" failure is a separate small HF.
- **Content-unit type beyond text|document:** if a future format needs a third handling mode, the
  content-unit type set extends at ingestion only; record if Phase-2 enumeration surfaces a format that
  fits neither cleanly.
- **AUD-0015 refresh:** after this merges, regenerate the ingestion-interpretation trace to a new SHA
  version so the SSOT stays live (the adapter and extraction surfaces change here).
