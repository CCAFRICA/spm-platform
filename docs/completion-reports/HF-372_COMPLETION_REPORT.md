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

---

## Phase A — Recognition integrity: identity-keyed atoms (D1 + F-NEW-1 + F-NEW-2)

**Phase 0 findings answered.** EPG-0.1 (value-shape-only hash collides distinct columns), F-NEW-1
(Tier-1 skip leaves no recognition surface → MissingRecognitionError on every re-import), F-NEW-2
(atom write drops the bare primitives → every fresh import re-creates incomplete atoms).

**Changes.**

1. **Identity-keyed fingerprint, v4** (`web/src/lib/sci/atom-fingerprint.ts`):
   `ATOM_ALGORITHM_VERSION` 3 → 4; the atom hash is now sha256 over the structural features PLUS a
   one-way digest of the header's identity key:
   ```ts
   export function headerIdentityKey(columnName: string): string {
     return columnName.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
   }
   export function hashAtomIdentity(columnName: string, f: AtomFeatures): string {
     const headerDigest = createHash('sha256').update(headerIdentityKey(columnName), 'utf8').digest('hex');
     return createHash('sha256').update(`${canonical(f)}|${headerDigest}`).digest('hex');
   }
   ```
   The header participates as DATA (generic Unicode canonicalization only — NFC/trim/whitespace/case;
   zero language-specific literals, zero vocabulary; Korean Test holds: `사원번호` keys identity with no
   developer edit). The raw header is never persisted in the identity row (one-way digest; DI-10
   preserved). The v4 bump invalidates every collided v3 entry by the established mechanism. The
   sheet-level fingerprint already keyed on column names (`structural-fingerprint.ts:81`) — only the
   atom layer was name-blind.

2. **F-NEW-2 closed** (`web/src/lib/sci/header-comprehension.ts:585`): the atom write now carries
   `scope_role`/`nature_role` (they were already present on `r.atomsToWrite` from
   `decomposed-comprehension.ts:111,152` and already persisted by `writeAtoms`/`buildAtomRow` — the
   single dropped link was this push).

3. **F-NEW-1 closed** (`web/src/app/api/import/sci/process-job/route.ts`): every sheet now goes
   through decomposed comprehension — the former Tier-1 skip left `profile.headerComprehension`
   absent, which the HF-367/368 classifier fail-louds on. Decomposed comprehension IS the warm path:
   known atoms claim from the flywheel with zero LLM dispatch; only the novel/identifier residue
   comprehends. One recognition surface, warm or cold (AP-17). (`sheetMatchTier1` helper deleted —
   its only consumer was the removed filter.)

4. **Recognition-layer definitional fix** (`web/src/lib/ai/providers/anthropic-adapter.ts`,
   header_comprehension prompt): the `transaction` scope's definition said "one value per row; the
   rows ARE the events" — a catalog's code column (Plan General `#`: C1..C5) literally satisfies
   "one value per row", and the model named it a transaction identifier while its own prose said
   "allowing other sheets to point back" (reference semantics). The fixed-skeleton definitions now
   state the ESSENCE and CONTRAST: transaction = OCCURRENCES that happened (dated/measured events),
   explicitly NOT a code column of a sheet that DEFINES/CATALOGS things (that is reference).
   Structural semantics only — no synonyms, no vocabulary (HALT-2 clean).

**EPG-A1 — distinct atoms, live.** `npx tsx scripts/_hf372_epg01_bcl_probe.ts` (v4):

```
Cross-column collisions: 0
  Plan_Comisiones_2025 [Plan General] "Componente" → 423f04549814
  Plantilla_Personal   [Personal] "Nombre_Completo" → 3bede79230e4
  Datos_Ene2026        [Datos] "Nombre_Completo" → 3bede79230e4     ← true re-encounter: SAME atom
  Plan_Comisiones_2025 [Metas Mensuales] "Nivel" → 711fe6428dcc
  Plan_Comisiones_2025 [Metas Mensuales] "Meta Colocación ($)" → dbb3ce59830e
  Plan_Comisiones_2025 [Metas Mensuales] "Meta Depósitos ($)" → 67f7f791856e
```

Casa Diaz workbook (was 21 collisions): `106 column-atoms, 95 distinct hashes, Hashes shared by
DISTINCT column names: 0` (remaining shared hashes are the same header+shape across sheets — true
re-encounters, e.g. AUTORIZA).

**EPG-A2 — live comprehension on the fixed code** (`_hf372_epg02_live_classify.ts bcl`, real LLM;
run 2 exercises the WARM path against run 1's v4 atoms):

```
[OB-203][atom-claim] sheet=Plan General col=Componente hash=423f04549814 -> CLAIMED
  role=A human-readable label/name for each incentive component.@0.92        ← its OWN recognition
[OB-203][atom-claim] sheet=Plan General col=# hash=98c2767c8f38 -> NOVEL … — will comprehend
[OB-203][atom-residue] sheet=Plan General known=4/5 novel=1 [#]              ← identifier re-comprehends (HF-370 O1 re-verified)
[OB-203][atom-residue] sheet=Tablas de Tasas known=7/7 novel=0 []            ← zero LLM
[OB-203][atom-residue] sheet=Metas Mensuales known=3/3 novel=0 []            ← zero LLM

  "#"           scope_role=reference  nature_role=identifier                 ← was transaction pre-fix
  "Componente"  scope_role=reference  nature_role=name
  "<0.70" … "≥0.95"  scope_role=none  nature_role=measure                    ← each cell column its own atom

── SHEET VERDICTS ──
  [Plan General]    → reference @0.92        ← was entity (roster) on corrupted memory
  [Tablas de Tasas] → reference @0.93  + plan ::split @0.8
  [Metas Mensuales] → reference @0.88        ← was ambiguous-churn reference@0.75
```

The warm path CLASSIFIES (F-NEW-1/2 closed): warm claims carry complete primitives; one LLM dispatch
total for the warm workbook (the identifier residue). No roster misread; no person-name claim.

**Named carry-forward (no silent deferral, HALT-4):** EPG-A2's third clause — "plan interpretation
receives the plan sheets it previously lost" — is gated on the plan ::split emission, which today is
decided by the `natureIsPlanRule` word-regex over prose (`negotiation.ts:53-55`, EPG-0.4 item 1).
On this run only `Tablas de Tasas` splits (interpretation sheet count 1 of 3). That surface is
Phase C's subtraction target; the sheet-count gate is demonstrated there.

**Suite/build:** 572/572 tests pass; `tsc` clean except two pre-existing TS2802 hits in HF-350/370
test files (verified present on the branch base); `npm run build` → `.next/BUILD_ID` present;
`localhost:3000` responds (HTTP 307 auth redirect).

---

## Phase B — Deterministic rate-table construction (D2)

**Phase 0 findings answered.** EPG-0.3: the LLM emitted every rate cell (40-52s/matrix, truncation
class, temperature-dropped Opus nondeterminism); the de-banded grid already held every cell value.

**Changes.**

1. **Recognition contract** (`anthropic-adapter.ts`, plan_component prompt): a component backed by a
   FIXED rate table emits `rateMatrixRecognition` — sheet, sectionLabel (a value actually present in
   the `__section` column), rowAxis/columnAxis with per-band `{rowLabel|gridColumn, gte, lt,
   occurrence}` half-open edges (Decision 127), `valueGridColumn` (1D), `applyToField` (rate×base) —
   or `inexpressible: {reason}` verbatim. Cells are NEVER emitted by the model. Per-row column rates
   and non-grid components keep the existing DAG emission unchanged (DD-7); the skeleton's
   `rateTableCellCount` is documented as an estimate, not a command (a wrongly-declared "table"
   whose values come from prose emits the normal DAG via the loudly-logged DECLARED-TABLE path).
2. **Deterministic constructor** (`web/src/lib/sci/rate-matrix-construction.ts`, new):
   `constructRateMatrixIntent(recognition, grid)` reads EVERY cell from the de-banded grid at the
   recognized locations and builds the exact PrimeNode cascade (sorted half-open bands, and(gte,lt)
   conditions, unbounded-below band as terminal else, else terminal constant(0); meta on edge
   constants mirrors the emitted-DAG shape). Cell values parse via a documented deterministic
   numeric parser (`parseNumericCell`: currency symbols, thousands/decimal separators, %, parens
   negatives — throws loud on unparseable). The constructed tree passes the SAME
   `validateComponentIntent` gate with `expectedCellCount` DERIVED from the recognition (rows×cols)
   — the completeness oracle is no longer an LLM emission.
3. **Carry Everything at construction** (`assembleConstructionGrid`): live EPG-B1 exposed a
   de-bander data-loss: BCL "Tablas de Tasas" stacks the C2 captación band tables whose rows the
   OB-254 classifier removed as SUBTOTAL (only "Nivel 5" survived as data). The construction grid is
   assembled from the tidy rows PLUS the data-shaped sidecar rows (SUBTOTAL/NARRATIVE only — never
   banners/headers) in SOURCE ORDER, with recovered rows inheriting the `__section` of the LAST
   SECTION_LABEL above them (mirroring the de-bander's own carry — its surviving rows hold exactly
   that value). The OB-254 classifier itself is UNTOUCHED (no reclassification, no ripple).
4. **Full-row flattening for grid-scale sheets** (`plan-interpretation.ts`): sheets ≤40 rows are
   shown in full (a >12-row fixed grid was structurally unemittable from the 12-row sample —
   EPG-0.3 §3b); the interleaved emission also annotates removed banner rows positionally
   (`>>> [removed SECTION_LABEL row]: …`) so the model binds stacked identical-label blocks to the
   banner that names them. Sampling unchanged for larger sheets.
5. **Orchestrator wiring** (`plan-orchestration.ts`): recognition branch constructs + validates and
   logs `[plan-component] CONSTRUCTED … cells=N constructMs=…`; construction failures retry WITH
   the verbatim error fed back (the model corrects its recognition); `inexpressible` retries with
   feedback and is terminal HALT-6 with the model's verbatim reason when it survives the retry
   budget. `debandedSheets` grids threaded from `interpretPlanGroup`.

**EPG-B1 — BCL plan workbook, live (real LLM, real storage file, persisted rule_set).**
Run 6 (`_hf372_epgb1_bcl_plan.ts`): **6/6 components succeeded** — the full C1-C4 structure, both
variants, persisted as rule_set "BANCO CUMBRE DEL LITORAL":

```
[plan-component] CONSTRUCTED component=c1-colocacion-ejecutivo … cells=30 constructMs=1 llmLatencyMs=12391
[plan-component] CONSTRUCTED component=c1-colocacion-senior    … cells=30 constructMs=0 llmLatencyMs=15067
[plan-component] CONSTRUCTED component=c2-captacion-ejecutivo  … section="Ejecutivo" cells=5 constructMs=0
[plan-component] CONSTRUCTED component=c2-captacion-senior     … section="Ejecutivo Senior" cells=5 constructMs=1
[plan-orchestrator] Phase B complete — 6/6 components succeeded    TOTAL wall time: 48848ms

  [Ejecutivo Senior] "Colocación de Crédito" method=rate_matrix_constructed
    cells (30): 0,80,120,160,200, 80,120,180,240,300, 120,180,260,340,420, 180,260,360,460,560,
                240,360,480,600,700, 300,420,560,680,700          ← grid rows 1-6 VERBATIM
  [Ejecutivo] "Colocación de Crédito" cells (30): 0,50,80,110,140 … 210,300,400,480,500  ← rows 7-12 VERBATIM
  [Ejecutivo Senior] "Captación de Depósitos" cells (5): 0,120,250,400,550   ← RECOVERED sidecar rows
  [Ejecutivo] "Captación de Depósitos"        cells (5): 0,80,180,300,420    ← RECOVERED sidecar rows
```

Every constructed cell matches the pasted de-banded grid exactly (the grid is in the Phase 0/EPG-B1
logs; C2's five bands were reconstructed from rows the de-bander had destroyed). Construction 0-3ms
per matrix vs the observed 40-52s emissions. **Determinism repeat** (reset + fresh run 7): 6/6 again;
both 30-cell matrices byte-identical across runs. Honest residuals: recognition-level expression may
vary within semantic equivalence (run 7 expressed Nivel-1 as gte:0 instead of unbounded — same
cells, one extra terminal constant(0)); non-grid `prime_dag` components (C4 gate) retain the
pre-existing LLM-emission variance (out of D2's surface; the temperature-drop mechanism is named in
EPG-0.3 §5a for architect disposition).

**EPG-B2 — Casa Diaz rate-bearing sheet, live.** LOCALES REFAC through the same entry
(`_hf372_epgb2_casa_plan.ts`): **10/10 components succeeded**, rule_set "COMISIONES SUCURSALES
LOCALES REFAC" persisted. Every per-row-rate component correctly took the DAG path (recognition mode
did NOT fire — these are not fixed grids) with verbatim column references and no hardcoded rates:

```
[Gerente] "Comisión Ventas Facturadas Propias" method=prime_dag
  references: "BASE COMISION", "% AUTORIZADO"     plain constants (0):
[plan-orchestrator] Phase B complete — 10/10 components succeeded   TOTAL wall time: 53145ms
```

**Architect review items (requested mid-phase):**

1. *Band-label character scans in construction code*: **zero.** Band labels are matched by trimmed
   equality ONLY (`rate-matrix-construction.ts:261`: `String(r[gridColumn] ?? '').trim() ===
   band.rowLabel.trim()`); band MEANING comes exclusively from the model's `gte`/`lt` numbers. The
   only regexes in the module are in `parseNumericCell` (lines 126-146) and operate on CELL VALUES
   (currency symbols, thousands/decimal separators, %, parens negatives) — never on band labels,
   never to infer edges. Disclosed in full; grep output pasted in the session log.
2. *No label-format enumeration; no confidence gate*: confirmed. `parseRateMatrixRecognition`
   validates SHAPE only (fields present, edges coherent, ≤1 unbounded per side) — no acceptable-label
   list anywhere. No confidence threshold or weighting gates construction: the only `confidence` in
   the module is the fixed 0.9 META on edge constants (mirroring the emitted-DAG compare-constant
   shape for the HF-279 scale validator), read by nothing as a gate.
3. *Model-named rowLabel with no verbatim-equal grid cell*: `constructRateMatrixIntent` throws
   `RateMatrixConstructionError` naming the label and match count
   (`rate-matrix-construction.ts:262-271`). No normalization retry exists in code (the ONLY
   transform on both sides is whitespace `trim()`); the orchestrator feeds the verbatim error back
   into the model's RETRY (the model corrects its recognition) — code never remaps, fuzzy-matches,
   or falls back. Terminal failure carries the verbatim error.
4. *HALT-6 handling*: `inexpressible` retries with the model's verbatim reason fed back (live
   evidence: a premature inexpressible on C2-senior was disproven by its sibling variant one attempt
   later), and is TERMINAL with the verbatim reason when it survives the retry budget
   (`plan-orchestration.ts` recognition branch). There is no code path that generates an LLM DAG for
   a recognized matrix. The one adjacent path, disclosed: the MODEL may itself emit
   `calculationIntent` instead of a recognition (skeleton declarations are estimates — e.g. "Pad
   System", whose two rates come from prose, not a grid); that path is loudly logged
   (`DECLARED-TABLE …emitted a DAG… accepting via the guarded emission path`) and remains
   exhaustive_emission-guarded. It is model judgment made visible, never a silent code fallback.

**Suite/build:** 580/580 tests pass (8 new constructor tests incl. Korean-clean cell parsing,
occurrence selection, grammar validation of constructed trees, byte-determinism); build →
`.next/BUILD_ID` present.

**State altered (proof tenants, self-healing):** rule_sets "BANCO CUMBRE DEL LITORAL" (VLTEST2) and
"COMISIONES SUCURSALES LOCALES REFAC" (Casa Diaz) persisted by the live EPG runs; a probe copy of the
Casa Diaz workbook uploaded at `2d9979ba-…/hf372-epgb2/`. Phase G clean-slates both tenants.

---

## Phase C — Registry subtraction with expression preservation (D3, corrected per HALT-1)

**Phase 0 finding answered.** EPG-0.4: the directive's named lists (`MEASURE_NATURE`/`TEMPORAL_NATURE`)
were already deleted by HF-368; the surviving registry class lived at `negotiation.ts:29-67` (7
bilingual regexes → field affinities incl. the plan ::split), `header-comprehension.ts:284-301` (6 more,
incl. the `seller|vendedor|empleado` scopeIsEntity synonym list), `entity-resolution.ts:34-45` (+3 call
sites), `per-row-attribution.ts:54-58` (calc layer).

**Changes.**

1. **New bare primitive `plan_role` ∈ {rule_parameter, none}** (`structural-primitives.ts` — the plan-vs-
   data architectural dimension, Decision 158): the MODEL names per column whether it is a parameter OF
   the compensation plan; code reads it by equality. Threaded end-to-end exactly like HF-368's
   scope/nature: producer prompt + JSON contract (`anthropic-adapter.ts`), `HeaderInterpretation`
   (`sci-types.ts`), `LLMHeaderResponse` + claim/comprehended reconstruction + atom write
   (`header-comprehension.ts`), `ComprehendedInterpretation` + both atomsToWrite pushes
   (`decomposed-comprehension.ts`), `AtomExpression`/`KnownAtom` + buildAtomRow + lookupAtoms +
   exprToStore (`atom-flywheel.ts`), planner claim expr (`comprehension-planner.ts`), classification
   trace (`resolver.ts`, `synaptic-ingestion-state.ts`), novel-value fail-loud
   (`validatePlanRole`, wired into the classifier's validation loop). **`ATOM_ALGORITHM_VERSION` 4 → 5**
   (the HF-369 lesson: a column_roles schema change MUST bump the version; v4 existed only in this
   branch's own live proofs).
2. **negotiation.ts** — all 7 word-regexes DELETED; readers are equality on the model's primitives
   (`natureIsPlanRule` = `plan_role === 'rule_parameter'`; `natureIsReferenceKey` = identifier scoped
   `reference`; `natureIsSilent` = no bare nature rendered → the structural affinity arms handle it,
   a structural fallback, not a default classification).
3. **header-comprehension.ts** — all 6 local word-regexes DELETED (equality readers).
4. **entity-resolution.ts** — prose predicates DELETED; equality readers over field_identities'
   `natureRole`/`scopeRole`; the batch key-kind is recorded as a bare token ('identifier' /
   'reference_key') and entity typing reads it by fixed-set membership. A LEGACY batch (field_identities
   with no bare primitives anywhere) ABSTAINS LOUDLY (`console.error` naming the batch; idColumn stays
   null → calc-time resolution; re-import self-heals) — never a prose read, never a silent guess.
5. **per-row-attribution.ts** (calc layer) — same conversion; legacy batches abstain loudly and
   `extractTransactionRef` returns null (no prose read).
6. **field-identities carry the primitives everywhere**: `extractFieldIdentitiesFromTrace` now carries
   `scopeRole` (it carried natureRole since HF-368); `buildFieldIdentitiesFromBindings` (the no-trace
   fallback) maps each controlled SemanticRole to its bare natureRole/scopeRole so bindings-built
   identities read identically.

**EPG-C1 evidence.**

Post-removal grep over `src/lib/sci` + `src/lib/calculation` for prose-scanning word lists: the only
remaining hits are (a) `remediation-stage.ts:49` `NON_TEXT_ROLE` — scans the platform's CONTROLLED
SemanticRole enum tokens (assigned values, not model prose) as the SECONDARY signal behind the
bare-natureRole equality read — justified, kept; (b) `classification-signal-service.ts:810-813`
(lookupLexicalPrior buckets) and (c) `tenant-context.ts:150` (computeEntityIdOverlap looksEntityId) —
both write to state fields (`priorSignals`, `entityIdOverlaps`) that have ZERO readers on main
(verified by grep; HF-364 §6A's "inert" disposition confirmed) — justified as non-classifying dead
surfaces, named as follow-on cleanup residuals (§6A).

Live classification on the fixed code (real LLM, v5 atoms, `_hf372_epg02_live_classify.ts bcl`):

```
  "#"                 scope_role=reference nature_role=identifier  plan_role=rule_parameter
  "Componente"        scope_role=reference nature_role=name        plan_role=rule_parameter
  "Tipo de Cálculo"   scope_role=reference nature_role=categorical plan_role=rule_parameter
  "Cumplimiento \ Calidad" … plan_role=rule_parameter   (and every rate-band column)
  "Nivel" / "Meta Colocación ($)" / "Meta Depósitos ($)" … plan_role=rule_parameter

── SHEET VERDICTS ──
  [Plan General]    → reference @0.97  + plan ::split @0.8      ← the split the word-regex missed
  [Tablas de Tasas] → reference @0.95  + plan ::split @0.8
  [Metas Mensuales] → reference @0.88  + plan ::split @0.8      ← now reaches plan interpretation
```

**EPG-A2 carry-forward CLOSED**: all three plan sheets split as plan via the model's own plan_role →
plan interpretation receives its full sheet set (EPG-B1's live run already exercised the 3-sheet
batched interpretation: "[SCI plan-interp] Batched interpretation: 3 sheets", "de-banded text
extracted … from 3 sheets" → the full C1-C4 component structure, both variants).

**Suite/build:** 580/580 (two fixture files updated from prose-only to bare-primitive shape — the
post-HF-368 reality the readers now demand); build → `.next/BUILD_ID` present.
