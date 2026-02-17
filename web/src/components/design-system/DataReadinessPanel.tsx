'use client';

export interface DataReadiness {
  plan: { status: 'ready' | 'missing' | 'warning'; label: string; detail?: string };
  data: { status: 'ready' | 'missing' | 'warning'; label: string; detail?: string };
  mapping: { status: 'ready' | 'missing' | 'warning'; label: string; detail?: string; confidence?: number };
  validation: { status: 'ready' | 'stale' | 'never'; label: string; detail?: string };
}

interface DataReadinessPanelProps {
  readiness: DataReadiness;
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'ready') {
    return <span className="text-emerald-400">&#10003;</span>;
  }
  if (status === 'warning' || status === 'stale') {
    return <span className="text-amber-400">&#9888;</span>;
  }
  return <span className="text-rose-400">&#10007;</span>;
}

function statusColor(status: string): string {
  if (status === 'ready') return 'border-emerald-500/30 bg-emerald-500/5';
  if (status === 'warning' || status === 'stale') return 'border-amber-500/30 bg-amber-500/5';
  return 'border-rose-500/30 bg-rose-500/5';
}

export function DataReadinessPanel({ readiness }: DataReadinessPanelProps) {
  const items = [
    { key: 'plan', ...readiness.plan },
    { key: 'data', ...readiness.data },
    { key: 'mapping', ...readiness.mapping },
    { key: 'validation', label: readiness.validation.label, status: readiness.validation.status === 'ready' ? 'ready' : readiness.validation.status === 'stale' ? 'warning' : 'missing', detail: readiness.validation.detail },
  ];

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Preparacion de Datos</h4>
      {items.map((item) => (
        <div
          key={item.key}
          className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${statusColor(item.status)}`}
        >
          <StatusIcon status={item.status} />
          <div className="flex-1 min-w-0">
            <span className="text-sm text-zinc-200">{item.label}</span>
            {item.detail && (
              <p className="text-[11px] text-zinc-500 truncate">{item.detail}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
