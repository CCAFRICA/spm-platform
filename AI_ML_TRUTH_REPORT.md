# AI/ML Reality Audit — OB-65 Mission 5

## Truth Table

| Capability | Status | Evidence |
|---|---|---|
| Plan Interpretation | **WORKING** | End-to-end: PDF/image → Claude API → structured plan JSON. Only real AI feature. |
| Training Signal Capture | **Theater** | Signals captured in-memory buffer but `getTrainingSignals()` returns empty — never persisted to DB |
| Signal Persistence | **Partial** | Manual `/api/ai/training-signals` endpoint exists, but no automated pipeline calls it |
| Closed-Loop Learning | **Not Implemented** | `boostConfidence()` exists but is never called by any code path |
| Usage Metering | **Partially Working** | Only 2 of many AI endpoints write to `usage_metering`; fixed `metadata` → `dimensions` in OB-65 |
| Observatory AI Tab | **Works (empty)** | Queries correct tables, returns zeros when no data exists |
| AI Anomaly Detection | **Heuristic Fallback** | AI method exists but heuristic (static threshold) is what actually runs |
| AI Recommendations | **Hardcoded** | AI method exists but hardcoded heuristic rules are used |
| Field Classification | **Working** | Claude API classifies CSV columns, second-pass refinement works |
| FIELD_ID_MAPPINGS | **Scattered** | No centralized dictionary; field names embedded in prompts and constants |

## Summary

- **1 truly working AI feature**: Plan interpretation (PDF → structured plan)
- **1 working classification**: Field classification (CSV column mapping)
- **Everything else**: Infrastructure exists but is disconnected, uses heuristic fallbacks, or captures data that goes nowhere

## Recommendation

Do NOT claim AI/ML capabilities beyond plan interpretation and field classification until the training signal pipeline is connected end-to-end.
