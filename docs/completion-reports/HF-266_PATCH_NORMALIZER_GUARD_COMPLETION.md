# HF-266 Patch — Normalizer Guard: Key-Existence → Value-Truthiness — COMPLETION
## HEAD SHA: 8ef0a3b2631cc6a9f33c98ce1551e916a77e2f9b · Date: 2026-06-02

## Problem
The normalizer guard used the `in` operator (key existence). The LLM emits `{ shape: undefined, operands: [...] }`, so `'shape' in n` is true → the node was skipped → `switch(desc.shape)` dispatched on undefined → `unknown shape "undefined"` (CRP Plan 2 consumables-commission, 3/3 identical at temperature 0).

## One-line diff
```diff
diff --git a/web/src/lib/plan-intelligence/intent-constructor.ts b/web/src/lib/plan-intelligence/intent-constructor.ts
index 02a7ba27..fb756187 100644
--- a/web/src/lib/plan-intelligence/intent-constructor.ts
+++ b/web/src/lib/plan-intelligence/intent-constructor.ts
@@ -104,7 +104,11 @@ function normalizeNode(node: unknown): void {
   if (!node || typeof node !== 'object' || Array.isArray(node)) return;
   const n = node as Record<string, unknown>;
 
-  if (!('shape' in n) && !('kind' in n)) {
+  // HF-266 patch: value-truthiness, not key-existence. The LLM emits nodes like
+  // { shape: undefined, operands: [...] } — `'shape' in n` is true (key present) so the
+  // original guard skipped them and the dispatcher threw `unknown shape "undefined"`.
+  // `!n.shape` catches both an absent key and a present-but-falsy value.
+  if (!n.shape && !n.kind) {
     // Operand discriminant (`kind`) — a leaf value, a data reference, or a wrapped structure.
     if (typeof n.value === 'number' || typeof n.value === 'string' || typeof n.value === 'boolean') {
       n.kind = 'constant';
```

## Build Gate
```
rm -rf .next && npm run build -> Compiled successfully
```

## Verification (real constructTree)
```
composed child { shape: undefined, operation:'multiply', operands:[...] } -> constructTree SUCCESS, prime = arithmetic
```

## Confirmation — no other changes
The ONLY change is the guard condition (`!('shape' in n) && !('kind' in n)` -> `!n.shape && !n.kind`, plus an explanatory comment). The inference rules, recursion, composed-children dispatch, and the P2 raw-intent logging are unchanged.

## Branch note
PR #452 was already MERGED to main before this patch. This patch is committed to `dev` (8ef0a3b2), now ahead of `main`; it will NOT flow into the closed #452. A new PR (or merge) is required to land it on main — see report tail.

*HF-266 patch — guard fixed, build + witness verified.*
