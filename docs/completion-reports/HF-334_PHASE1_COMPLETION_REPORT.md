# HF-334 — Phase 1 Completion Report (SOP correction)

**Date:** 2026-06-22 · **Repo:** VP `CCAFRICA/spm-platform` · **Branch:** `hf-334-shell-render-readiness`
**Directive:** `docs/vp-prompts/HF-334_DIRECTIVE_20260622.md` (Shell Render-Readiness) · **Root cause:** DIAG-076 HALT-1
**Phase-1 commit:** `08d60c7e` (pushed) · **PR:** none yet (§3.4 opens it after Phase 2)

> SOP note: this report was authored as a correction — Phase 1 was committed/pushed at `08d60c7e` before the completion report existed, violating the standing completion-report SOP regardless of the HALT. This closes that gap. Evidence below is **pasted command output, not self-attestation** (AP-9/AP-10).

---

## Status

- **Phase 1: COMPLETE.** The missing shell-level recoverable error boundary is built, wired around the entire provider stack, type-clean, build-clean, and dev-verified on `localhost:3000`.
- **HALT-A ACTIVE — awaiting architect capture (SR-44).** Phase 2 **not started.** No subtraction has been made (AP-9/AP-10 — no fix against a guessed throw).
- **This is a SAFETY NET, not closure.** The boundary *catching* the throw means the throw is **still present** (now graceful + captured). Closure = Phase 2 **ELIMINATES** the throw (boundary does not fire), architect-verified.
- **Existing boundaries untouched:** `web/src/app/global-error.tsx` (last-resort root-layout server throws), `web/src/app/error.tsx` (segment), `web/src/app/operate/import/error.tsx` (HF-330 page scope) — all unchanged. HF-334 adds only the missing **middle (shell)** layer.

---

## Phase-1 proof gate (pasted)

### 1. `git diff` — `layout.tsx` wiring (boundary wraps the ENTIRE provider stack, inside `<body>`, above `AuthProvider`)
```diff
+import { ShellErrorBoundary } from "@/components/shell/ShellErrorBoundary"; // HF-334: missing shell-layer boundary
+        {/* HF-334: shell-level recoverable boundary — wraps the ENTIRE provider stack inside <body> so a
+            client render throw in ANY provider (AuthProvider outermost) or in AuthShell chrome is caught
+            in-document (recoverable retry) instead of escaping to global-error's chromeless document
+            replacement. Sits above all providers; its fallback consumes none of them. */}
+        <ShellErrorBoundary>
           <AuthProvider initialAuthState={authState}>
             … existing provider stack: TenantProvider → LocaleProvider → SessionProvider → ConfigProvider → AuthShell{children} …
           </AuthProvider>
+        </ShellErrorBoundary>
```

### 2. `git diff` — `ShellErrorBoundary.tsx` (NEW; key structure)
```
commit 08d60c7e — HF-334 Phase 1: shell-level recoverable error boundary (capture instrument)
 web/src/components/shell/ShellErrorBoundary.tsx | (new file)
 web/src/app/layout.tsx                          | (wiring)
```
```tsx
// React error boundaries MUST be class components (getDerivedStateFromError / componentDidCatch).
export class ShellErrorBoundary extends React.Component<Props, State> {
  static getDerivedStateFromError(error: Error): Partial<State> {        // → { hasError: true, error }
  componentDidCatch(error: Error & { digest?: string }, errorInfo: React.ErrorInfo) {
    console.error('[HF-334][ShellErrorBoundary] caught shell render throw:', { message, digest, stack, componentStack });
    // best-effort report to platform_events (raw fetch, NO context — providers may be down):
    fetch('/api/auth/log-event', { … eventType: 'client.error.unhandled', payload: { message, stack, componentStack, digest, pathname, kind: 'shell-error-boundary' } })
  }
  private handleRetry  = () => { /* re-render subtree in place — no full reload */ };
  private handleReload = () => { /* window.location.reload() */ };
  render() {
    if (!this.state.hasError) return this.props.children;
    // SELF-CONTAINED fallback — consumes NO wrapped context; inline-styled; renders WITHIN the document.
    // Branded retry (Vialuce wordmark + AlertTriangle) + Try again / Reload page + in-document Diagnostics panel.
  }
}
```
Full file at `web/src/components/shell/ShellErrorBoundary.tsx` @ `08d60c7e`. The fallback reads **no** wrapped context (Auth/Tenant/Locale/Session/Config/persona/navigation) — a provider throw means those are unavailable, so a context-reading fallback would itself crash.

### 3. `npx tsc --noEmit` — 0 errors
```
$ cd web && npx tsc --noEmit 2>&1 | grep -c "error TS"
0
```

### 4. `npm run build` — clean (kill dev → `rm -rf .next` → build)
```
$ npm run build 2>&1 | grep -ciE "Failed to compile"
0
$ npm run build  (tail)
   Generating static pages (153/205) ...
 ✓ Generating static pages (205/205)
 ✓ Compiled successfully
```
("Dynamic server usage" notices during static generation are standard Next.js logs for cookie/searchParams routes — pre-existing across the app, not errors.)

### 5. `npm run dev` + `localhost:3000` confirmation
```
$ npm run dev   (web/)
  - Local:   http://localhost:3000
 ✓ Ready in 1299ms
$ curl -s -o /dev/null -w "GET / -> HTTP %{http_code}\n" http://localhost:3000/
GET / -> HTTP 307     (app up; unauth → /login)
```

### 6. Commit + push
```
commit 08d60c7e  HF-334 Phase 1: shell-level recoverable error boundary (capture instrument)
pushed → origin/hf-334-shell-render-readiness
```

---

## What happens next (HALT-A → Phase 2)

The architect reproduces the empty-tenant first-import path with Phase 1 live; the boundary catches + logs the **exact** throw (`[HF-334][ShellErrorBoundary]` console object, or the new `client.error.unhandled` event in Observatory → Users → Event Timeline). On the architect pasting the confirmed component/file/line/message/digest, Phase 2 subtracts that render-phase read and sweeps the shell class (read-only recon already points at `persona-context.tsx:112` — `sessionStorage` in a `useState` lazy initializer — but **nothing is subtracted until the throw is confirmed**). The PR (§3.4) opens after Phase 2; the architect merges (SR-44).

## ARTIFACT SYNC
```
ARTIFACT SYNC
MC:        HF-334 → Phase 1 COMPLETE (safety net live + capture instrument); HALT-A active; Phase 2 not started.
REGISTRY:  ShellErrorBoundary added — missing shell layer (between root layout and global-error) closed.
           Render-phase storage-read subtractions: NONE YET (Phase 2, post-capture).
R1:        Empty-tenant first import (onboarding/demo) → BLOCKED until closure (Phase 2 "no catch"). Phase 1
           degrades the crash from chromeless wipe to in-document recoverable retry, but the throw persists.
BOARD:     CAPS — HF-334 status: Phase 1 complete / awaiting architect capture.
SUBSTRATE: FP-69/FP-72 layer error addressed (shell boundary added below global-error, above the page
           boundaries); AP-D2 class sweep PENDING capture; Decision 158 subtraction PENDING capture;
           DIAG-076 §6A residual: structural layer closed, throw-elimination pending.
```

_Phase 1 = throw CAUGHT (safety net). Closure (Phase 2 = throw ELIMINATED, "no catch") is the architect's verification. The boundary is NOT the fix._
