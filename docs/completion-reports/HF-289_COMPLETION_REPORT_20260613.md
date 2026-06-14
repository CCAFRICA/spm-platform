# HF-289 — PEN Currency, Peru Timezone, es-PE Locale Support

**Date:** 2026-06-13 · **Category:** HF (Hotfix) · **Branch:** `hf-289`
**Unblocks:** MIR tenant creation (PEN/Lima/es-PE selectable at provisioning).
**Drafted to:** `INF_Structured_Compliant_Drafting_Reference_20260513.md` (DD-1…DD-12).

---

## §1 — SQL Verification Gate

Live `tenants` query (`scripts/diag/hf289-gate.ts`, service role):

```json
[
 { "name": "Meridian Logistics Group", "currency": "MXN", "locale": "es-MX" },
 { "name": "Cascade Revenue Partners", "currency": "USD", "locale": "en-US" },
 { "name": "MX Restaurant",            "currency": "MXN", "locale": "es-MX" },
 { "name": "Sabor Grupo Gastronomico", "currency": "MXN", "locale": "es-MX" }
]
```

**Confirmed:** `currency` and `locale` exist as top-level `text` columns; values are free-form
ISO codes (`MXN`/`USD`, `es-MX`/`en-US`). No schema migration required — adding a currency/locale
is a **type + data** change only. `PEN` will persist on the row exactly as `MXN` does today.

---

## §2 — Surface Enumeration (DD-2 class enumeration)

| Class | Location | Disposition |
|---|---|---|
| **TYPE-DEF** | `web/src/types/tenant.ts:25` (`Currency`), `:26` (`Locale`), `:14` (`timezone: string`, free-text) | **Edited** (§3) |
| **FORMAT-AUTH** | `formatTenantCurrency` — `web/src/types/tenant.ts:134` | **Verified + documented** (§4) — no branch added |
| **SYMBOL-MAP** | `useCurrency` `Record<Currency,string>` — `web/src/contexts/tenant-context.tsx:270` | **Edited** (data entry `PEN: 'S/'`; exhaustiveness forced by build) |
| **UI-SELECT** | `web/src/app/admin/tenants/new/page.tsx:146-183` (`COUNTRIES`/`CURRENCIES`/`LOCALES`/`TIMEZONES`) | **Edited** (§5) |
| **FORMAT-RIVAL** | `web/src/lib/currency.ts` (`CurrencyCode` union + own formatters) | **NOT touched** — Wave-3 convergence (§6A) |
| **TEMPLATE** | MXN `$`→`MX$` branch in `formatTenantCurrency` (pre-existing) | **NOT touched** — pre-existing special-case |
| **TZ-CONFIG** | `getIndustryTemplates()` — `web/src/lib/tenant/provisioning-engine` | **NOT touched** — DD-7 (no new template) |
| **I18N-LOCALE** | `web/src/lib/i18n.ts:1` (`Locale = en-US\|es-MX\|pt-BR`, translation bundles) | **NOT touched** — separate union; es-PE UI text falls back to es-MX/en-US. No compile coupling (tenant `Locale` is never assigned into the i18n `Locale`). Noted as residual. |

---

## §3 — Type Definitions (data, not branches)

`web/src/types/tenant.ts`:

```diff
-export type Currency = 'USD' | 'MXN' | 'EUR' | 'GBP' | 'CAD';
-export type Locale = 'en-US' | 'es-MX' | 'en-GB' | 'fr-FR';
+export type Currency = 'USD' | 'MXN' | 'PEN' | 'EUR' | 'GBP' | 'CAD';
+export type Locale = 'en-US' | 'es-MX' | 'es-PE' | 'en-GB' | 'fr-FR';
```

Timezone is free-text `string` (`:14`) — no type union to extend; `America/Lima` is added as
UI data in §5. **Korean Test:** every addition is data (code / locale string / IANA id). Zero
`if (currency === 'PEN')` introduced anywhere.

---

## §4 — formatTenantCurrency Handles PEN

The authority is **data-driven** (`Intl.NumberFormat(locale, {style:'currency', currency})`). Any
valid ISO-4217 code resolves natively; PEN needed **no new branch**. The lone conditional
(`currency === 'MXN'` → `MX$`) disambiguates MXN/USD `$`-collision and is skipped for PEN (its
symbol `S/` is unambiguous). A clarifying comment was added marking that branch as the lone
exception, not a per-currency pattern.

**Assertion** (`scripts/diag/hf289-format-assert.ts`, calls the real export) — **6/0**:

```
formatTenantCurrency(150000, 'PEN','es-PE') = "S/ 150,000"
formatTenantCurrency(8500.50,'PEN','es-PE') = "S/ 8,500.50"
  [PASS] symbol S/ present
  [PASS] forward slash intact (not escaped/truncated)
  [PASS] PDR-01: >=10k renders without cents
  [PASS] no $ symbol leaked
  [PASS] not the literal string PEN
  [PASS] <10k retains cents
```

**Symbol note:** ICU renders es-PE PEN as `S/ 150,000` (a locale-correct narrow space after the
symbol; MXN has none). The space is **not** stripped — doing so would be a currency-specific
post-process, the exact Korean-Test violation this HF avoids. The §6 acceptance ("symbol `S/`,
not `$`, not blank, not literal `PEN`; no cents ≥ threshold; slash intact") is met as rendered.

**PDR-01 scope:** the no-cents behavior here keys on `Number.isInteger(amount)`, not magnitude.
The §4.3 examples (whole `150000`, fractional `8500.50`) pass. The magnitude-based edge
(a *fractional* amount ≥ 10,000 → `S/ 150,000.50`) is the **OPEN PDR-01** defect — equally true
for MXN/USD today — and is owned by the Wave-3 convergence item, not this HF (§6A).

---

## §5 — Tenant Creation UI

`web/src/app/admin/tenants/new/page.tsx` — four typed data arrays, each gains one row:

```diff
 COUNTRIES   +{ code: 'PE',  name: 'Peru',          nameEs: 'Perú' }
 CURRENCIES  +{ code: 'PEN', name: 'Sol peruano (S/)' }
 LOCALES     +{ code: 'es-PE', name: 'Español (Perú)' }
 TIMEZONES   +{ value: 'America/Lima', label: 'America/Lima (GMT-5, No DST)' }
```

Dropdowns render from these arrays (`.map`), so the new options appear automatically. Peru uses
UTC-5 year-round (no DST) — label states `No DST`. DD-7: no Distribution/Wholesale template
created; the operator selects PEN/Lima/es-PE manually (the explicit path this HF unblocks).

---

## §6 — Proof Gate

- ✅ `rm -rf .next && npm run build` → **exit 0**, zero TypeScript errors. The type addition
  *forced* the `tenant-context.tsx` symbol-map fix (build failed until `PEN: 'S/'` was added) —
  evidence the `Currency` union is exhaustively honored, not bypassed.
- ✅ `formatTenantCurrency` assertion 6/0 (above) — symbol, slash, PDR-01 ≥10k, cents <10k.
- ✅ No-new-`$` guard: `git diff` added-lines grep for money `$`/`MX$` → **none** (only `S/` added).
- ✅ No `if (currency === 'PEN')` / `case 'PEN'` branch anywhere (data-only).

**Architect browser checklist (manual):** create "MIR Test" tenant (PEN / America/Lima / es-PE) →
confirm `tenants.currency = 'PEN'` row → confirm a ≥ S/10,000 figure renders `S/ …` without cents →
delete the test tenant. (These require an authenticated `/admin/tenants/new` session.)

---

## §6A — Residuals (named, out of scope)

- **Currency convergence (Wave-3):** `src/lib/currency.ts` rival + ~13 `$`-template sites + ~175
  raw formatting sites remain. This HF only extends the canonical authority; the CI guard banning
  raw money formatting retires the rivals.
- **PDR-01 (magnitude rule):** still OPEN — `Number.isInteger` ≠ magnitude. Broken identically for
  MXN/USD/PEN; convergence fixes all at once. Not re-verified here.
- **JMD / KYD** (Archipielago Telecom): not added — same data-only pattern when needed.
- **i18n translation locale:** `es-PE` not added to `src/lib/i18n.ts` (would need a bundle); es-PE
  tenants get es-MX/en-US UI strings via existing fallback. Currency/date formatting is correct.
- **Distribution industry template** (PEN/Lima defaults): deferred (DD-7).

---

*HF-289 · vialuce.ai · Intelligence. Acceleration. Performance.*
