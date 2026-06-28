'use client';

// OB-250 — the PRISM import SOURCE (the "cleared shelf"), shown inside the Import surface.
//
// I6: the local/direct import source is ALWAYS available (rendered by the import page itself) — this
// panel is ADDITIVE. I7: it appears ONLY when prism_enabled is on (derived from the ONE predicate
// isPrismEnabled), and presents ONLY files PRISM has cleared and NOT yet consumed (the server query
// enforces state=promoted ∧ clean ∧ import_batch_id IS NULL). Clearing (the membrane) makes a file
// available here; importing (the "Import" button → consume) is a SEPARATE act that removes it from
// the shelf — clearing != importing (produce/consume boundary).

import { useCallback, useEffect, useState } from 'react';
import { useTenant } from '@/contexts/tenant-context';
import { isPrismEnabled } from '@/lib/prism/capability';
import { ShieldCheck, FileCheck2, Loader2, ArrowDownToLine } from 'lucide-react';

interface ClearedFile {
  id: string;
  original_filename: string;
  byte_size: number;
  promoted_at: string | null;
}

export function ClearedSourcePanel() {
  const { currentTenant } = useTenant();
  const on = isPrismEnabled(currentTenant?.features);
  const [files, setFiles] = useState<ClearedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [consuming, setConsuming] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    fetch('/api/prism/cleared')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: { files?: ClearedFile[] }) => setFiles(d.files ?? []))
      .catch(() => setFiles([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { if (on) refresh(); }, [on, refresh]);

  // I7: PRISM source is ABSENT (not disabled-but-shown) when the capability is off.
  if (!on) return null;

  const consume = async (fileObjectId: string) => {
    setConsuming(fileObjectId);
    try {
      const res = await fetch('/api/prism/cleared', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileObjectId }),
      });
      if (res.ok) refresh(); // the consumed file leaves the shelf
    } catch (err) {
      console.error('[ClearedSourcePanel] consume failed:', err);
    } finally {
      setConsuming(null);
    }
  };

  return (
    <div className="rounded-xl bg-zinc-800/40 border border-zinc-700/50 p-5 mb-4">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck className="w-4 h-4 text-teal-300" />
        <h3 className="text-sm font-semibold text-zinc-100">From PRISM (cleared)</h3>
        <span className="ml-auto text-[11px] text-zinc-500">{files.length} ready</span>
      </div>
      <p className="text-xs text-zinc-400 mb-3">
        Files PRISM has scanned and cleared for ingestion. Importing one is a separate act — a cleared
        file waits here until you import it.
      </p>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-zinc-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      ) : files.length === 0 ? (
        <p className="text-xs text-zinc-500">No cleared files awaiting import.</p>
      ) : (
        <ul className="space-y-2">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-3 rounded-lg bg-zinc-900/50 border border-zinc-700/40 p-2.5">
              <FileCheck2 className="w-4 h-4 text-emerald-300 shrink-0" />
              <span className="text-xs text-zinc-200 truncate">{f.original_filename}</span>
              <span className="ml-auto text-[10px] text-zinc-500">{Math.max(1, Math.round(f.byte_size / 1024))} KB</span>
              <button
                disabled={consuming === f.id}
                onClick={() => void consume(f.id)}
                className="inline-flex items-center gap-1 rounded-md bg-teal-600/80 hover:bg-teal-500 text-white text-[11px] px-2 py-1 disabled:opacity-50"
              >
                {consuming === f.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowDownToLine className="w-3 h-3" />} Import
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
