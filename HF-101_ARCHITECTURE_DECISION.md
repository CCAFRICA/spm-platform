# HF-101 Architecture Decision Record

## FAILURE 1: HC Override Not Affecting Scores

**Problem:** HC identifies reference_key@1.00 on Datos_Flota_Hub but Reference Agent only scores ~0.35. Transaction Agent scores ~0.98 from structural signals alone (has_date:+0.25, many_per_entity:+0.20, has_entity_id:+0.15, has_currency:+0.15, high_numeric_ratio:+0.15). Decision 108 says HC overrides structural detection when confident.

**Root cause:** `applyHeaderComprehensionSignals` in agents.ts only adds +0.15 to Reference when reference_key is found. This is a bonus, not an override. Transaction's structural lead is insurmountable with a +0.15 bonus.

**Fix:** When HC identifies reference_key at confidence >= 0.80:
1. Set Reference Agent confidence FLOOR to 0.80 (same mechanism as signatures)
2. Apply -0.30 penalty to Transaction Agent (HC contradicts structural temporal/event signals)
3. Suppress R2 temporal_repeat_conviction for Transaction when reference_key override active

Expected outcome: Reference ~0.80, Transaction ~0.70 after all adjustments. Reference wins.

- Scale test: YES — confidence-gated, not hardcoded
- AP check: Zero Korean Test violations — uses HC column role (structural + LLM), not field names
- Decision 108 compliance: YES — HC authority is now a floor + penalty, not a bonus

## FAILURE 2: /api/periods on Import Path

**Problem:** PeriodContext loads at AuthShell level (auth-shell.tsx:198), fetches periods before user reaches import page. isImportRoute conditional in period-context.tsx failed twice.

**Root cause:** PeriodProvider wraps ALL authenticated pages in auth-shell.tsx. The isImportRoute check inside PeriodContext has race conditions with pathname resolution.

**Options:**
- Option A: Conditional isImportRoute in PeriodContext (FAILED TWICE)
- Option B: Don't mount PeriodProvider on import route in auth-shell.tsx
- Option C: Make usePeriod() safe without PeriodProvider + conditional mount in auth-shell.tsx

**CHOSEN: Option C** — Make usePeriod() return empty defaults when PeriodProvider is absent (no throw). In auth-shell.tsx, skip PeriodProvider when pathname starts with /operate/import. Navbar gracefully shows no period info on import.

**REJECTED: Option A** — Failed twice. Pathname race conditions cause loadPeriods to fire before isImportRoute resolves.
**REJECTED: Option B** — Would crash Navbar which calls usePeriod() unconditionally.

Decision 92 compliance: Import surface has zero period API calls — PeriodProvider never mounts.

## FAILURE 3: Plan Interpretation AIService Migration

**Problem:** Raw fetch() to api.anthropic.com in analyze-document/route.ts. No retry, no cost tracking, no provider abstraction.

**Fix:** Add 'document_analysis' task type to AIService. Move the document analysis prompt to anthropic-adapter.ts. Extend PDF document block support to document_analysis. Rewrite analyze-document/route.ts to call AIService.execute().

Same pattern as HF-100 HC migration. Eliminates the LAST dual code path (AP-17).

- Scale test: YES — AIService handles all AI calls
- AP-17 check: Zero raw AI calls remain after fix
