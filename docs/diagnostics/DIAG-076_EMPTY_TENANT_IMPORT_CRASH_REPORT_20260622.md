# DIAG-076 — Data Import Empty-Tenant Critical-Error Crash — ROOT-CAUSE ANALYSIS

**Date:** 2026-06-22
**Repo:** VP (`CCAFRICA/spm-platform`), branch `main` @ `22e4884c`
**Directive:** `docs/vp-prompts/DIAG-076_DATA_IMPORT_EMPTY_TENANT_CRASH_DIRECTIVE_20260622.md`
**Mode:** DIAG → structural fix in one work item, with **HARD HALT after root-cause confirmation if out-of-class**
**Outcome:** **HALT-1 (§4).** The confirmed root-cause class is **NOT** the §1.4 hypothesis (empty-tenant → plan-assuming surface / route divergence). Per the directive, **no fix was implemented.** This document is the Phase-1 root-cause analysis surfaced for architect disposition.

> **TL;DR.** The directive's §1.4 premise is **stale**. The three-route import divergence (CLT72-F27 / Decision 77 / CLT167-F03) was **already consolidated at OB-213 Phase 7** — every import entry point now redirects to the empty-safe SCI page `/operate/import`, the ~4,359-line plan-deriving legacy page was **DISCARDED**, and `extractTargetFieldsFromPlan` **no longer exists**. The crash the architect sees is the **root-layout error boundary `global-error.tsx`** firing on a **client-side throw inside the provider/chrome subtree** that the root layout renders **above** the page-level boundary. It is a *first-mount* render/hydration-class defect in the authenticated shell, **not** a plan-null-dereference on an import page. This is exactly the §6A residual ("auth/tenant-context hydration race … a different defect requiring its own work item"). The exact throwing line requires the architect's authenticated browser + Vercel runtime-log digest (SR-44 / RULE 22 Level 5) to pin with certainty; this report captures the boundary, the class, the structural reason HF-330's fix could never catch it, and the leading code-level candidate.

---

## §1 — Phase-1 proof gate (pasted evidence, no self-attestation)

### 1.1 Re-verified import route map (RULE 21 — current code, not the AUD-001 snapshot)

```
$ grep -rn "redirect(" web/src/app/data/import web/src/app/data/imports web/src/app/operate/import
web/src/app/data/import/page.tsx:10:           redirect('/operate/import');
web/src/app/data/imports/page.tsx:10:          redirect('/operate/import');
web/src/app/data/import/enhanced/page.tsx:5:   redirect('/operate/import');
web/src/app/operate/import/enhanced/page.tsx:9: redirect('/operate/import');

$ wc -l (import entry points)
web/src/app/data/import/page.tsx                 11 lines   → redirect('/operate/import')
web/src/app/data/imports/page.tsx                11 lines   → redirect('/operate/import')
web/src/app/data/import/enhanced/page.tsx         6 lines   → redirect('/operate/import')   ← was ~4,359 lines
web/src/app/operate/import/enhanced/page.tsx     10 lines   → redirect('/operate/import')
web/src/app/operate/import/page.tsx             720 lines   → canonical SCI state machine
web/src/app/operate/page.tsx                    677 lines   → operate landing (empty-tenant branch below)
```

**`/data/import` (the screenshot URL) resolves to `/operate/import`** (server `redirect()`, `web/src/app/data/import/page.tsx:10`). The §1.3 ambiguity in the directive (comment said "/data/import/enhanced", one extract said "/operate/import") is **resolved: the real target is `/operate/import`**, and `/data/import/enhanced` *itself* now also redirects to `/operate/import`.

**The legacy plan-deriving page is gone.** `web/src/app/data/import/enhanced/page.tsx` is now:
```tsx
import { redirect } from 'next/navigation';
// OB-213 Phase 7: DISCARD — superseded route; redirects to the canonical page.
export default function Page() {
  redirect('/operate/import');
}
```
Git lineage of that file's last substantive change:
```
$ git log --oneline -1 -- web/src/app/data/import/enhanced/page.tsx
93c66ca1 OB-213 Phase 7: DISCARD + clean + completion report
```
The consolidation prescribed by **CLT167-F03 ("Route consolidation per Decision 77")** and **CLT72-F27 ("Duplicate import paths 3 → should be 1")** was **completed at OB-213 Phase 7**, not left pending.

**No live surface derives import fields from a plan:**
```
$ grep -rn "extractTargetFieldsFromPlan" web/src
web/src/lib/import-pipeline/smart-mapper.ts:95:  // CamelCase aliases (used by existing extractTargetFieldsFromPlan)
```
Only a **stale comment** remains — **no definition, no caller**. `smart-mapper.ts` is imported by `api/analyze-workbook/route.ts`, `components/import/field-mapper.tsx`, and the `import-pipeline` lib — **none of which is a page an empty tenant lands on during import**. There is no `extractTargetFieldsFromPlan(plan)` null-dereference path anywhere.

**Operate-landing empty-tenant branch** (`web/src/app/operate/page.tsx`): `buildPipelineSteps()` treats the empty tenant as `hasPlan=false / hasRoster=false / hasData=false` and renders a *guidance* CTA (`{ label: 'Import Plan', href: '/operate/import' }`). It routes the empty tenant to **`/operate/import`** — the empty-safe SCI page — **never to a plan-assuming surface.**

### 1.2 The error boundary (the visible "critical error" screen)

```
$ grep -rn "critical error occurred\|Something went wrong" web/src/app
web/src/app/error.tsx:25:              Something went wrong
web/src/app/global-error.tsx:21:       Something went wrong
web/src/app/global-error.tsx:24:       A critical error occurred. Please refresh the page.
web/src/app/operate/import/error.tsx:5: // …the reported crash … is the text of the ROOT-layout boundary…
```

The architect's screenshot text — *"Something went wrong / A critical error occurred. Please refresh the page" + "Try Again"*, **rendered without app chrome** — is **`web/src/app/global-error.tsx`** (it renders its own `<html><body>`, replacing the root layout; that is *why there is no sidebar/header*). The page-level `web/src/app/error.tsx` shows **different text** ("An error occurred while loading this page") **with chrome**, so the crash is **not** a page-level throw.

### 1.3 What `global-error` can and cannot catch — the structural key

Root layout (`web/src/app/layout.tsx:67-79`) renders, in order:
```
<AuthProvider>            ← client provider
  <TenantProvider>        ← client provider
    <LocaleProvider>      ← client provider
      <SessionProvider>   ← client provider
        <ConfigProvider>  ← client provider
          <AuthShell>{children}</AuthShell>   ← chrome; {children} is where app/error.tsx wraps
          <PrivacyNoticeFooter/>
          <Toaster/>
```
In the Next.js App Router, the root `app/error.tsx` boundary wraps the **`{children}` slot** — which here is **inside `<AuthShell>`**. Therefore:

| Throw originates in… | Caught by | Chrome? | Text |
|---|---|---|---|
| Root layout server render (`getServerAuthState`, `getResolvedTheme`, `cookies()`) | `global-error.tsx` | none | "A critical error occurred" |
| Any client provider above `{children}` (Auth/Tenant/Locale/Session/Config) | `global-error.tsx` | none | "A critical error occurred" |
| `AuthShell` / its chrome (`ChromeSidebar`, `VialuceTopbar`/`Navbar`, `NavigationProvider`, `PersonaProvider`, `CommandPalette`, `PersonaSwitcher`) — **siblings of `{children}`, above `app/error.tsx`** | `global-error.tsx` | none | "A critical error occurred" |
| A child layout (`operate/layout.tsx` → `OperateProvider`) | `app/error.tsx` | **chrome present** | "An error occurred while loading this page" |
| The page (`operate/import/page.tsx`) or its subtree | `operate/import/error.tsx` (HF-330) | chrome present | "Import couldn't load" |

The screenshot is row 1/2/3 → **a root-layout server throw or a client throw in the provider/chrome subtree.**

**Root-layout server throws are excluded:** both root-layout server functions are fully `try/catch`'d with safe fallbacks:
- `getServerAuthState` (`web/src/lib/auth/server-auth.ts:65-68`) → `catch { return {user:null,profile:null,isAuthenticated:false} }`
- `getResolvedTheme`/`getActiveTheme` (`web/src/lib/theme/active-theme.ts:39-41`) → `catch { return 'current' }`
- `cookies()` does not throw here.

⇒ **The throw is a CLIENT render throw inside the provider/chrome subtree** rendered directly by the root layout (above `app/error.tsx`).

### 1.4 Why this recurred after HF-330 — the layer error (FP-69 / FP-72)

HF-330 (PR #579) investigated this exact crash as "Defect A," correctly identified the text as `global-error.tsx`, deemed it unreproducible, and shipped **only** `web/src/app/operate/import/error.tsx` — a **route-scoped** boundary. That file's **own comment** states the fatal limitation:

> `web/src/app/operate/import/error.tsx:16-17` — *"Next's error boundaries do not catch errors in an ancestor layout, so a genuine root-layout fault still surfaces via global-error; this scopes and recovers everything from the page down."*

`operate/import/error.tsx` sits **inside** the providers and **inside** `AuthShell` — structurally **below** the throw site. It **cannot** catch a provider/chrome throw. HF-330's fix addressed the **page subtree**; the crash lives in the **provider/chrome subtree**. This is **FP-69 ("fix one layer, leave the real one")** / **FP-72 ("page fix ≠ shell fix")** — the named failure patterns the directive warned against — applied to *layers* rather than *routes*.

### 1.5 Captured throw — what is confirmed vs. what needs the architect's runtime digest

Per RULE 21/22, I traced statically and fanned out two read-only hunts across the entire provider/chrome subtree. **Confirmed by static analysis:**

- The crash boundary is **`global-error.tsx`** (root layout). *(certain — only file with that text; chromeless render is its signature)*
- The throw is a **client render throw in the provider/chrome subtree above `app/error.tsx`**. *(certain — server root layout is try/catch'd; page/child-layout throws hit different boundaries with chrome)*
- **All five context providers** (`auth-context`, `tenant-context`, `locale-context`, `session-context`, `config-context`) catch their async work into state and **do not throw during render** on an empty tenant. *(read in full)*
- The **canonical SCI page** `operate/import/page.tsx` is **empty-safe**: it is wrapped in `RequireCapability`, guards `if (!tenantId) handleError(...)` (line 173), and routes every failure into an in-page `{ phase:'error' }` state (lines 392-398) — which renders **with chrome**, not `global-error`. *(read in full)*
- The six chrome components (`ChromeSidebar`, `VialuceSidebar`, `VialuceTopbar`, `Navbar`, `CommandPalette`, `PersonaSwitcher`) and `navigation-context` contain **no unguarded synchronous dereference** that throws on an empty tenant (all array reads are on `[]`-initialized context values or static records; all `currentTenant`/persona reads are optional-chained). *(two read-only sweeps)*

**Leading code-level candidate (one concrete render-phase hazard found):**
`web/src/contexts/persona-context.tsx:110-116` reads `sessionStorage` **inside a `useState` lazy initializer (render phase, not an effect):**
```tsx
const [override, setOverride] = useState<PersonaKey | null>(() => {
  if (typeof window !== 'undefined') {
    const stored = sessionStorage.getItem('vl_persona_override');
    if (stored === 'admin' || stored === 'manager' || stored === 'rep') return stored;
  }
  return null;
});
```
This is a render-phase browser-storage read — the canonical first-mount / hydration-divergence anti-pattern, and it lives in a provider (`PersonaProvider`, mounted in `AuthShell`'s `showShell` branch) whose throws escape to `global-error`. It matches the reported signature ("first mount only; fine after refresh + back").

**Honest caveat (AP-9/AP-10 — no false confirmation):** `PersonaProvider` is mounted **client-side after** the `AuthShell` loading gate (`TenantProvider.isLoading` starts `true`, so the server renders the *loading spinner*, not the shell). A pure `useState`-initializer divergence is also often *recoverable* by React (client re-render) rather than a hard boundary throw. So this read is a **confirmed code smell and the strongest single candidate**, but it is **not proven** to be the exact fatal throw. The precise component+line of the fatal throw requires the **error `digest` from the architect's authenticated browser console + the correlated Vercel runtime log** — which is **architect territory (SR-44 / RULE 22 Level 5)** and was already blocked for headless repro in HF-330 (auth gate → 307/login). The §2 capture script gives the architect the exact steps.

### 1.6 Class verdict (one sentence)

**The crash is a first-mount client render/hydration throw in the authenticated shell's provider/chrome subtree, surfaced by the root-layout `global-error` boundary — NOT the §1.4 route-divergence / plan-assuming-surface class, which no longer exists in the codebase.**

---

## §2 — HALT-1 declaration & architect disposition

Per **§4 HALT-1**: the confirmed class is **not** §1.4 ⇒ **STOP; do not implement any fix; write the root-cause analysis; surface for architect disposition.** Done. No code under `web/src/**` was modified. No Phase-2 ADR, no Phase-3 fix.

**Two distinct items the architect must dispose of:**

1. **CLT167-F03 ("/operate/import/enhanced crash") and the CLT72-F27 / Decision-77 route consolidation are ALREADY SATISFIED** in code (OB-213 Phase 7). Closing the *visible crash* by "consolidating routes" would be a **no-op against the wrong target** — the routes are already one. The directive's Option A is already done.

2. **The actual crash is a new/distinct defect** (§6A residual class): a first-mount client render/hydration throw in the shell provider/chrome subtree, structurally uncatchable by HF-330's page-scoped boundary. It needs **its own work item** scoped to *shell render-readiness / hydration safety*, not import-route consolidation. Recommended scope for that work item:
   - Pin the exact throw via the §2 capture script (architect-run).
   - Remove the render-phase storage read in `persona-context.tsx:110-116` (move to an effect with a mount flag, or read via a cookie the server can also see) — **subtraction of a render-phase side effect**, Decision-158-aligned.
   - **Close the structural gap that let HF-330 miss this**: the providers/chrome have **no error boundary between the root layout and `global-error`**. A single recoverable boundary wrapping the authenticated shell (so a shell throw degrades to a retry *with* the app alive, instead of the chromeless root replacement) is the **class-level** fix — and it would have caught both this crash and any future shell throw.

**Architect verification / capture script (SR-44 — browser + logs are the architect's):**
1. Incognito → fresh login → select a tenant with **no plan and no `committed_data`** (empty tenant).
2. Open DevTools **Console** + **Network** before step 3.
3. Navigate to `/data/import` → land on `/operate/import` → **select an import action** → reproduce the crash.
4. Capture: the **first** red console error + its component stack (React dev build), and the **`Ref:`/`digest`** shown on the screen if present.
5. In Vercel → the project's **Runtime Logs**, filter by that `digest` → capture the server/client stack line.
6. Cross-check the asymmetry: after the crash, **refresh + back** → confirm it does **not** reproduce (warm second mount), pinning it as first-mount.
7. Paste the component+file+line into the follow-up work item; if it is `persona-context.tsx` (or another render-phase storage/`document` read in a shell provider), §1.5's candidate is confirmed.

---

## §3 — Discipline / compliance ledger

- **RULE 21 (trace actual path):** done — all route targets, the boundary, the provider tree, and the server functions were read in the current code, not the AUD-001 snapshot. Several snapshot premises were corrected (legacy page discarded; extractor deleted; redirect target = `/operate/import`).
- **RULE 22 (headless/static first; browser last & architect's):** all findings are static; the runtime digest is explicitly deferred to the architect.
- **RULE 23 (diagnostic cleanup):** **nothing to clean.** No instrumentation, no `[DIAG]`/`[TRACE]` logging, no `/tmp/vialuce-diagnostic*` file was created — the entire investigation was read-only static tracing. No source file under `web/src/**` was modified.
- **RULE 24 (≤3 rounds):** one thorough round; HALT-1 reached on a *class* determination, not a stuck capture.
- **Decision 158 (subtraction):** the recommended forward fix removes a render-phase side effect and a redundant failure mode; it adds no enumerated per-site guard.
- **SR-34 / AP-D2 (class not instance):** the recommended fix targets the **layer** (shell render-readiness + a shell-level boundary), closing the class HF-330's instance fix left open.
- **SR-43 / SR-44 / HALT-4:** no PR merged, no push to `main`, no SQL migration, no browser self-attestation. CC opened **no PR** because **no fix was produced** (HALT-1).
- **N/A (stated, not omitted):** Reconciliation channel — **N/A** (no GT values, no payout numbers touched). SQL Verification Gate / FP-49 — **N/A** (no DDL, no DB write; reads were schema-free route/component tracing).
- **Korean Test / AI-First:** N/A to this report; no literals introduced (no code changed).

---

## ARTIFACT SYNC
```
MC:        DIAG-076 → HALT-1 (out-of-class). Visible crash is NOT CLT167-F03's route-divergence
           class. NEW item discovered: shell-provider first-mount render/hydration throw +
           missing shell-level error boundary (recommend new HF/OB work item).
REGISTRY:  Import routes (data/import, data/imports, data/import/enhanced, operate/import/enhanced)
           → ALL redirect('/operate/import'); legacy ~4,359-line enhanced page DISCARDED at
           OB-213 Phase 7 (93c66ca1); extractTargetFieldsFromPlan removed (only a stale comment in
           smart-mapper.ts:95). CLT72-F27 / CLT167-F03 / Decision-77 consolidation = SATISFIED.
R1:        Empty-tenant first import (onboarding) — still BLOCKED by the crash; this DIAG does NOT
           unblock it (HALT-1). Unblocks only after the follow-up shell-render work item ships.
BOARD:     CAPS — DIAG-076 status: ROOT-CAUSED (out-of-class) / HALTED pre-fix; awaiting architect
           disposition + runtime digest.
SUBSTRATE: CLT167-F03 recurrence root = LAYER error (page-scoped boundary vs root-layout throw),
           not route divergence. FP-69 / FP-72 exercised against HF-330. AP-17 / CLT72-F27 already
           closed (OB-213 P7). Decision 158 + SR-34 framing carried into the recommended forward fix.
           §6A residual ("auth/tenant-context hydration race = different defect") CONFIRMED as the class.
```

*— End of DIAG-076 root-cause analysis. No fix implemented (HALT-1). Awaiting architect disposition.*
