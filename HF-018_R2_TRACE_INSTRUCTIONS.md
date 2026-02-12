# HF-018 Round 2: TRACE INSTRUCTIONS

## DIAGNOSTIC LOGGING ADDED

Targeted trace logging has been added for **store 7967 employees only**.

When a calculation runs, the browser console will show:

```
[HF-018 TRACE] Employee XXXXX (store 7967)
[HF-018 TRACE] componentMetrics keys: Base_Venta_Individual, Base_Clientes_Nuevos, ...
[HF-018 TRACE] Base_Clientes_Nuevos: attainment=XXX, goal=XXX, amount=XXX

[HF-018 TRACE] Clientes Nuevos: matchedSheet="Base_Clientes_Nuevos"
[HF-018 TRACE] Clientes Nuevos: sheetMetrics.goal=0, isZeroGoal=true
[HF-018 TRACE] Clientes Nuevos: sheetMetrics.attainment=XXX (BEFORE guard)
[HF-018 TRACE] Clientes Nuevos: enrichedMetrics.attainment=undefined (AFTER guard)
[HF-018 TRACE] Clientes Nuevos: resolved={}

[HF-018 TRACE] Final metrics: new_customers_attainment=undefined
```

---

## WHAT TO LOOK FOR

### Expected (Correct) Behavior:
1. `sheetMetrics.goal=0` → `isZeroGoal=true`
2. `sheetMetrics.attainment` (BEFORE guard) = any value
3. `enrichedMetrics.attainment` (AFTER guard) = `undefined`
4. `resolved={}` (empty object - no metrics)
5. `Final metrics: new_customers_attainment=undefined`

### Bug Indicators:
- If `isZeroGoal=false` when goal=0 → bug in zero-goal check
- If `resolved` has values when `enrichedMetrics.attainment=undefined` → bug in buildComponentMetrics
- If `new_customers_attainment` has a value → metric is coming from somewhere unexpected

---

## TEST STEPS

1. Open browser DevTools (F12) → Console tab
2. Clear localStorage calculation data:
   ```javascript
   Object.keys(localStorage).forEach(k => {
     if (k.includes('calculation') || k.includes('vialuce_calc')) {
       localStorage.removeItem(k);
     }
   });
   ```

3. Navigate to Admin → Launch → Calculate
4. Run calculation preview
5. Check console for `[HF-018 TRACE]` lines
6. Screenshot/copy the trace output

---

## FILES MODIFIED

| File | Lines | Change |
|------|-------|--------|
| `calculation-orchestrator.ts` | 676-693, 781-786, 817-827 | Added targeted diagnostic logging for store 7967 |

---

*This trace will reveal the ACTUAL runtime behavior for store 7967 employees.*
