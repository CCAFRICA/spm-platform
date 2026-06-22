# HF-335 — Localization Diagnostic Sweep (Phase 1 inventory)

**Date:** 2026-06-22 · **Branch:** `hf-335-localization-sweep` · **Directive:** `docs/vp-prompts/HF-335_LOCALIZATION_SWEEP_DIRECTIVE_20260622.md`
**Outcome:** **HALT-1 triggered** (>3 distinct locale-determination mechanisms — see §0). Phase 1 complete; Phase 2 (ADR) and Phase 3/4 (implementation) await architect disposition of the normalization target. Evidence is pasted/cited, not attested (IGF-T1-E905).

---

## §0 — HALT-1: locale-mechanism inventory (architect dispositions normalization target)

The directive's repair approach ("complete the existing inline `isSpanish` ternary pattern") is mechanically aligned with the codebase — inline ternaries ARE the dominant mechanism. **But Spanish DETECTION is inconsistent across more than three distinct mechanisms**, which is the named HALT-1 condition. The architect must pick the normalization target before Phase 3, because the choice changes every one of ~1,847 edit sites.

| # | Mechanism | Where | Count | es-PE result |
|---|---|---|---|---|
| 1 | `useLocale().locale === 'es-MX'` (exact) | dominant | ~80 files | **English** (exact miss) |
| 2 | `locale === 'es'` / `lang === 'es'` (2-letter) | `InsightPanel.tsx`, `design-system/AssessmentPanel.tsx`, `api/ai/assessment/route.ts:69` | ~3 files | **English** |
| 3 | admin-coerced ternary `isVLAdmin(user) ? false : locale==='es-MX'` | several dashboards | ~9 files | **English** |
| 4 | `useAdminLocale()` hook — collapses any non-`es-MX`/`en-US` locale to `en-US`, then `isSpanish = locale==='es-MX'` | `hooks/useAdminLocale.ts:48-52` | hook | **forced English** |
| 5 | `useLocale().t('key')` keyed lookup (centralized i18n) | `login`, `configuration/terminology`, `sci/ExecutionProgress` | **8 call sites / 3 files** | en fallback (no es-PE catalog) |
| 6 | `currentTenant?.locale === 'es-MX'` (tenant-context locale) | 1 file | 1 | English |
| (adj) | `useTerm`/`useTerminology` (tenant business vocabulary — distinct concern, not locale text) | tenant-context | 4 files | n/a |

**Disposition needed (the architect's call):**
- **(A) Normalize Spanish detection** to a single shared predicate that catches es-PE — e.g. a presentation-layer util `isSpanishLocale(locale) => locale?.startsWith('es')` (catches `es-MX`, `es-PE`) — and route mechanisms 1–4 + 6 through it. Recommended; it is the single highest-leverage fix (an es-PE tenant currently gets English *everywhere*).
- **(B) Keyed-layer decision.** The centralized `t()`+JSON layer (directive §6/§6A assume it does NOT exist) **already exists** (`lib/i18n.ts` + `locales/{en-US,es-MX,pt-BR}/{common,compensation}.json`, ~259 keys) but is vestigial (8 usages). The directive deliberately chose inline completion now / keyed migration later (§6A #1). Confirm that still holds given the layer is already partly built — Phase 3 sprawls ~1,847 inline ternaries that the future OB would then unwind.

Until disposed, Phase 3 cannot pick its edit form. The rest of this inventory is mechanism-agnostic.

---

## §1 — Premise corrections (directive vs. live code)

1. **Centralized i18n layer EXISTS** (directive §1/§6 imply it doesn't). `lib/i18n.ts` (`Locale = 'en-US'|'es-MX'|'pt-BR'`, `t()`, `getTranslation`, `formatLocalized*`) + `contexts/locale-context.tsx` + JSON catalogs. Vestigial in practice (8 `t()` text sites vs 1,847 inline ternaries; pt-BR catalogs effectively unreachable via the inline path).
2. **Class B is NOT all-English** (directive §1 Class B premise). Locale is already threaded end-to-end for **`dashboard_assessment`** and **`narration`** (binary en/es). The defect is the *remaining* user-facing tasks, not "all AI output."
3. **Adapter path:** `web/src/lib/ai/providers/anthropic-adapter.ts` (directive said `web/src/lib/ai/anthropic-adapter.ts`).
4. **Two divergent `Locale` types:** `i18n.ts` (`en-US|es-MX|pt-BR`) vs `types/tenant.ts:26` (`en-US|es-MX|es-PE|en-GB|fr-FR`). `es-PE` is a creatable tenant locale (`admin/tenants/new/page.tsx:167`) with no translation catalog and no detection coverage → English UI.
5. **HALT-2 does NOT fire:** `tenants.locale TEXT NOT NULL DEFAULT 'en'` (`001_core_tables.sql:30`); `profiles.locale TEXT` (`:47`, the value `useLocale` actually reads). Tenant locale IS available.
6. **HALT-3 does NOT fire:** no shared system prompt — `SYSTEM_PROMPTS` is a per-task `Record` (`anthropic-adapter.ts:112`, selected `:997`); `buildUserPrompt` is a per-task `switch` (`:1252`). Per-task locale injection is safe; a shared-layer injection WOULD corrupt structured tasks (documented warning, §3).

---

## §2 — Defect Class A (UI Chrome) — representative inventory

Type 1 = file has locale but this string lacks the branch; Type 2 = file has no locale access; Type 3 = hardcoded English in shared util.

| File | Line(s) | Type | Excerpt |
|---|---|---|---|
| app/operate/calculate/page.tsx | 472,483,496 | 2 | `"Calculate"` (h1), `placeholder="Select period"` |
| app/operate/results/page.tsx | 399,441,834,842 | 2 | `"Access Denied"`, `"Results Dashboard"`, `placeholder="Search entity..."`, `"All Stores"` |
| app/operate/import/quarantine/page.tsx | 101-118 | 2 | toasts `"File committed"`, `"File rejected"`, `"Failed to override/reject"` |
| app/configure/users/invite/page.tsx | 179,204 | 2 | `placeholder="Full name"`, `"No entity link"` |
| app/insights/my-team/page.tsx | 204,472,477 | 2 | `"My Team"`, `title="Franchise Ranking by Sales"` |
| app/insights/trends/page.tsx | 114,120,121 | 2 | `"Entity trajectory"`, headers `"Entity"/"Direction"/"Velocity"` |
| app/financial/leakage/page.tsx | 143,182,316 | 2 | `"Leakage Monitor"`, `"No Financial Data"`, `"Leakage by Category"` |
| app/financial/patterns/page.tsx | 135,165,171,197 | 2 | `"Operational Patterns"`, `"No Data"`, `"All Locations"` |
| components/platform/* (Onboarding/Observatory/BillingUsage/ModelConfig/Users/FeatureFlags/Ingestion/AIIntelligence/Infrastructure Tab) | many | 2 | entire Observatory admin suite is English (e.g. OnboardingTab.tsx:219-232 `"Tenant Onboarding Pipeline"`, `"Total Tenants"`) |
| components/sci/ImportProgress.tsx | 111 | 2 | `"Processing Files"` (sibling ExecutionProgress uses `t()`) |
| components/import/import-history.tsx | 106-109 | 2 | headers `"File"/"Source"/"Imported"/"Rows"` |
| app/configure/periods/page.tsx | 289,293,326,397,424,436 | 1 | toasts hardcoded EN despite 64 ternaries + `isSpanish` at :148 |
| components/drill-through/ComponentCards.tsx | 110,130-131 | 1 | headers + buttons `"Source data"/"Dispute"` (formatDate used, text not branched) |
| components/drill-through/DisputeInline.tsx | 107,136 | 1 | `placeholder="Describe what looks wrong…"` |
| app/financial/staff/page.tsx | 348,355,367,396 | 1 | `"Staff Rankings"/"All Locations"/"All Roles"/"Location"` despite 18 ternaries |
| app/acceleration/page.tsx | 293,298,302 | 1 | toasts `"Alert marked as read"`, `"Coaching tip completed!"` |
| components/sci/SCIProposal.tsx | 188 | 1 | `title="Atom recognition provenance"` |
| lib/sci/import-failure.ts | — | (clean) | NOT Type 3 — returns i18n KEY PATHS resolved via `t()` downstream |

**Pattern of the leak:** (a) whole Type-2 surfaces with no `useLocale` at all (Observatory admin suite, several operate/financial/insights pages), and (b) Type-1 *toasts/placeholders/titles/table-headers* skipped inside otherwise-branched files. Hardcoded English toasts recur in: `configure/periods`, `acceleration`, `operate/import/quarantine`, `admin/audit:97,130`, `configuration/terminology:61,75`, `performance/approvals:63`, `performance/approvals/payouts:62,79`. No Type-3 shared-util sprawl found. No English `window.confirm` dialogs found.

---

## §3 — Defect Class B (AI Generation) — task inventory

| AI task type | Output | Locale today | System / user prompt | Action |
|---|---|---|---|---|
| `dashboard_assessment` | user prose | **threaded (en/es)** | `anthropic-adapter.ts:879 / :1570`; origin `ai-service.ts:637` | model to copy; extend to pt-BR |
| `narration` | user prose | **threaded (en/es)** | `narration-service.ts:99` → echoed `:1580` | model to copy; extend to pt-BR |
| `recommendation` (my-compensation narrative) | user prose | **NOT threaded** | sys `:849` / user `:1541`; call `my-compensation/page.tsx:199-235` (locale AVAILABLE at call site) | thread locale → add language clause |
| `reconciliation_diagnosis` (agent) | user prose | **NOT threaded** (no locale field in chain) | `reconciliation-diagnosis-agent.ts:14`; route `reconcile-diagnose/route.ts:138-146`; `agent-runner.ts:132` | thread locale through route→agent def→runner |
| `natural_language_query` | user prose (`answer`) | NOT threaded | sys `:860` / user `:1557` | thread locale (lower traffic) |
| `anomaly_detection` | JSON + prose `explanation` | NOT threaded | sys `:827` / user `:1531` | inject language for the `explanation` field only |
| `file_classification`,`sheet_classification`,`field_mapping`,`field_mapping_second_pass`,`plan_interpretation`,`plan_skeleton`,`plan_component`,`plan_component_with_chunking`,`plan_chunk`,`workbook_analysis`,`import_field_mapping`,`header_comprehension`,`convergence_mapping`,`document_analysis`,`entity_extraction` | **structured JSON** | n/a | per-task | **OUT OF SCOPE** — language instruction would corrupt enum/key output |

**Locale→language utility (Class B / §6 requirement):** none exists; to be added as a single presentation-layer map (`es-MX|es-PE→Spanish`, `en-US|en-GB|en-PR→English`, `pt-BR→Portuguese`), extensible one-line-per-locale, NOT in engine/SCI/calculation (AP-25). Existing prompts only branch binary en/es (`:1570`, `narration-service.ts:99`) so **pt-BR AI output currently collapses to Spanish** — the util fixes that too.

---

## §4 — Scope sizing (for Phase 3/4 planning)
- Class A: **101 files** already branched (Type-1 gap-fill) + an estimated comparable set of **Type-2 files with zero locale access** (Observatory admin suite + ~10 operate/financial/insights pages catalogued). ~1,847 existing ternary sites set the order of magnitude for new branches. This is **OB-scale effort** even at HF urgency — fan-out warranted.
- Class B: **4–6 user-facing task surfaces** to thread (2 already done as the template) + 1 locale→language util. Small, well-bounded.

---

## ARTIFACT SYNC
```
ARTIFACT SYNC
MC:        HF-335 → Phase 1 complete; HALT-1 (locale-mechanism inconsistency) — awaiting architect normalization disposition.
REGISTRY:  Localization: centralized t()+JSON layer EXISTS but vestigial (8 sites); inline isSpanish ternary dominant
           (101 files / ~1,847 sites); Spanish detection exact-es-MX → es-PE tenants render English everywhere.
R1:        Spanish-locale tenant UI completeness → BLOCKED (Class A Type-1/2 leaks + es-PE detection gap + Class B
           recommendation/recon-diagnosis untranslated). Unblocks after Phase 3/4 on the disposed normalization.
BOARD:     CAPS — HF-335 status: Phase 1 / HALT-1.
SUBSTRATE: AP-25 lens held (no engine/SCI string literals proposed); SR-34 class-sweep scoped (not instance);
           Decision 158 (LLM generates language / code passes locale) applies to Class B; HALT-2/HALT-3 cleared.
```
