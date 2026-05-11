# E4.6 / E4.7 / E4.8 / E4.9 — SCI Marker Greps (verbatim)

## E4.6 — `sciVersion` references

**Command:** `grep -rn "sciVersion\|sci_version" web/src/ --include="*.ts"`

```
/Users/AndrewAfrica/spm-platform/web/src/app/api/intelligence/converge/route.ts:110:          context: { sciVersion: '2.0', phase: 'E', schema: 'HF-092' },
/Users/AndrewAfrica/spm-platform/web/src/app/api/intelligence/converge/route.ts:137:          context: { sciVersion: '2.0', phase: 'E', schema: 'HF-092' },
/Users/AndrewAfrica/spm-platform/web/src/app/api/import/sci/execute/route.ts:394:          context: { sciVersion: '2.0', phase: 'E', schema: 'HF-092' },
/Users/AndrewAfrica/spm-platform/web/src/app/api/import/sci/analyze/route.ts:479:          context: { sciVersion: '2.0', phase: 'E', schema: 'HF-092' },
/Users/AndrewAfrica/spm-platform/web/src/app/api/import/sci/process-job/route.ts:358:          context: { sciVersion: '2.0', phase: 'E', schema: 'HF-092' },
/Users/AndrewAfrica/spm-platform/web/src/lib/sci/signal-capture-service.ts:61:      context: { sciVersion: '1.0', capturedAt: new Date().toISOString() },
/Users/AndrewAfrica/spm-platform/web/src/lib/sci/signal-capture-service.ts:98:        context: { sciVersion: '1.0', capturedAt: new Date().toISOString() } as Record<string, unknown>,
```

Total: 7 matches. 5 at sciVersion '2.0' (Phase E classification:outcome via canonical writer); 2 at sciVersion '1.0' (signal-capture-service.ts pre-OB-199 SCI capture path).

## E4.7 — `phase: 'E'` references

**Command:** `grep -rn "phase: 'E'" web/src/ --include="*.ts"`

```
/Users/AndrewAfrica/spm-platform/web/src/app/api/intelligence/converge/route.ts:110:          context: { sciVersion: '2.0', phase: 'E', schema: 'HF-092' },
/Users/AndrewAfrica/spm-platform/web/src/app/api/intelligence/converge/route.ts:137:          context: { sciVersion: '2.0', phase: 'E', schema: 'HF-092' },
/Users/AndrewAfrica/spm-platform/web/src/app/api/import/sci/execute/route.ts:394:          context: { sciVersion: '2.0', phase: 'E', schema: 'HF-092' },
/Users/AndrewAfrica/spm-platform/web/src/app/api/import/sci/analyze/route.ts:479:          context: { sciVersion: '2.0', phase: 'E', schema: 'HF-092' },
/Users/AndrewAfrica/spm-platform/web/src/app/api/import/sci/process-job/route.ts:358:          context: { sciVersion: '2.0', phase: 'E', schema: 'HF-092' },
```

Total: 5 matches. All 5 are SCI canonical-writer call sites (E4 (a) execute + (b)+(c) converge + (d) process-job + (e) analyze).

## E4.8 — `schema: 'HF-092'` references

**Command:** `grep -rn "schema: 'HF-092'" web/src/ --include="*.ts"`

```
/Users/AndrewAfrica/spm-platform/web/src/app/api/intelligence/converge/route.ts:110:          context: { sciVersion: '2.0', phase: 'E', schema: 'HF-092' },
/Users/AndrewAfrica/spm-platform/web/src/app/api/intelligence/converge/route.ts:137:          context: { sciVersion: '2.0', phase: 'E', schema: 'HF-092' },
/Users/AndrewAfrica/spm-platform/web/src/app/api/import/sci/execute/route.ts:394:          context: { sciVersion: '2.0', phase: 'E', schema: 'HF-092' },
/Users/AndrewAfrica/spm-platform/web/src/app/api/import/sci/analyze/route.ts:479:          context: { sciVersion: '2.0', phase: 'E', schema: 'HF-092' },
/Users/AndrewAfrica/spm-platform/web/src/app/api/import/sci/process-job/route.ts:358:          context: { sciVersion: '2.0', phase: 'E', schema: 'HF-092' },
```

Total: 5 matches. Identical set as E4.7.

## E4.9 — `[SCI Signal]` log marker + SCI source vocabulary

**Command:** `grep -rn "\[SCI Signal\]\|sci_agent\|user_corrected" web/src/ --include="*.ts"`

```
/Users/AndrewAfrica/spm-platform/web/src/app/api/reconciliation/compare/route.ts:177:      source: userOverrides.length > 0 ? 'user_corrected' : 'ai_prediction',
/Users/AndrewAfrica/spm-platform/web/src/app/api/intelligence/converge/route.ts:109:          source: 'sci_agent',
/Users/AndrewAfrica/spm-platform/web/src/app/api/intelligence/converge/route.ts:136:          source: 'sci_agent',
/Users/AndrewAfrica/spm-platform/web/src/app/api/ingest/classification/route.ts:57:        source: wasCorrected ? 'user_corrected' : 'user_confirmed',
/Users/AndrewAfrica/spm-platform/web/src/app/api/import/sci/execute/route.ts:393:          source: wasOverridden ? 'user_corrected' : 'sci_agent',
/Users/AndrewAfrica/spm-platform/web/src/app/api/import/sci/analyze/route.ts:478:          source: 'sci_agent',
/Users/AndrewAfrica/spm-platform/web/src/app/api/import/sci/process-job/route.ts:357:        source: 'sci_agent',
/Users/AndrewAfrica/spm-platform/web/src/lib/intelligence/ai-metrics-service.ts:122: * - 'user_corrected' → user changed AI suggestion
/Users/AndrewAfrica/spm-platform/web/src/lib/intelligence/ai-metrics-service.ts:126: * - confidence >= 0.99 with user_corrected → corrected
/Users/AndrewAfrica/spm-platform/web/src/lib/intelligence/ai-metrics-service.ts:131:  if (src === 'user_corrected') return 'corrected';
/Users/AndrewAfrica/spm-platform/web/src/lib/intelligence/classification-signal-service.ts:14: * - user_corrected: 0.99 (user provided explicit correction)
/Users/AndrewAfrica/spm-platform/web/src/lib/intelligence/classification-signal-service.ts:27:export type SignalSource = 'ai' | 'user_confirmed' | 'user_corrected';
/Users/AndrewAfrica/spm-platform/web/src/lib/intelligence/classification-signal-service.ts:181:    source: 'user_corrected',
/Users/AndrewAfrica/spm-platform/web/src/lib/intelligence/classification-signal-service.ts:245:    // Priority: user_corrected > user_confirmed > ai (by confidence, then recency)
/Users/AndrewAfrica/spm-platform/web/src/lib/intelligence/classification-signal-service.ts:249:        user_corrected: 3,
/Users/AndrewAfrica/spm-platform/web/src/lib/sci/synaptic-ingestion-state.ts:235:        const boost = bestPrior.source === 'human_override' || bestPrior.source === 'user_corrected'
/Users/AndrewAfrica/spm-platform/web/src/lib/sci/signal-capture-service.ts:311:      return 'sci_agent';
/Users/AndrewAfrica/spm-platform/web/src/lib/sci/signal-capture-service.ts:314:      return (signal as { wasOverridden?: boolean }).wasOverridden ? 'user_corrected' : 'user_confirmed';
/Users/AndrewAfrica/spm-platform/web/src/lib/sci/sci-types.ts:132:  confirmationSource: 'llm_initial' | 'user_confirmed' | 'user_corrected' | 'classification_success';
/Users/AndrewAfrica/spm-platform/web/src/lib/sci/classification-signal-service.ts:132:      console.error('[SCI Signal] Prior lookup failed:', error?.message);
/Users/AndrewAfrica/spm-platform/web/src/lib/sci/classification-signal-service.ts:163:    console.error('[SCI Signal] Prior lookup exception:', err);
/Users/AndrewAfrica/spm-platform/web/src/lib/sci/classification-signal-service.ts:543:    console.error('[SCI Signal] Vocabulary recall exception:', err);
/Users/AndrewAfrica/spm-platform/web/src/lib/ai/signal-reader.ts:26:  source?: string;             // 'ai_prediction' | 'user_confirmed' | 'user_corrected' | 'ai'
/Users/AndrewAfrica/spm-platform/web/src/lib/ai/training-signal-service.ts:111:      source: action === 'corrected' ? 'user_corrected' : action === 'accepted' ? 'user_confirmed' : 'ai_prediction',
/Users/AndrewAfrica/spm-platform/web/src/lib/data/persona-queries.ts:711:      ... source === 'user_corrected' ...
/Users/AndrewAfrica/spm-platform/web/src/lib/data/persona-queries.ts:717:          else if (src === 'user_corrected') { act++; }
```

Total: 24+ matches. `[SCI Signal]` log marker appears 3× in `web/src/lib/sci/classification-signal-service.ts` (lines 132, 163, 543 — all in read-side functions: prior-lookup + vocabulary recall, NOT write-side). Source vocabulary `sci_agent` appears 6× (5 SCI canonical-writer call sites + 1 in `signal-capture-service.ts:getSource`). `user_corrected` appears widely across the codebase as a signal-source enum value.
