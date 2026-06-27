'use client';

/**
 * StatusSpine — the luminous file-lifecycle spine (DS-031 §3.4).
 *
 * Renders one file's journey: Received → Quarantined → Scanned → [Condition ·
 * forthcoming, inert seam] → Promoted, with illumination keyed to the recorded
 * file_objects.state. The agent pipeline that the PrismDataSurface mockup drew
 * here is OUT OF SCOPE for Slice 1; the "Condition" node is the inert seam slot.
 * Colors are state indicators consumed by name (SEMANTIC) + shadcn classes for
 * chrome — theme-commensurate (Vialuce / Dark / Bliss), no hardcoded palette.
 */

import { Fragment } from 'react';
import { SEMANTIC, CARD, CARD_PAD } from '@/components/insights/ds003/ds003-tokens';
import { QualityRing } from './QualityRing';
import {
  spineNodes,
  nodeColor,
  stateSummary,
  toneTextClass,
  formatBytes,
  type FileRow,
  type SpineNode,
  type Audience,
} from './prism-status';

function SpineDot({ node }: { node: SpineNode }) {
  const color = nodeColor(node.status);
  const lit = node.status === 'done' || node.status === 'active' || node.status === 'attention';
  const active = node.status === 'active';
  const forthcoming = node.status === 'forthcoming';

  return (
    <div className="flex shrink-0 flex-col items-center gap-1.5" style={{ width: 64 }}>
      <span
        className="block h-3.5 w-3.5 rounded-full"
        style={{
          background: lit ? color : 'transparent',
          border: lit
            ? 'none'
            : forthcoming
              ? '2px dashed var(--vl-line, #E8EAF3)'
              : '2px solid var(--vl-line, #E8EAF3)',
          boxShadow: lit ? `0 0 8px ${color}99` : 'none',
          animation: active ? 'prism-pulse 1.4s ease-in-out infinite' : undefined,
        }}
      />
      <span
        className={`text-center text-[10px] uppercase leading-tight tracking-wide ${
          lit ? 'text-foreground' : 'text-muted-foreground/60'
        }`}
      >
        {node.label}
        {node.forthcoming ? ' · soon' : ''}
      </span>
    </div>
  );
}

function Segment({ litLeft }: { litLeft: boolean }) {
  return (
    <span
      className="mx-1 mt-[7px] h-[2px] flex-1 self-start rounded-full"
      style={{ background: litLeft ? SEMANTIC.green : 'var(--vl-line, #E8EAF3)' }}
    />
  );
}

export function StatusSpine({ file, audience = 'operator' }: { file: FileRow; audience?: Audience }) {
  const nodes = spineNodes(file.state);
  const summary = stateSummary(file.state, audience);

  return (
    <div className={`${CARD} ${CARD_PAD}`}>
      <div className="flex items-start gap-4">
        <div className="shrink-0">
          <QualityRing state={file.state} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <h3 className="truncate font-medium text-foreground">{file.original_filename}</h3>
            <span className={`shrink-0 text-sm font-semibold ${toneTextClass(summary.tone)}`}>{summary.label}</span>
          </div>
          <p className={`text-sm ${toneTextClass(summary.tone)}`}>{summary.message}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {file.mime_detected ?? 'unknown type'} · {formatBytes(file.byte_size)} · sha256{' '}
            {file.content_sha256?.slice(0, 12)}…
          </p>
        </div>
      </div>

      <div className="mt-5 flex items-start">
        {nodes.map((node, i) => (
          <Fragment key={node.key}>
            {i > 0 && <Segment litLeft={nodes[i - 1].status === 'done'} />}
            <SpineDot node={node} />
          </Fragment>
        ))}
      </div>

      {file.state === 'infected_held' && (
        <div className="mt-4 rounded-lg border border-red-300/60 bg-red-50 p-3 text-sm dark:border-red-900/50 dark:bg-red-950/30">
          <p className="font-medium text-red-700 dark:text-red-300">Held for review — here&apos;s why</p>
          <p className="mt-0.5 text-red-600/90 dark:text-red-400/90">
            Scan verdict: <span className="font-mono">{file.scan_verdict ?? 'infected'}</span>
            {file.scan_engine_version ? ` · ${file.scan_engine_version}` : ''}. Conditioning is unavailable for held
            files. The bytes are retained in quarantine for review — nothing was promoted.
          </p>
          <p className="mt-1 text-xs text-red-500/80 dark:text-red-400/70">Triage workflow arrives in a later slice.</p>
        </div>
      )}

      {file.state === 'promoted' && (
        <p className="mt-3 text-xs text-muted-foreground">
          Cleared and ready for the platform · landed in <span className="font-mono">ingestion-raw</span> · audit
          recorded
        </p>
      )}

      <style>{`@keyframes prism-pulse { 0%,100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.35); opacity: .6; } }`}</style>
    </div>
  );
}
