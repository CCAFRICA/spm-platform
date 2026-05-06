// HF-202 — Calc-Execution Trace Capability
// Reusable instrumented diagnostic. Off by default; zero overhead when disabled.
// Substrate: T1-E910 Korean Test (generic trace fields), Decision 124 (research-derived).

import * as fs from 'fs';
import * as path from 'path';

export interface TraceEvent {
  ts: string;
  surface: string;
  entityExternalId?: string;
  componentIdx?: number;
  componentName?: string;
  step: string;
  data: Record<string, unknown>;
}

interface TraceContext {
  tenantId?: string;
  periodId?: string;
  periodLabel?: string;
  ruleSetId?: string;
  ruleSetName?: string;
  calcBatchId?: string;
}

interface TraceConfig {
  enabled: boolean;
  entityFilter?: string[];
  componentFilter?: number[];
  outputPath?: string;
  context?: TraceContext;
}

let config: TraceConfig = { enabled: false };
let buffer: TraceEvent[] = [];

export function isTraceEnabled(): boolean {
  return config.enabled;
}

export function enableTrace(opts: Omit<TraceConfig, 'enabled'>): void {
  config = { ...opts, enabled: true };
  buffer = [];
}

export function disableTrace(): void {
  config = { enabled: false };
}

export function setTraceContext(ctx: TraceContext): void {
  if (config.enabled) config.context = { ...config.context, ...ctx };
}

export function getTraceConfig(): TraceConfig {
  return config;
}

export function traceEvent(
  surface: string,
  step: string,
  data: Record<string, unknown>,
  scope?: { entityExternalId?: string; componentIdx?: number; componentName?: string },
): void {
  if (!config.enabled) return;
  if (config.entityFilter && config.entityFilter.length > 0
      && scope?.entityExternalId
      && !config.entityFilter.includes(scope.entityExternalId)) return;
  if (config.componentFilter && config.componentFilter.length > 0
      && scope?.componentIdx !== undefined
      && !config.componentFilter.includes(scope.componentIdx)) return;
  buffer.push({
    ts: new Date().toISOString(),
    surface,
    step,
    data,
    ...scope,
  });
}

export function flushTraceToMD(filename?: string): string {
  const outDir = config.outputPath ?? path.resolve(process.cwd(), 'docs/calc-traces');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const fname = filename ?? `calc-trace-${ts}.md`;
  const fp = path.join(outDir, fname);

  const lines: string[] = [];
  const ctx = config.context ?? {};
  lines.push(`# Calc Trace — ${ctx.periodLabel ?? 'unknown'} ${ts}`);
  lines.push('');
  lines.push(`**Tenant:** ${ctx.tenantId ?? 'n/a'}`);
  lines.push(`**Period:** ${ctx.periodId ?? 'n/a'} (${ctx.periodLabel ?? 'n/a'})`);
  lines.push(`**Rule Set:** ${ctx.ruleSetId ?? 'n/a'} (${ctx.ruleSetName ?? 'n/a'})`);
  lines.push(`**Calc Batch:** ${ctx.calcBatchId ?? 'n/a'}`);
  lines.push(`**Filter:** entity=${(config.entityFilter ?? []).join(',') || 'all'}, component=${(config.componentFilter ?? []).join(',') || 'all'}`);
  lines.push(`**Total Events:** ${buffer.length}`);
  lines.push('');
  lines.push('## Trace Events');
  lines.push('');

  const byEntity = new Map<string, Map<number, TraceEvent[]>>();
  for (const ev of buffer) {
    const eKey = ev.entityExternalId ?? '__global__';
    const cKey = ev.componentIdx ?? -1;
    if (!byEntity.has(eKey)) byEntity.set(eKey, new Map());
    const cMap = byEntity.get(eKey)!;
    if (!cMap.has(cKey)) cMap.set(cKey, []);
    cMap.get(cKey)!.push(ev);
  }

  for (const [entityId, cMap] of Array.from(byEntity.entries())) {
    lines.push(`### Entity: ${entityId}`);
    lines.push('');
    for (const [cIdx, events] of Array.from(cMap.entries())) {
      const componentName = events.find(e => e.componentName)?.componentName ?? `(component ${cIdx})`;
      const cLabel = cIdx === -1 ? '(global)' : `Component ${cIdx}`;
      lines.push(`#### ${cLabel}: ${componentName}`);
      lines.push('');
      for (const ev of events) {
        lines.push(`##### Step: ${ev.surface} → ${ev.step}`);
        lines.push('```json');
        lines.push(JSON.stringify(ev.data, null, 2));
        lines.push('```');
        lines.push('');
      }
    }
  }

  fs.writeFileSync(fp, lines.join('\n'), 'utf8');
  return fp;
}

export function getBufferSize(): number {
  return buffer.length;
}

export function clearBuffer(): void {
  buffer = [];
}
