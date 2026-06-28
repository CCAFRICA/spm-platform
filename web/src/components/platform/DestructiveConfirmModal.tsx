'use client';

// HF-352 — the shared two-step destructive-confirmation modal (I2). Built ONCE, used by both Clean
// Slate and Delete Tenant. Step 1: a warning naming the tenant + action (+ what will be wiped). Step 2:
// type the exact tenant name. On confirm it fetches the server-issued challenge and calls `execute`.
// NOTE: this UI gate is friction — the SECURITY boundary is the server (platform.system_config gate +
// server-verified challenge + name). The server rejects any call lacking a valid challenge/name.

import { useState } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';

type Action = 'clean-slate' | 'delete-tenant';

export interface DestructiveExecuteResult { ok: boolean; error?: string; summary?: string }

interface Props {
  open: boolean;
  onClose: () => void;
  tenantId: string;
  tenantName: string;
  action: Action;
  title: string;
  warning: React.ReactNode;
  confirmVerb: string;
  execute: (a: { confirmName: string; challenge: string }) => Promise<DestructiveExecuteResult>;
  onSuccess?: () => void;
}

export function DestructiveConfirmModal({ open, onClose, tenantId, tenantName, action, title, warning, confirmVerb, execute, onSuccess }: Props) {
  const [step, setStep] = useState<'warn' | 'type'>('warn');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DestructiveExecuteResult | null>(null);

  if (!open) return null;

  const close = () => { setStep('warn'); setTyped(''); setBusy(false); setResult(null); onClose(); };

  const onConfirm = async () => {
    if (typed !== tenantName) return;
    setBusy(true); setResult(null);
    try {
      // Step-2 server handshake: fetch the short-lived signed challenge bound to {action, tenant}.
      const cRes = await fetch(`/api/platform/tenants/${tenantId}/confirm-challenge?action=${action}`);
      if (!cRes.ok) { setResult({ ok: false, error: `challenge failed (${cRes.status})` }); setBusy(false); return; }
      const { challenge } = await cRes.json() as { challenge: string };
      const r = await execute({ confirmName: typed, challenge });
      setResult(r);
      if (r.ok) onSuccess?.();
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-xl border border-red-500/40 bg-zinc-900 shadow-2xl">
        <div className="flex items-center gap-2 border-b border-zinc-700/60 px-5 py-3">
          <AlertTriangle className="h-5 w-5 text-red-400" />
          <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
          <button onClick={close} className="ml-auto text-zinc-500 hover:text-zinc-300" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {result ? (
            <div className={`text-sm ${result.ok ? 'text-emerald-300' : 'text-red-300'}`}>
              {result.ok ? '✓ Done. ' : '✗ Failed. '}{result.summary || result.error}
            </div>
          ) : step === 'warn' ? (
            <>
              <p className="text-sm text-zinc-300">
                You are about to <span className="font-semibold text-red-300">{confirmVerb}</span> for tenant{' '}
                <span className="font-mono font-semibold text-zinc-100">{tenantName}</span>. This cannot be undone.
              </p>
              <div className="rounded-lg bg-zinc-800/50 border border-zinc-700/50 p-3 text-xs text-zinc-300">{warning}</div>
            </>
          ) : (
            <>
              <p className="text-sm text-zinc-300">Type the tenant name <span className="font-mono font-semibold text-zinc-100">{tenantName}</span> to confirm:</p>
              <input
                autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={tenantName}
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-red-500/60"
              />
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-zinc-700/60 px-5 py-3">
          {result ? (
            <button onClick={close} className="rounded-md bg-zinc-700 px-3 py-1.5 text-sm text-zinc-100 hover:bg-zinc-600">Close</button>
          ) : step === 'warn' ? (
            <>
              <button onClick={close} className="rounded-md px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200">Cancel</button>
              <button onClick={() => setStep('type')} className="rounded-md bg-red-600/80 px-3 py-1.5 text-sm text-white hover:bg-red-600">Continue</button>
            </>
          ) : (
            <>
              <button onClick={() => setStep('warn')} disabled={busy} className="rounded-md px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 disabled:opacity-50">Back</button>
              <button
                onClick={onConfirm} disabled={busy || typed !== tenantName}
                className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-500 disabled:opacity-40"
              >
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{confirmVerb}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
