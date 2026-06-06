# CC INLINE DIRECTIVE — HF-271 Phase 2 socket-drop recovery (diagnose → resolve → resume)

A socket connection closed mid-Phase-2. Phase 2 is a WRITE (edit `web/src/lib/ai/providers/anthropic-adapter.ts` `plan_component` prompt + commit). A dropped socket does NOT tell us whether the edit or the commit landed server-side. Do NOT re-run Phase 2 blind and do NOT commit anything until Step 1 establishes the actual repo state. Each step is an evidentiary gate — paste the literal output, do not self-attest.

Standing constraints that REMAIN IN FORCE on any recovered or re-done Phase 2 output (a socket-interrupted retry is exactly when these slip):
- **AUD-009 registry test:** the rewritten `plan_component` prompt must contain NO named plan-component kind and NO worked example depicting a *kind of plan* — only primitive descriptions + the composition rule. Test every line: *if it names or shapes a kind of plan component, it is the registry and must be cut; if it describes only a primitive (reference type / structural shape) and the rule that they compose, it is the grammar.*
- **SR-41:** discard uncommitted work with `git checkout -- <file>`; NEVER force-push, never rewrite pushed history.
- The Phase 3.3 **EPG** gate still applies to the Phase 2 prompt: it will be pasted in full and literal-enumerated before it is allowed to stand.

---

## Step 1 — Diagnose (read-only; paste all three)

From the repo root:

```
cd ~/spm-platform
git log --oneline -5
git status
git --no-pager diff --stat web/src/lib/ai/providers/anthropic-adapter.ts
```

Report all three verbatim. Classify into exactly ONE case:

- **Case A — commit landed.** `git log` shows a commit matching `HF-271 Phase 2: replace plan_component pattern-catalog…` (or equivalent). → go to Step 2A.
- **Case B — edit landed, NOT committed.** `git status` shows `web/src/lib/ai/providers/anthropic-adapter.ts` modified; no Phase 2 commit in `git log`. → go to Step 2B.
- **Case C — nothing landed.** Clean working tree AND no Phase 2 commit. → go to Step 2C.
- **Case D — ambiguous/other** (e.g., other files unexpectedly modified, detached HEAD, merge state). → STOP, paste state, do not act.

## Step 2 — Resolve (act ONLY on the matched case)

### Step 2A — commit landed
The Phase 2 write completed. Confirm its content is intact before trusting it:
```
git --no-pager show --stat HEAD
git --no-pager show HEAD:web/src/lib/ai/providers/anthropic-adapter.ts | sed -n '/SYSTEM_PROMPTS/,/^};/p' | sed -n '1,400p'
```
Paste the committed `plan_component` system-prompt block. Verify it is COMPLETE (not truncated mid-string) and coherent. → proceed to Step 3 (do NOT re-edit).

### Step 2B — edit landed, uncommitted
The edit may be partial (socket dropped mid-`str_replace`). Inspect BEFORE committing:
```
git --no-pager diff web/src/lib/ai/providers/anthropic-adapter.ts
```
Paste the full diff. Verify:
1. The diff is COMPLETE — no truncated/garbled string, no unterminated literal, balanced braces/backticks, no dangling old-catalog fragment left beside new grammar text.
2. The SC-A/B/C illustration catalog is fully REMOVED (no orphaned remnant).
3. The replacement is grammar-description ONLY (reference types + structural shapes + the composition rule), with NO named plan-component kind and NO worked example of a kind of plan (AUD-009 test).
- **If complete + coherent + AUD-009-clean:** `npm run build` to confirm it compiles (paste the tail). If it compiles, commit exactly: `git add web/src/lib/ai/providers/anthropic-adapter.ts && git commit -m "HF-271 Phase 2: replace plan_component pattern-catalog with compositional-grammar description (AUD-009 / OPT-TEACH-C)"`. Paste the commit line. → Step 3.
- **If partial / garbled / catalog remnant / AUD-009 violation:** discard and re-do clean — `git checkout -- web/src/lib/ai/providers/anthropic-adapter.ts` — then go to Step 2C.

### Step 2C — nothing landed (re-do Phase 2 clean)
Re-apply HF-271 Phase 2 from the directive (§3 Phase 2.1/2.2): in `web/src/lib/ai/providers/anthropic-adapter.ts`, replace the `plan_component` prompt's SC-A/B/C illustration catalog with grammar-description:
- **Reference types:** a single quantity → metric reference (name the field); ONE quantity divided by another → ratio reference (name BOTH numerator and denominator fields — NEVER collapse a divided quantity to a single field); a value aggregated over a group → aggregate / scope-aggregate; a value from an earlier component → prior-component reference.
- **Structural shapes:** values combined by an operation → arithmetic (state operation + operands); a value that changes by a threshold → conditional (condition / then / else); a cap/floor/limit on a value → a conditional clamp applied to THAT value before it combines further; a payout across graduated thresholds → banded lookup (reference field(s) + breaks + cell values); independently-computed parts combined → composed (sum / max / min / first-match).
- **Composition rule:** primitives combine freely and recursively to match what the plan describes; describe what the plan text says — do NOT match it to a known shape.
- Any example that remains illustrates a SINGLE primitive or the composition rule, with NO field name, NO real threshold/value, NO component-kind name.
- Do NOT change the emitted `compositional_intent` schema — only the teaching changes (DD-7).

Then `npm run build` (paste tail). On success: `git add web/src/lib/ai/providers/anthropic-adapter.ts && git commit -m "HF-271 Phase 2: replace plan_component pattern-catalog with compositional-grammar description (AUD-009 / OPT-TEACH-C)"`. Paste the commit line. → Step 3.

## Step 3 — Resume (EPG gate, then Phase 3)

Regardless of path A/B/C, before proceeding to HF-271 Phase 3, satisfy the Phase 2 portion of the EPG (Phase 3.3): paste the FULL rewritten `plan_component` prompt text as it now stands committed, and enumerate every string literal in it. The architect verifies verbatim that it contains no named plan-component kind, no worked example of a kind of plan, and no data-field/threshold literal — only primitive + composition-rule descriptions and grammar-token references. Do not begin Phase 3 (the structural-coherence proofread) until that paste is provided.

(No content after this line.)
