# E4.4e — Side-by-side Diff: (e) api/import/sci/analyze/route.ts

**Command:** `git diff 93d6e793^ HEAD -- <file>`

```diff
diff --git a/web/src/app/api/import/sci/analyze/route.ts b/web/src/app/api/import/sci/analyze/route.ts
index 217608db..9d59e151 100644
--- a/web/src/app/api/import/sci/analyze/route.ts
+++ b/web/src/app/api/import/sci/analyze/route.ts
@@ -16,8 +16,12 @@ import type { ClassificationTrace } from '@/lib/sci/synaptic-ingestion-state';
 import { resolveClassification } from '@/lib/sci/resolver';
 import { classifyByHCPattern } from '@/lib/sci/hc-pattern-classifier';
 import { requiresHumanReview } from '@/lib/sci/agents';
-import { computeStructuralFingerprint, lookupPriorSignals, computeClassificationDensity, writeClassificationSignal } from '@/lib/sci/classification-signal-service';
-import type { ClassificationDensity, StructuralFingerprint, ClassificationSignalPayload } from '@/lib/sci/classification-signal-service';
+// OB-199 Phase 4: writeClassificationSignal deleted; migrated to canonical writer below.
+import { computeStructuralFingerprint, lookupPriorSignals, computeClassificationDensity } from '@/lib/sci/classification-signal-service';
+import { writeSignal, CanonicalWriteError } from '@/lib/intelligence/canonical-signal-writer';
+// OB-199 Phase 4: ClassificationSignalPayload no longer constructed at call site
+// (canonical writer accepts CanonicalSignalInput directly). Type import removed.
+import type { ClassificationDensity, StructuralFingerprint } from '@/lib/sci/classification-signal-service';
 import { lookupFingerprint, writeFingerprint, type FlywheelLookupResult } from '@/lib/sci/fingerprint-flywheel';
 import { loadPromotedPatterns } from '@/lib/sci/promoted-patterns';
 import { queryTenantContext, computeEntityIdOverlap } from '@/lib/sci/tenant-context';
@@ -456,27 +460,30 @@ export async function POST(req: NextRequest) {
         const unitTrace = unit.classificationTrace as unknown as ClassificationTrace | undefined;
         const unitDecisionSource = unitTrace?.decisionSource || 'crr_bayesian';
 
-        const payload: ClassificationSignalPayload = {
+        // OB-199 Phase 4 (canonical writer migration; was writeClassificationSignal).
+        writeSignal({
           tenantId,
+          signalType: 'classification:outcome',
           sourceFileName: unit.sourceFile,
           sheetName: unit.tabName,
-          fingerprint: fp,
+          structuralFingerprint: fp as unknown as Record<string, unknown>,
           classification: unit.classification,
           confidence: unit.confidence,
           decisionSource: unitDecisionSource,
-          classificationTrace: (unit.classificationTrace as unknown as ClassificationTrace) ?? ({} as unknown as ClassificationTrace),
+          classificationTrace: ((unit.classificationTrace as unknown as Record<string, unknown>) ?? {}),
           vocabularyBindings: null,
-          agentScores: Object.fromEntries(
-            unit.allScores.map(s => [s.agent, s.confidence])
-          ),
+          agentScores: Object.fromEntries(unit.allScores.map(s => [s.agent, s.confidence])),
           humanCorrectionFrom: null,
-        };
-
-        writeClassificationSignal(
-          payload,
-          process.env.NEXT_PUBLIC_SUPABASE_URL!,
-          process.env.SUPABASE_SERVICE_ROLE_KEY!,
-        ).catch(() => {});
+          scope: 'tenant',
+          source: 'sci_agent',
+          context: { sciVersion: '2.0', phase: 'E', schema: 'HF-092' },
+        }, process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).catch((err: unknown) => {
+          if (err instanceof CanonicalWriteError) {
+            console.warn(`[SCIAnalyze] classification:outcome CanonicalWriteError (${err.cause}): ${err.message}`);
+          } else {
+            console.warn('[SCIAnalyze] classification:outcome unexpected error:', err instanceof Error ? err.message : String(err));
+          }
+        });
       }
     } catch {
       // Signal capture failure must NEVER block import
```
