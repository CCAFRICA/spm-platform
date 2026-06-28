'use client';

// OB-250 — the platform-admin per-tenant PRISM capability toggle (I10).
//
// A self-contained control: reads the tenant's current prism_enabled (GET) and toggles it (PATCH)
// via the DEDICATED endpoint /api/platform/tenants/[id]/prism — which writes ONLY features.prism_enabled
// and an audit_logs row, with NO billing side effects (decoupled from the modules/billing path). VL-Admin
// gated server-side. Distinct from "Active Modules" (priced) — this is a capability flag.

import { useEffect, useState } from 'react';
import { Loader2, DatabaseZap } from 'lucide-react';

export function PrismCapabilityToggle({ tenantId }: { tenantId: string }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/platform/tenants/${tenantId}/prism`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: { prism_enabled?: boolean }) => { if (!cancelled) setEnabled(d.prism_enabled === true); })
      .catch(() => { if (!cancelled) setEnabled(false); });
    return () => { cancelled = true; };
  }, [tenantId]);

  const toggle = async (next: boolean) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/platform/tenants/${tenantId}/prism`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });
      if (res.ok) setEnabled(next);
    } catch (err) {
      console.error('[PrismCapabilityToggle] toggle failed:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <span style={{ color: 'var(--strag-s4)', fontSize: '13px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Capabilities
      </span>
      <div className="space-y-2 mt-2">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2" style={{ color: 'var(--strag-s2)', fontSize: '14px' }}>
            <DatabaseZap className="h-3.5 w-3.5" style={{ color: '#2dd4bf' }} />
            Data Operations (PRISM)
          </span>
          {enabled === null ? (
            <Loader2 className="h-4 w-4 animate-spin" style={{ color: '#71717a' }} />
          ) : (
            <button
              disabled={saving}
              onClick={(e) => { e.stopPropagation(); void toggle(!enabled); }}
              className="relative w-10 h-5 rounded-full transition-colors disabled:opacity-50"
              style={{ background: enabled ? '#2dd4bf' : '#374151' }}
              aria-pressed={enabled}
              aria-label="Toggle Data Operations (PRISM)"
            >
              <div
                className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform"
                style={{ transform: enabled ? 'translateX(22px)' : 'translateX(2px)' }}
              />
            </button>
          )}
        </div>
        <p style={{ color: 'var(--strag-s4)', fontSize: '12px' }}>
          Gateable data-acquisition path (membrane + scan + cleaned import). Capability flag — not billed.
        </p>
      </div>
    </div>
  );
}
