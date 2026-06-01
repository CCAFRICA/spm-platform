# AUD-0014 — INGESTION PATH CAPABILITY AUDIT
# Capability under audit: precisely ingest ANY file, ANY format, MULTI-FILE, MULTI-SHEET, in ONE simultaneous import
# Classification: AUD (read-only comprehensive audit)
# Repo: CCAFRICA/spm-platform (VP)
# Date: 2026-05-29
# Directive location: docs/audits/AUD-0014_INGESTION_PATH_CAPABILITY_AUDIT.md
# Output location: docs/audits/AUD-0014_INGESTION_PATH_FINDINGS.md
# Number provisional — architect confirms next AUD-of-record before dispatch.

---

## §0 — CC Standing Rules

Read `CC_STANDING_ARCHITECTURE_RULES.md` and `CC_DIAGNOSTIC_PROTOCOL.md` in full before any probe. Binding throughout:

- **This is a READ-ONLY audit.** CC changes no code, runs no migration, writes no DB row, opens no PR. The deliverable is a findings report. (AUD-001 precedent: "independent review of actual source code.")
- **Rule 21 (CC_DIAGNOSTIC_PROTOCOL):** trace the ACTUAL code path. Every finding is grounded in pasted source, not inference.
- **Rule 27 (COMPLETION_REPORT_ENFORCEMENT):** evidence = PASTE, not describe. Every finding carries the verbatim code lines that establish it.
- **Principle 1 / AP-5/AP-6 / AP-25 (Korean Test):** the capability must dispatch on file STRUCTURE/format, never on hardcoded extension, filename, or language literals. Where the path keys on a literal, that is itself a finding.
- **AP-17 (single pipeline):** divergent transports/parse paths for the same capability are a finding.
- **SR-34 (No Bypass):** this audit exists to characterize a DEFECT CLASS at the class layer, so remediation closes the class — not an instance. The auditor names the class, not just the symptoms.

Drafting-discipline source: `INF_Structured_Compliant_Drafting_Reference_20260513.md` (DD-1..DD-12). This file IS the prompt (DD-11): no CC execution block, no paste block, no tail summary. The probe prose is the executable. The file ends at §6A.

zsh note: every grep below is single-quoted to survive history expansion (`!`, `(`, `)` are literal).

---

## §1 — Objective and Why an Audit (not another HF)

### 1.1 — The capability, stated precisely

ONE import action must accept **N files of mixed formats** — multi-sheet XLSX, PPTX, PDF, DOCX, CSV, TSV — **simultaneously**; each file may be **any classification** (plan, entity, transaction, target, reference); each file is parsed by **its own format**; every content unit is classified, executed, **and emits signals**; and the result reconciles. This is the product capability. Anything less than this whole is the regression.

### 1.2 — The defect class (the reason for one audit, not serial HFs)

The HF-239 unification ("collapse `execute`/`execute-bulk` into one Storage-based path") flattened a multi-format, multi-file capability (built across OB-133 / HF-129..133 / HF-140..142 and proven in production) into a **single-file, XLSX-shaped happy path**. Multiple runtime failures observed this session are not separate bugs — they are surfaces of ONE regressed class. Confirmed-at-HEAD surfaces already seen:

- **C1 (confirmed):** `page.tsx` derives a singular `storagePath = Object.values(storagePaths)[0]`; `execute-bulk` accepts one `storagePath`. Multi-file is structurally impossible at transport — file #2..#N never reach execute. (Maps to multi-file P1 lineage: F07, CLT111-F3, CLT111-F8, CLT102-F44, CLT109-F15.)
- **C2 (confirmed, live PPTX failure):** `execute-bulk` runs `XLSX.read` unconditionally (route ~line 165) before plan dispatch; a non-spreadsheet throws "Could not find workbook" before reaching the format-aware plan pipeline.
- **C3 (confirmed by code shape):** data units (entity/transaction/target/reference) read only from the route's XLSX-parsed `sheetDataMap`; only PLAN units self-extract by format (`plan-interpretation.ts`). A document DATA file (PDF transaction, DOCX roster) has no extraction path.

Fixing C1/C2/C3 as three separate HFs, discovered one runtime failure at a time, is the SR-34 violation this audit exists to prevent. **No instance HF is drafted until this audit returns the complete register and one sequenced remediation.**

### 1.3 — What this audit produces

A complete, severity-ranked defect register covering the FULL path against the §1.1 objective, plus the POSITIVE findings (what works and must be preserved), plus ONE recommended remediation sequence — so the architect authorizes the class-level fix in one decision.

---

## §2 — Governing Documents and Discipline Applications

- HF-239 (unification — the regressing change); OB-133 / HF-129–133 / HF-140–142 (the any-format / multi-file capability as originally built — the auditor establishes what that capability WAS so the regression delta is precise).
- Multi-file P1 lineage: F07, CLT111-F3, CLT111-F8, CLT102-F44, CLT109-F15 — the auditor MAPS findings to these and states whether they are subsumed; it does NOT renumber them.
- `VIALUCE_CLT_FINDINGS_REGISTRY_R7.md` + addenda — check whether any finding here is already a known CLT finding.
- HF-255 (PR #443, the upload decoupling — document files now reach Storage); HF-254 (merged classification/flywheel — unrelated surface, must not regress).
- Vertical Slice Rule: signals are part of the slice — a stage that ingests but emits no signal is a finding, not a pass.

---

## §3 — Audit Dimensions (the lens applied to every stage)

Every probe evaluates the stage against SIX dimensions. The findings report fills a cell for each (stage × dimension) with a verdict (PASS / DEFECT-Sn / N/A) and pasted evidence:

- **D1 — Format:** handles tabular (XLSX/CSV/TSV) AND document (PPTX/PDF/DOCX)?
- **D2 — Multiplicity:** handles N files in one import, not just one?
- **D3 — Classification:** works for all five (plan/entity/transaction/target/reference)?
- **D4 — Multi-sheet:** one file, N sheets, sheets of differing classification?
- **D5 — Signal/Moat:** does the moat accrue (signals emitted) on this path/format?
- **D6 — Korean Test:** dispatch by structure, not by hardcoded extension/filename/language literal?

Severity scale for findings:
- **S1 — capability-blocking:** the §1.1 objective cannot be met (e.g. multi-file impossible).
- **S2 — partial:** works for some formats/counts/classifications but not others.
- **S3 — moat/degradation:** ingests but loses signal accrual or correctness guarantees.
- **S4 — latent/robustness:** works in tested cases, fragile in untested ones.

---

## §4 — Stage-by-Stage Probes (read-only; paste all output)

CC executes each probe, pastes the raw code, and records findings against §3. Probes are reads; CHANGE NOTHING. Where a probe's anchor differs at HEAD, report the resolved location and continue.

```bash
cd ~/spm-platform
git rev-parse HEAD
```

### §4.1 — Probe A: Upload & transport assembly — `web/src/app/operate/import/page.tsx`

```bash
echo '=== A1: how storagePaths is built (per-file) and how the SINGULAR storagePath is derived (C1) ==='
grep -nE 'storagePaths|storagePath|Object\.values|uploadableFiles|spreadsheetFiles|ingestion-raw|\.upload\(' web/src/app/operate/import/page.tsx
echo '=== A2: the isDocument determination — is it first-file-only for a mixed set? ==='
grep -nE 'isDocument|firstFile|documentBase64|files\[0\]' web/src/app/operate/import/page.tsx
echo '=== A3: how files reach analyze — one call, per-file, or both analyze + analyze-document? ==='
grep -nE 'analyze|analyze-document|fetch\(|/api/import/sci' web/src/app/operate/import/page.tsx
echo '=== A4: props handed to SCIExecution (singular vs map) ==='
grep -nE '<SCIExecution|storagePath=|storagePaths=|rawData=' web/src/app/operate/import/page.tsx
```

**Determine (fill D1–D6 for Stage 1):** Does any value carry file #2..#N to execute (D2)? Is the async/document routing decided per-file or by `firstFile` only (D1×D2)? Does a mixed set trigger both analyze routes (D1)?

### §4.2 — Probe B: Analyze / classification — `analyze/route.ts` + `analyze-document/route.ts`

```bash
echo '=== B1: does analyze loop files[] (multi-file classification) or assume one? ==='
grep -nE 'for \(const file|files\.map|files\[0\]|file of files|contentUnits|sourceFile|proposalId' web/src/app/api/import/sci/analyze/route.ts
echo '=== B2: analyze-document — single document per call, or N? where do multiple document files go? ==='
grep -nE 'fileBase64|documentBase64|files|for |map\(|contentUnit|classification|sheets' web/src/app/api/import/sci/analyze-document/route.ts
echo '=== B3: fingerprint computation — what happens for a DOCUMENT unit with no tabular columns/rows? (D5 precursor) ==='
grep -nE 'computeStructuralFingerprint|structuralFingerprint|fingerprint|columns|rows' web/src/app/api/import/sci/analyze/route.ts
echo '=== B4: proposal assembly — per-file/per-sheet content units, sourceFile/tabName, processing order ==='
grep -nE 'sourceFile|tabName|contentUnits|processingOrder|buildProposal|::split' web/src/app/api/import/sci/analyze/route.ts
```

**Determine:** Where does multi-file SURVIVE (classification) vs COLLAPSE (transport/execute)? Is mixed-format classification (some files → analyze, some → analyze-document) merged into one proposal, or do the two routes produce disjoint proposals that never combine (D1×D2)? Do multiple DOCUMENT files in one import all get analyzed, or only `firstFile` (D2 for documents)?

### §4.3 — Probe C: Execute — `web/src/app/api/import/sci/execute-bulk/route.ts`

```bash
echo '=== C1: the request shape — single storagePath vs array (the multi-file transport ceiling) ==='
grep -nE 'storagePath|storagePaths|contentUnits|BulkRequest|interface .*Request|\.download\(' web/src/app/api/import/sci/execute-bulk/route.ts
echo '=== C2: the UNCONDITIONAL XLSX.read before plan dispatch (the PPTX throw site) ==='
grep -nE 'XLSX|\.read\(|sheetDataMap|SheetNames|workbook|ext|extension' web/src/app/api/import/sci/execute-bulk/route.ts
echo '=== C3: data-unit pipelines — do entity/transaction/target/reference read ONLY from sheetDataMap (no doc extraction)? ==='
grep -nE 'processEntityUnit|processDataUnit|processReferenceUnit|sheetDataMap|case .plan.|executePlanPipeline|documentMetadata|fileBase64' web/src/app/api/import/sci/execute-bulk/route.ts
echo '=== C4: per-unit sheet matching + single-sheet fallback (multi-sheet correctness, D4) ==='
grep -nE 'tabName|sheetDataMap\.get|case-insensitive|sheetDataMap\.size === 1|onlySheet' web/src/app/api/import/sci/execute-bulk/route.ts
```

**Determine:** Confirm C1 (one file per invocation) and C2 (unconditional XLSX parse) at HEAD with pasted lines. Establish C3: is there ANY format-aware extraction for DATA units, or is document-data ingestion entirely absent (D1×D3 — likely the single largest missing capability)? Does multi-sheet routing assign the right sheet to the right unit when a workbook holds sheets of differing classification (D4)?

### §4.4 — Probe D: Format-aware extraction — `web/src/lib/sci/plan-interpretation.ts`

```bash
echo '=== D1: plan-interpretation extracts by extension (pdf/pptx/docx/xlsx) — confirm the dispatch ==='
grep -nE 'ext|storagePath\.split|pdf|pptx|docx|xlsx|XLSX|extractText|\.download\(|mimeType' web/src/lib/sci/plan-interpretation.ts
echo '=== D2: is this extractor PLAN-only, or could data units reuse it? (remediation reuse surface) ==='
grep -nE 'ContentUnitExecution|classification|plan|interpretPlan|emitPlanComprehensionSignals' web/src/lib/sci/plan-interpretation.ts
```

**Determine:** Confirm plan units self-extract by format (the one path that works for documents). Establish whether the format-aware extractor is reusable for data units (informs remediation: extend vs build).

### §4.5 — Probe E: Signals / moat coverage

```bash
echo '=== E1: plan comprehension signals — transport-independent (works for documents)? ==='
grep -nE 'emitPlanComprehensionSignals|comprehension:plan_interpretation' web/src/lib/sci/plan-interpretation.ts web/src/lib/compensation/plan-comprehension-emitter.ts
echo '=== E2: fingerprint/classification/foundational/domain signals — keyed on tabular structuralFingerprint? ==='
grep -nE 'structuralFingerprint|if \(!unit\.structuralFingerprint\)|emitFlywheelSignals|writeFingerprint|aggregateToFoundational|aggregateToDomain' web/src/lib/sci/flywheel-signal-emission.ts
echo '=== E3: where is emitFlywheelSignals invoked, and does it run per-file in a multi-file import? ==='
grep -rnE 'emitFlywheelSignals' web/src/app/api/import/sci --include='*.ts'
```

**Determine (D5 across the path):** Do DOCUMENT DATA units emit ANY flywheel signal, or only (for plans) comprehension signals? Is "documents accrue no structural-fingerprint moat" intended or a gap (architecture question for the architect, flagged not decided)? In a multi-file import, does signal emission fire for every file or only the one that reached execute (downstream of C1)?

### §4.6 — Probe F: Async worker & cross-cutting — `process-job/route.ts` (UNREAD — highest unknown)

```bash
echo '=== F1: what does the async XLSX worker do, when does it fire, and is it spreadsheet-only? ==='
grep -nE 'processing_jobs|XLSX|\.read\(|storagePath|documentBase64|isDocument|classification|status' web/src/app/api/import/sci/process-job/route.ts
echo '=== F2: does any file go through process-job vs execute-bulk — two execution paths? (AP-17) ==='
grep -rnE 'process-job|processing_jobs|execute-bulk' web/src/app/operate/import/page.tsx web/src/app/api/import/sci --include='*.ts'
echo '=== F3: the documentMetadata.fileBase64 legacy fallback — any live consumer at execute time? ==='
grep -rnE 'documentMetadata|fileBase64' web/src/app/api/import/sci --include='*.ts'
```

**Determine:** Characterize `process-job` (entirely unread to date) — is there a SECOND execution path beside `execute-bulk` (AP-17 concern), and how does it behave for documents and mixed sets? Resolve whether the `fileBase64` execute-time fallback is dead or live.

---

## §5 — Findings Register Format (how CC records each finding)

For every defect, one `F-AUD-NN` entry (numbering scoped to this audit's confirmed number) with this attribute table (AUD-001 house style):

```
### F-AUD-NN: <one-line defect title>

| Attribute | Value |
|-----------|-------|
| Severity | S1 / S2 / S3 / S4 |
| Dimensions | which of D1–D6 it fails |
| Stage | upload / analyze / execute / extraction / signals / worker |
| Files + lines | exact paths + line numbers at HEAD |
| Evidence | PASTED code lines establishing the defect (Rule 27 — not described) |
| Capability impact | what the objective (§1.1) cannot do because of this |
| Root cause | the structural cause, tied to the HF-239 collapse where applicable |
| Maps to | multi-file P1 lineage item (F07/CLT111-F8/etc.) if applicable — MAP, do not renumber |
| Remediation shape | the structural fix direction (not the full HF) |
```

POSITIVE findings (what works, must be preserved) recorded the same way, marked ✅, with the evidence that it works — so the remediation sequence is forbidden from breaking them. At minimum confirm or refute as positive: single-file XLSX happy path (BCL-proven), plan self-extraction by format, plan comprehension signal emission, HF-255 upload decoupling, HF-254 classification flywheel.

---

## §6 — Output Expectation (the synthesis)

CC produces `docs/audits/AUD-0014_INGESTION_PATH_FINDINGS.md` containing, per Rule 27 (paste, not describe):

1. **HEAD SHA** + confirmed file paths for all probed files.
2. **Executive summary** + severity-count table (S1/S2/S3/S4 counts).
3. **The 6×(stages) dimension matrix** — a verdict cell (PASS / DEFECT-Sn / N/A) for every (stage × D1–D6) with the finding ID that establishes it.
4. **Numbered `F-AUD-NN` findings** per §5, each with pasted evidence.
5. **Positive findings** (✅) — the preserve set.
6. **The complete defect class statement** — one paragraph naming the class (the HF-239 single-file-XLSX collapse) and enumerating its surfaces, so remediation is scoped to the class (SR-34).
7. **ONE recommended remediation sequence** — ordered HFs (e.g. format-gate execute parse → document-data extraction → multi-file transport → signal coverage decision), each with: the files it touches, the positive findings it must not break, and its dependency on the prior. The sequence is a RECOMMENDATION for architect disposition — CC authors no HF here.
8. **Mapping to the multi-file P1 lineage** — which findings subsume F07/CLT111-F8/etc., stated explicitly, not renumbered.

CC produces NO code change and opens NO PR. Read-only.

---

## §6A — Scope Boundary (what AUD-0014 does NOT do)

- Does NOT change any code, run any migration, write any DB row, or open any PR. Read-only.
- Does NOT author the remediation HFs. It recommends the sequence; the architect dispositions and sequences; the HFs are separate structured/compliant directives.
- Does NOT renumber the multi-file P1 lineage (F07 / CLT111-F3 / CLT111-F8 / CLT102-F44 / CLT109-F15) — it maps findings to them.
- Does NOT touch or re-verify HF-254's merged classification/flywheel surface beyond confirming the audited path does not regress it.
- Does NOT decide the "documents accrue no structural-fingerprint signal" architecture question — it FLAGS it for the architect as a Design-Gate decision (intended behavior vs gap), with evidence.
- Does NOT run calculations or address any specific tenant (Meridian, BCL, CRP). Tenants are witnesses to capability, not the objective. This audit characterizes the capability class; it does not unblock an instance.
