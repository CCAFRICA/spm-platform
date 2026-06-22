/**
 * OB-228 — GenericComponentRenderer: THE Korean-Test fallback (the `?? Generic` arm).
 * Renders ANY component's structure legibly — an unknown/novel componentType, a Korean
 * tenant's Hangul config, a future dialect — never errors, never drops. Prefers the
 * structural ComponentView outline; always also offers the raw config (collapsed).
 * This component is the proof that the canvas degrades gracefully for any type.
 */
'use client';
import { useState } from 'react';
import { ChevronRight, Braces } from 'lucide-react';
import { StepLine, type RendererProps } from './shared';

function KeyVals({ obj, depth = 0 }: { obj: unknown; depth?: number }) {
  if (obj === null || obj === undefined) return <span className="text-muted-foreground">∅</span>;
  if (typeof obj !== 'object') return <span className="font-mono text-foreground">{String(obj)}</span>;
  if (Array.isArray(obj)) {
    if (obj.length === 0) return <span className="text-muted-foreground">[]</span>;
    return (
      <div className="space-y-0.5">
        {obj.slice(0, 12).map((v, i) => <div key={i} className="pl-3 border-l border-border"><KeyVals obj={v} depth={depth + 1} /></div>)}
        {obj.length > 12 && <div className="text-xs text-muted-foreground pl-3">… +{obj.length - 12} more</div>}
      </div>
    );
  }
  const entries = Object.entries(obj as Record<string, unknown>).filter(([k]) => k !== 'raw');
  return (
    <div className="space-y-0.5">
      {entries.slice(0, 24).map(([k, v]) => (
        <div key={k} className="grid grid-cols-[minmax(80px,auto)_1fr] gap-2 items-start">
          <span className="text-xs text-muted-foreground truncate">{k}</span>
          <div className="text-sm"><KeyVals obj={v} depth={depth + 1} /></div>
        </div>
      ))}
    </div>
  );
}

export function GenericComponentRenderer({ component, view }: RendererProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-2.5">
      {view.steps.map((s, i) => <StepLine key={i} icon={<Braces className="h-3.5 w-3.5" />} label={s.label} detail={s.detail} />)}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronRight className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-90' : ''}`} />
        {open ? 'Hide' : 'Show'} raw configuration
      </button>
      {open && (
        <div className="rounded-md border border-border bg-muted/30 p-3 max-h-72 overflow-auto">
          <KeyVals obj={component.config?.raw ?? component.config} />
        </div>
      )}
    </div>
  );
}
