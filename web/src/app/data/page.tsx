"use client";

/**
 * OB-253 (HALT-3) — Data Operations workspace, wired LIVE.
 *
 * This page shipped (OB-250) as 100% hardcoded mock data. It is now wired to the co-present signal
 * surface via GET /api/data/overview: real ingestion metrics + jobs, joint-recognition activity by
 * facet (Phase 3), and the precision-weighted TRUST FLAGS (Phase 4) that an operator confirms/corrects
 * — the feedback loop that refines the precision-weighting calibration (POST /api/data/acknowledge).
 * NOT a new surface (route/nav/gate pre-existed) — only the data source changed (Vertical Slice Rule).
 */

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Database, CheckCircle2, XCircle, Clock, AlertTriangle, RefreshCw, FileText, Activity, ShieldAlert, Loader2 } from "lucide-react";
import { useIsVialuce } from "@/hooks/use-is-vialuce";

interface Overview {
  metrics: { committedRecords: number; knownStructures: number; recognitionSignals: number; maxRecall: number; lastSeen: string | null };
  jobs: Array<{ id: string; status: string; fileName: string | null; createdAt: string | null; completedAt: string | null }>;
  signalsByFacet: Record<string, number>;
  trustFlags: Array<{ column: string; value: string; facet: string; action: string; consequence: number; consequenceFactors: string[]; reason: string }>;
  calibration: { consequenceThreshold: number };
}

function fmt(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function statusIcon(status: string) {
  if (/(complete|finalize|committed|clean)/i.test(status)) return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (/(fail|error)/i.test(status)) return <XCircle className="h-4 w-4 text-red-500" />;
  return <Clock className="h-4 w-4 text-blue-500" />;
}

export default function DataPage() {
  const isVialuce = useIsVialuce();
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acked, setAcked] = useState<Record<string, "confirmed" | "corrected">>({});

  const load = useCallback(() => {
    setLoading(true); setError(null);
    fetch("/api/data/overview", { cache: "no-store" })
      .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`); return r.json(); })
      .then((d: Overview) => setData(d))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const acknowledge = async (flag: Overview["trustFlags"][number], feedback: "confirmed" | "corrected") => {
    const key = `${flag.column}:${flag.value}`;
    setAcked((p) => ({ ...p, [key]: feedback }));
    await fetch("/api/data/acknowledge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ column: flag.column, value: flag.value, facet: flag.facet, feedback }) }).catch(() => {});
  };

  const facets = data ? Object.entries(data.signalsByFacet).sort((a, b) => b[1] - a[1]) : [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className={isVialuce ? "page" : "container mx-auto px-6 py-8"}>
        <div className={isVialuce ? "phead" : "mb-6 flex items-center justify-between"}>
          <div>
            <h1 className={isVialuce ? undefined : "text-3xl font-bold tracking-tight text-slate-50"}>Data Operations</h1>
            <div className={isVialuce ? "sub" : "mt-2 text-slate-600 dark:text-slate-400"}>The perceptual surface — what the model recognized, learned, and flagged for your judgment</div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2" onClick={load}><RefreshCw className="h-4 w-4" /> Refresh</Button>
          </div>
        </div>

        {loading && <div className="flex items-center gap-2 text-slate-400 py-12"><Loader2 className="h-5 w-5 animate-spin" /> Reading the signal surface…</div>}
        {error && !loading && <Card className="border-0 shadow-md"><CardContent className="pt-6 text-red-500 flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> {error}</CardContent></Card>}

        {data && !loading && (
          <>
            {/* Live metrics from the co-present surface */}
            <div className="grid gap-4 md:grid-cols-4 mb-6">
              <Metric label="Committed Records" value={data.metrics.committedRecords.toLocaleString()} icon={<Database className="h-5 w-5 text-indigo-600" />} tint="bg-indigo-100" />
              <Metric label="Known Structures" value={data.metrics.knownStructures.toLocaleString()} icon={<FileText className="h-5 w-5 text-purple-600" />} tint="bg-purple-100" sub="recognized fingerprints" />
              <Metric label="Recognition Signals" value={data.metrics.recognitionSignals.toLocaleString()} icon={<Activity className="h-5 w-5 text-emerald-600" />} tint="bg-emerald-100" />
              <Metric label="Max Recall" value={`${data.metrics.maxRecall}×`} icon={<RefreshCw className="h-5 w-5 text-blue-600" />} tint="bg-blue-100" sub="files a structure was recognized in" />
            </div>

            {/* Recognition activity by facet (Phase 3 joint recognition output) */}
            {facets.length > 0 && (
              <Card className="border-0 shadow-md mb-6">
                <CardHeader><CardTitle>Recognition Activity</CardTitle><CardDescription>Joint-recognition facet signals on the shared surface</CardDescription></CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {facets.map(([facet, n]) => <Badge key={facet} variant="secondary" className="bg-slate-100 text-slate-700">{facet}: {n}</Badge>)}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Recent ingestion jobs (real history, replaces the mock "recent loads") */}
            <Card className="border-0 shadow-lg mb-6">
              <CardHeader><CardTitle>Recent Ingestion</CardTitle><CardDescription>Processing jobs through the perceptual front</CardDescription></CardHeader>
              <CardContent>
                {data.jobs.length === 0 ? <p className="text-slate-400 text-sm">No ingestion jobs yet.</p> : (
                  <div className="rounded-lg border border-slate-200 dark:border-slate-800">
                    <Table>
                      <TableHeader><TableRow className="bg-slate-800/50"><TableHead>Created</TableHead><TableHead>File</TableHead><TableHead>Completed</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {data.jobs.map((j) => (
                          <TableRow key={j.id} className="hover:bg-slate-800/50">
                            <TableCell className="text-slate-600">{fmt(j.createdAt)}</TableCell>
                            <TableCell className="font-medium">{j.fileName ?? "—"}</TableCell>
                            <TableCell className="text-slate-600">{fmt(j.completedAt)}</TableCell>
                            <TableCell><div className="flex items-center gap-2">{statusIcon(j.status)}<span className="text-slate-600">{j.status}</span></div></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Precision-weighted TRUST FLAGS (Phase 4) — the safeguard surface */}
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-amber-500" /> Trust-Flagged for Review</CardTitle>
                    <CardDescription>High-consequence values on thin exposure — surfaced so a confident model does not silently predict them away</CardDescription>
                  </div>
                  <Badge variant="secondary" className="bg-amber-100 text-amber-700">{data.trustFlags.length} flagged</Badge>
                </div>
              </CardHeader>
              <CardContent>
                {data.trustFlags.length === 0 ? (
                  <p className="text-slate-400 text-sm">Nothing requires your judgment right now — recognized structure is being predicted silently.</p>
                ) : (
                  <div className="space-y-3">
                    {data.trustFlags.map((f) => {
                      const key = `${f.column}:${f.value}`;
                      const decision = acked[key];
                      return (
                        <div key={key} className="p-4 rounded-lg border border-slate-700">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3">
                              <Badge variant="secondary" className="bg-amber-100 text-amber-700">{f.facet}</Badge>
                              <div>
                                <p className="font-medium text-slate-50"><span className="text-slate-400">{f.column}:</span> {f.value}</p>
                                <p className="text-sm text-slate-400 mt-1">consequence {f.consequence} · {f.consequenceFactors.join(", ")}</p>
                                <p className="text-xs text-slate-500 mt-1">{f.reason}</p>
                              </div>
                            </div>
                            {decision ? (
                              <Badge variant="secondary" className={decision === "confirmed" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}>{decision}</Badge>
                            ) : (
                              <div className="flex gap-2 shrink-0">
                                <Button size="sm" variant="outline" onClick={() => acknowledge(f, "confirmed")}>Confirm</Button>
                                <Button size="sm" variant="outline" onClick={() => acknowledge(f, "corrected")}>Correct</Button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, icon, tint, sub }: { label: string; value: string; icon: React.ReactNode; tint: string; sub?: string }) {
  return (
    <Card className="border-0 shadow-md">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-400">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
            {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
          </div>
          <div className={`p-3 ${tint} rounded-full`}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}
