# E6.5 — Cross-references Reader ↔ Writer Surface

**Command:** `grep -rn "convergence-service\|ai-metrics-service\|persona" web/src/ --include="*.ts" | grep -i "classification_signals\|signal_type"`

```
/Users/AndrewAfrica/spm-platform/web/src/app/api/ai/metrics/route.ts:8: * OB-86: Powered by ai-metrics-service.ts — all from classification_signals.
/Users/AndrewAfrica/spm-platform/web/src/app/api/ai/calibration/route.ts:8: * OB-86: Powered by ai-metrics-service.ts — all from classification_signals.
/Users/AndrewAfrica/spm-platform/web/src/lib/intelligence/signal-registry.ts:273:    'web/src/lib/intelligence/convergence-service.ts (observations.crossRun query — see signal_type IN list extension below)',
```

Total: 3 cross-reference matches.

CC observation: these are documentation comments + a registry declared_readers citation, not code dependencies. Architect-channel review for whether the cross-reference inventory is complete.

(The directive's E6.5 query intentionally captures only the explicit narrative cross-references, not transitive function-call dependencies. The full reader-writer dependency graph is the union of E6.1, E6.2, E6.3, E4.5 evidence files.)
