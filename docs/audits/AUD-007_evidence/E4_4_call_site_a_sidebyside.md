# E4.4a — Side-by-side Diff: (a) api/import/sci/execute/route.ts

**Command:** `git diff 93d6e793^ HEAD -- <file>`

```diff
diff --git a/web/src/app/api/import/sci/execute/route.ts b/web/src/app/api/import/sci/execute/route.ts
index 33030797..e13af469 100644
--- a/web/src/app/api/import/sci/execute/route.ts
+++ b/web/src/app/api/import/sci/execute/route.ts
@@ -16,10 +16,13 @@ import { convergeBindings } from '@/lib/intelligence/convergence-service';
 // is now invoked indirectly through the shared module to keep both import
 // endpoints' post-commit work identical.
 import { executePostCommitConstruction } from '@/lib/sci/post-commit-construction';
-import { writeClassificationSignal, aggregateToFoundational, aggregateToDomain } from '@/lib/sci/classification-signal-service';
+// OB-199 Phase 4: writeClassificationSignal deleted; migrated to canonical writer below.
+import { aggregateToFoundational, aggregateToDomain } from '@/lib/sci/classification-signal-service';
+import { writeSignal, CanonicalWriteError } from '@/lib/intelligence/canonical-signal-writer';
 import { writeFingerprint } from '@/lib/sci/fingerprint-flywheel';
 import { computeFingerprintHashSync } from '@/lib/sci/structural-fingerprint';
-import type { StructuralFingerprint, ClassificationSignalPayload } from '@/lib/sci/classification-signal-service';
+// OB-199 Phase 4: ClassificationSignalPayload no longer used at call site.
+import type { StructuralFingerprint } from '@/lib/sci/classification-signal-service';
 import type { ClassificationTrace } from '@/lib/sci/synaptic-ingestion-state';
 import type { Json } from '@/lib/supabase/database.types';
 import type {
@@ -368,27 +371,34 @@ export async function POST(req: NextRequest) {
         const wasOverridden = originalClassification !== unit.confirmedClassification;
         const traceData = unit.classificationTrace as ClassificationTrace | undefined;
 
-        const payload: ClassificationSignalPayload = {
+        // OB-199 Phase 4 (canonical writer migration; was writeClassificationSignal).
+        // Decision 30 v2 inclusive bound: confidence=1.0 on human-override admissible.
+        const confidenceValue = wasOverridden ? 1.0 : (unit.originalConfidence || 0);
+        writeSignal({
           tenantId,
+          signalType: 'classification:outcome',
           sourceFileName: unit.sourceFile || '',
           sheetName: unit.tabName || '',
-          fingerprint: unit.structuralFingerprint as unknown as StructuralFingerprint,
+          structuralFingerprint: unit.structuralFingerprint as Record<string, unknown>,
           classification: unit.confirmedClassification,
-          confidence: wasOverridden ? 1.0 : (unit.originalConfidence || 0),
+          confidence: confidenceValue,
           decisionSource: wasOverridden ? 'human_override' : (traceData?.decisionSource || 'heuristic'),
-          classificationTrace: traceData || {} as ClassificationTrace,
-          vocabularyBindings: unit.vocabularyBindings || null,
+          classificationTrace: (traceData || {}) as Record<string, unknown>,
+          vocabularyBindings: (unit.vocabularyBindings || null) as Record<string, unknown> | null,
           agentScores: traceData
             ? Object.fromEntries(traceData.round1.map(s => [s.agent, s.confidence]))
             : {},
           humanCorrectionFrom: wasOverridden ? originalClassification : null,
-        };
-
-        writeClassificationSignal(
-          payload,
-          process.env.NEXT_PUBLIC_SUPABASE_URL!,
-          process.env.SUPABASE_SERVICE_ROLE_KEY!,
-        ).catch(() => {});
+          scope: 'tenant',
+          source: wasOverridden ? 'user_corrected' : 'sci_agent',
+          context: { sciVersion: '2.0', phase: 'E', schema: 'HF-092' },
+        }, process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).catch((err: unknown) => {
+          if (err instanceof CanonicalWriteError) {
+            console.warn(`[SCIExecute] classification:outcome CanonicalWriteError (${err.cause}): ${err.message}`);
+          } else {
+            console.warn('[SCIExecute] classification:outcome unexpected error:', err instanceof Error ? err.message : String(err));
+          }
+        });
 
         // OB-160I: Aggregate anonymized structural pattern to foundational scope (fire-and-forget)
         // Privacy: only structural fingerprint + classification + confidence cross the tenant boundary
```
