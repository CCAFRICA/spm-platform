'use client';

// HF-334 Phase 1 — the missing SHELL-level error boundary.
//
// DIAG-076: a client render throw in the provider/chrome subtree (rendered by the root layout ABOVE
// app/error.tsx) escapes every page/segment boundary and triggers global-error.tsx — which renders its
// own <html><body>, REPLACING the document (the chromeless "critical error" screen). HF-330's
// operate/import/error.tsx sits INSIDE the providers, structurally below the throw, so it cannot catch
// this (FP-69/FP-72 at the layer level).
//
// This boundary wraps the provider stack INSIDE <body>, so a throw in ANY shell provider (AuthProvider
// outermost included) or in AuthShell chrome is caught and degraded to an IN-DOCUMENT recoverable retry
// — never the full-document replacement. It also LOGS the caught throw (message + stack + componentStack
// + digest) and best-effort reports it to platform_events: this is the capture instrument that finally
// surfaces the exact throw that production global-error swallowed across HF-330 + DIAG-076.
//
// CLOSURE NOTE: this boundary is a SAFETY NET, not the fix. Catching the throw means the throw is still
// present (now graceful + captured). Closure = HF-334 Phase 2 ELIMINATES the throw (boundary never fires).
//
// React error boundaries MUST be class components (getDerivedStateFromError / componentDidCatch). The
// fallback is SELF-CONTAINED: it consumes NO wrapped context (a provider throw means Auth/Tenant/Locale/
// Session/Config/persona/navigation are unavailable — a fallback that read them would itself crash).

import React from 'react';
import { AlertTriangle, RefreshCw, RotateCcw, Copy } from 'lucide-react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: (Error & { digest?: string }) | null;
  componentStack: string | null;
}

export class ShellErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, componentStack: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error & { digest?: string }, errorInfo: React.ErrorInfo) {
    // The capture: log the exact throw so the architect's authenticated-browser repro yields the
    // component/file/line that production global-error swallowed.
    console.error('[HF-334][ShellErrorBoundary] caught shell render throw:', {
      message: error?.message,
      digest: error?.digest,
      stack: error?.stack,
      componentStack: errorInfo?.componentStack,
    });
    this.setState({ componentStack: errorInfo?.componentStack ?? null });

    // Best-effort report to platform_events via the OB-230 client-error pipeline (raw fetch — NO
    // context, since the providers may be down). Captures the throw even without DevTools open.
    try {
      fetch('/api/auth/log-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'client.error.unhandled',
          payload: {
            message: String(error?.message || 'shell render throw').slice(0, 500),
            stack: String(error?.stack || '').slice(0, 2000),
            componentStack: String(errorInfo?.componentStack || '').slice(0, 2000),
            digest: error?.digest ?? null,
            pathname: typeof window !== 'undefined' ? window.location.pathname : null,
            kind: 'shell-error-boundary',
          },
        }),
      }).catch(() => {});
    } catch { /* never block the fallback */ }
  }

  private handleRetry = () => {
    // Re-render the wrapped subtree in place — no full document reload.
    this.setState({ hasError: false, error: null, componentStack: null });
  };

  private handleReload = () => {
    if (typeof window !== 'undefined') window.location.reload();
  };

  private handleCopy = () => {
    const { error, componentStack } = this.state;
    const text = [
      `message: ${error?.message ?? ''}`,
      `digest: ${error?.digest ?? ''}`,
      `stack: ${error?.stack ?? ''}`,
      `componentStack: ${componentStack ?? ''}`,
    ].join('\n');
    try { navigator.clipboard?.writeText(text); } catch { /* ignore */ }
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const { error } = this.state;
    // Self-contained, branded, inline-styled. Renders WITHIN the document (recoverable), not replacing it.
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#0a0e1a' }}>
        <div style={{ textAlign: 'center', maxWidth: 460, width: '100%' }}>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: '#7B7FD4', marginBottom: 24 }}>
            Vialuce
          </div>
          <div style={{ width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', background: 'rgba(239, 68, 68, 0.15)' }}>
            <AlertTriangle style={{ width: 32, height: 32, color: '#f87171' }} />
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#e4e4e7', margin: '0 0 8px' }}>
            Something interrupted the app
          </h2>
          <p style={{ color: '#71717a', margin: '0 0 24px', fontSize: 14, lineHeight: 1.5 }}>
            A part of the workspace failed to load. Your data was not changed. Try again — if it keeps
            happening, reload the page.
          </p>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={this.handleRetry}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 8, border: 'none', background: '#4845E4', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              <RotateCcw style={{ width: 15, height: 15 }} /> Try again
            </button>
            <button
              onClick={this.handleReload}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 8, border: '1px solid #27272a', background: 'transparent', color: '#a1a1aa', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              <RefreshCw style={{ width: 15, height: 15 }} /> Reload page
            </button>
          </div>

          {/* Capture aid: the throw shown in-document so the architect reads it without DevTools. */}
          {(error?.message || error?.digest) && (
            <div style={{ marginTop: 24, textAlign: 'left', background: '#0f1525', border: '1px solid #1e293b', borderRadius: 8, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: '#52525b' }}>Diagnostics</span>
                <button
                  onClick={this.handleCopy}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'transparent', border: 'none', color: '#7B7FD4', fontSize: 11, cursor: 'pointer' }}
                >
                  <Copy style={{ width: 12, height: 12 }} /> copy
                </button>
              </div>
              {error?.message && <div style={{ fontSize: 11, color: '#cbd5e1', fontFamily: 'monospace', wordBreak: 'break-word' }}>{error.message}</div>}
              {error?.digest && <div style={{ fontSize: 11, color: '#52525b', fontFamily: 'monospace', marginTop: 4 }}>ref: {error.digest}</div>}
            </div>
          )}
        </div>
      </div>
    );
  }
}
