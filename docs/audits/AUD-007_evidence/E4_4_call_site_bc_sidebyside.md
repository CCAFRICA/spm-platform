# E4.4bc — Side-by-side Diff: (b+c) api/intelligence/converge/route.ts (both call sites)

**Command:** `git diff 93d6e793^ HEAD -- <file>`

```diff
diff --git a/web/src/app/api/intelligence/converge/route.ts b/web/src/app/api/intelligence/converge/route.ts
index 2df6273b..65479bf7 100644
--- a/web/src/app/api/intelligence/converge/route.ts
+++ b/web/src/app/api/intelligence/converge/route.ts
@@ -13,8 +13,9 @@
 import { NextRequest, NextResponse } from 'next/server';
 import { createServiceRoleClient } from '@/lib/supabase/server';
 import { convergeBindings } from '@/lib/intelligence/convergence-service';
-import { writeClassificationSignal } from '@/lib/sci/classification-signal-service';
-import type { ClassificationTrace } from '@/lib/sci/synaptic-ingestion-state';
+// OB-199 Phase 4: canonical writer migration; writeClassificationSignal deleted.
+import { writeSignal, CanonicalWriteError } from '@/lib/intelligence/canonical-signal-writer';
+// OB-199 Phase 4: ClassificationTrace was only used in the deleted writeClassificationSignal payload.
 import type { Json } from '@/lib/supabase/database.types';
 
 export async function POST(request: NextRequest) {
@@ -89,54 +90,58 @@ export async function POST(request: NextRequest) {
         });
       }
 
-      // OB-160G: Write Level 3 convergence signals via Phase E service (HF-092 dedicated columns)
+      // OB-160G + OB-199 Phase 4: Write Level 3 convergence signals via canonical writer.
       for (const signal of result.signals) {
-        try {
-          writeClassificationSignal(
-            {
-              tenantId,
-              sourceFileName: 'convergence',
-              sheetName: signal.domain,
-              fingerprint: { columnCount: 0, numericFieldRatioBucket: '0-25', categoricalFieldRatioBucket: '0-25', identifierRepeatBucket: '0-1', hasTemporalColumns: false, hasIdentifier: false, hasStructuralName: false, rowCountBucket: 'small' },
-              classification: 'convergence_match',
-              confidence: signal.confidence,
-              decisionSource: 'convergence',
-              classificationTrace: {} as ClassificationTrace,
-              vocabularyBindings: null,
-              agentScores: { convergence: signal.confidence },
-              humanCorrectionFrom: null,
-            },
-            process.env.NEXT_PUBLIC_SUPABASE_URL!,
-            process.env.SUPABASE_SERVICE_ROLE_KEY!,
-          ).catch(() => {});
-        } catch {
-          // Signal failure must not block convergence
-        }
+        writeSignal({
+          tenantId,
+          signalType: 'classification:outcome',
+          sourceFileName: 'convergence',
+          sheetName: signal.domain,
+          structuralFingerprint: { columnCount: 0, numericFieldRatioBucket: '0-25', categoricalFieldRatioBucket: '0-25', identifierRepeatBucket: '0-1', hasTemporalColumns: false, hasIdentifier: false, hasStructuralName: false, rowCountBucket: 'small' } as Record<string, unknown>,
+          classification: 'convergence_match',
+          confidence: signal.confidence,
+          decisionSource: 'convergence',
+          classificationTrace: {} as Record<string, unknown>,
+          vocabularyBindings: null,
+          agentScores: { convergence: signal.confidence },
+          humanCorrectionFrom: null,
+          scope: 'tenant',
+          source: 'sci_agent',
+          context: { sciVersion: '2.0', phase: 'E', schema: 'HF-092' },
+        }, process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).catch((err: unknown) => {
+          if (err instanceof CanonicalWriteError) {
+            console.warn(`[ConvergeAPI] convergence_match CanonicalWriteError (${err.cause}): ${err.message}`);
+          } else {
+            console.warn('[ConvergeAPI] convergence_match unexpected error:', err instanceof Error ? err.message : String(err));
+          }
+        });
       }
 
       // Write gap signals
       for (const gap of result.gaps) {
-        try {
-          writeClassificationSignal(
-            {
-              tenantId,
-              sourceFileName: 'convergence',
-              sheetName: gap.component,
-              fingerprint: { columnCount: 0, numericFieldRatioBucket: '0-25', categoricalFieldRatioBucket: '0-25', identifierRepeatBucket: '0-1', hasTemporalColumns: false, hasIdentifier: false, hasStructuralName: false, rowCountBucket: 'small' },
-              classification: 'convergence_gap',
-              confidence: 0,
-              decisionSource: 'convergence',
-              classificationTrace: {} as ClassificationTrace,
-              vocabularyBindings: null,
-              agentScores: { convergence: 0 },
-              humanCorrectionFrom: null,
-            },
-            process.env.NEXT_PUBLIC_SUPABASE_URL!,
-            process.env.SUPABASE_SERVICE_ROLE_KEY!,
-          ).catch(() => {});
-        } catch {
-          // Signal failure must not block convergence
-        }
+        writeSignal({
+          tenantId,
+          signalType: 'classification:outcome',
+          sourceFileName: 'convergence',
+          sheetName: gap.component,
+          structuralFingerprint: { columnCount: 0, numericFieldRatioBucket: '0-25', categoricalFieldRatioBucket: '0-25', identifierRepeatBucket: '0-1', hasTemporalColumns: false, hasIdentifier: false, hasStructuralName: false, rowCountBucket: 'small' } as Record<string, unknown>,
+          classification: 'convergence_gap',
+          confidence: 0,
+          decisionSource: 'convergence',
+          classificationTrace: {} as Record<string, unknown>,
+          vocabularyBindings: null,
+          agentScores: { convergence: 0 },
+          humanCorrectionFrom: null,
+          scope: 'tenant',
+          source: 'sci_agent',
+          context: { sciVersion: '2.0', phase: 'E', schema: 'HF-092' },
+        }, process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).catch((err: unknown) => {
+          if (err instanceof CanonicalWriteError) {
+            console.warn(`[ConvergeAPI] convergence_gap CanonicalWriteError (${err.cause}): ${err.message}`);
+          } else {
+            console.warn('[ConvergeAPI] convergence_gap unexpected error:', err instanceof Error ? err.message : String(err));
+          }
+        });
       }
     }
 
```
