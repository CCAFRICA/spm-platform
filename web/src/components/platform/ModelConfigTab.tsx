'use client';

/**
 * ModelConfigTab — OB-215 Agent B: Observatory model-control surface.
 *
 * Reads GET /api/platform/model-config (the task→model policy + available models +
 * the plan family + which models reject sampling params), lets a platform operator
 * change the model per task, and PATCHes the overrides to platform_settings. Changes
 * take effect within ~60s (the resolver's per-process cache TTL). Keyed on the typed
 * AITaskType (Korean Test) — no tenant/language strings.
 */

import { useState, useEffect } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';

interface ModelConfigData {
  policy: Record<string, string>;
  allTasks: string[];
  planTasks: string[];
  availableModels: string[];
  deprecatedSamplingModels: string[];
}

const card = {
  background: 'var(--strag-panel)',
  border: '1px solid var(--strag-s8)',
  borderRadius: '12px',
  padding: '24px',
} as const;

export function ModelConfigTab() {
  const [data, setData] = useState<ModelConfigData | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/platform/model-config')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: ModelConfigData) => { setData(d); setDraft({ ...d.policy }); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, []);

  const save = async () => {
    if (!data) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/platform/model-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overrides: draft }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || `HTTP ${res.status}`);
      }
      const d = await res.json();
      setData(prev => (prev ? { ...prev, policy: d.policy } : prev));
      setDraft({ ...d.policy });
      setSavedAt(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
        <Loader2 style={{ width: '24px', height: '24px', color: '#7B7FD4', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }
  if (error && !data) {
    return <div style={{ padding: '24px', color: '#EF4444', fontSize: '14px' }}>Failed to load model config: {error}</div>;
  }
  if (!data) return null;

  const planSet = new Set(data.planTasks);
  const deprecatedSet = new Set(data.deprecatedSamplingModels);
  const dirty = data.allTasks.some(t => draft[t] !== data.policy[t]);
  const modelOptions = (current: string) =>
    Array.from(new Set([...data.availableModels, current])).filter(Boolean);

  const renderRow = (task: string) => {
    const current = draft[task] ?? data.policy[task] ?? '';
    const rejects = deprecatedSet.has(current);
    return (
      <div key={task} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', borderRadius: '8px',
        background: 'rgba(30, 41, 59, 0.5)', border: '1px solid var(--strag-s7)', gap: '16px',
      }}>
        <div style={{ flex: 1 }}>
          <code style={{ color: 'var(--strag-s1)', fontSize: '13px', fontWeight: 600 }}>{task}</code>
          {rejects && (
            <span title="This model rejects sampling params (temperature); the adapter omits them automatically." style={{
              display: 'inline-flex', alignItems: 'center', gap: '4px', marginLeft: '10px',
              fontSize: '11px', color: '#FBBF24', background: 'rgba(251, 191, 36, 0.1)',
              border: '1px solid rgba(251, 191, 36, 0.25)', borderRadius: '6px', padding: '1px 6px',
            }}>
              <AlertTriangle style={{ width: '11px', height: '11px' }} /> no sampling params
            </span>
          )}
        </div>
        <select
          value={current}
          onChange={e => setDraft(prev => ({ ...prev, [task]: e.target.value }))}
          style={{
            background: 'var(--strag-s8)', color: 'var(--strag-s2)', border: '1px solid var(--strag-s6)',
            borderRadius: '6px', padding: '6px 10px', fontSize: '13px', minWidth: '220px',
          }}
        >
          {modelOptions(current).map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
    );
  };

  return (
    <div style={{ fontSize: '14px', color: 'var(--strag-s2)', lineHeight: '1.5' }}>
      <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ color: 'var(--strag-s0)', fontSize: '18px', fontWeight: 700, margin: 0 }}>Model Configuration</h2>
          <p style={{ color: 'var(--strag-s4)', fontSize: '14px', marginTop: '4px' }}>
            The model used for each AI task. Plan-interpretation tasks default to Opus for rate-table
            completeness; everything else uses the general default. Changes take effect within ~60s.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {savedAt && <span style={{ color: '#34D399', fontSize: '12px' }}>Saved {savedAt}</span>}
          {error && <span style={{ color: '#EF4444', fontSize: '12px' }}>{error}</span>}
          <button
            onClick={save}
            disabled={!dirty || saving}
            style={{
              background: dirty ? '#4F46E5' : 'var(--strag-disabled)', color: '#fff', border: 'none',
              borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: 600,
              cursor: !dirty || saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>

      <div style={{ ...card, marginBottom: '20px' }}>
        <h3 style={{ color: 'var(--strag-s0)', fontSize: '15px', fontWeight: 700, margin: '0 0 4px' }}>Plan interpretation family</h3>
        <p style={{ color: 'var(--strag-s4)', fontSize: '13px', margin: '0 0 16px' }}>
          The highest-reasoning step — must emit structurally complete rate tables (AUD-017).
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {data.allTasks.filter(t => planSet.has(t)).map(renderRow)}
        </div>
      </div>

      <div style={card}>
        <h3 style={{ color: 'var(--strag-s0)', fontSize: '15px', fontWeight: 700, margin: '0 0 16px' }}>General tasks</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {data.allTasks.filter(t => !planSet.has(t)).map(renderRow)}
        </div>
      </div>
    </div>
  );
}
