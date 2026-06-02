# HF-266 — Intent Constructor Branch Normalization — COMPLETION REPORT
## HEAD SHA: 9696b01d5b1702802c297369a0e503098b572907 · Date: 2026-06-02 · PR: pending below

## P1 — Constructor validation (web/src/lib/plan-intelligence/intent-constructor.ts)
- Structure discriminant: `switch (desc.shape)` (:88) — recognized `banded_lookup | arithmetic | conditional | composed` (:104).
- Operand discriminant: `switch (op.kind)` (:412) — recognized `reference | constant | structure` (HALT-2: data references use kind:'reference' with a `source`; there is no 'input'/'measure' kind).
- Branch validator (:302-316): a then/else branch must have `'shape' in branch` (structure) or `'kind' in branch` (operand), else throws `branch is neither a structure (shape field) nor an operand (kind field)`.
- `unknown shape "undefined"` throw at the structure dispatcher default (:100-104).
- Schema field names (compositional-intent.ts): arithmetic={operation, operands[2]}; conditional={condition, then, else}; composed={composition, children[]}; banded_lookup={dimensions, outputs}; operands=constant{value}/reference{source}/structure{structure}. The directive's hypothesized `op`/`inputs` are aliases for `operation`/`operands` — normalizer adapted to the real names.

## P2+P3 — Implementation diff
```diff
diff --git a/web/src/lib/plan-intelligence/intent-constructor.ts b/web/src/lib/plan-intelligence/intent-constructor.ts
index cee57af8..02a7ba27 100644
--- a/web/src/lib/plan-intelligence/intent-constructor.ts
+++ b/web/src/lib/plan-intelligence/intent-constructor.ts
@@ -70,7 +70,80 @@ export function constructTree(intent: CompositionalIntent): PrimeNode {
   if (!intent.structure) {
     throw new ConstructionError('$.structure', null, 'structure field missing');
   }
-  return constructStructure(intent.structure, intent.scale, '$.structure');
+  // HF-266 P2: snapshot the RAW LLM intent before normalization, so a construction
+  // failure surfaces the exact malformation (previously only the error path string survived).
+  let rawSnapshot: string;
+  try { rawSnapshot = JSON.stringify(intent); } catch { rawSnapshot = '<unserializable>'; }
+  // HF-266 P3: infer missing shape/kind discriminants from structural cues before validation.
+  normalizeCompositionalIntent(intent);
+  try {
+    return constructStructure(intent.structure, intent.scale, '$.structure');
+  } catch (err) {
+    // HF-266 P2: the raw intent is the diagnostic evidence for any future failure (§4A — retain).
+    console.error(
+      `[intent-constructor] HF-266 construction failed: ${err instanceof Error ? err.message : String(err)} ` +
+      `— raw CompositionalIntent (pre-normalization): ${rawSnapshot}`,
+    );
+    throw err;
+  }
+}
+
+// ─────────────────────────────────────────────
+// HF-266 — structural normalization pass
+// ─────────────────────────────────────────────
+//
+// The LLM sometimes emits nodes that carry the right structural fields but lack
+// the `shape`/`kind` discriminant the constructor dispatches on (e.g. `{ value: 500 }`
+// missing `kind:"constant"`, or `{ operation, operands }` missing `shape:"arithmetic"`).
+// This pass infers the missing discriminant from the node's own fields, recursively,
+// BEFORE validation. Korean Test: keys on structural field PRESENCE only — no domain
+// vocabulary. Unknown patterns are left untouched so the constructor still throws (and
+// P2 logs the raw intent). Inference rules are append-only (§4A).
+
+function normalizeNode(node: unknown): void {
+  if (!node || typeof node !== 'object' || Array.isArray(node)) return;
+  const n = node as Record<string, unknown>;
+
+  if (!('shape' in n) && !('kind' in n)) {
+    // Operand discriminant (`kind`) — a leaf value, a data reference, or a wrapped structure.
+    if (typeof n.value === 'number' || typeof n.value === 'string' || typeof n.value === 'boolean') {
+      n.kind = 'constant';
+    } else if (n.source && typeof n.source === 'object') {
+      n.kind = 'reference';
+    } else if (n.structure && typeof n.structure === 'object' && !Array.isArray(n.structure)) {
+      n.kind = 'structure';
+    }
+    // Structure discriminant (`shape`) — inferred from the schema's composite fields.
+    else if (Array.isArray(n.operands)) {
+      n.shape = 'arithmetic';            // ArithmeticDescription { operation, operands }
+    } else if (n.condition && typeof n.condition === 'object') {
+      n.shape = 'conditional';           // ConditionalDescription { condition, then, else }
+    } else if (Array.isArray(n.dimensions) || Array.isArray(n.outputs)) {
+      n.shape = 'banded_lookup';         // BandedLookupDescription { dimensions, outputs }
+    } else if (Array.isArray(n.children)) {
+      n.shape = 'composed';              // ComposedDescription { composition, children }
+    }
+    // else: unknown pattern → leave untouched; the constructor throws (rule 7).
+  }
+
+  // Recurse into every node-bearing position, regardless of the node's own discriminant,
+  // so deeply-nested branches (then/else/children/operands) are normalized too.
+  if (Array.isArray(n.operands)) n.operands.forEach(normalizeNode);
+  if (Array.isArray(n.children)) n.children.forEach(normalizeNode);
+  if ('then' in n) normalizeNode(n.then);
+  if ('else' in n) normalizeNode(n.else);
+  if ('output_derivation' in n) normalizeNode(n.output_derivation);
+  if (n.structure && typeof n.structure === 'object' && !Array.isArray(n.structure)) normalizeNode(n.structure);
+}
+
+/**
+ * HF-266: normalize a CompositionalIntent in place — infer missing shape/kind
+ * discriminants throughout the structure tree. Exported for unit verification.
+ */
+export function normalizeCompositionalIntent(intent: CompositionalIntent): void {
+  if (intent && typeof intent === 'object' && intent.structure) {
+    normalizeNode(intent.structure);
+  }
 }
 
 // ─────────────────────────────────────────────
@@ -334,7 +407,10 @@ function constructComposed(
     throw new ConstructionError(path, desc, 'composed requires at least one child');
   }
 
-  const childNodes = desc.children.map((c, i) => constructStructure(c, scale, `${path}.children[${i}]`));
+  // HF-266: composed children may be structures OR operands (a constant/reference can be a
+  // legitimate child of a sum/max). Dispatch via constructBranchOrOperand so a normalized
+  // operand child (e.g. {kind:'constant', value:100}) is accepted instead of forced to a shape.
+  const childNodes = desc.children.map((c, i) => constructBranchOrOperand(c, scale, `${path}.children[${i}]`));
 
   if (childNodes.length === 1) return childNodes[0];
 
```

## P5 — Verification (real constructTree, no UI; live tenant re-import is architect-executed)
I cannot drive the browser import, so the normalizer was verified directly against the witness
malformation patterns using the actual exported `constructTree`/`normalizeCompositionalIntent`:
```
raw then-branch has shape? false | kind? false   (the exact failing condition)
after normalize: then.kind = constant | else.shape = arithmetic | operands[0].kind = constant | operands[1].kind = reference
CRP Plan 3 class (conditional w/ malformed then/else) -> constructTree SUCCESS, prime = conditional   (was cognition_violation)
CRP Plan 2 class (composed w/ constant operand child + arithmetic child missing shape) -> SUCCESS, prime = arithmetic
unknown node {foo,bar} as a branch -> correctly REJECTED (rule 7; normalizer does not fabricate) + P2 raw-intent logged
```
**CRP Plan 3 import:** mechanism PASS against the witness pattern; live PDF re-import for tenant e44bbcb1-... is architect-executed. If the live LLM output hits a pattern not covered by the inference rules, the P2 raw-intent log now captures the exact JSON for an append-only rule extension (§4A).
**CRP Plan 2 import:** mechanism PASS — required an additional fix: constructComposed now accepts operand children (constructBranchOrOperand) since the witness sums a constant alongside structures.
No success is fabricated: live re-import results are the architect's to capture; the harness proves the construction-layer fix against the documented malformation classes.

## Build Gate
```
rm -rf .next && npm run build -> Compiled successfully
```

## HALT Disposition Log
- HALT-1 (discriminant convention): CLEAR — constructor uses `shape` (structure) and `kind` (operand).
- HALT-2 (data-reference kind): CLEAR — operand kinds are reference|constant|structure; a data reference is kind:'reference' with a `source` object (no 'input'/'measure'). Normalizer maps source-bearing nodes to kind:'reference'.

## Notes
- Inference rules are append-only (§4A). The P2 raw-intent logging is retained permanently as the diagnostic for any future construction failure.
- Beyond the directive's discriminant normalization, the composed-children polymorphism fix (operands allowed as composed children) was required for the CRP Plan 2 class and is included.

*HF-266 — normalization + raw-intent logging implemented, build-verified, witness-pattern-verified. Live CRP re-import is architect-executed.*
