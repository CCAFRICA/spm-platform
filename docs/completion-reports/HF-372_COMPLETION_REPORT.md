# HF-372 Completion Report — Restore the import process end-to-end

**Status: IN PROGRESS.** This report is extended per phase (Rules 25-28). Every claim below is pasted
evidence from current `main` (HEAD `32b8e760` at Phase 0 start) or live systems — never a prior report.

---

## Phase 0 — Independent re-verification (read-only)

**Objective.** Establish the actual operative state of every surface this directive touches, with pasted
live evidence, trusting nothing previously reported.

**Probes written** (all read-only except where noted): `web/scripts/_hf372_epg01_collision_probe.ts`,
`web/scripts/_hf372_epg01_bcl_probe.ts`, `web/scripts/_hf372_epg02_live_classify.ts`,
`web/scripts/_hf372_epg09_claim_probe.ts`, `web/scripts/_hf372_db.ts`. Code-surface recon ran as six
parallel readers over current `main` (five completed; the registry-inventory reader was re-run inline).

### EPG-0.1 — Fingerprint mechanics + live collision evidence: **D1 CONFIRMED, byte-exact**

The hash is sha256 over structural `features` ONLY; the column name is excluded from identity **by
design** (`atom-fingerprint.ts:50-56`):

```ts
export interface AtomFingerprint {
  /** Display metadata — NEVER part of identity (DI-3). */
  columnName: string;
  features: AtomFeatures;
  /** sha256 of `features` ONLY (excludes columnName). */
  hash: string;
}
```

`features` = `{algorithmVersion, dataType, cardinalityBucket, repeatBucket, nullBucket, lengthBucket,
lengthVarBucket, flags{temporal,identifierLike,measureLike,nameLike}}` (`atom-fingerprint.ts:34-48`) —
value-shape buckets only. Two columns with the same bucket profile collide by construction.

**Live reproduction of the directive's named collision** (pipeline-identical path: `XLSX.read(dense)` →
`debandWorksheet` → `computeAtomFingerprint`, the same calls as `process-job/route.ts:145-167` and
`header-comprehension.ts:456`) — `npx tsx scripts/_hf372_epg01_bcl_probe.ts`:

```
hash bf2acb98cc11…  ← 3:
    Plan_Comisiones_2025 [Plan General] "Componente"
    Plantilla_Personal [Personal] "Nombre_Completo"
    Datos_Ene2026 [Datos] "Nombre_Completo"
    shared features: {"algorithmVersion":3,"dataType":"text","cardinalityBucket":"near-unique",
      "repeatBucket":"1","nullBucket":"none","lengthBucket":"long","lengthVarBucket":"uniform",
      "flags":{"temporal":false,"identifierLike":true,"measureLike":false,"nameLike":true}}

hash 64d80b93284e…  ← 3:
    Plan_Comisiones_2025 [Metas Mensuales] "Nivel"
    Plan_Comisiones_2025 [Metas Mensuales] "Meta Colocación ($)"
    Plan_Comisiones_2025 [Metas Mensuales] "Meta Depósitos ($)"

hash 13cc80dafee9…  ← 2:
    Plan_Comisiones_2025 [Tablas de Tasas] "<0.70"
    Plan_Comisiones_2025 [Tablas de Tasas] "0.70-0.80"
```

**The stored atoms at those hashes** (live `structural_fingerprints`, tenant VLTEST2
`5b078b52-55c9-4612-8f86-96038c198bfe`, rows written by the real imports earlier on 2026-07-01):

```
bf2acb98cc11…  covers: "Componente" ≡ "Nombre_Completo" ≡ "Nombre_Completo"
  v3 match_count=2 conf=0.6667 updated=2026-07-01T19:58:32.809+00:00
  role=A free-text human name string, non-unique in theory but practically unique per employee. @0.99
  identifies: "Identifies the employee by their full human-readable name, serving as the display label
   for the ID_Empleado entity."

64d80b93284e…  covers: "Nivel" ≡ "Meta Colocación ($)" ≡ "Meta Depósitos ($)"
  v3 match_count=3 conf=0.75  role=ambiguous @0.72        ← the role-AMBIGUOUS churn

13cc80dafee9…  covers: "<0.70" ≡ "0.70-0.80"
  identifies: "The monetary rate applicable when quality is in the 0.70–0.80 band…"
  (the <0.70 column carries the 0.70-0.80 column's recognition — rate-table cells cross-contaminate)
```

**Casa Diaz exposure**: the 8-sheet banded workbook alone produces **21 hashes shared by distinct
column names** out of 54 distinct hashes over 106 column-atoms, including one 18-column pile-up at
`64d80b93284e` (AUTORIZA / col_13..col_20 / PAGO MENSUAL 1a Catorcena / SUCURSAL across 7 sheets) —
the same hash as BCL's Metas columns: sparse/empty-ish columns everywhere collide onto ONE atom
(`_hf372_epg01_collision_probe.ts` output, full list in the script's output).

### EPG-0.2 — Live comprehension + classification on current main

**(a) BCL plan workbook (VLTEST2, warm atoms — the corrupted memory in action).** The three
plan-workbook sheet-granularity fingerprint rows were removed (hashes `9d0ca9563130`, `963c76a3f7e4`,
`c6a73ab9985b`, `fd9ce13b92eb`) so HC re-runs; atoms were left intact. Live run
(`_hf372_epg02_live_classify.ts bcl`, real LLM):

```
[OB-203][atom-claim] sheet=Plan General col=Componente hash=bf2acb98cc11 -> CLAIMED
  role=A free-text human name string, non-unique in theory but practically unique per employee.@0.99
[OB-203][atom-claim] sheet=Tablas de Tasas col=<0.70 hash=13cc80dafee9 -> CLAIMED
  role=Monetary lookup value (rate/bonus amount) stored as a formatted currency string.@0.92
[OB-203][atom-claim] sheet=Metas Mensuales col=Nivel hash=64d80b93284e -> NOVEL
  (ambiguous/low-conf (stored role=ambiguous@0.75)) — will comprehend        ← ×3 columns, every import
[OB-203][atom-residue] sheet=Plan General known=5/5 novel=0 []              ← zero LLM: all warm-claimed

MissingRecognitionError: HF-368: cannot classify sheet "Plan General" — the model's bare primitive
recognition is absent (no column carries a bare nature_role — the model rendered no structural
primitive).
```

The plan sheet's `Componente` **is** claimed as a person name @0.99 (the directive's exact observation),
and the file **cannot classify at all** on the warm path — see F-NEW-2 below.

**(b) Casa Diaz, two structurally distinct sheets (cold atoms — fresh-LLM path).** Live run
(`_hf372_epg02_live_classify.ts casa`), per-column bare primitives as read by the classifier:

```
── LOCALES REFAC ──                              ── FORANEAS REFAC ──
"DEPARTAMENTO"   scope_role=entity    nature_role=name         "No. VEND"       scope_role=entity nature_role=identifier
"SUCURSAL"       scope_role=reference nature_role=identifier   "No. Nòmin"      scope_role=entity nature_role=identifier
"% AUTORIZADO"   scope_role=none      nature_role=measure      "SUCURSAL NOMBRE VENDEDOR" scope_role=entity nature_role=name
"POLITICA DE PAGO" scope_role=none    nature_role=categorical  "% AUTORIZADO CONFECC …"   scope_role=none nature_role=measure
"BASE COMISION"  scope_role=none      nature_role=categorical  "% AUTORIZADO SERIG"       scope_role=none nature_role=measure
(… full listing in scratch log epg02_casa_cold.log)

── SHEET VERDICTS ──
  [LOCALES REFAC] → reference @0.92   + plan ::split @0.8
  [FORANEAS REFAC] → entity @0.65     + plan ::split @0.8   ← a commission-rate sheet reads as a roster
```

**F-NEW-1 (beyond the directive, additive): the Tier-1 warm path cannot classify at all.**
`process-job/route.ts:267` skips HC for Tier-1-matched sheets; `resolveClassification` (`resolver.ts:33-35`)
unconditionally derives from the expression; `deriveClassificationFromExpression` throws
`MissingRecognitionError` when `profile.headerComprehension` is absent (`expression-classifier.ts:103`).
The route's outer catch returns HTTP 500 **without writing job status** (`process-job/route.ts:557-563`)
— the job stays `classifying` until the reclaimer retries it into the same throw. Live proof: first run
of the BCL harness hit Tier-1 on all three sheets → `MissingRecognitionError: … (no header comprehension)`.
**Re-importing any already-seen file is structurally broken on current main.**

**F-NEW-2 (beyond the directive, additive): the atom write path drops the bare primitives.**
`header-comprehension.ts:585` pushes atoms to write with `identifies/characterization/relationships`
but **omits `scope_role`/`nature_role`**:

```ts
atomsToWrite.push({ atom: computeAtomFingerprint(a.columnName, sheet.rows.map(row => row[a.columnName])),
  role: a.role, roleConfidence: a.roleConfidence, identifies: a.identifies,
  characterization: a.characterization, relationships: a.relationships });   // ← no scope_role/nature_role
```

Live proof: ALL 18 VLTEST2 atoms freshly written by the real imports on 2026-07-01 19:57-19:58 carry
`scope_role=undefined nature_role=undefined` (EPG-0.1 output above). Consequence: every fresh import
re-creates exactly the incomplete-atom class HF-369's v3 bump was meant to purge; the NEXT import that
warm-claims them fail-louds (`isComprehendedButIncomplete`, `expression-classifier.ts:88-92,161-167`) —
the live BCL run above. The two findings together mean: **first import works; every subsequent import of
the same or overlapping-column files throws.** This — not any single misclassification — is the
"broken for days" mechanism.

### EPG-0.3 — Rate-table construction: **D2 CONFIRMED, with three refinements**

- The LLM emits the full component graph: Phase A `plan_skeleton` (component index +
  `rateTableCellCount`), then **one LLM call per component emitting the complete PrimeNode DAG**
  including every rate cell as constant leaves (`plan-orchestration.ts:490-497`; prompts
  `anthropic-adapter.ts:464-559`: "EXHAUSTIVE emission: emit EVERY cell/tier/category").
- Truncation class: the adapter never checks `stop_reason`; max-tokens truncation surfaces as a JSON
  parse failure → `cognition_truncation` → **maxAttempts: 1, no retry** (`interpretation-errors.ts:138-139`).
  maxTokens: skeleton 16384, component 8192 (`ai-service.ts:391,444`).
- **The de-banded parse already holds the complete grid before any LLM call**: `debandWorksheet` returns
  `columns` (real recovered headers) + `rows` (every data row keyed by exact header) + sidecar +
  transformMap (`deband-sheet.ts:34-44`, `structural-construction.ts:44-61,381-404`) — everything a
  deterministic constructor needs. But the LLM is shown only a **12-row sample**
  (`PLAN_SAMPLE_ROWS = 12`, `plan-interpretation.ts:205-236`) — a fixed rate grid larger than 12 rows
  can never be exhaustively emitted from what the model sees.
- **Nondeterminism mechanism found**: the plan family routes to Opus (`model-policy.ts:118-122`) and the
  adapter **drops `temperature: 0` for Opus/Fable models** (`anthropic-adapter.ts:1199-1203`,
  `SAMPLING_PARAM_REJECTING_PATTERNS = [/^claude-opus-4/, /^claude-fable/]`) → provider-default sampling
  → run-to-run divergence (the observed 2-vs-4 components). The `exhaustive_emission` check is skipped
  entirely when the LLM omitted `rateTableCellCount` (`prime-validator.ts:43-45`) — the completeness
  oracle is itself an LLM emission.
- Persistence: single `rule_sets` upsert (`plan-interpretation.ts:502-524`), components as
  `prime_dag` DAGs; idempotency via `plan_interpretation_runs` keyed on file-bytes+sheet-set hash.

### EPG-0.4 — Registry inventory: **HALT-1 on D3's naming — the named lists are GONE; the class survives elsewhere**

`grep -rn "MEASURE_NATURE\|TEMPORAL_NATURE" web/src` → **zero code hits** (only comments recording the
HF-368 deletion). The directive's D3 premise as named is refuted: HF-368's deletion holds; the sheet
classifier (`expression-classifier.ts`) reads bare primitives by equality only.

**But the registry class survives on classification-participating surfaces:**

1. `negotiation.ts:29-67` — SEVEN bilingual word-list regexes over the model's prose
   (`natureIsTemporal/Measure/Name/Identifier/ReferenceKey/Attribute/PlanRule`), e.g.:
   ```ts
   function natureIsPlanRule(interp: HeaderInterpretation): boolean {
     return /\b(rate|percentage|commission|payout|formula|policy|tier|bracket|cadence|pay[_ ]?period|comisi[oó]n|tasa|porcentaje|pol[ií]tica|f[oó]rmula)\b/i.test(natureNorm(interp));
   }
   ```
   These feed `FIELD_AFFINITY_RULES` (`negotiation.ts:81-133`) — field claims/bindings, the plan
   ::split detection (≥3 plan-rule cluster), and split analysis. **Participates in classification.**
2. `entity-resolution.ts:38-44` — `/\b(identifier|id|key|code)\b/i` + reference-key regex over
   `data_nature` prose; decides entity-id column fallbacks at commit (`:193,244,464`). **Participates.**
3. `per-row-attribution.ts:54-58` — the same two regexes duplicated in the calculation layer. **Participates**
   (calc-time attribution).
4. `remediation-stage.ts:49` — `NON_TEXT_ROLE` role-word regex; remediation exclusions only (does not
   set data_type/scope/nature) — non-classifying but same word-list construction.

Phase C targets these actual surfaces (the model's bare primitives are already threaded through
`HeaderInterpretation.scope_role/nature_role` — `sci-types.ts:114-115` — so consumers can read them).

### EPG-0.5 — Job-status plumbing: **D4 CONFIRMED, mechanisms identified**

- The server's LAST happy-path status write is `'classified'` (`process-job/route.ts:414-419`).
  **`'committing'`/`'committed'` are written ONLY by the browser** (`page.tsx:493-502, 532-541`),
  fire-and-forget, unchecked — verified: `grep "status: 'committed'"` over web/src hits only page.tsx:537.
- **RLS makes even that lie conditional**: platform operators (profile `tenant_id IS NULL`) have
  SELECT-only on `processing_jobs` (`20260628_ob251_processing_jobs_reconcile.sql:87-95`) — their
  browser UPDATEs silently match 0 rows → any platform-admin import can NEVER leave `'classified'`.
- The fleet IngestionTab styles `'classified'` green identically to `'committed'`
  (`IngestionTab.tsx:270-277`) and `isActive` excludes it → not visibly stuck, no Cancel offered
  (`observatory/route.ts:956-971`; cancel only for `pending|classifying|committing`, `:143-148`).
- The KPI cards read `ingestion_events`, which the SCI pipeline **never writes** (writers are only the
  legacy `/api/ingest/event` routes) — dead 0.0% metrics beside a populated queue.
- **"0 of 4 while the server committed at 65s"**: during a healthy execute nothing polls
  (`SCIExecution.tsx:277-283`); units advance only from the execute-bulk HTTP 200 or the
  `settleFromSurface` recovery poller. When the response socket dies (Vercel 300s cap/proxy), the server
  finishes but the client re-POSTs then polls `session-state`; a session whose telemetry row was never
  written "projects an empty view" (`session-state/route.ts:18-20`) → zero units ever settle → 90s stall
  → counter stays 0 forever.
- **Watchdog cron forked**: `web/vercel.json` (the Next.js app root) has NO dispatch-jobs cron (removed
  by HF-360 fc0a7040); the repo-root `vercel.json` (added by HF-370 O3) has it. If the Vercel project
  root is `web/`, the HF-370 "activated watchdog" is NOT scheduled — nothing unsticks a `classifying`
  job after a worker crash, and `process-job`'s outer catch writes nothing to the job (`:557-563`).
- Kill: the only cancel is the platform observatory action (`observatory/route.ts:143-148`,
  `retry_count=99` sentinel); **no kill exists on the import screen**; a stuck `'classified'` job is
  uncancellable by the guard.
- Status vocabulary: 8 CHECK-constraint values of which `confirming` and `finalized` are NEVER written;
  `chunk_progress` is selected but never written (dead). Three mutually-inconsistent progress
  vocabularies coexist (processing_jobs status / SCIExecution local unit state / pulse_load_jobs).

### EPG-0.6 — Insight step: **HALT-1 on D5's framing — not on the UI critical path; worse, silently swallowed**

The UI transitions to `complete` and the client stamps `committed` at finalize DISPATCH, not completion
(`page.tsx:522-547` — `void fetch`, then `goComplete` synchronously). Insight generation runs as step 5
INSIDE finalize-import, **awaited before `completeFinalize(..., true)`** (`finalize-import/route.ts:133-149`)
— so it holds the HF-371 claim window (and the finalize-sweep's `finalized=true` for hand-off loads) for
up to ~76s of retry backoff (6 attempts, `anthropic-stream.ts:41-85`) inside the shared 300s budget.
Truncation: `parseInsightArray` salvages complete objects and logs
`insight.partial_salvage` (`insight-engine.ts:126-151`), maxTokens 4000, one call per tenant.
**On insight failure the claim is still stamped `done` with `ok:true`** (`route.ts:136-146`) — the
failure is invisible and never retried for that proposalId. D5's fix is re-scoped: move insight AFTER
the claim completes; surface its failure; the observed 183s spinner belongs to EPG-0.5's settle gap,
not to insights.

### EPG-0.7 — Large-file admission: **D6 CONFIRMED with exact mechanics**

Live bucket read (`_hf372_db.ts bucket`):

```
bucket=imports          file_size_limit=524288000 (500MB)
bucket=ingestion-raw    file_size_limit=NULL      ← the import bucket
bucket=ingest-quarantine file_size_limit=NULL
```

- `discoverUploadByteBudget` (`pulse-budget.ts:35-56`): NULL → **40MB fallback** (log-warn only), budget
  = 0.8×limit — but this governs the staged-CSV pulse size at commit, NOT upload admission.
- Upload admission is a **client-side 50MB gate** in `SCIUpload.tsx:40-41,203-216` (loud, limit named).
  The ~42MB JDE file passes it; the ~52MB variant named in `sheet-stream.ts:52` would be rejected at the
  door. The storage `.upload()` error (Supabase project-global limit for a NULL-limit bucket) goes to
  `console.error` only; the user sees the generic "The file upload did not complete. Please retry."
  with **no limit named** (`page.tsx:258-274,300-304`) — the C2 violation.
- Oversized entry conditions: file ≥20MB bytes → STREAMED classify/commit (`sheet-stream.ts:54-58`);
  sheet >5M cells → WINDOWED (`sheet-window.ts:140-156`). **Neither path applies `debandWorksheet`** —
  zero call sites in `windowed-commit.ts`/`sheet-stream.ts`/`sheet-window.ts`; raw row-1 header keying
  only (`sheet-stream.ts:219-228`, `sheet-window.ts:46-62`). Fine for the clean-row-1 JDE class;
  a banded large file has no header recovery (named residual, §6A).

### EPG-0.8 — Pathway inventory: **D7 CONFIRMED — enumerated divergences**

1. **TWO full classify pipelines**: `analyze/route.ts` (sync, client-parsed 50-row samples, NO de-band,
   NO remediation express, NO in-route auth) vs `process-job/route.ts` (async, full rows, de-band,
   remediation, atomic claim + auth). Plus a THIRD entry `retry-unit/route.ts` (no de-band, no size
   gate, no auth). A comprehension fix must land on all three.
2. **Three commit variants**: direct `commitContentUnit` vs `commitUnitWindowed` vs `commitUnitStreamed`,
   with live divergences: (2-A) PARTIAL-claim field filtering skipped on streamed
   (`execute-bulk/route.ts:578` passes raw unit; direct filters at `:663`, windowed at `:610`);
   (2-B) entity-id resolution has THREE algorithms — streamed takes `candidates[0]` with no overlap
   tie-break (`windowed-commit.ts:267-272`); (2-C) an entity unit on a streaming-scale file silently
   "succeeds" with 0 rows (`execute-bulk/route.ts:647-653`); (2-D) rollback unit-atomic vs pulse-atomic;
   (2-E) hand-off decision computed only on windowed/streamed.
3. **Recognition consumed via N parallel trace-readers** (commit-content-unit :187-208/:549, execute-bulk
   :383-402/:1064, process-job :444-455, windowed-commit :92/:270) — and the analyze route's Tier-1
   injection FABRICATES `headerComprehension` without bare primitives (`analyze/route.ts:292-311`),
   a fourth variant of F-NEW-1/2.
4. **Finalize**: three dispatchers (client, execute-bulk waitUntil, finalize-sweep) behind ONE claim —
   verified live in EPG-0.9. `aggregate-flywheel` remains client-only (no server backstop).
5. **Cron config forked**: two tracked `vercel.json` files disagree (see EPG-0.5).

### EPG-0.9 — Finalize claim, live: **HF-371 singleton-finalize VERIFIED operative**

`import_finalize_runs` exists (migration applied). The ledger from the real 2026-07-01 imports and a
live concurrent double-claim (`_hf372_epg09_claim_probe.ts`):

```
=== import_finalize_runs (recent 2) ===
  tenant=5b078b52 proposal=f34afa6b-a194-4fb3-891d- status=done claimed_at=2026-07-01T20:03:06.231+00:00
  tenant=5b078b52 proposal=09509405-ad64-40ab-97c2- status=done claimed_at=2026-07-01T19:58:30.146+00:00
concurrent claim A: {"granted":false,"reason":"coalesced — another finalize pass is in flight for this import"}
concurrent claim B: {"granted":true,"reason":"claimed (first caller)"}
post-done claim C:  {"granted":false,"reason":"coalesced — this import was already finalized"}
```

Exactly one effective pass per proposal, duplicates coalesce, post-done coalesces. (The full-arc claim
lines from a browser import re-verify in Phase G.)

### HALT-1 dispositions (reported before any fix design)

| Framing | Verdict | True finding |
|---|---|---|
| D1 collision mechanism | **CONFIRMED byte-exact** | + F-NEW-1 (Tier-1 skip → fail-loud) and F-NEW-2 (atom write drops primitives) make the warm path fail entirely, not just misclassify |
| D2 LLM-generated rate tables | **CONFIRMED** | + nondeterminism root = temperature dropped on Opus route; 12-row sample makes >12-row grids unemittable; completeness oracle is LLM-chosen |
| D3 MEASURE_NATURE/TEMPORAL_NATURE | **REFUTED as named** — deleted by HF-368 | The registry class survives at `negotiation.ts:29-67` (7 bilingual regexes → field affinity/plan-split), `entity-resolution.ts:38-44`, `per-row-attribution.ts:54-58`, `remediation-stage.ts:49`. Phase C targets these. |
| D4 status untruthful | **CONFIRMED** | Mechanisms: client-only status advancement + RLS SELECT-only for platform ops + forked vercel.json (watchdog likely unscheduled) + dead `ingestion_events` KPIs + settle-gap "0 of N" |
| D5 insight blocks completion | **REFUTED as framed** — UI never waits on it | Insight holds the finalize CLAIM window (up to ~76s retries in the 300s budget) and its failure is swallowed with the claim stamped `done`. Fix re-scoped: after-claim + visible failure. The 183s spinner is the EPG-0.5 settle gap. |
| D6 admission blocked | **CONFIRMED** | `ingestion-raw` limit NULL; 50MB client gate passes 42MB; storage-side rejection silent to user (C2 violation); windowed path has no de-band header recovery (§6A residual) |
| D7 fragmentation | **CONFIRMED** | Enumerated: dual classify + third retry entry; 3 commit variants with divergences 2-A..2-E; N trace-readers; forked cron config |

**State altered during Phase 0** (proof tenants only, self-healing): VLTEST2's 4 plan-workbook
sheet-granularity fingerprint rows deleted (regenerate on next import; with-or-without them the warm
path throws — see F-NEW-1/2); Casa Diaz atoms written by the probe runs were deleted to restore the
pre-probe state; one synthetic finalize-claim row inserted and removed.
