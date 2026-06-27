# OB-247 R2 — CDA Portal Completion: capability fix · trust band · Vialuce brand — Completion Report

**Branch:** `ob-247-cda-portal` (extends PR #606; based on the OB-245 membrane). **Supersedes HF-346** (its 403 fix is Phase 1 here).
**Mode:** ULTRACODE. Finishes DS-032 §6 — a focused, confidence-instilling, branded landing.
**Date:** 2026-06-27

---

## CRF + PCD

**CRF**
- [x] Seed: OB-247 R2 / Cite CLT247 + DS-032 §6 + live prism capability gate + production mark + theme tokens / Class: OB revision / Mode: ULTRACODE.
- [x] Architecture Decision Gate cleared.
- [x] Anti-Pattern Registry: **no new/parallel auth path** (capability swap on the existing gate); **no hardcoded/fictional trust data** (org from the tenant record, account from the session, posture copy true to the membrane); **no bespoke logo/font** (reuse the production diamond mark + the loaded Inter weights); **no dark-first fork** (semantic tokens, theme-portable). Capabilities structural (Korean Test).
- [x] CC paste block: none.

**PCD**
- [x] All three phases shipped — scope not narrowed.
- [x] Trust content sources from **real data** (tenant record + session + true posture). No literals.
- [x] Brand **reuses** the production mark + font tokens. No new mark, no new font.
- [x] Updates PR #606; **architect merges**.

---

## 1. The three phases

### Phase 1 — the capability fix (the 403)
The membrane upload routes gated on `data.import` (operator-only); the CDA holds `data.upload` → `POST /api/prism/prepare` (and `commit`, `scan`) returned **403**. Fix: the three routes now gate on **`data.upload`** — the canonical membrane-delivery capability — and `data.upload` is granted additively to **platform + admin** (so the operator Submit surface does not regress). `data.import` stays for the full import wizard (`WORKSPACE_CAPABILITIES` `/operate`,`/data`; the `/data/submit` page). **No new auth path.** OB-246 (now merged) changed only a `WORKSPACE_CAPABILITIES` line, not the capability sets → granting operators `data.upload` is collision-free (**no HALT-D**).

### Phase 2 — the trust band (all owner/tenant-sourced)
- **Organization** — "Delivering to **{currentTenant.name}**" + "stays private to your organization", from the CDA's real tenant record (`useTenant()` — `TenantProvider` is mounted above `AuthShell`, so the chromeless portal keeps tenant context). Loading-guarded with a skeleton — never a literal org.
- **Account** — the signed-in account (initials + `user.email`) in the header, from the session.
- **Security** — a quiet band: *encrypted in transit and at rest · isolated to your organization · scanned before it reaches the platform* — each true to the actual posture (Supabase TLS + AES-at-rest; the `file_objects`/storage RLS tenant isolation; the OB-245 quarantine + scan).

### Phase 3 — the Vialuce brand
- The bare "Vialuce" text is replaced by the **production diamond mark** (the exact `VialuceSidebar.tsx:131-135` geometry) extracted to a shared `components/brand/VialuceMark.tsx` — reuse, not a third duplication, not a bespoke logo. Theme-portable colors (`var(--vialuce-indigo, var(--color-indigo, #2D2F8F))` …) resolve under Vialuce / Bliss / light / dark.
- The wordmark uses `font-semibold` (600) — the portal already inherits the production body font (Inter under Vialuce/Bliss); 600 is within Inter's loaded set (`@import …wght@400;500;600`), honoring the HF-342 weight-set rule (not faux-bold 700).

### Files
- `app/api/prism/{prepare,commit,scan/[id]}/route.ts` (gate → `data.upload`), `lib/auth/permissions.ts` (grant platform+admin `data.upload`).
- `app/portal/{layout,page}.tsx` (trust band + brand), `components/brand/VialuceMark.tsx` (new).
- `lib/auth/__tests__/ob247-cda.test.ts` (+Phase 1 assertion).

---

## 2. Proof gates

### Verified now
**Gate 1 (capability fix, no new mechanism):** routes diff `data.import`→`data.upload`; `permissions.ts` grants platform+admin `data.upload`. **Unit test (6/6 pass)** asserts the canonical cap is held by **both** operator and CDA, and `data.import` stays operator-only:
```
✔ R2 Phase 1: the membrane delivery capability (data.upload) is held by BOTH operator and CDA
ℹ pass 6  ℹ fail 0
```
**tsc 0 · build exit 0 · `/portal` builds.**

**Live-data confirmation** (the 403-fix chain is mechanically complete): the seeded CDA in the live DB —
```
{"email":"cda.demo@vialuce.test","role":"cda","capabilities":["data.upload","view.own_uploads"],"tenants":{"name":"Almacenes Mirasol"}}
```
`role='cda'` → `hasCapability('cda','data.upload')=true` (the routes' role-based PDP) → `prepare`/`commit` pass the gate (no 403). The tenant name **Almacenes Mirasol** is the real value the trust band renders (gate 4).

### Architect-gated (HALT-A — infra is live per CLT247)
- **Gate 2 (CDA 403→200):** a CDA `prepare`/`commit` now passes the capability gate → file reaches quarantine + scanning. Browser-verified (the session already authorizes per CLT247; the migrations are applied).
- **Gate 3 (operator not regressed):** operator Submit still 200 (platform/admin hold `data.upload`).
- **Gate 4 (trust real):** the portal renders the CDA's actual tenant name (e.g. **Almacenes Mirasol**, not a literal) + account + security band; a different tenant's CDA shows a different org.
- **Gate 5 (brand):** the production diamond mark renders; computed font matches production; light/dark both correct.

---

## 2.5 Adversarial review + fixes

A 2-dimension review (capability safety + trust/brand). **Invariants confirmed HOLD:** the CDA passes the gate (403 fixed); **every `data.import` holder also holds `data.upload`** → no operator regression; `data.import` intact for the wizard; no over-exposure (only an extra UI entry to the same RLS-scoped membrane). Trust: real org (`currentTenant.name`) + account (`user.email`), loading-guarded, no literal; security copy true to the posture (ClamAV fail-closed scan, RLS isolation, Supabase TLS/AES); brand **byte-identical** to the production `VialuceSidebar` diamond + theme-portable; font uses 600 (loaded), not faux-bold 700. Fixes:

| Sev | Finding | Fix |
|---|---|---|
| LOW (SOC2 CC6) | `/api/prism/files` was RLS-only (no capability gate) — no leak, but single-layer | Added a `data.upload` gate (defense in depth; RLS still scopes rows). |
| LOW | Initials took first-two-letters (`"Andrew Africa"→"AN"`) + surrogate-split risk | First letter of the first two name tokens via `Array.from` (surrogate-safe), else email. |
| LOW | Org eyebrow could pulse forever if the tenant load errors | Terminal state: org → show · loading → skeleton · error → omit the line (never a fake org). |
| INFO | Stale doc-comment ("via session + data.import") | Corrected to `data.upload`. |
| INFO (pre-existing) | AuthShell shows a dark full-screen spinner during `tenantLoading` (a flash before the light portal) | Not OB-247 — noted for a later theme pass. |

Re-verified: `tsc` 0; tests 6/6; `npm run build` exit 0.

## 3. SR-39 compliance

| Standard | Mechanism |
|---|---|
| SOC 2 CC6 | Membrane gated on `data.upload` (operator + CDA); owner-scoped `file_objects` RLS unchanged; `data.import` retained for the wizard. |
| OWASP | No new auth path; capability swap on the existing PDP; no client-trusted authorization. |
| DS-014 | Structural capability `data.upload` = membrane delivery; capability-derived portal + nav. |
| Decision 123 | Trust is real (tenant record + session + true posture), not asserted; brand reuses production assets. |

---

## 4. HALT status
- **HALT-A (browser verification):** ACTIVE — architect confirms upload works (403 gone, spine advances), the portal shows the right org + account + security band, and the Vialuce mark + font render (light/dark).
- **HALT-B (PR merge):** ACTIVE — CC updates PR #606; architect merges (order coordinated with OB-245 #605; OB-246 #604 already merged).
- **HALT-D (OB-246 collision):** NOT triggered — additive grant; clean.

## 5. Residuals (§6A)
- **Canonical capability:** `data.upload` = membrane delivery (operator + CDA); `data.import` = full wizard. **OB-246 must carry `data.upload` for operators in its model** — flag at merge.
- The scanner clears a file only with a reachable clamd; otherwise it holds at `scanning` (fail-closed, expected — the infrastructure brief).
- DS-032 §6 is refined by the trust band + brand — fold back into DS-032 on lock.
- Slice B/C (the dynamic confidence panels + learning loop) remain out of scope — this is the static trust band.
