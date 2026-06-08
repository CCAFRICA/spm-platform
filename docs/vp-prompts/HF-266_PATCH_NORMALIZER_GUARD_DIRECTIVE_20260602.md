# HF-266 Patch — Normalizer Guard: Key-Existence → Value-Truthiness

## §0 — Standing Rules

Read `CC_STANDING_ARCHITECTURE_RULES.md`. Drafting per `INF_Structured_Compliant_Drafting_Reference_20260513.md`. Commit + push. Build gate.

---

## §1 — Problem

HF-266 normalizer does not fire on nodes where `shape` is present as a key but has value `undefined`. The JavaScript `in` operator tests key existence, not value truthiness. The LLM emits `children[1]` with `{ shape: undefined, operands: [...] }` — the guard `!('shape' in n)` returns `false`, the normalizer skips the node, the constructor dispatches `switch(desc.shape)` on `undefined`, throws `unknown shape "undefined"`.

Evidence: CRP Plan 2 `consumables-commission` fails 3/3 attempts at `$.structure.children[1]: unknown shape "undefined"`. All 3 attempts produce the identical error — temperature 0 determinism confirmed.

---

## §2 — Execution

**P1 — Read the current guard.** In `web/src/lib/plan-intelligence/intent-constructor.ts`, locate the `normalizeNode` function. Confirm the guard reads:

```typescript
if (!('shape' in n) && !('kind' in n)) {
```

**P2 — Fix the guard.** Replace with value-truthiness check:

```typescript
if (!n.shape && !n.kind) {
```

This catches both "key absent" and "key present with falsy value" (`undefined`, `null`, `''`, `0`, `false`). The inference rules below are unchanged — they fire on the node's structural fields and assign the correct `shape` or `kind`.

No other changes. The normalizer logic, inference rules, recursion, and the raw-intent capture (P2 logging) are all correct and unchanged.

**P3 — Build.**

```bash
rm -rf .next && npm run build
```

Commit: `HF-266 patch: normalizer guard — key-existence to value-truthiness (shape:undefined)`

Push.

---

## §3 — Reporting

Completion report: `docs/completion-reports/HF-266_PATCH_NORMALIZER_GUARD_COMPLETION.md`

Include:
- The one-line diff
- Build gate output
- Confirm no other changes to the normalizer

Push. Do NOT create a new PR — push to the existing `dev` branch so PR #452 picks up the fix.

---

## §4 — Out of Scope

- Re-import verification (architect-executed)
- New inference rules (the existing rules handle the `operands` → `shape:arithmetic` pattern once the guard lets them fire)
- Prompt template changes
