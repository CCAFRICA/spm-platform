# HF-100 COMPLETION REPORT: HC AIService Migration

## Commits
- `73db0b5` HF-100 Phase 0+1: Architecture decision — migrate HC to AIService
- `6a7bea8` HF-100 Phase 2: Migrate HC to AIService — single AI calling path

## Files Changed
| File | Changes |
|------|---------|
| web/src/lib/sci/header-comprehension.ts | -88/+60 — replaced raw fetch with AIService, removed trace logs |
| web/src/lib/ai/types.ts | +1 — added `header_comprehension` to AITaskType |
| web/src/lib/ai/providers/anthropic-adapter.ts | +30 — system prompt + user prompt case for HC |
| web/src/app/api/import/sci/analyze/route.ts | -2 — removed HC-TRACE logs |
| web/src/app/api/import/sci/analyze-document/route.ts | -1 — removed PLAN-AI-TRACE log |

## Hard Gates
| Gate | Test | Result |
|------|------|--------|
| HG-1 | Zero raw Anthropic calls in HC code | PASS (0) |
| HG-2 | HC imports and uses AIService | PASS |
| HG-3 | max_tokens >= 4096 | PASS (8192) |
| HG-4 | Zero HF-099 trace logs | PASS (0) |
| HG-5 | Build clean | PASS |
| HG-6 | header_comprehension task type registered | PASS |

## Soft Gates (require production verification by Andrew)
| Gate | Test | Result |
|------|------|--------|
| SG-1 | HC produces llmCalled=true on production | PENDING — PV-3 |
| SG-2 | Datos_Flota_Hub classified as reference | PENDING — PV-4 |
| SG-3 | Plantilla classified as entity | PENDING — PV-4 |
| SG-4 | Entities matched > 0 | PENDING — PV-6 |

## Anti-Pattern Compliance
- AP-17 (dual code paths): RESOLVED — HC now uses AIService singleton
- AP-7 (hardcoded confidence): N/A
- FP-49 (SQL schema fabrication): N/A

## Root Cause Analysis
HC made a raw `fetch()` to `https://api.anthropic.com/v1/messages` with `max_tokens: 2000`.
The Anthropic API returned valid data (status 200, 6522 chars) but the JSON was truncated
at the token limit. HC's `JSON.parse()` failed on the incomplete JSON (`Expected ',' or '}'
at position 6522`). The catch block returned `null`, and HC silently fell back to structural
heuristics only. All sheets were classified without HC Override Authority (Decision 108).

## Fix Summary
Replaced the raw fetch with `getAIService().execute()`. HC now gets:
- **8192 max_tokens** (was 2000) — 4x the previous limit
- **3-layer JSON repair** — markdown fence strip, regex object extraction, safe fallback
- **Retry with backoff** — 3 attempts with 2s/4s delays
- **Cost tracking** — token usage captured for trend analysis
- **Provider abstraction** — not hardcoded to Anthropic

## Notes
- `analyze-document/route.ts` (plan interpretation) also bypasses AIService with a raw
  fetch. This is a separate issue for a future HF — not in scope here.
