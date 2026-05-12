# HF-203 — Calc Trace Output to Vercel Log

**Class:** HF (small follow-on fix to HF-202)
**Repo:** `~/spm-platform`
**Branch:** `hf-203-calc-trace-vercel-log` (create from main HEAD post-HF-202 merge)
**Type:** Single-file modification; replaces filesystem write with Vercel log emission
**Substrate authority:**
- HF-202 architectural gap surfaced empirically: `fs.writeFileSync` to `process.cwd()/docs/calc-traces/` is incompatible with Vercel serverless (filesystem ephemeral)
- T1-E907 (Fix Logic Not Data) — single function body modification
- T1-E910 (Korean Test) — generic delimiters; no domain-specific terms
- Decision 124 (Research-Derived Design) — output sink derived from deployment-environment constraints
- T5-E1064 (Procedural Theater Minimization) — minimal change; existing toggle/filter logic untouched

## ARCHITECT INTENT

HF-202 trace capture works correctly. Output sink is wrong for production (Vercel serverless). HF-203 changes the output mechanism: instead of `fs.writeFileSync` to ephemeral filesystem, emit each line of the MD via `console.log` to Vercel's log stream with bracketing delimiters.

**Architect retrieval:** Vercel dashboard → Logs → find calc invocation → copy lines between `=== CALC-TRACE-MD-START ===` and `=== CALC-TRACE-MD-END ===` → paste into chat.

**Size limit acknowledged.** Per-line emission (each `console.log` is one MD line) keeps individual log entries under Vercel's per-line cap. If a single MD line exceeds the cap (rare; pretty-printed JSON `data` could trigger), the line truncates. Architect dispositions follow-on HF if it becomes an issue.

## CC PASTE BLOCK

```markdown
# HF-203 — Calc Trace Output to Vercel Log

**Repo:** `~/spm-platform`
**Branch:** create `hf-203-calc-trace-vercel-log` from main HEAD
**Inheritance:** `CC_STANDING_ARCHITECTURE_RULES.md` Rules 1-28
**Bindings:**
- T1-E907 (Fix Logic Not Data) — single file modification
- T1-E910 (Korean Test) — generic delimiters
- Decision 124 — output sink derived from deployment constraint
- T5-E1064 — minimal change; preserve existing structure

## SCOPE

Modify `web/src/lib/calculation/calc-trace.ts` `flushTraceToMD` function to emit MD content via `console.log` (Vercel log stream) instead of `fs.writeFileSync`.

**File modified:** `web/src/lib/calculation/calc-trace.ts` only.
**File NOT modified:** any caller of `flushTraceToMD` (signature stays same; return value stays string).

## EXECUTION

### Phase 0 — Branch + baseline

```bash
cd ~/spm-platform
git checkout main
git pull origin main
git checkout -b hf-203-calc-trace-vercel-log
git rev-parse HEAD
```

PASTE output.

### Phase 1 — Read current calc-trace.ts

```bash
cat web/src/lib/calculation/calc-trace.ts
```

PASTE output. Capture the current `flushTraceToMD` function body verbatim. This becomes BEFORE state in completion report.

### Phase 2 — Replace flushTraceToMD function body

Modify the `flushTraceToMD` function so the MD content (currently written to file) is instead emitted to console as bracketed log lines. Specifically:

1. Keep the existing logic that COMPOSES the MD content (the `lines` array build) — DO NOT change MD format
2. Replace the file-write block (`fs.writeFileSync(fp, lines.join('\n'), 'utf8'); return fp;`) with:
   - `console.log('=== CALC-TRACE-MD-START ===');`
   - `console.log(<header line containing trace context: tenantId, periodLabel, ruleSetName, calcBatchId, eventCount, filename>);`
   - For each line in `lines`: `console.log(line);` (one console.log call per line — Vercel cap-friendly)
   - `console.log('=== CALC-TRACE-MD-END ===');`
   - Return the synthetic filename string (e.g., `calc-trace-<timestamp>.md`) — preserves caller contract
3. Remove the `fs` and `path` imports if no longer used (likely still needed for nothing — verify with grep first)
4. Leave `filename` parameter intact; it becomes the synthetic identifier in the START header

After modification, capture the new function body verbatim. AFTER state for completion report.

### Phase 3 — Build + lint

```bash
cd web && npm run build 2>&1 | tail -20
npm run lint 2>&1 | tail -10
```

PASTE output. Both must PASS.

### Phase 4 — Commit + push

```bash
cd ~/spm-platform
git add web/src/lib/calculation/calc-trace.ts
git commit -m "HF-203: calc trace output to Vercel log

Replaces fs.writeFileSync in flushTraceToMD with per-line console.log
emission so trace MD content is captured by Vercel log stream.

Closes HF-202 architectural gap: production deployment runs on Vercel
serverless where process.cwd() is ephemeral /var/task/, not the deployed
repo. flushTraceToMD wrote files to ephemeral filesystem; files were
inaccessible post-invocation.

Output mechanism:
- '=== CALC-TRACE-MD-START ===' delimiter
- Per-line console.log of MD content (each call < Vercel per-line cap)
- '=== CALC-TRACE-MD-END ===' delimiter

Architect retrieval: Vercel dashboard > Logs > find calc invocation >
copy block between START/END delimiters > paste into chat.

Size limit (per Vercel per-line cap, ~4KB) is acknowledged. Per-line
emission mitigates aggregate trace size; per-MD-line truncation is
possible only when a single line (e.g., pretty-printed JSON) exceeds
cap. If encountered, follow-on HF dispositions remediation.

Substrate: T1-E907 (logic not data); T1-E910 (Korean Test, generic
delimiters); Decision 124 (output sink from deployment constraint);
T5-E1064 (minimal change, existing toggle/filter logic preserved)."
git push origin hf-203-calc-trace-vercel-log
```

PASTE output including commit SHA.

### Phase 5 — Open PR

```bash
gh pr create --title "HF-203: calc trace output to Vercel log" \
  --body "Replaces fs.writeFileSync in HF-202 flushTraceToMD with per-line console.log emission. Closes HF-202 architectural gap where Vercel serverless ephemeral filesystem prevented trace files from landing in repo. See commit message for substrate citations."
```

PASTE PR number.

### Phase 6 — Completion report

Write `docs/completion-reports/HF-203_CALC_TRACE_VERCEL_LOG_COMPLETION_REPORT_<YYYYMMDD>.md` per Rule 26.

Hard Gates:
- Phase 1 BEFORE state (current flushTraceToMD verbatim)
- Phase 2 AFTER state (modified flushTraceToMD verbatim)
- Phase 3 build + lint output PASS
- Phase 4 commit SHA + push confirmation
- Phase 5 PR number

Soft Gates:
- T1-E907 PASS
- T1-E910 PASS
- Decision 124 PASS
- T5-E1064 PASS
- HF-202 caller contract preserved (function signature unchanged; return value still string) PASS

Known Issues:
- Size limit deferred per architect direction
- Vercel log retention on Hobby/Pro tier (14-30 days) is acceptable for ad-hoc trace use

PASTE completion report content in chat.

## HALT CONDITIONS

HALT if:
- Build or lint fails after Phase 2 (likely import path issue from removed fs/path)
- flushTraceToMD has callers that depend on actual filesystem path existence (grep for callers; if any use fs.readFileSync on returned path, surface to architect)

Otherwise: execute continuously through Phases 0-6.

## NO FURTHER SCOPE

Single change: replace fs.writeFileSync with console.log per-line in flushTraceToMD. No other modifications. No filter changes. No additional events. No size-limit remediation.

END OF DIRECTIVE.
```

## ARCHITECT POST-MERGE WORKFLOW

After HF-203 merges:

1. **Enable trace** (browser DevTools console at platform):
   ```javascript
   fetch('/api/calculation/trace', {
     method: 'POST',
     headers: {'Content-Type': 'application/json'},
     body: JSON.stringify({entityFilter: ['BCL-5003'], componentFilter: [1]})
   }).then(r => r.json()).then(console.log);
   ```

2. **Run BCL October calc through UI**

3. **Retrieve trace from Vercel:**
   - Vercel dashboard → your project → Logs (or Deployments → click latest → Functions)
   - Filter for `/api/calculation/run` invocation timestamp matching your calc
   - Find log lines between `=== CALC-TRACE-MD-START ===` and `=== CALC-TRACE-MD-END ===`
   - Copy that block

4. **Paste trace content into chat**

5. **Disable trace:**
   ```javascript
   fetch('/api/calculation/trace', {method: 'DELETE'}).then(r => r.json()).then(console.log);
   ```
