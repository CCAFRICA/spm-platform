# HF-335: COMPREHENSIVE LOCALIZATION SWEEP AND REPAIR

**Date:** 2026-06-22
**Category:** HF (Hot Fix)
**Repo:** VP `CCAFRICA/spm-platform`
**Branch:** `hf-335-localization-sweep`
**Drafting SOP:** `INF_Structured_Compliant_Drafting_Reference_20260513.md` — the file IS the prompt (DD-11); repo-root-relative commands per standing convention (no fabricated absolute paths); prose matches implementation (DD-9).
**Mode:** ULTRACODE — objectives, constraints, proof-gates. CC determines execution strategy autonomously. Fan-out permitted.

---

## §0 — CC STANDING RULES HEADER

`CC_STANDING_ARCHITECTURE_RULES.md` binds throughout: Phase-0 read-before-build (Mandatory Interface Verification), Architecture Decision Gate, Anti-Pattern Registry check, commit+push after every change, kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm `localhost:3000` before the completion report, git from the repo root (`spm-platform`, NOT `web/`), final `gh pr create --base main --head hf-335-localization-sweep`. AP-25 exercised (Korean Test lens: localization must not introduce language-specific string literals into foundational code). SR-34 (no bypass — structural sweep, not instance patch). SR-41 (revert discipline). Rules 25–28 (completion-report structure). Drafting-discipline source: `INF_Structured_Compliant_Drafting_Reference_20260513.md`.

**First action:** write this directive verbatim to `docs/vp-prompts/HF-335_LOCALIZATION_SWEEP_DIRECTIVE_20260622.md` and commit (`"HF-335: directive committed"`). The file is the prompt; CC reads end-to-end and executes the phase prose. Nothing is summarized elsewhere; the directive ends at §6A.

**Channel boundary (binding):** No ground-truth reconciliation values appear in this directive. No governance expression surfaces are edited by CC. Reconciliation-channel separation is unaffected. This HF is exclusively UI/UX and AI-generation layer — no engine, no calculation, no schema changes.

---

## §1 — PROBLEM STATEMENT

Two defect classes produce English-language content on Spanish-locale tenants, contradicting the "LATAM-native, Spanish UI from day one" positioning:

**Defect Class A — UI Chrome.** User-facing strings across multiple platform surfaces render in English for Spanish-locale tenants. The platform localizes inline via `isSpanish ? '…' : '…'` ternaries (or equivalent `locale === 'es-MX'` / `locale === 'es-PE'` checks). Surfaces authored without the Spanish branch, or where the locale flag was never threaded, display English. There is no centralized detection mechanism — gaps are invisible until observed in production. AUD-001 finding F-AUD-008 identified this exact pattern (P2: locale-specific reasoning strings in code; fix: move display strings to localization resource). This HF does not build the localization resource layer (that is OB-scale, see §6A); it completes the existing inline pattern exhaustively so every user-facing string on every platform surface has a Spanish branch.

**Defect Class B — AI-Generated Content.** All AI Intelligence outputs (Assessment Panels, coaching narratives, intelligence briefs, insight summaries, anomaly explanations) render in English regardless of tenant locale. Root cause: the system prompts in `anthropic-adapter.ts` (and any downstream AI invocation surfaces) do not pass the tenant locale or instruct the model to respond in the tenant's language. This is a generation-layer defect, not a UI-ternary defect.

**Combined-treatment rationale:** Both classes produce the same user-visible symptom (English on a Spanish tenant). Sweeping both in a single HF ensures the repair is complete from the user's perspective. The two classes have distinct root causes and distinct repair patterns, so the phases separate them cleanly.

**Defect-class lineage:**
- AUD-001 F-AUD-008 (P2): locale-specific reasoning strings in code
- AUD-001 F-AUD-009 (P1): AI prompts reference "compensation and commission" throughout (domain-language surface; localization is adjacent)
- Anthropic Adapter Audit 2026-03-22: English-prompt surface cataloged
- Competitive one-pager: "LATAM-Native — Spanish UI, MXN, LFPDPPP compliance from day one"

---

## §2 — SUBSTRATE-BOUND DISCIPLINE APPLICATIONS

**IGF-T1-E910 (Korean Test / AP-25):** This HF must not introduce new language-specific string literals into foundational code. The repair pattern is completing the existing `isSpanish` branching on user-facing surfaces — not adding Spanish keywords to engine, SCI, or calculation code. Any string added must be a UI-presentation string gated by locale, never a structural identifier.

**IGF-T1-E952 (Adjacent-Arm Drift Discipline):** The sweep must be exhaustive — every component, every page, every modal, every toast, every error message, every AI prompt. Instance-level patches that leave adjacent surfaces in English are the named violation class. SR-34 binds: class closure, not instance closure.

**IGF-T1-E953 (Decision-Implementation Gap):** The stated scope is "every user-facing string." If the sweep discovers surfaces where the `isSpanish` flag is not available in the component's props/context chain, threading it through is within scope (it is implementation of the existing pattern, not new architecture).

**IGF-T1-E905 (Prove Don't Describe):** Proof gates require rendered browser screenshots or pasted terminal output, not "all strings translated" attestation.

**Decision 158 (LLM recognizes; deterministic code constructs):** Defect Class B applies this directly — the AI model generates content in the locale's language (recognition/generation); the platform code passes the locale parameter deterministically (construction).

---

## §3 — PHASE 1: DIAGNOSTIC SWEEP

**Objective:** Produce a complete inventory of every un-localized surface across both defect classes.

**Defect Class A — UI Chrome sweep:**

1. From repo root, execute a comprehensive grep across `web/src/` for all user-facing string patterns that lack locale branching. Search patterns include but are not limited to:
   - JSX text content (strings inside `>...</` that are not variable references)
   - `placeholder=`, `title=`, `aria-label=`, `alt=` attributes with English literals
   - Toast messages, error messages, confirmation dialogs
   - Button labels, tab labels, navigation items, page titles, section headers
   - Empty-state messages, loading messages, tooltip text
   - Form validation messages

2. Cross-reference against the existing `isSpanish` pattern to identify components that already thread locale and components that do not. Classify each finding:
   - **Type 1:** Component has `isSpanish` available but specific strings lack the ternary
   - **Type 2:** Component does not have `isSpanish` in its props/context chain — locale threading required before string translation
   - **Type 3:** Hardcoded English strings in shared utility/helper functions

3. Product names, technical identifiers, and brand names (`ViaLuce`, `Dashboard`, proper nouns) may remain in English — these are not defects.

**Defect Class B — AI Generation sweep:**

4. Locate every AI invocation surface — every system prompt, every user prompt template, every function that calls `getAIService()` or constructs Anthropic API requests. For each, determine whether tenant locale is:
   - Available in the calling context
   - Passed to the prompt construction
   - Used to instruct the model's response language

5. Produce the inventory as a committed markdown file: `docs/diagnostics/HF-335_LOCALIZATION_INVENTORY.md`. Format: one table per defect class, columns: file path, line range, defect type (1/2/3 for Class A; "locale not passed" / "locale not in prompt" for Class B), string/prompt excerpt.

**Commit:** `"HF-335 Phase 1: localization diagnostic sweep"` — commit+push.

---

## §4 — PHASE 2: ARCHITECTURE DECISION

**Objective:** Record the repair approach before writing implementation code.

Commit an Architecture Decision Record at the top of the inventory file from Phase 1 or as a separate section. The decision must address:

**For Defect Class A:**
- How `isSpanish` (or locale) will be threaded to Type 2 components (context, prop drilling, or existing pattern in the codebase — CC determines which is consistent with the existing architecture).
- Confirmation that the repair uses the existing inline ternary pattern (not a new i18n library — that is out of scope per §6).

**For Defect Class B:**
- How tenant locale reaches the AI prompt construction functions. Identify the data path: tenant record → locale field → route handler → AI service call → prompt builder → system/user prompt text.
- The instruction pattern to the model. The model must be told to respond in the tenant's language. The locale parameter must be injected into every AI prompt that produces user-facing content. The instruction must be structural (e.g., "Respond entirely in {locale_language}. All headings, labels, analysis, and recommendations must be in {locale_language}.") — not a per-prompt Spanish translation of the entire system prompt.

**Commit:** `"HF-335 Phase 2: architecture decision record"` — commit+push.

---

## §5 — PHASE 3: IMPLEMENTATION — DEFECT CLASS A (UI CHROME)

**Objective:** Every user-facing string on every platform surface has a Spanish-locale branch. Zero English-only user-facing strings remain after this phase.

**ULTRACODE constraints:**

- CC determines file ordering, grouping, and execution strategy autonomously.
- Every component modified must compile (`npm run build` must pass after the full phase).
- Translations must be contextually accurate — not machine-translation artifacts. CC uses its language capability to produce natural Mexican/Peruvian Spanish appropriate to a B2B enterprise platform. Formal register. No slang. Financial/business terminology must be domain-correct.
- The `isSpanish` check must derive from the tenant's locale, not from a hardcoded boolean. If the existing pattern uses `locale?.startsWith('es')` or equivalent, maintain that pattern. If the pattern is inconsistent across the codebase, normalize to the most common pattern.
- Type 2 components (locale not available): thread the locale through the existing mechanism (React context, prop chain, or hook — whichever the codebase already uses). Do not introduce a new state management pattern.
- Navigation labels, page titles, section headers, button labels, empty states, error messages, toast messages, confirmation dialogs, tooltips, form validation messages, table column headers — all in scope.
- Product feature names that are English-origin brand terms (e.g., "Dashboard," "Pipeline," "Observatory") may be kept in English if the existing codebase treats them as product vocabulary. If they are already translated elsewhere in the codebase, use the established translation.

**Commit discipline:** One commit per logical group of components (e.g., by page/feature area). Commit messages: `"HF-335 Phase 3: localize [area] UI strings"`. Commit+push after each group.

---

## §6 — PHASE 4: IMPLEMENTATION — DEFECT CLASS B (AI GENERATION)

**Objective:** Every AI-generated content surface produces output in the tenant's locale language. A Spanish-locale tenant sees Spanish intelligence briefs, Spanish coaching narratives, Spanish assessment panels, Spanish insight summaries, Spanish anomaly descriptions.

**ULTRACODE constraints:**

- Locate the tenant locale in the request context. It is available on the tenant record in Supabase (`tenants` table, `locale` field or equivalent — CC verifies the live schema per FP-49 before writing any code).
- Thread the locale to every AI prompt builder function. The locale must reach the system prompt and/or user prompt for every AI task type that produces user-facing content.
- Add a locale instruction to each relevant prompt. The instruction pattern:
  ```
  LANGUAGE REQUIREMENT: Respond entirely in {language_name} ({locale_code}). 
  All analysis, recommendations, headings, labels, and narrative content 
  must be in {language_name}. Technical terms and product names may remain 
  in English where they are industry-standard.
  ```
  CC determines the exact placement within each prompt (system prompt preferred; user prompt acceptable if system prompt is shared across task types with different locale requirements).
- Map locale codes to language names deterministically in a single utility function (e.g., `es-MX` → `Spanish`, `es-PE` → `Spanish`, `en-US` → `English`, `en-PR` → `English`). This mapping is a presentation-layer utility, not a foundational-code string list — it maps ISO locale codes to language names for prompt construction only. It must be extensible (adding a new locale = adding one line) and must not violate AP-25 (no language-specific keywords in engine/SCI/calculation code).
- AI task types that do NOT produce user-facing content (e.g., field mapping classification, sheet classification, file classification — these produce structured JSON consumed by the platform, not read by users) are **out of scope** for language instruction. Only task types whose output is rendered as natural-language text to the user are in scope.
- Verify that the AI response is consumed and rendered without any English-language wrapper/label added by the UI around it (e.g., an English "AI Assessment" heading wrapping a Spanish AI response is a Class A defect in the rendering component — fix it in this phase if discovered, or flag it for Phase 3 if already committed).

**Commit discipline:** Logical grouping by AI task type or by the prompt-builder surface modified. Commit messages: `"HF-335 Phase 4: localize [AI surface] generation"`. Commit+push after each group.

---

## §4A — HALT CONDITIONS

- **HALT-1:** If the `isSpanish` / locale pattern is fundamentally inconsistent across the codebase (more than 3 distinct mechanisms for determining locale), HALT and report the inventory of mechanisms. Architect dispositions which to normalize to.
- **HALT-2:** If the tenant locale is not available on the tenant record in Supabase (the `tenants` table has no locale/language column), HALT. Schema changes are architect-channel (SR-44 for migrations).
- **HALT-3:** If any AI system prompt is shared across task types with different user-facing/non-user-facing output characteristics, and injecting a locale instruction into the shared prompt would affect non-user-facing task types (e.g., cause field mapping to return Spanish field names instead of English structural identifiers), HALT and report. The locale instruction must be scoped to user-facing output tasks only.
- **HALT-4:** If `npm run build` fails after Phase 3 or Phase 4 with errors unrelated to this HF's changes, HALT and report. Do not fix unrelated build failures under this HF's scope (DD-7: preserve pre-HF behavior; no scope expansion).

---

## §5A — REPORTING DISCIPLINE

**Completion report:** `docs/completion-reports/HF-335_COMPLETION_REPORT.md`

**Mandatory structure per Rules 25–28:**

```
# HF-335 COMPLETION REPORT
## Date
## Execution Time

## COMMITS (in order)
| Hash | Phase | Description |

## FILES CREATED
| File | Purpose |

## FILES MODIFIED  
| File | Change |

## PROOF GATES — HARD
| # | Criterion (VERBATIM from prompt) | PASS/FAIL | Evidence |

## PROOF GATES — SOFT
| # | Criterion (VERBATIM from prompt) | PASS/FAIL | Evidence |

## STANDING RULE COMPLIANCE
- Rule 1 (commit+push each phase): PASS/FAIL
- Rule 25-28 (report discipline): PASS — this file exists
- AP-25 (Korean Test): PASS/FAIL — evidence
- SR-34 (no bypass): PASS/FAIL — evidence  

## KNOWN ISSUES

## ARTIFACT SYNC
MC: [new items if discovered]
REGISTRY: [row deltas if applicable]
R1: [criterion evidence if applicable]
BOARD: [CAPS field deltas if applicable]
SUBSTRATE: [entries exercised]
```

**Proof Gates — Hard:**

| # | Criterion | Verification method |
|---|-----------|-------------------|
| PG-1 | `npm run build` exits 0 after all phases complete | Paste build exit code |
| PG-2 | Zero English-only user-facing strings in components that render for Spanish-locale tenants | Paste grep command + output showing zero un-localized strings in the Class A inventory (all items resolved) |
| PG-3 | Every AI prompt that produces user-facing content includes locale-language instruction | Paste the locale instruction as it appears in each modified prompt |
| PG-4 | Localhost verification: navigate to a Spanish-locale tenant's dashboard, import page, plan view, and at least one AI assessment panel — paste screenshot description or console output confirming Spanish rendering | Browser verification on localhost with a Spanish-locale tenant |
| PG-5 | AP-25 compliance: zero language-specific string literals added to foundational code (engine, SCI, calculation). Grep `web/src/lib/engine/`, `web/src/lib/sci/`, `web/src/lib/calculation/` for any new Spanish/English string literals added by this HF | Paste grep command + output |
| PG-6 | Locale-to-language mapping utility is extensible (adding a locale = adding one entry) and lives in presentation layer, not foundational code | Paste the utility function location and content |

**Proof Gates — Soft:**

| # | Criterion |
|---|-----------|
| PG-S1 | Translation quality: Spanish strings use formal register appropriate to enterprise B2B SaaS |
| PG-S2 | Consistency: same concept translated the same way across all surfaces (e.g., "Payout" → same Spanish term everywhere) |
| PG-S3 | No truncation or layout breakage from longer Spanish strings |

---

## §6 — OUT OF SCOPE

- Centralized i18n/localization resource layer (keys instead of inline ternaries) — this is OB-scale architectural work. See §6A.
- New locale support beyond existing `es-MX`, `es-PE`, `en-US`, `en-PR` patterns already in the codebase.
- Translation of AI system prompts themselves into Spanish — the prompts remain in English; only the output language instruction is added.
- Engine, SCI, or calculation code changes — zero touches to foundational layers.
- Schema migrations.
- Translation of plan document content, committed_data column names, or any tenant-uploaded data.
- PDF export localization (if PDF generation exists and renders English — that is a separate surface).
- Email template localization (Resend templates — separate surface).

---

## §6A — RESIDUALS

**Known forward gaps (named explicitly):**

1. **Centralized localization layer.** The inline ternary pattern, even when complete, has no detection mechanism for future regressions. Every new component authored must remember to include the Spanish branch. A future OB should introduce a locale-keyed resource (key-based lookup) so missing translations are detectable at build time or via automated scan. AUD-001 F-AUD-008 recommended this. This HF completes the existing pattern; that OB replaces it.

2. **AI prompt language for non-user-facing tasks.** Field mapping, sheet classification, and file classification prompts remain English-instruction. If a future requirement arises for these structured-output tasks to produce bilingual reasoning strings (e.g., the `reasoning` field shown to admins), that is a separate HF scoped to those specific AI task types.

3. **Email and PDF surfaces.** Resend email templates and any PDF export generation are separate localization surfaces not swept by this HF. If discovered during the sweep, log in the completion report KNOWN ISSUES section.

4. **Right-to-left / CJK locale support.** The current locale set is Latin-script only. Future locale expansion (Arabic, Korean, Japanese) may require layout/rendering changes beyond string translation. Not in scope.

5. **`es-PE` vs `es-MX` dialect differences.** This HF treats both as "Spanish" for UI strings. If MIR (es-PE) requires Peruvian-specific terminology distinct from Mexican Spanish, that is a follow-on refinement — flag any known dialect-sensitive terms in the completion report.

---

*HF-335 — Comprehensive Localization Sweep and Repair · 2026-06-22 · vialuce.ai · Intelligence. Acceleration. Performance.*
*Drafting-discipline source: INF_Structured_Compliant_Drafting_Reference_20260513.md*
*Pairs with: CC_STANDING_ARCHITECTURE_RULES.md · AUD-001_SCI_PIPELINE_AUDIT.md (F-AUD-008, F-AUD-009)*
