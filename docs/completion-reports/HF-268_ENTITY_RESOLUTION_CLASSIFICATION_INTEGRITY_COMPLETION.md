# HF-268 — Entity-Resolution & Classification Integrity — COMPLETION REPORT
## HEAD SHA: 6b129f4b54c9a07799c14c713b06b6f1b77f69a2 · Date: 2026-06-03

Meta-class: a downstream mechanism overrides/drops the authoritative structural/HC signal. Witnessed: clean CRP re-import ended with 202 entities (should be ~32).

## P1 (A2) — Entity resolution binds transactions to reference_key, never event identifiers (56c90d82)
### commit-content-unit.ts (entity_id_field selection)
```diff
diff --git a/web/src/lib/sci/commit-content-unit.ts b/web/src/lib/sci/commit-content-unit.ts
index ee24640e..0a00d25d 100644
--- a/web/src/lib/sci/commit-content-unit.ts
+++ b/web/src/lib/sci/commit-content-unit.ts
@@ -165,10 +165,14 @@ function resolveEntityIdField(
   // Structural fallback still consults confirmedBindings.entity_identifier in
   // case HC didn't assign a reference_key role above threshold.
   if (classification === 'transaction') {
-    const hcReferenceKey = findHcRole(classificationTrace, 'reference_key');
-    if (hcReferenceKey) return hcReferenceKey;
-    const binding = bindings.find(b => b.semanticRole === 'entity_identifier');
-    return binding?.sourceField ?? null;
+    // HF-268 A2: a transaction's entity association is its reference_key (the foreign key to the
+    // entity the event BELONGS TO). The transaction's OWN identifier is the EVENT ID, not an entity.
+    // The prior fallback to the entity_identifier binding selected that event ID when the
+    // reference_key was absent (e.g. dropped by a flywheel Tier-1 replay), and entity resolution
+    // then created phantom entities from transaction IDs (170 from one CRP sales file). When no
+    // reference_key is present, leave entity_id_field null — the engine resolves at calc time
+    // (Decision 92 / OB-183). NEVER key a transaction's entity on its own identifier (HF-263 lineage).
+    return findHcRole(classificationTrace, 'reference_key');
   }
 
   // Entity and target files: the identifier IS the entity (entity files) or
```
### entity-resolution.ts (data_type-aware idColumn fallback)
```diff
diff --git a/web/src/lib/sci/entity-resolution.ts b/web/src/lib/sci/entity-resolution.ts
index 24974455..d3a3cb68 100644
--- a/web/src/lib/sci/entity-resolution.ts
+++ b/web/src/lib/sci/entity-resolution.ts
@@ -49,7 +49,7 @@ export async function resolveEntitiesFromCommittedData(
   while (true) {
     const { data: rows } = await supabase
       .from('committed_data')
-      .select('import_batch_id, metadata')
+      .select('import_batch_id, metadata, data_type')
       .eq('tenant_id', tenantId)
       .range(offset, offset + 999);
 
@@ -60,6 +60,11 @@ export async function resolveEntitiesFromCommittedData(
       if (!batchId || seenBatches.has(batchId)) continue;
       seenBatches.add(batchId);
 
+      // HF-268 A2: the batch's classification gates the idColumn FALLBACK. A transaction/target
+      // unit's identifier is the EVENT ID, not an entity — never discover entities from it.
+      const dataType = (row as { data_type?: string | null }).data_type ?? undefined;
+      const isEventUnit = dataType === 'transaction' || dataType === 'target';
+
       const meta = row.metadata as Record<string, unknown> | null;
       if (!meta) continue;
 
@@ -103,10 +108,15 @@ export async function resolveEntitiesFromCommittedData(
             }
           }
         }
-        // Fallback within field_identities: any identifier
+        // Fallback within field_identities. HF-268 A2: an event unit (transaction/target) must
+        // discover entities from its reference_key (the entity pointer), NEVER its identifier (the
+        // event ID — keying on it created 170 phantom entities from CRP transaction_ids). When no
+        // reference_key is present, idColumn stays null → no entities (calc-time resolution, OB-183).
+        // Entity/reference units keep identifier-based discovery (the identifier IS the entity).
         if (!idColumn) {
+          const fallbackType = isEventUnit ? 'reference_key' : 'identifier';
           for (const [colName, fi] of Object.entries(fieldIds)) {
-            if (fi.structuralType === 'identifier') {
+            if (fi.structuralType === fallbackType) {
               idColumn = colName;
               break;
             }
@@ -118,8 +128,10 @@ export async function resolveEntitiesFromCommittedData(
       if (!idColumn) {
         const semanticRoles = meta.semantic_roles as Record<string, { role?: string }> | undefined;
         if (semanticRoles) {
+          // HF-268 A2: do not let an event unit (transaction/target) fall back to its
+          // entity_identifier semantic role either — that is the event ID, not an entity.
           for (const [colName, sr] of Object.entries(semanticRoles)) {
-            if (sr.role === 'entity_identifier' && !idColumn) idColumn = colName;
+            if (sr.role === 'entity_identifier' && !idColumn && !isEventUnit) idColumn = colName;
             if (sr.role === 'entity_name' && !nameColumn) nameColumn = colName;
           }
         }
```
- A transaction's entity key is its reference_key (entity pointer); the prior fallback selected the transaction's identifier (event ID) when reference_key was absent → 170 phantom entities. Now: reference_key only; null when absent (calc-time resolution, OB-183).
- entity-resolution defense-in-depth: the idColumn FALLBACK is data_type-aware — event units (transaction/target) discover from reference_key, never identifier.
- Roster (entity unit) UNCHANGED: still creates entities from its identifier (employee_id IS the person). Discriminant = the unit's classification (HALT-2 CLEAR).
- Meridian-safe: its transaction batch uses a recorded entity_id_field=Hub (reference_key — fallback not reached); its reference batch resolves via semantic_roles (data_type='reference', not gated).

## P2 (A1) — Flywheel Tier-1 carries the complete binding set (42165078)
```diff
diff --git a/web/src/app/api/import/sci/analyze/route.ts b/web/src/app/api/import/sci/analyze/route.ts
index 6a8f2ce1..cc3aa5a4 100644
--- a/web/src/app/api/import/sci/analyze/route.ts
+++ b/web/src/app/api/import/sci/analyze/route.ts
@@ -587,30 +587,53 @@ export async function POST(req: NextRequest) {
     try {
       for (const unit of proposal.contentUnits) {
         if (!unit.fieldBindings || unit.fieldBindings.length === 0) continue;
-        // Build column_roles map from field bindings
-        const columnRoles: Record<string, string> = {};
-        for (const binding of unit.fieldBindings) {
-          columnRoles[binding.sourceField] = binding.semanticRole;
-        }
         // HF-254 Fix 2a: enrich fieldBindings with NATIVE columnRole, server-side, so the
         // cold-import cache the warm import reads carries real roles independent of the
         // client round-trip. SemanticBinding carries no columnRole; the only native source
-        // is the HC interpretations, which resolveClassification builds onto the trace
-        // server-side (synaptic-ingestion-state buildProposalFromState assigns it to every
-        // unit). Identical enriched shape to emitFlywheelSignals (AP-17).
+        // is the HC interpretations (resolveClassification builds them onto the trace).
         const hcInterps = (unit.classificationTrace as Record<string, unknown> | undefined)
           ?.headerComprehension as
-            | { interpretations?: Record<string, { columnRole?: string; identifiesWhat?: string }> }
+            | { interpretations?: Record<string, { columnRole?: string; identifiesWhat?: string; confidence?: number; semanticMeaning?: string }> }
             | undefined;
         const interpMap = hcInterps?.interpretations ?? {};
-        const enrichedFieldBindings = unit.fieldBindings.map(b => {
+        // HF-268 A1 (Carry Everything — T1-E902 v2): the flywheel cache must carry EVERY
+        // HC-interpreted column's structural role, not just the subset that became a
+        // semanticBinding. Previously this mapped unit.fieldBindings only (e.g. 5 of 11),
+        // dropping sales_rep_id:reference_key — so a Tier-1 warm replay reconstructed an
+        // incomplete role set and the entity pointer vanished, causing phantom entities (A2).
+        // Build from the semantic bindings first (they carry semanticRole + confidence), then
+        // ADD any HC column with a real structural columnRole not already covered. Low-quality
+        // roles ('unknown'/empty) are gated out (HALT-4 — carry all STRUCTURAL roles, not blanket).
+        const STRUCTURAL_ROLES = new Set(['identifier', 'reference_key', 'measure', 'temporal', 'name', 'attribute']);
+        const enrichedBySource = new Map<string, Record<string, unknown>>();
+        for (const b of unit.fieldBindings) {
           const interp = interpMap[b.sourceField];
-          return {
+          enrichedBySource.set(b.sourceField, {
             ...b,
             ...(interp?.columnRole ? { columnRole: interp.columnRole } : {}),
             ...(interp?.identifiesWhat ? { identifiesWhat: interp.identifiesWhat } : {}),
-          };
-        });
+          });
+        }
+        for (const [colName, interp] of Object.entries(interpMap)) {
+          if (enrichedBySource.has(colName)) continue;
+          const role = interp.columnRole;
+          if (!role || !STRUCTURAL_ROLES.has(role)) continue;
+          enrichedBySource.set(colName, {
+            sourceField: colName,
+            semanticRole: role,
+            confidence: typeof interp.confidence === 'number' ? interp.confidence : 0.8,
+            displayContext: interp.semanticMeaning,
+            columnRole: role,
+            ...(interp.identifiesWhat ? { identifiesWhat: interp.identifiesWhat } : {}),
+          });
+        }
+        const enrichedFieldBindings = Array.from(enrichedBySource.values());
+        // column_roles map mirrors the COMPLETE binding set (native columnRole), so the
+        // poisoned-cache quality gate and warm-replay role reconstruction both see all roles.
+        const columnRoles: Record<string, string> = {};
+        for (const fb of enrichedFieldBindings) {
+          columnRoles[fb.sourceField as string] = (fb.columnRole as string) ?? (fb.semanticRole as string);
+        }
         // HF-197B: locate the unit's OWN sheet for the hash, not sheets[0].
         const sourceFile = files.find(f => f.fileName === unit.sourceFile);
         const sheetForUnit = sourceFile?.sheets.find(s => s.sheetName === unit.tabName);
```
- The fingerprint store mapped unit.fieldBindings only (5 of 11), dropping HC columns like sales_rep_id:reference_key — a Tier-1 warm replay (injected 5 fieldBindings) reconstructed an incomplete role set, the entity pointer vanished, feeding A2.
- Fix: carry EVERY HC-interpreted column with a real structural columnRole (identifier/reference_key/measure/temporal/name/attribute), gating 'unknown'/empty (HALT-4 — carry all STRUCTURAL roles, not blanket). column_roles map mirrors the complete set. HALT-5 not needed (carry-all-at-store is the fix).

## P3 (B) — HC-PATTERN restores idRepeatRatio discriminant (6b129f4b)
```diff
diff --git a/web/src/lib/sci/hc-pattern-classifier.ts b/web/src/lib/sci/hc-pattern-classifier.ts
index 77ecb748..7b1ef9fa 100644
--- a/web/src/lib/sci/hc-pattern-classifier.ts
+++ b/web/src/lib/sci/hc-pattern-classifier.ts
@@ -85,6 +85,11 @@ export function classifyByHCPattern(profile: ContentProfile): HCPatternResult |
   // it should join this disjunction. For now the tree reads only the union
   // values that actually exist in the type.
   const measurePresent = hasMeasure;
+  // HF-268 B: restore the target/transaction discriminant (Decision 108). idRepeatRatio is the
+  // structural signal HC's profile already encodes — > 1.5 means repeated entities over time
+  // (transaction); <= 1.5 means one row per entity (a per-period TARGET, e.g. a quota whose
+  // temporal column is an effective-date/period marker, not a transaction timestamp).
+  const idRepeatRatio = profile.structure.identifierRepeatRatio;
 
   // ── Branch 1: dimensional lookup ─────────────────────────
   // A categorical lookup key with no entity identifier — hub capacity,
@@ -155,7 +160,7 @@ export function classifyByHCPattern(profile: ContentProfile): HCPatternResult |
       ],
     };
   }
-  if (identifierCount >= 1 && hasTemporal) {
+  if (identifierCount >= 1 && hasTemporal && idRepeatRatio > 1.5) {
     return {
       classification: 'transaction',
       confidence: 0.85,
@@ -163,6 +168,7 @@ export function classifyByHCPattern(profile: ContentProfile): HCPatternResult |
       matchedConditions: [
         'HAS measure',
         'HAS temporal — per-period event data',
+        `idRepeatRatio=${idRepeatRatio.toFixed(2)} (>1.5 — repeated entities over time)`,
         `${identifierCount} identifier(s)`,
         `${measureCount} measure column(s)`,
       ],
@@ -173,7 +179,12 @@ export function classifyByHCPattern(profile: ContentProfile): HCPatternResult |
   // Has an identifier but NO reference_key AND NO temporal — this IS the
   // entity record, not referencing another, and not per-period.
   // "One value set per entity — quotas, targets, thresholds, rates."
-  if (identifierCount >= 1 && !hasReferenceKey && !hasTemporal) {
+  // HF-268 B: a per-entity record with measures and NO reference_key is a target. This now
+  // INCLUDES per-period temporal targets: the high-repeat temporal case (idRepeatRatio > 1.5) was
+  // already classified transaction above, so any temporal file reaching here has idRepeatRatio <= 1.5
+  // — a quota whose effective-date is a period marker, one row per entity (idRepeatRatio=1.00) lands
+  // target, not transaction. Decision 108: HC's structural idRepeatRatio is authoritative.
+  if (identifierCount >= 1 && !hasReferenceKey) {
     return {
       classification: 'target',
       confidence: 0.85,
@@ -181,7 +192,9 @@ export function classifyByHCPattern(profile: ContentProfile): HCPatternResult |
       matchedConditions: [
         'HAS measure',
         'NO reference_key — entity-level record',
-        'NO temporal — snapshot, not per-period',
+        hasTemporal
+          ? `HAS temporal but idRepeatRatio=${idRepeatRatio.toFixed(2)} (<=1.5 — per-period target, not events)`
+          : 'NO temporal — snapshot, not per-period',
         `${identifierCount} identifier(s)`,
         `${measureCount} measure column(s)`,
       ],
```
- event_transactions_temporal fired on identifier+temporal alone → quota (idRepeatRatio=1.00) misclassified transaction@85%. Restored: transaction requires idRepeatRatio>1.5 (repeated entities over time); the target branch accepts temporal files when idRepeatRatio<=1.5 (per-period targets). The quota lands target.

## Build Gate
```
rm -rf .next && npm run build -> Compiled successfully
npm run dev -> Ready in 1250ms ; curl localhost:3000 -> HTTP 307 (auth redirect, normal)
```

## HALT Disposition Log
- HALT-1 (entity_id_field selection inputs): CLEAR — uses HC reference_key role + confirmedBindings.semanticRole; entity-resolution uses field_identities structuralType. Both available.
- HALT-2 (roster must still create from identifier): CLEAR — discriminant is the unit's data_type; entity units keep identifier-based creation.
- HALT-3 (null path / calc-time dependency): not triggered — reference_key recorded when present (A1 ensures it is); genuinely-absent case leaves entity_id null per OB-183.
- HALT-4 (flywheel low-confidence gating): CLEAR — carry all STRUCTURAL roles, gate 'unknown'/empty; the existing poisoned-cache gate (column_roles contains 'unknown') still applies.
- HALT-5 (incomplete injection -> re-run HC): not chosen — carry-all-at-store is the correct fix; no re-run-HC fallback.
- HALT-6 (idRepeatRatio>1.5 changes all measure+temporal files): NOT triggered for proof tenants — genuine transactions repeat (>1.5; Meridian Datos_Rendimiento ~3x). BCL regression mandated (§8A).
- HALT-7 (temporal target accepted): CLEAR — target branch accepts temporal when idRepeatRatio<=1.5; the quota lands target.

## Expected live-verification outcomes (architect-executed)
- Clean-slate CRP (incl. structural_fingerprints + plan_interpretation_runs) -> 0 CRP entities.
- Roster CSV -> entity -> ~32 entities (employee_id is the person — unchanged).
- Quota CSV -> target (NOT transaction) -> monthly_quota in committed_data; entity_ids match roster (no phantom).
- Sales files (incl. flywheel-replay file 07) -> transaction -> linked to existing entities via sales_rep_id reference_key, 0 entities created (never transaction_id).
- Final CRP entity count ~= 32, NOT 202.
- BCL + Meridian re-import -> entity counts + classifications unchanged from verified-PASS (MANDATORY regression, §8A).
- Re-learned fingerprint for 4efbcb34e912 carries the full binding set (§8A).
- CC did NOT run imports or fabricate counts; the architect captures them.

*HF-268 — A2 + A1 + B implemented, build-verified. Live import + clean-slate architect-executed.*
