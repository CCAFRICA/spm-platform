'use client';

/**
 * SubmitDropzone — the acquisition front door (DS-031 §3.4).
 *
 * Format-agnostic drag-drop + picker. The one intake path: prepare (mint signed
 * URL into ingest-quarantine) → PUT bytes direct-to-storage (never through a
 * function) → commit (server fingerprints + types from the BYTES, records
 * file.received). The confirmation the user sees is the live spine itself —
 * a render of the recorded state (verified, §6A), never optimistic.
 */

import { useCallback, useRef, useState } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { QUARANTINE_BUCKET } from '@/lib/prism/types';
import { CARD, CARD_PAD } from '@/components/insights/ds003/ds003-tokens';
import { StatusSpine } from './StatusSpine';
import { useFileObjects } from './useFileObjects';
import type { FileRow } from './prism-status';

async function sha256Hex(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function SubmitDropzone() {
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [submittedIds, setSubmittedIds] = useState<string[]>([]);
  const [pendingNames, setPendingNames] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const { files } = useFileObjects(1500);

  const submit = useCallback(async (file: File) => {
    setBusy((n) => n + 1);
    setError(null);
    setPendingNames((p) => [file.name, ...p]);
    try {
      const prep = await fetch('/api/prism/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name }),
      });
      if (!prep.ok) throw new Error((await prep.json().catch(() => ({}))).error || 'prepare failed');
      const { path, token } = await prep.json();

      const supabase = createClient();
      const { error: upErr } = await supabase.storage.from(QUARANTINE_BUCKET).uploadToSignedUrl(path, token, file);
      if (upErr) throw new Error(`upload failed: ${upErr.message}`);

      const clientSha256 = await sha256Hex(file);
      const commit = await fetch('/api/prism/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, filename: file.name, clientSha256 }),
      });
      if (!commit.ok) throw new Error((await commit.json().catch(() => ({}))).error || 'commit failed');
      const { id } = await commit.json();
      setSubmittedIds((prev) => [id, ...prev].slice(0, 10));
    } catch (e) {
      setError(String(e));
    } finally {
      setPendingNames((p) => p.filter((n) => n !== file.name));
      setBusy((n) => Math.max(0, n - 1));
    }
  }, []);

  const onFiles = (list: FileList | null) => {
    if (!list) return;
    Array.from(list).forEach((f) => void submit(f));
  };

  const recent = submittedIds
    .map((id) => files.find((f) => f.id === id))
    .filter((f): f is FileRow => Boolean(f));

  return (
    <div className="space-y-5">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          onFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-14 text-center transition-colors ${
          dragging ? 'border-primary bg-muted/60' : 'border-border bg-card hover:bg-muted/30'
        }`}
      >
        <Upload className="mb-3 h-8 w-8 text-muted-foreground" />
        <p className="text-base font-medium text-foreground">Drop files to submit</p>
        <p className="mt-1 text-sm text-muted-foreground">direct upload · any format · up to 500 MB</p>
        <p className="mt-3 text-xs text-muted-foreground/80">
          Every file is isolated in quarantine and scanned before it reaches the platform.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => onFiles(e.target.files)}
        />
      </div>

      {error && (
        <div className="rounded-lg border border-red-300/60 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      {(recent.length > 0 || pendingNames.length > 0 || busy > 0) && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">This submission</h2>
          {pendingNames.map((name) => (
            <div key={`pending-${name}`} className={`${CARD} ${CARD_PAD} flex items-center gap-3`}>
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <div>
                <p className="truncate font-medium text-foreground">{name}</p>
                <p className="text-sm text-muted-foreground">Uploading to quarantine…</p>
              </div>
            </div>
          ))}
          {recent.map((file) => (
            <StatusSpine key={file.id} file={file} />
          ))}
        </div>
      )}
    </div>
  );
}
