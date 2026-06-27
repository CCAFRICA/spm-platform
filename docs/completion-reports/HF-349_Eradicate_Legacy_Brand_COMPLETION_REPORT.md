# HF-349 — Eradicate the legacy `compensationcloud` identity — Completion Report

**Branch:** co-landed on `ob-247-cda-portal` (#606) — CC's call (stated below).
**Mode:** ULTRACODE — audit → purge → prove zero. Binds Decision 123 (on-brand copy) · the Vialuce brand arc · SR-2 (fix the class).
**Date:** 2026-06-27

---

## CRF + PCD
- [x] Seed: HF-349 / Cite grep of the legacy brand across source + git origin (`a3f22336`, `ab08a45e`) / Class: HF / Mode: ULTRACODE.
- [x] Architecture Decision Gate cleared.
- [x] Anti-Pattern Registry: **eradicated the class, not the two known instances** (SR-2) — swept all forms (`compensationcloud.io`, `compensationcloud`, `CompensationCloud`, `compensation cloud`) case-insensitive across source; **no new identity invented** (used the architect-confirmed Vialuce addresses).
- [x] CC paste block: none.
- [x] PCD: **audited first** (full list below), then purged, then proved zero.

**Branch decision (CC's call):** co-landed directly on `ob-247-cda-portal` (#606) rather than a separate branch. One occurrence (`StatusSpine.tsx`) is #606's own content (the HF-348 mailto); the other (`upgrade/page.tsx`) is a `main` file #606 already carries; and the legacy identity must **not** ship in #606's "Contact support". Co-landing keeps it inside the already-validated #606 (no extra PR, no merge-order coordination), satisfying "precedes the #606 merge."

---

## 1. Proof gate 1 — the audit (§3.1, full pre-change list)

```
docs/completion-reports/HF-348_Portal_Hold_Messaging_COMPLETION_REPORT.md:63:| NIT | `mailto` uses `support@compensationcloud.io` ...
docs/completion-reports/HF-348_Portal_Hold_Messaging_COMPLETION_REPORT.md:73:- `Contact support` uses `mailto:support@compensationcloud.io` ...
web/src/app/upgrade/page.tsx:372:            href="mailto:sales@compensationcloud.io"
web/src/components/prism/StatusSpine.tsx:198:          href={`mailto:support@compensationcloud.io?subject=${encodeURIComponent(
```
**Four occurrences, all the `.io` email domain** — two customer-visible **code** strings + two **historical doc** references. **No** `CompensationCloud` brand-name form, no "compensation cloud" prose, no titles/footers/config — so **no HALT-A** (nothing ambiguous, nothing without a clear Vialuce equivalent). The rebrand was complete except this one residual email domain.

## 2. Proof gate 2 — the purge (the replacements)

| File:line | Before | After |
|---|---|---|
| `web/src/app/upgrade/page.tsx:372` | `mailto:sales@compensationcloud.io` | `mailto:sales@vialuce.ai` |
| `web/src/components/prism/StatusSpine.tsx:198` | `mailto:support@compensationcloud.io?subject=…` | `mailto:support@vialuce.ai?subject=…` (subject + behavior unchanged, §2.5) |
| `HF-348_…REPORT.md:63,73` (historical notes) | referenced the legacy domain | updated to `support@vialuce.ai` (architect-confirmed) |

Addresses used: the **architect-confirmed** `support@vialuce.ai` / `sales@vialuce.ai` — no invented identity.

## 3. Proof gate 3 — zero in source

Re-running the §3.1 grep on source (after the purge, before this report existed):
```
ZERO matches in source ✓
```
The new addresses confirmed landed: `StatusSpine.tsx:198 → support@vialuce.ai`, `upgrade/page.tsx:372 → sales@vialuce.ai`.

*(The only place the legacy string now appears in the tree is this report's §1 audit evidence — the record of the eradication itself, which is expected and correct.)*

## 4. Proof gate 4 — zero in the rebuild

`rm -rf .next && npm run build` (exit 0), then grep the rebuilt artifacts:
```
.next matches: 0
```
And the replacement propagated into the bundle — `support@vialuce.ai` / `sales@vialuce.ai` present in `.next/server/app/upgrade/page.js` and the StatusSpine chunk (`.next/server/chunks/224.js`).

## 5. Proof gate 5 — no regression
`tsc --noEmit` **0** · `npm run build` **exit 0** · full suite **308/308**. The support `mailto` keeps its `?subject=…` (it still opens a pre-filled email about the not-accepted file); only the address changed.

---

## 6. HALT status
- **HALT-A (ambiguous occurrence):** NOT triggered — every occurrence was the email domain with a clear Vialuce replacement.
- **HALT-B (browser verification):** ACTIVE — architect confirms the portal's "Contact support" and the upgrade page's "Contact Sales" now show `vialuce.ai`.
- **HALT-C (merge):** ACTIVE — co-landed in #606; architect merges.

## 7. Residuals (§6A)
- **Origin (for the record):** `a3f22336` (OB-62/63) introduced the legacy identity; `ab08a45e` (HF-348) propagated it into the portal's support link. Now eradicated.
- **Rebrand completeness:** the sweep found the legacy identity ONLY in the email domain (no stray titles/footers/metadata) — the Vialuce rebrand was otherwise complete.
- Lands inside #606 — re-validate #606 mergeability is unaffected (2 string changes + a doc note; no conflict surface with `main`).
