'use client';

/**
 * FeatureFlagsTab — Platform Settings toggle panel
 *
 * HF-052: Database-backed feature flags controllable from Observatory.
 * Reads from GET /api/platform/settings, toggles via PATCH.
 */

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { THEME_LABELS, THEME_ORDER } from '@/lib/theme/theme-labels';
import type { AppTheme } from '@/lib/theme/active-theme';

interface PlatformSetting {
  id: string;
  key: string;
  value: unknown;
  description: string | null;
  updated_by: string | null;
  updated_at: string;
  created_at: string;
}

// OB-196 Phase 1.6: landing_page_enabled and gpv_enabled removed (cluster pathway deleted).
const FLAG_CONFIG: Record<string, { label: string; description: string }> = {
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
  const [themeSaving, setThemeSaving] = useState(false);

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

  // OB-201: the active_ui_theme setting (global app theme). Normalize jsonb string value.
  const themeSetting = settings.find(s => s.key === 'active_ui_theme');
  const activeTheme: AppTheme = (() => {
    const v = themeSetting?.value;
    const n = typeof v === 'string' ? v.replace(/^"|"$/g, '') : 'current';
    return n === 'bliss' ? 'bliss' : n === 'vialuce' ? 'vialuce' : 'current'; // HF-312: +vialuce
  })();

  const setTheme = async (theme: AppTheme) => {
    if (theme === activeTheme || themeSaving) return;
    setThemeSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/platform/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'active_ui_theme', value: theme }),
      });
      if (res.ok) {
        // HF-313 Defect 4: this selector already sent the INTERNAL value (theme = 'current'|'bliss'|
        // 'vialuce' from THEME_ORDER, NOT the 'Dark' display label) — the architect's value/label
        // hypothesis was incorrect. The real reason "Dark" didn't take effect: a per-user
        // profiles.preferences.theme OVERRIDES the global active_ui_theme (layout.tsx precedence,
        // HF-309). So an admin who set a personal theme while testing won't see a global change. Sync
        // the acting admin's per-user preference to the new global so the Observatory selection honors
        // for them (and for users without a personal override the global default already applies).
        await fetch('/api/user/theme', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ theme }),
        }).catch(() => { /* non-fatal: global already saved; per-user sync best-effort */ });
        // The theme is applied server-side in the root layout; reload to re-render with it.
        window.location.reload();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to update theme');
        setThemeSaving(false);
      }
    } catch {
      setError('Network error — could not update theme');
      setThemeSaving(false);
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
        <p style={{ color: 'var(--strag-s4)', fontSize: '13px', marginTop: '8px' }}>
          Ensure the platform_settings table has been created in Supabase.
        </p>
      </div>
    );
  }

  return (
    <div style={{ fontSize: '14px', color: 'var(--strag-s2)', lineHeight: '1.5' }}>
      {/* Section heading */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ color: 'var(--strag-s0)', fontSize: '18px', fontWeight: 700, margin: 0 }}>Platform Settings</h2>
        <p style={{ color: 'var(--strag-s4)', fontSize: '14px', marginTop: '4px' }}>
          Toggle platform-wide feature flags. Changes take effect within 60 seconds.
        </p>
      </div>

      {/* OB-201 Appearance Panel — global app UI theme (current | bliss | vialuce). HF-312: +vialuce */}
      <div style={{
        background: 'var(--strag-panel)',
        border: '1px solid var(--strag-s8)',
        borderRadius: '12px',
        padding: '24px',
        marginBottom: '16px',
      }}>
        <h3 style={{ color: 'var(--strag-s0)', fontSize: '16px', fontWeight: 700, margin: '0 0 4px' }}>Appearance</h3>
        <p style={{ color: 'var(--strag-s4)', fontSize: '13px', margin: '0 0 16px' }}>
          Global app UI theme for all users. Applied server-side on the next page render. &ldquo;Dark&rdquo;
          is the original look; &ldquo;Bliss&rdquo; and &ldquo;Vialuce&rdquo; are the indigo/gold brand re-skins.
        </p>
        <div style={{ display: 'inline-flex', borderRadius: '8px', border: '1px solid var(--strag-s7)', overflow: 'hidden' }}>
          {THEME_ORDER.map(theme => {
            const isActive = activeTheme === theme;
            return (
              <button
                key={theme}
                onClick={() => setTheme(theme)}
                disabled={themeSaving}
                style={{
                  padding: '10px 24px',
                  fontSize: '14px',
                  fontWeight: 600,
                  border: 'none',
                  cursor: themeSaving ? 'wait' : (isActive ? 'default' : 'pointer'),
                  background: isActive ? '#4F46E5' : 'transparent',
                  color: isActive ? '#FFFFFF' : 'var(--strag-s4)',
                  transition: 'background-color 0.15s',
                }}
              >
                {THEME_LABELS[theme]}
              </button>
            );
          })}
        </div>
        {themeSaving && (
          <span style={{ color: 'var(--strag-s4)', fontSize: '12px', marginLeft: '12px' }}>Applying… reloading.</span>
        )}
      </div>

      {/* Feature Flags Panel */}
      <div style={{
        background: 'var(--strag-panel)',
        border: '1px solid var(--strag-s8)',
        borderRadius: '12px',
        padding: '24px',
      }}>
        <h3 style={{
          color: 'var(--strag-s0)',
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
                  border: '1px solid var(--strag-s7)',
                }}
              >
                <div style={{ flex: 1, marginRight: '16px' }}>
                  <p style={{ color: 'var(--strag-s1)', fontSize: '14px', fontWeight: 600, margin: 0 }}>
                    {config.label}
                  </p>
                  <p style={{ color: 'var(--strag-s4)', fontSize: '13px', marginTop: '4px', margin: '4px 0 0' }}>
                    {config.description}
                  </p>
                  {setting.updated_at && (
                    <p style={{ color: 'var(--strag-s5)', fontSize: '12px', marginTop: '6px', margin: '6px 0 0' }}>
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
                    backgroundColor: isOn ? '#4F46E5' : 'var(--strag-s6)',
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
          <p style={{ color: 'var(--strag-s4)', fontSize: '14px', padding: '16px 0' }}>
            No feature flags found. Ensure the platform_settings table is populated.
          </p>
        )}
      </div>
    </div>
  );
}
