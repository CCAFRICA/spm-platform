# E2.4 — Importers of `signal-reader.ts` (verbatim)

**Command:** `grep -rn "signal-reader" web/src/ --include="*.ts" --include="*.tsx"`

```
/Users/AndrewAfrica/spm-platform/web/src/lib/reconciliation/ai-column-mapper.ts:20:// OB-199 Phase 4: read surface migrated from signal-persistence.ts (deleted) to signal-reader.ts.
/Users/AndrewAfrica/spm-platform/web/src/lib/reconciliation/ai-column-mapper.ts:21:import { getTrainingSignals } from '@/lib/ai/signal-reader';
/Users/AndrewAfrica/spm-platform/web/src/lib/intelligence/classification-signal-service.ts:19:// OB-199 Phase 4: read surface migrated from signal-persistence.ts (deleted) to signal-reader.ts.
/Users/AndrewAfrica/spm-platform/web/src/lib/intelligence/classification-signal-service.ts:20:import { getTrainingSignals } from '@/lib/ai/signal-reader';
/Users/AndrewAfrica/spm-platform/web/src/lib/sci/signal-capture-service.ts:10:// OB-199 Phase 4: read surface migrated from signal-persistence.ts (deleted) to signal-reader.ts.
/Users/AndrewAfrica/spm-platform/web/src/lib/sci/signal-capture-service.ts:11:import { getTrainingSignals } from '@/lib/ai/signal-reader';
/Users/AndrewAfrica/spm-platform/web/src/lib/ai/training-signal-service.ts:13:// OB-199 Phase 4: read surface migrated from signal-persistence.ts (deleted) to signal-reader.ts.
/Users/AndrewAfrica/spm-platform/web/src/lib/ai/training-signal-service.ts:14:import { getTrainingSignals } from './signal-reader';
```

4 importers (each cited as comment + import line — 8 grep matches; 4 distinct files).
