# HF-289: PEN Currency, Peru Timezone, and es-PE Locale Support

**Date:** 2026-06-13
**Category:** HF (Hotfix)
**Scope:** Add PEN (Sol peruano) to the Currency type, `America/Lima` to timezone options, `es-PE` to locale options, and ensure the canonical formatting authority handles PEN. Does NOT scope the full currency convergence (9 rivals, 13 $-templates, CI guard) — that is a separate Wave-3 item.
**Blocks:** MIR tenant creation. Without PEN in the Currency type, the tenant creation dropdown cannot select Peruvian soles. Without `America/Lima`, the tenant gets the wrong time context for period boundaries and t-1 data.
**Drafting reference:** `INF_Structured_Compliant_Drafting_Reference_20260513.md`

---

## §0 — READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all standing rules apply.
2. `PERSISTENT_DEFECT_REGISTRY.md` — PDR-01 (currency no cents on large amounts) is in scope. The same formatting rule that applies to MXN applies to PEN: amounts >= S/10,000 render as whole numbers.
3. `INF_Structured_Compliant_Drafting_Reference_20260513.md` — this directive drafted against DD-1 through DD-12.

**Locked decisions carried:**
- `formatTenantCurrency` is the single canonical formatting authority (Capability Profile §D2, Demo Schedule Wave-3).
- PDR-01 formatting rule: no cents on amounts >= 10,000 in any currency. Symbol-agnostic — the rule is about magnitude, not currency.
- Korean Test: currency and timezone configuration must work for any locale. Adding PEN/Lima must not introduce language-specific or country-specific string literals outside the configuration data. The configuration is data; the code is general.

---

## §1 — SQL Verification Gate

Before writing any code, CC queries the live schema to verify the `tenants` table structure and current currency/timezone values:

```bash
npx tsx -e "
const { createClient } = require('@supabase/supabase-js');
const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await c.from('tenants').select('id, currency, locale, settings').limit(5);
console.log('Sample tenants:', JSON.stringify(data, null, 2));
"
```

Confirm: `currency` column exists and is type `text`. Record the output in the completion report.

---

## §2 — Enumerate All Surfaces

Before any edit, CC greps the codebase to enumerate every file that participates in currency, timezone, or locale definition, selection, or formatting. This is the DD-2 class-enumeration requirement.

```bash
cd /path/to/spm-platform

echo "=== CURRENCY TYPE ==="
grep -rn "type Currency\|Currency =" web/src/types/ --include='*.ts' --include='*.tsx'

echo "=== LOCALE TYPE ==="
grep -rn "type Locale\|Locale =" web/src/types/ --include='*.ts' --include='*.tsx'

echo "=== TIMEZONE ==="
grep -rn "timezone\|timeZone\|America/" web/src/types/ --include='*.ts' --include='*.tsx' | head -20
grep -rn "timezone\|timeZone" web/src/components/ --include='*.ts' --include='*.tsx' | grep -i "select\|dropdown\|option\|picker" | head -20

echo "=== CURRENCY UI ==="
grep -rn "currency" web/src/components/ --include='*.ts' --include='*.tsx' | grep -i "select\|dropdown\|option\|picker" | head -20

echo "=== FORMAT AUTHORITY ==="
grep -rn "formatTenantCurrency\|formatCurrency\|currencyFormat" web/src/ --include='*.ts' --include='*.tsx' | head -30

echo "=== CURRENCY SYMBOLS ==="
grep -rn "'MXN'\|'USD'\|MX\\$\|US\\$" web/src/types/ --include='*.ts' | head -20
```

Record the output. Classify each result:

- **TYPE-DEF:** Where the Currency / Locale / Timezone type unions are defined
- **UI-SELECT:** Where options are rendered in dropdowns/selectors
- **FORMAT-AUTH:** The canonical `formatTenantCurrency` function
- **FORMAT-RIVAL:** Any other function that formats currency (do NOT modify — out of scope, noted in §6A)
- **TEMPLATE:** Hardcoded `$` or `MX$` symbols (do NOT modify — out of scope, noted in §6A)
- **TZ-CONFIG:** Timezone configuration or defaults in industry templates

Paste the classified list in the completion report.

---

## §3 — Add PEN, es-PE, and America/Lima to Type Definitions

In the TYPE-DEF file(s) identified in §2 (expected: `web/src/types/tenant.ts`):

**3.1 — Currency type.** Add `'PEN'` to the `Currency` type union.

**Before** (expected shape):
```typescript
export type Currency = 'USD' | 'MXN' | ... ;
```

**After:**
```typescript
export type Currency = 'USD' | 'MXN' | 'PEN' | ... ;
```

**3.2 — Locale type.** Add `'es-PE'` to the `Locale` type union if not already present.

**3.3 — Currency metadata.** If the Currency type has a display-name mapping, locale mapping, or symbol mapping (object, array, or map that drives the dropdown), add the PEN entry:

```typescript
{
  code: 'PEN',
  name: 'Sol peruano',
  symbol: 'S/',
  locale: 'es-PE',
}
```

**3.4 — Timezone.** If timezone options are enumerated as a type union or array, add `'America/Lima'`. Peru uses UTC-5 year-round with no daylight saving time. If timezone options are free-text (not enumerated), no type change is needed — but verify the tenant creation UI allows entering or selecting `America/Lima` in §5.

**Korean Test compliance:** Every addition is data (code, name, symbol, locale string, timezone IANA identifier), not a conditional branch. No `if (currency === 'PEN')` introduced anywhere. The formatter and the UI read the data; they do not switch on currency or timezone codes.

Commit: `HF-289: Add PEN, es-PE, America/Lima to type definitions`

---

## §4 — Ensure formatTenantCurrency Handles PEN

Open the FORMAT-AUTH file identified in §2.

**4.1 — Verify data-driven design.** If `formatTenantCurrency` reads currency configuration from data (a map of code to symbol/locale), the PEN entry added in §3 may be sufficient. Verify by reading the function body and confirming PEN resolves through the existing path without a new branch.

**4.2 — If the function has hardcoded branches** (`if currency === 'MXN'` / `switch(currency)`), add the PEN case. The symbol is `S/`, the locale is `es-PE`, the decimal separator is `.`, the thousands separator is `,`.

**4.3 — Verify PDR-01 compliance for PEN.** The no-cents rule must apply to PEN the same way it applies to MXN and USD:
- `formatTenantCurrency(150000, 'PEN')` produces `S/150,000` — not `S/150,000.00`.
- `formatTenantCurrency(8500.50, 'PEN')` produces `S/8,500.50` — below threshold, cents retained.

**4.4 — Verify the symbol renders correctly.** PEN's symbol is `S/` (with the forward slash). This is a two-character symbol containing a character that could be interpreted as a path separator. Confirm the formatter does not truncate, escape, or split the slash.

Commit: `HF-289: formatTenantCurrency handles PEN with S/ symbol and PDR-01 compliance`

---

## §5 — Tenant Creation UI

Open the UI-SELECT files identified in §2. The tenant creation form has currency, country, locale, and timezone fields.

**5.1 — Currency dropdown.** If data-driven (renders from the Currency type or a currency list), PEN should appear automatically from §3. If hardcoded option list, add:
```
PEN — Sol peruano (S/)
```

**5.2 — Country/locale.** If a country selector exists and Peru is absent, add it. If locale options exist and `es-PE` is absent, add it.

**5.3 — Timezone.** If a timezone selector exists:
- If it renders from a static list, add `America/Lima` with display label `Lima (UTC-5, sin horario de verano)` or equivalent.
- If it renders from a library (e.g., a timezone package), verify `America/Lima` is included.
- If no timezone selector exists (timezone is set from the industry template default), verify the `Other` template or manual override path allows `America/Lima`.

**5.4 — Industry template.** Check whether a `Distribution` or `Wholesale` industry template exists. If it does, its `defaultCurrency` and `defaultTimezone` could be set to PEN and America/Lima. If only `Other` exists, do not create a new template in this HF (scope constraint per DD-7). The user selects PEN and Lima manually at tenant creation.

Commit: `HF-289: PEN, es-PE, America/Lima available in tenant creation`

---

## §6 — Proof Gate

Build and verify:

```bash
rm -rf .next && npm run build && npm run dev
```

**Browser verification (architect executes):**

- [ ] Navigate to tenant creation. PEN appears in the currency dropdown.
- [ ] `America/Lima` is selectable as timezone (or enterable if free-text).
- [ ] `es-PE` is selectable as locale (or the locale auto-derives from country selection).
- [ ] Create a test tenant named "MIR Test" with currency PEN, timezone America/Lima, locale es-PE. Tenant row in Supabase shows `currency: 'PEN'`.
- [ ] Navigate to any page that displays currency for this tenant. Symbol renders as `S/` — not `$`, not blank, not the literal string `PEN`.
- [ ] A formatted amount >= S/10,000 renders without cents (PDR-01). Example: `S/150,000` not `S/150,000.00`.
- [ ] A formatted amount < S/10,000 retains cents where meaningful. Example: `S/8,500.50`.
- [ ] The forward slash in `S/` is not escaped, truncated, or rendered as an HTML entity.
- [ ] TypeScript build completes with zero errors.
- [ ] No new `$` or `MX$` hardcoded literals introduced by this HF: `grep -rn 'MX\$\|\$' web/src/ --include='*.ts' --include='*.tsx' | diff` against pre-HF baseline shows no new hits.
- [ ] Delete the test tenant after verification.

---

## §6A — Residuals (out of scope, named)

- **Currency convergence (Wave-3):** 9 rival formatting functions, 13 `$`-template sites, ~175 raw formatting sites. These remain. This HF adds PEN to the canonical authority; it does not retire the rivals. The Demo Schedule's Wave-3 "Currency single-authority convergence" item scopes the full retirement with a CI guard banning raw money formatting.
- **PDR-01 MXN verification:** This HF does not re-verify PDR-01 for MXN. PDR-01 remains OPEN on the persistent defect registry. If PDR-01 is currently broken for MXN, it will be equally broken for PEN — the convergence item fixes both.
- **Additional currencies:** JMD, KYD (Archipielago Telecom) are not added in this HF. Same pattern applies when needed.
- **Distribution industry template:** A template with PEN/Lima defaults could be created for Peruvian distribution companies. Deferred — not needed to unblock MIR, and DD-7 prohibits behavior expansion within a fix HF.

---

*HF-289 · PEN Currency, Peru Timezone, es-PE Locale Support · 2026-06-13*
*vialuce.ai · Intelligence. Acceleration. Performance.*
*Drafted to INF_Structured_Compliant_Drafting_Reference_20260513.md*
