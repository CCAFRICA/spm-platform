'use client';

/**
 * FeatureFlagsTab — Platform Settings toggle panel
 *
 * HF-052: Database-backed feature flags controllable from Observatory.
 * Reads from GET /api/platform/settings, toggles via PATCH.
 */

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';

interface PlatformSetting {
  id: string;
  key: string;
  value: unknown;
  description: string | null;
  updated_by: string | null;
  updated_at: string;
  created_at: string;
}

const FLAG_CONFIG: Record<string, { label: string; description: string }> = {
  landing_page_enabled: {
    label: 'Public Landing Page',
    description: 'When ON, unauthenticated visitors see the marketing landing page. When OFF, they go directly to login.',
  },
  gpv_enabled: {
    label: 'Guided Proof of Value',
    description: 'When ON, new tenants see the onboarding wizard. When OFF, all tenants see the normal dashboard.',
  },
  public_signup_enabled: {
    label: 'Public Signup',
    description: 'When ON, the signup page allows new account creation. When OFF, it shows "coming soon."',
  },
};

export function FeatureFlagsTab() {
  const [settings, setSettings] = useState<PlatformSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/platform/settings')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => {
        setSettings(data.settings || []);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const toggleFlag = async (key: string, currentValue: boolean) => {
    setToggling(key);
    try {
      const res = await fetch('/api/platform/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: !currentValue }),
      });
      if (res.ok) {
        setSettings(prev =>
          prev.map(s =>
            s.key === key ? { ...s, value: !currentValue, updated_at: new Date().toISOString() } : s
          )
        );
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to update flag');
      }
    } catch {
      setError('Network error — could not update flag');
    } finally {
      setToggling(null);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
        <Loader2 style={{ width: '24px', height: '24px', color: '#7B7FD4', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '24px', color: '#EF4444', fontSize: '14px' }}>
        <p>Failed to load settings: {error}</p>
        <p style={{ color: '#94A3B8', fontSize: '13px', marginTop: '8px' }}>
          Ensure the platform_settings table has been created in Supabase.
        </p>
      </div>
    );
  }

  return (
    <div style={{ fontSize: '14px', color: '#E2E8F0', lineHeight: '1.5' }}>
      {/* Section heading */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ color: '#F8FAFC', fontSize: '18px', fontWeight: 700, margin: 0 }}>Platform Settings</h2>
        <p style={{ color: '#94A3B8', fontSize: '14px', marginTop: '4px' }}>
          Toggle platform-wide feature flags. Changes take effect within 60 seconds.
        </p>
      </div>

      {/* Feature Flags Panel */}
      <div style={{
        background: '#0F172A',
        border: '1px solid #1E293B',
        borderRadius: '12px',
        padding: '24px',
      }}>
        <h3 style={{
          color: '#F8FAFC',
          fontSize: '16px',
          fontWeight: 700,
          margin: '0 0 16px',
        }}>
          Feature Flags
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {settings.map(setting => {
            const config = FLAG_CONFIG[setting.key];
            if (!config) return null;
            const isOn = setting.value === true || setting.value === 'true';
            const isToggling = toggling === setting.key;

            return (
              <div
                key={setting.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '16px 20px',
                  borderRadius: '8px',
                  background: 'rgba(30, 41, 59, 0.5)',
                  border: '1px solid #334155',
                }}
              >
                <div style={{ flex: 1, marginRight: '16px' }}>
                  <p style={{ color: '#F1F5F9', fontSize: '14px', fontWeight: 600, margin: 0 }}>
                    {config.label}
                  </p>
                  <p style={{ color: '#94A3B8', fontSize: '13px', marginTop: '4px', margin: '4px 0 0' }}>
                    {config.description}
                  </p>
                  {setting.updated_at && (
                    <p style={{ color: '#64748B', fontSize: '12px', marginTop: '6px', margin: '6px 0 0' }}>
                      Last updated: {new Date(setting.updated_at).toLocaleString()}
                    </p>
                  )}
                </div>

                {/* Toggle switch */}
                <button
                  onClick={() => toggleFlag(setting.key, isOn)}
                  disabled={isToggling}
                  style={{
                    position: 'relative',
                    display: 'inline-flex',
                    height: '28px',
                    width: '52px',
                    flexShrink: 0,
                    alignItems: 'center',
                    borderRadius: '14px',
                    border: 'none',
                    cursor: isToggling ? 'wait' : 'pointer',
                    transition: 'background-color 0.2s',
                    backgroundColor: isOn ? '#4F46E5' : '#475569',
                    opacity: isToggling ? 0.6 : 1,
                  }}
                  aria-label={`Toggle ${config.label}`}
                >
                  <span
                    style={{
                      display: 'inline-block',
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      backgroundColor: '#FFFFFF',
                      transition: 'transform 0.2s',
                      transform: isOn ? 'translateX(28px)' : 'translateX(4px)',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                    }}
                  />
                </button>
              </div>
            );
          })}
        </div>

        {settings.length === 0 && (
          <p style={{ color: '#94A3B8', fontSize: '14px', padding: '16px 0' }}>
            No feature flags found. Ensure the platform_settings table is populated.
          </p>
        )}
      </div>
    </div>
  );
}
