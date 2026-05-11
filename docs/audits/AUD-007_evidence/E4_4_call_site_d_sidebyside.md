# E4.4d — Side-by-side Diff: (d) api/import/sci/process-job/route.ts

**Command:** `git diff 93d6e793^ HEAD -- <file>`

```diff
diff --git a/web/src/app/api/import/sci/process-job/route.ts b/web/src/app/api/import/sci/process-job/route.ts
index 62ffab31..b120ffc6 100644
--- a/web/src/app/api/import/sci/process-job/route.ts
+++ b/web/src/app/api/import/sci/process-job/route.ts
@@ -20,9 +20,10 @@ import { enhanceWithHeaderComprehension } from '@/lib/sci/header-comprehension';
 import { createIngestionState, buildProposalFromState } from '@/lib/sci/synaptic-ingestion-state';
 import { resolveClassification } from '@/lib/sci/resolver';
 import { classifyByHCPattern } from '@/lib/sci/hc-pattern-classifier';
-import { computeStructuralFingerprint, lookupPriorSignals, writeClassificationSignal } from '@/lib/sci/classification-signal-service';
-import type { ClassificationSignalPayload } from '@/lib/sci/classification-signal-service';
-import type { ClassificationTrace } from '@/lib/sci/synaptic-ingestion-state';
+// OB-199 Phase 4: writeClassificationSignal deleted; migrated to canonical writer below.
+import { computeStructuralFingerprint, lookupPriorSignals } from '@/lib/sci/classification-signal-service';
+import { writeSignal, CanonicalWriteError } from '@/lib/intelligence/canonical-signal-writer';
+// OB-199 Phase 4: ClassificationTrace was only used in the deleted writeClassificationSignal payload.
 import { loadPromotedPatterns } from '@/lib/sci/promoted-patterns';
 import { queryTenantContext, computeEntityIdOverlap } from '@/lib/sci/tenant-context';
 import { lookupFingerprint, writeFingerprint, type FlywheelLookupResult } from '@/lib/sci/fingerprint-flywheel';
@@ -338,24 +339,30 @@ export async function POST(req: NextRequest) {
       const fp = computeStructuralFingerprint(
         Array.from(profileMap.values()).find(p => p.tabName === unit.tabName) || Array.from(profileMap.values())[0]
       );
-      const payload: ClassificationSignalPayload = {
+      // OB-199 Phase 4 (canonical writer migration; was writeClassificationSignal).
+      writeSignal({
         tenantId,
+        signalType: 'classification:outcome',
         sourceFileName: fileName,
         sheetName: unit.tabName,
-        fingerprint: fp,
+        structuralFingerprint: fp as unknown as Record<string, unknown>,
         classification: unit.classification,
         confidence: unit.confidence,
         decisionSource: sheetTier(unit.tabName) === 1 ? 'fingerprint_tier1' : 'crr_bayesian',
-        classificationTrace: (unit.classificationTrace as unknown as ClassificationTrace) ?? ({} as unknown as ClassificationTrace),
+        classificationTrace: ((unit.classificationTrace as unknown as Record<string, unknown>) ?? {}),
         vocabularyBindings: null,
         agentScores: Object.fromEntries(unit.allScores.map(s => [s.agent, s.confidence])),
         humanCorrectionFrom: null,
-      };
-      writeClassificationSignal(
-        payload,
-        process.env.NEXT_PUBLIC_SUPABASE_URL!,
-        process.env.SUPABASE_SERVICE_ROLE_KEY!,
-      ).catch(() => {});
+        scope: 'tenant',
+        source: 'sci_agent',
+        context: { sciVersion: '2.0', phase: 'E', schema: 'HF-092' },
+      }, process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).catch((err: unknown) => {
+        if (err instanceof CanonicalWriteError) {
+          console.warn(`[SCIProcessJob] classification:outcome CanonicalWriteError (${err.cause}): ${err.message}`);
+        } else {
+          console.warn('[SCIProcessJob] classification:outcome unexpected error:', err instanceof Error ? err.message : String(err));
+        }
+      });
     }
 
     return NextResponse.json({
```
