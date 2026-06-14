'use client';

// OB-204 F.3 — hierarchy review panel (admin, own tenant). Run the CPI pass, then review the
// confidence-ranked inferred edges with their evidence, and confirm (→ scope-bearing) or reject
// (→ end-dated). Thin client over the F.2/F.3 routes — no inference or authz logic here.
import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GitBranch, Sparkles, Check, X } from 'lucide-react';

interface InferredEdge {
  id: string; relationshipType: string; confidence: number; dimension: string | null;
  evidenceFields: string[]; sourceLabel: string; targetLabel: string;
}

export function HierarchyReviewPanel() {
  const [edges, setEdges] = useState<InferredEdge[]>([]);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/entities/inferred-edges');
    if (res.ok) setEdges((await res.json()).edges ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const runCpi = async () => {
    setRunning(true);
    try {
      const res = await fetch('/api/entities/cpi', { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(d.error || 'Inference failed'); return; }
      toast.success(`Inference complete — ${d.written} relationship${d.written === 1 ? '' : 's'} proposed`);
      await load();
    } finally { setRunning(false); }
  };

  const act = async (edge: InferredEdge, verb: 'confirm' | 'reject') => {
    setBusy(edge.id);
    try {
      const res = await fetch(`/api/entities/relationships/${edge.id}/${verb}`, { method: 'POST' });
      if (!res.ok) { const d = await res.json().catch(() => ({})); toast.error(d.error || `${verb} failed`); return; }
      toast.success(verb === 'confirm' ? 'Confirmed — now drives team scope' : 'Rejected — edge end-dated');
      setEdges(prev => prev.filter(e => e.id !== edge.id));
    } finally { setBusy(null); }
  };

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base text-slate-200 flex items-center gap-2"><GitBranch className="h-4 w-4" />Inferred hierarchy</CardTitle>
            <CardDescription className="text-slate-400">Relationships inferred from your imported roster structure. Inferred edges never grant access until confirmed.</CardDescription>
          </div>
          <Button size="sm" variant="secondary" onClick={runCpi} disabled={running} className="gap-2"><Sparkles className="h-4 w-4" />{running ? 'Inferring…' : 'Run inference'}</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {edges.length === 0 ? (
          <p className="text-sm text-slate-500 py-2">No pending inferred relationships. Run inference to propose hierarchy from your roster.</p>
        ) : edges.map(e => (
          <div key={e.id} className="flex items-center justify-between rounded border border-slate-800 px-3 py-2">
            <div className="text-sm text-slate-300">
              <span className="text-slate-200">{e.sourceLabel}</span>
              <span className="text-slate-500 mx-1.5">{e.relationshipType.replace('_', ' ')} →</span>
              <span className="text-slate-200">{e.targetLabel}</span>
              <div className="text-[11px] text-slate-500 mt-0.5">
                <Badge variant="outline" className="border-slate-700 text-slate-400 mr-1.5">{Math.round(e.confidence * 100)}%</Badge>
                {e.dimension && <span className="mr-1.5">{e.dimension.replace('_', ' ')}</span>}
                {e.evidenceFields.length > 0 && <span>· from {e.evidenceFields.join(', ')}</span>}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-400 hover:text-emerald-300" disabled={busy === e.id} onClick={() => act(e, 'confirm')}><Check className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-400 hover:text-rose-300" disabled={busy === e.id} onClick={() => act(e, 'reject')}><X className="h-4 w-4" /></Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
