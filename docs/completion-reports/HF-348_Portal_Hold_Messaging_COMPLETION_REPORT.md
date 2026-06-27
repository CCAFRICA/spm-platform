# HF-348 — CDA Portal: descriptive hold messaging + prominent organization identity — Completion Report

**Branch:** `ob-247-cda-portal` (extends PR #606).
**Mode:** ULTRACODE. Binds DS-032 §6 · DS-031 (verdict) · Decision 123 (honest copy) · P-01 (Thermostat) · Proximity.
**Date:** 2026-06-27

---

## CRF + PCD
- [x] Seed: HF-348 / Cite OB-247 R2 verdict states + DS-032 §6 + Decision 123 / Class: HF / Mode: ULTRACODE.
- [x] Architecture Decision Gate cleared.
- [x] Anti-Pattern Registry: **honest copy** (the two verdicts read differently, sourced from the recorded `scan_verdict` — not the filename, Korean Test); no new auth path; org name **real-data-sourced** (no literal); theme-portable (amber/red with `dark:` + `SEMANTIC` by name).
- [x] CC paste block: none.
- [x] PCD: CC distinguishes the two verdicts + elevates the org; **does not** build the held-file review *workflow* (§6A dependency named).

---

## 1. The problem
The portal framed a **scanner error** (`verdict = error` — our side, temporary) identically to an **infected file** (`verdict = infected` — the file, rejected): both showed the same red "we couldn't accept this file", mis-blaming good files. And the org name was a small eyebrow.

## 2. The fix

### Verdict-aware hold (honest, sourced from the recorded verdict)
The membrane records `error` vs `infected` on `file_objects.scan_verdict` (returned by `/api/prism/files`). A new `holdKind(verdict)` (`prism-status.ts`) drives one branch — **not the filename**:
- **`error` → "Under review"** (amber/`warning`, calm): *"We're taking a closer look — a Vialuce data expert will review this and follow up with you. Your file is encrypted and safely kept; there's nothing you need to do right now."* No file blame, no action asked.
- **`infected` → "Not accepted"** (red/`danger`, action): *"This file looks like it contains a security threat, so we couldn't accept it. Please check the file on your device and upload a clean copy."* — with a **proximate** `Upload a clean copy` affordance (`onReupload` → smooth-scroll to the upload hero) and a `Contact support` mailto.

The split runs through `stateSummary` (chip + message), `spineNodes` (the held node lights amber vs red), `ringFor`/`QualityRing` (amber vs red), and `StatusSpine`'s `HeldDetail` (verdict + audience aware — operators get the concise technical version with the verdict + engine). Clean/promoted/scanning are unchanged.

### Prominent organization identity
`{currentTenant.name}` is now a **primary `<h1>`** ("`Almacenes Mirasol`") with a "Your secure delivery space" subhead — the first thing read. "Deliver your data" is demoted to the action line beneath. Real-data-sourced, loading-guarded (skeleton while loading, **omitted** on error — never a fake org).

### Files
`components/prism/prism-status.ts` (holdKind + heldSummary + warning tone/status + verdict params), `StatusSpine.tsx` (HeldDetail), `QualityRing.tsx` (verdict), `SubmitDropzone.tsx` (onReupload passthrough), `app/portal/page.tsx` (org heading + re-upload scroll). Test: `__tests__/hf348-hold-messaging.test.ts`.

## 3. Proof

### Verified now — `node --test src/components/prism/__tests__/hf348-hold-messaging.test.ts` (5/5)
```
✔ HF-348: holdKind distinguishes error (our side) from infected (the file)
✔ HF-348: scan ERROR → "Under review" (calm/warning), NEVER framed as a rejection
✔ HF-348: INFECTED → "Not accepted" (danger) with a proximate action
✔ HF-348: operator gets the same two distinct verdict labels (honest for everyone)
✔ HF-348: non-held states unchanged (clean/promoted still "Cleared"/"Promoted")
```
The error message asserts `doesNotMatch(/couldn't accept|threat|reject|not accepted/)` — it can never read as a rejection. **Full suite 308/308 · tsc 0 · build exit 0.**

### Architect-gated (HALT-A — browser; the CDA is live, tenant = Almacenes Mirasol)
- An `error`-held file renders "Under review" + the expert/reassurance copy (amber, not a rejection).
- An `infected`-held file (EICAR) renders "Not accepted" + the proximate `Upload a clean copy` + `Contact support`.
- The org name renders prominently at heading level (real tenant), loading-guarded.
- Light/dark both correct (amber/red `dark:` variants + `SEMANTIC` by name).

## 3.5 Adversarial review + fixes
A focused review **confirmed** the core: the split is sourced from the recorded `scan_verdict` (never the filename — Korean Test), the error copy carries no file blame (the test asserts `doesNotMatch /couldn't accept|threat|reject/`), `/api/prism/files` returns `scan_verdict` so the branch can fire, the infected action (`Upload a clean copy` → scroll + `Contact support`) reaches **both** the deliveries list and the dropzone's recent list, and the org is a real, loading-guarded `<h1>`. Findings fixed:

| Sev | Finding | Fix |
|---|---|---|
| MED | The amber held node never illuminated — `SpineDot`'s `lit` omitted `'warning'` (ring + block were amber, the spine wasn't) | Added `'warning'` to `lit`. |
| MED | `text-amber-600` on the white card ≈ 3.3:1 (below WCAG AA) | `toneTextClass('warning')` → `text-amber-700` (≈4.8:1). |
| LOW | `holdKind` defaulted unknown → `infected` (a false rejection) | Flipped: **only a known `'infected'` → "Not accepted"**; error/unknown/raced → "Under review" — honoring the "never falsely reject" invariant (the byte is held regardless, so the message is UX-only). |
| LOW | Dead, misleading `CUSTOMER_MESSAGE.infected_held = "We couldn't accept this file"` (unreachable but a latent honesty landmine) | Removed; `CUSTOMER_MESSAGE` is now `Partial` (held is verdict-aware only). |
| NIT | `mailto` uses `support@compensationcloud.io` while copy says "Vialuce" | Domain matches the app's existing contact; architect confirms the address. |

Re-verified: tsc 0; HF-348 5/5; build exit 0.

## 4. HALT status
- **HALT-A (browser):** ACTIVE — the four renders above + theme.
- **HALT-B (PR merge):** ACTIVE — co-lands in PR #606; architect merges.

## 5. Residuals (§6A)
- **Dependency the copy creates:** "a Vialuce data expert will review and follow up" requires held files to **surface to a reviewer** (operator/VL-Admin visibility + a triage path). **Fast-follow** — without it the promise is unbacked. Tracked as an open item.
- `Contact support` uses `mailto:support@compensationcloud.io` (the domain the app already uses for contact, `upgrade/page.tsx`) — architect confirms the address.
- DS-032 §6 refined by verdict-aware messaging + prominent identity — fold back on lock.
- Note: a stray dev server was running on this worktree during the build (shared `.next`); it self-heals on recompile.
