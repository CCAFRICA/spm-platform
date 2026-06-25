# HF-334 — Shell Render-Readiness: Recoverable Boundary + Render-Phase Read Subtraction

**Date:** 2026-06-22
**Repo:** VP (`CCAFRICA/spm-platform`)
**Branch:** `hf-334-shell-render-readiness` (off `main`; `main` is PR-protected — do not push to `main`, do not merge)
**Root-cause source:** DIAG-076 HALT-1 analysis (`docs/diagnostics/DIAG-076_EMPTY_TENANT_IMPORT_CRASH_REPORT_20260622.md`)
**CLT source:** CLT-227 (architect browser-verification session)
**Class:** First-mount client render throw in the authenticated **shell** (provider/chrome subtree the root layout renders **above** the page boundary), surfaced by `global-error.tsx`. DIAG-076 §6A residual — distinct from the (already-satisfied) import-route-divergence class.
**Mode:** ULTRACODE — objectives + constraints + proof-gates; CC determines per-component strategy. **Two phases separated by a mandatory architect capture gate (SR-44).**
**Completion report path:** `docs/completion-reports/HF-334_COMPLETION_REPORT.md` (HF reports → `docs/completion-reports/` — **NOT** `docs/diagnostics/`, **NOT** project root)

> **Dispatch note (architect-channel — the only non-CC line):** Number assigned by architect under CRF, 2026-06-22: **HF-334**. **Phase 2 is gated on an architect-run browser capture (SR-44) that Phase 1 makes possible** — see §3.2. Everything from §0 onward is the prompt; the file is the prompt and is pasted to CC verbatim.

---

## §0 — CC Standing Rules header

Binds to **`CC_STANDING_ARCHITECTURE_RULES.md`** (live repo copy — read it; do not rely on a cached/older copy). Spine of this work item:

- **Decision 158 (LOCKED)** — every fix is a **subtraction**. The instance fix **removes** a render-phase side effect; it adds no per-site guard. The class fix adds **one** structural boundary (a safety *layer*, not an enumerated guard) and otherwise subtracts the throwing reads.
- **SR-34 / AP-D2 (class not instance)** — the render-phase-read defect is closed at the **class** layer: **all** shell providers/chrome are swept, not only the one DIAG-076 flagged. Instance closure masquerading as class closure is the exact thing DIAG-076 caught HF-330 doing at the *layer* level — do not re-commit it one level down.
- **FP-69 / FP-72** — HF-330 fixed the **page** subtree and missed the **shell**; this HF targets the shell layer the page boundary structurally cannot reach. Do not repeat the layer error.
- **AP-9 / AP-10 (prove, don't describe; no false confirmation)** — the Phase-1 boundary **logs** the throw; the architect's capture replaces DIAG-076's *unproven* candidate with the **confirmed** line. **No subtraction ships against a guessed throw.**
- **SR-43 (ship = merge + production verification + report with SHA)** and **SR-44 (browser verification, PR merges = architect-only)** — CC opens the PR; **the architect merges and runs both browser verifications.** Closure is the architect's, on the throw **ELIMINATED** (not merely caught).
- **SR-41 (revert discipline)** — contamination on a pushed commit = `git revert <SHA>`, never force-push.
- **Korean Test / AI-First** — no language- or field-name literals introduced anywhere in the fix.
- **React error boundaries are class components** (`static getDerivedStateFromError` / `componentDidCatch`). A function component cannot be an error boundary. Honor this.

Drafting source: **`INF_Structured_Compliant_Drafting_Reference_20260513.md`** (file is the prompt; ends at §6A; no tail summary / no separate CC paste block).

---

## §1 — Problem Statement

### 1.1 Confirmed root cause (DIAG-076, RULE 21 against live code)

A fresh-session admin who selects a tenant with **no prior import** and begins an import receives a **full-page, chromeless** *"Something went wrong / A critical error occurred. Please refresh the page" + "Try Again."* DIAG-076 established:

- The boundary is **`web/src/app/global-error.tsx`** — it renders its own `<html><body>`, **replacing** the root layout, which is **why there is no chrome**.
- The throw is a **client render throw in the provider/chrome subtree** the root layout renders **above** the page boundary. Root-layout **server** functions are excluded (both `getServerAuthState` and `getResolvedTheme` are `try/catch`'d with safe fallbacks).
- The boundary-catch topology (`web/src/app/layout.tsx:67-79`): providers (`AuthProvider → TenantProvider → LocaleProvider → SessionProvider → ConfigProvider`) → `AuthShell` → `{children}`. The root `app/error.tsx` wraps only the `{children}` slot — which sits **inside** `AuthShell`. So a throw in any **provider** or in **`AuthShell` chrome** (siblings/ancestors of `{children}`) escapes every page/segment boundary and hits **`global-error`**.
- **The route-divergence hypothesis is dead.** OB-213 Phase 7 (`93c66ca1`) already consolidated every import route to `/operate/import`, discarded the ~4,359-line plan-deriving page, and removed `extractTargetFieldsFromPlan`. CLT72-F27 / CLT167-F03 / Decision 77 = **SATISFIED**. This HF does **not** touch routing.
- **Why it recurred after HF-330 (PR #579):** HF-330 shipped only `web/src/app/operate/import/error.tsx` — a **page-scoped** boundary that sits **inside** the providers and `AuthShell`, **structurally below** the throw site. Its own comment admits it cannot catch an ancestor-layout/provider throw. **FP-69 / FP-72 at the layer level.**

### 1.2 The two layers this HF closes

1. **Class (structural):** the **missing shell-level boundary** between the root layout and `global-error`. Today a shell throw has **no** recoverable boundary — it triggers the chromeless full-document replacement. A boundary wrapping the provider/`AuthShell` subtree closes this gap for **any** shell throw, present or future.
2. **Instance → class-sweep (the actual throw):** a **render-phase browser-storage read** in a shell provider. DIAG-076's strongest (explicitly **UNPROVEN**) candidate: `web/src/contexts/persona-context.tsx:110-116` reads `sessionStorage` inside a `useState` lazy initializer (render phase, not an effect) — the canonical first-mount/hydration-divergence anti-pattern, in a provider mounted in `AuthShell`. The capture (§3.2) confirms the exact line; the sweep closes the class.

### 1.3 The Phase-1 boundary doubles as the capture instrument

The exact throw has gone **uncaptured across two cycles** (HF-330, DIAG-076): production `global-error` swallows it; headless repro is auth-gated (307 → login). The Phase-1 boundary, by **logging `error.message` + `errorInfo.componentStack` + `error.digest` when it catches**, finally captures the throw in the architect's **authenticated browser**. This dissolves the chicken-and-egg: ship the robust boundary → it catches and logs → architect pastes the confirmed line → subtract it.

### 1.4 Closure semantics (critical — the boundary is NOT the fix)

Phase 1 alone is a **safety net, not closure.** The boundary **catching** the throw means the throw is **still present** (now graceful + captured). **Closure = Phase 2 ELIMINATES the throw:** the architect reproduces the empty-tenant first-import path and the boundary does **not** fire; the import surface renders cleanly. SR-43 status move happens **only** on "no catch." The boundary must never be filed as the fix.

---

## §2 — Discipline applications (substrate-bound)

- **Reconciliation channel:** **N/A** — no ground-truth values, no payout numbers. No GT content enters this directive or its report.
- **Schema / SQL surface:** **N/A** — no DDL, no migration, no DB write. The **SQL Verification Gate / FP-49** do not apply (no SQL). Stated, not omitted.
- **Decision 158 (subtraction):** instance fix = **removal** of render-phase reads; class fix = one structural boundary + the swept removals. No enumerated per-site guard.
- **SR-34 / AP-D2:** class closure proven by **grep** showing zero render-phase storage/`window`/`document` reads remain across the full shell provider/chrome set.
- **Vertical slice:** the slice is the **shell render path** — root layout → boundary → providers → first-mount render — end to end, **one branch, one PR.** Not the import pipeline (untouched), not the engine (untouched).

---

## §3 — Phase prose (ULTRACODE)

### §3.1 — Phase 1: Recoverable shell-level boundary (robust; the capture instrument)

**Objective:** a recoverable error boundary wrapping the provider/`AuthShell` subtree in the root layout — catching provider/chrome throws and degrading the chromeless `global-error` document-replacement to an **in-document recoverable retry**, while **logging** the caught throw.

**Constraints:**
- New **client class component** (error boundaries are class components), e.g. `web/src/components/shell/ShellErrorBoundary.tsx`, implementing `static getDerivedStateFromError` + `componentDidCatch`.
- Wire it in `web/src/app/layout.tsx` **inside `<body>`** (renders **within** the document — NOT replacing it like `global-error`) and **around the provider stack** (so a throw in **any** provider — `AuthProvider` outermost included — is caught):
  ```
  <body>
    <ShellErrorBoundary>
      <AuthProvider> … <ConfigProvider> <AuthShell>{children}</AuthShell> </ConfigProvider> … </AuthProvider>
    </ShellErrorBoundary>
    <PrivacyNoticeFooter/> <Toaster/>
  </body>
  ```
- **The fallback MUST be self-contained.** It must **not** consume any wrapped context (`Auth/Tenant/Locale/Session/Config/persona/navigation`) — a provider throw means those contexts are unavailable, so a fallback that reads a failed context would itself crash. Render a **styled, branded, self-contained** retry (logo + message + retry) whose retry re-renders the subtree (reset state) **without a full document reload**.
- **On catch, log** `error.message`, `error.stack`, `errorInfo.componentStack`, and any `error.digest` to the console (this is the capture). Optionally expose a "copy diagnostics" affordance in the fallback.
- **Leave the existing boundaries intact:** `global-error.tsx` remains the last resort for root-layout **server** throws above this boundary; `error.tsx` (segment) and `operate/import/error.tsx` (HF-330, page) remain unchanged. HF-334 adds the **missing middle (shell) layer** — it does not alter the others.

**Phase-1 proof gate (paste, no self-attestation):**
- `git diff` of `ShellErrorBoundary.tsx` + the `layout.tsx` wiring.
- Clean build: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm `localhost:3000`. Paste build output.
- Commit + push (feature branch).

**Architect verification (SR-44):** reproduce the empty-tenant first-import path → confirm (a) the chromeless crash is now an **in-document recoverable retry** (app not wiped), and (b) the boundary **logged the throw** (`componentStack` visible in console).

### §3.2 — ARCHITECT CAPTURE GATE (SR-44 — HALT for architect input)

With Phase 1 live, the architect reproduces the path; the boundary catches + logs the **exact** throw. **Repro steps (DIAG-076 §2):** incognito → fresh login → empty tenant (no plan, no `committed_data`) → DevTools Console open → `/data/import` → lands `/operate/import` → **select an import action** → boundary fires.

**Architect pastes the confirmed throw:** component + file + line + `message` + (`digest` / `componentStack`). **CC does NOT begin §3.3 until this confirmed throw is provided.** (The Phase-1 boundary log replaces the previously-unreachable production digest.)

### §3.3 — Phase 2: Subtract the confirmed render-phase read + sweep the class

**Objective:** **ELIMINATE** the throw (not just catch it) by removing the **confirmed** render-phase browser-storage/`window`/`document` read, and **sweep all** shell providers/chrome for the same anti-pattern.

**Steps:**
- **Subtract the confirmed read** (per §3.2). Canonical fix patterns — CC chooses per site:
  - (a) Move the read to a `useEffect` (post-mount), guarded by a `mounted` flag — accept a brief default-then-correct.
  - (b) Read via a **cookie the server can also see** (SSR and CSR agree) — **preferred** when the value affects SSR output (e.g. a persona that changes the rendered shell).
  - (c) `useSyncExternalStore` with a server snapshot.
  No render-phase storage read remains at the confirmed site.
- **Sweep the class.** Across the full shell set — providers `auth-context`, `tenant-context`, `locale-context`, `session-context`, `config-context`, `persona-context`, `navigation-context`, and chrome `ChromeSidebar`, `VialuceSidebar`, `VialuceTopbar`, `Navbar`, `CommandPalette`, `PersonaSwitcher` — grep for **synchronous `localStorage` / `sessionStorage` / `window` / `document` reads during render** (component bodies and `useState`/`useMemo`/`useRef` lazy initializers). Subtract each per the same patterns. **Close the class, not just the instance.**

**Phase-2 proof gate (paste):**
- `git diff` of every subtraction.
- **Class-closure grep:** paste the grep command over the shell set and the **empty/clean** result proving **zero** render-phase storage/`window`/`document` reads remain (SR-34 / AP-D2 evidence).
- Clean build (kill → `rm -rf .next` → build → dev → `localhost:3000`).
- Commit + push.

**Architect verification (SR-44 — the closure gate):** reproduce the empty-tenant first-import path → **the boundary does NOT fire**; the import surface renders cleanly. **This is closure.**

### §3.4 — PR

`gh pr create --base main --head hf-334-shell-render-readiness` with a title + body summarizing **both** layers (the structural boundary and the swept subtractions) and the before/after closure semantics. **The architect merges (SR-44).**

---

## §4 — HALT Conditions

- **HALT-A (capture gate, §3.2):** CC must not implement Phase 2 until the architect provides the **confirmed** throw. If the architect cannot capture, **Phase 1 ships ALONE** as a logged safety-net improvement (chromeless → recoverable) — explicitly **NOT closure**; Phase 2 waits. Report it as a safety net, not a fix.
- **HALT-B:** if, once Phase 1 is live, the boundary log shows the throw originates **above** the boundary (root-layout server render) — contradicting DIAG-076's exclusion of server throws — **stop and surface**; the boundary placement or the root-cause class needs architect revision.
- **HALT-C (RULE 24):** if Phase 2's subtractions do **not** eliminate the throw (boundary still fires after the swept removals), stop after **one** corrective round, re-capture, and write a failure analysis — **not** repeated guessing.
- **HALT-D (SR-44):** any push to `main`, PR merge, SQL migration, or browser self-attestation → **stop**; architect-only.

## §5 — Reporting Discipline

- **Completion report:** `docs/completion-reports/HF-334_COMPLETION_REPORT.md` (HF → `docs/completion-reports/`; **NOT** `docs/diagnostics/`, **NOT** project root).
- **Contents:** Phase-1 diff + clean build + architect's "chromeless → recoverable + throw logged" confirmation; the **captured throw** (component/file/line/message/digest); Phase-2 diffs + **class-closure grep** + clean build; architect's **CLOSURE** confirmation ("boundary does not fire on the empty-tenant first-import path"); PR URL + branch + final SHA.
- **Closure semantics in the report:** Phase 1 = throw **CAUGHT** (safety net engaged); Phase 2 = throw **ELIMINATED** (no catch). SR-43 closure = **"no catch,"** architect-verified — not "boundary present."
- **Evidentiary standard:** pasted code, pasted terminal/grep output for every gate. **PASS/FAIL self-attestation is not accepted** (AP-9/AP-10).
- **ARTIFACT SYNC** block (CC emits deltas; CC does not edit governance artifacts):
  ```
  ARTIFACT SYNC
  MC:        HF-334 → [phase states]; shell render-readiness class status
  REGISTRY:  ShellErrorBoundary added (missing shell layer closed); render-phase storage reads
             removed across shell provider/chrome set (list sites subtracted)
  R1:        Empty-tenant first import (onboarding/demo path) → [BLOCKED until closure | UNBLOCKED on no-catch]
  BOARD:     CAPS — HF-334 status
  SUBSTRATE: FP-69/FP-72 layer error closed (shell boundary added below global-error);
             AP-D2 class closure via sweep; Decision 158 subtraction; DIAG-076 §6A residual resolved
  ```

## §6 — Out of Scope

- **The import UI surface** — `operate/import/page.tsx` (SCI state machine), the import-action selection, the upload/mapping/proposal flow, `components/import/*`, the `import-pipeline` lib — **UNTOUCHED.** A significant import-UI revision is **HELD by the architect** as separate work, to be sequenced **after** HF-334 clears the runway.
- **Import-route consolidation** (CLT72-F27 / CLT167-F03 / Decision 77) — already **SATISFIED** at OB-213 Phase 7; not re-touched.
- **Existing boundaries** — `global-error.tsx` / `error.tsx` / `operate/import/error.tsx` — **REMAIN as-is** (last-resort + segment/page scope). HF-334 adds the missing **middle (shell)** layer; it does not alter them.
- **Engine / calculation / convergence** — untouched (no payout path).

## §6A — Residuals

- If the capture reveals **multiple distinct** render-phase throws across providers, Phase 2's sweep closes them **together** (one class). If a **non-storage** render hazard surfaces (e.g. a synchronous throw on a missing/optional config during render), it is a **sibling within the same shell render-readiness class** and is **in-scope** for the sweep — not deferred.
- The Phase-1 boundary **remains permanently** as the structural safety layer; future shell throws degrade gracefully + log. This is the **durable class closure** beyond the specific subtraction.
- Once HF-334 ships and the empty-tenant path renders cleanly, the architect's **held import-UI revision** is unblocked for its own DS/OB on a clear runway.
