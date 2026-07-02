'use client';

/**
 * OB-221 Phase 1 — Vialuce Sidebar (deep-indigo rail).
 *
 * Rendered ONLY under data-theme="vialuce": the LIVE ChromeSidebar early-returns this component
 * instead of its existing rail; the else-branch is unchanged → Current/Bliss cannot regress. Maps
 * the platform's REAL nav (WORKSPACES config: workspace → sections → routes) onto the design
 * package's .sb vocabulary:
 *   .ws 2×2 workspace switcher → accessible workspaces (role + feature filtered)
 *   .sb-sec expandable groups   → the active workspace's sections
 *   .nav a sub-items            → section routes (real paths), active = current path
 *   .persona (footer, docked)   → persona override (fixes the floating-over-content defect)
 *   .sb-back "← Observatory"     → VL admin returns to the tenant picker (/select-tenant); omitted
 *                                  for non-admins (no Observatory concept for them)
 *   (the gold "Calculate" CTA now lives in VialuceTopbar — its design-spec home — not here; HF-312)
 *   .sb-user                    → authenticated user
 * Icons: lucide-react (the platform's icon lib; the design's Tabler `.ti` webfont is not installed —
 * documented substitution). Labels come from the i18n-bearing WORKSPACES config (label/labelEs),
 * not hardcoded English (Korean Test).
 */

import { useMemo, useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import * as LucideIcons from 'lucide-react';
import { ArrowLeftRight, Command, ChevronDown, ChevronUp, Palette } from 'lucide-react';
import { THEME_LABELS, THEME_ORDER } from '@/lib/theme/theme-labels';
import type { AppTheme } from '@/lib/theme/active-theme';
import { cn } from '@/lib/utils';
import { useWorkspace, useCommandPalette } from '@/contexts/navigation-context';
import { useTenant } from '@/contexts/tenant-context';
import { useAuth } from '@/contexts/auth-context';
import { usePersona } from '@/contexts/persona-context';
import { WORKSPACES, getWorkspaceRoutesForRole } from '@/lib/navigation/workspace-config';
import { getAccessibleWorkspaces } from '@/lib/navigation/role-workspaces';
import type { WorkspaceId, WorkspaceSection } from '@/types/navigation';
import type { UserRole } from '@/types/auth';
import type { PersonaKey } from '@/lib/design/tokens';

const WS_ICON: Record<WorkspaceId, string> = {
  decide: 'TrendingUp', calculate: 'Zap', 'platform-core': 'Settings', finance: 'Activity', 'data-operations': 'DatabaseZap', // OB-250
  revenue: 'LineChart', // OB-257
};

function Icon({ name, className }: { name?: string; className?: string }) {
  const Cmp = (name && (LucideIcons as Record<string, unknown>)[name]) as
    | React.ComponentType<{ className?: string }> | undefined;
  const Fallback = LucideIcons.Circle;
  const C = Cmp ?? Fallback;
  return <C className={className} />;
}

export function VialuceSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { activeWorkspace, navigateToWorkspace, isSpanish, effectiveRole } = useWorkspace();
  const { setOpen: setCommandPaletteOpen } = useCommandPalette();
  const { currentTenant } = useTenant();
  const { user, isVLAdmin } = useAuth();
  const { persona, setPersonaOverride } = usePersona();

  // OB-250: single two-gate composition (featureFlag enforced inside getAccessibleWorkspaces).
  const accessibleWorkspaces = useMemo(() => effectiveRole
    ? getAccessibleWorkspaces(effectiveRole as UserRole, (currentTenant?.features ?? {}) as Record<string, boolean>)
    : [], [effectiveRole, currentTenant?.features]);

  // HF-332: capability-gated sections (the single PDP, hasCapability) — replaces reading
  // WORKSPACES[].sections raw + roles-only itemVisible. This is what gates Plans & Canvas on
  // icm.configure_plans in the Vialuce rail (ChromeSidebar already used this helper). Reuses the
  // live entitlement signal the OB-228 route enforces; no new entitlement concept invented.
  const sections = useMemo<WorkspaceSection[]>(
    () => effectiveRole ? getWorkspaceRoutesForRole(activeWorkspace, effectiveRole as UserRole) : [],
    [activeWorkspace, effectiveRole],
  );

  // HF-313 Defect 3: the per-user theme toggle (was UserIdentity's, not rendered under Vialuce since
  // ChromeSidebar swaps in this sidebar). Same mechanism as UserIdentity: POST /api/user/theme -> cookie
  // + profiles.preferences -> reload. Lets a user override the Observatory default while in Vialuce.
  const [theme, setThemeState] = useState<AppTheme>('vialuce');
  const [themeSaving, setThemeSaving] = useState(false);
  // HF-314 §3.1: the theme toggle is a settings action, not persistent nav — reveal it behind the
  // user-profile chevron (collapsed by default; only persona + user info show until expanded).
  const [userExpanded, setUserExpanded] = useState(false);
  useEffect(() => {
    const attr = document.documentElement.getAttribute('data-theme');
    setThemeState(attr === 'bliss' ? 'bliss' : attr === 'current' ? 'current' : 'vialuce');
  }, []);
  const setTheme = async (next: AppTheme) => {
    if (next === theme || themeSaving) return;
    setThemeSaving(true);
    try {
      const res = await fetch('/api/user/theme', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: next }),
      });
      if (res.ok) window.location.reload();
      else setThemeSaving(false);
    } catch { setThemeSaving(false); }
  };

  const isItemActive = (path: string) => pathname === path || (path !== '/' && pathname?.startsWith(path + '/'));

  // Open the section that contains the active route by default; others collapsed.
  const [openSections, setOpenSections] = useState<Record<string, boolean> | null>(null);
  const sectionOpen = (sec: WorkspaceSection) => {
    if (openSections && sec.id in openSections) return openSections[sec.id];
    return sec.routes.some(it => isItemActive(it.path)); // default: open if it holds the active route
  };
  const toggleSection = (id: string) =>
    setOpenSections(prev => ({ ...(prev ?? {}), [id]: !(prev?.[id] ?? sections.find(s => s.id === id)?.routes.some(it => isItemActive(it.path)) ?? false) }));

  const initials = (user?.name ?? '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const PERSONAS: { key: PersonaKey; label: string }[] = [
    { key: 'admin' as PersonaKey, label: 'Admin' },
    { key: 'manager' as PersonaKey, label: isSpanish ? 'Gerente' : 'Manager' },
    { key: 'rep' as PersonaKey, label: isSpanish ? 'Rep' : 'Rep' },
  ];

  return (
    <aside className="sb" style={{ width: '100%', height: '100vh' }}>
      {/* Brand */}
      <div className="sb-brand" onClick={isVLAdmin ? () => router.push('/select-tenant') : undefined} style={isVLAdmin ? { cursor: 'pointer' } : undefined}>
        {/* HF-340: the Bliss diamond mark (geometry identical to ChromeSidebar's bliss branch),
            themed to Vialuce's own indigo/gold tokens. Same asset, reused; no new/duplicate file.
            HF-342: rendered at 40px (viewBox-native, was 32px) so the mark — which fills only ~64% of
            its viewBox — reads as a deliberate, well-sized lockup beside the wordmark. */}
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" className="shrink-0">
          <rect x="11" y="11" width="18" height="18" rx="1" transform="rotate(45 20 20)" stroke="var(--vialuce-indigo)" strokeWidth="1.25" />
          <rect x="15.5" y="15.5" width="9" height="9" rx="0.5" transform="rotate(45 20 20)" fill="var(--vialuce-indigo)" />
          <circle cx="20" cy="20" r="1.6" fill="var(--vialuce-gold)" />
        </svg>
        <div className="min-w-0">
          <b>Vialuce</b>
          <div className="sb-tenant">
            {currentTenant?.displayName || 'Platform'}
            {isVLAdmin && <ArrowLeftRight className="h-2.5 w-2.5" />}
          </div>
        </div>
      </div>

      {/* "← Observatory" back link — VL admin returns to the tenant picker (maps to the existing
          back-to-select-tenant link). Omitted for non-admins (no Observatory concept for them). */}
      {isVLAdmin && currentTenant && (
        <div className="sb-back" onClick={() => router.push('/select-tenant')}>
          <ArrowLeftRight className="h-3.5 w-3.5" /> {isSpanish ? 'Observatorio' : 'Observatory'}
        </div>
      )}

      <div className="sb-scroll">
        {/* HF-312: the gold Calculate CTA moved to VialuceTopbar (its design-spec home). Not
            duplicated here. */}

        {/* HF-332 — AGENTS: elevated wayfinding tiles (Wayfinder Layer 1). Each entitled agent is an
            elevated tile (icon + name + one-line descriptor from the config); the active agent carries
            the gold accent and reveals its children (capability-gated sections) below, subordinate to
            the tile. Below the container: a divider, then the restrained utility row. */}
        <div className="sb-lbl">{isSpanish ? 'AGENTES' : 'AGENTS'}</div>
        <div className="agents">
          {accessibleWorkspaces.map(wsId => {
            const ws = WORKSPACES[wsId];
            const active = wsId === activeWorkspace;
            return (
              <div key={wsId} className={cn('agent', active && 'on')}>
                <button className="agent-tile" onClick={() => navigateToWorkspace(wsId)} aria-current={active ? 'page' : undefined}>
                  <span className="agent-ic"><Icon name={WS_ICON[wsId]} className="h-4 w-4" /></span>
                  <span className="agent-text">
                    <b className="truncate">{isSpanish ? ws.labelEs : ws.label}</b>
                    <span className="agent-desc">{isSpanish ? ws.descriptionEs : ws.description}</span>
                  </span>
                </button>
                {active && sections.length > 0 && (
                  <div className="agent-children">
                    {sections.map(sec => {
                      // HF-319 Surface D: OB-226 absorbed /operate/lifecycle into the /operate cockpit
                      // (redirects under Vialuce); drop the redundant item here (Vialuce-scoped).
                      const items = sec.routes.filter(it => it.path !== '/operate/lifecycle');
                      if (items.length === 0) return null;
                      // HF-332: single-route section → a direct child link (no redundant header),
                      // matching ChromeSidebar's single-child behavior (e.g. Plans & Canvas under Calculate).
                      if (items.length === 1) {
                        const it = items[0];
                        return (
                          <div className="nav" key={sec.id}>
                            <a className={cn(isItemActive(it.path) && 'on')} onClick={() => router.push(it.path)}>
                              <Icon name={it.icon} className="h-4 w-4" />
                              <span className="truncate">{isSpanish ? (it.labelEs ?? it.label) : it.label}</span>
                            </a>
                          </div>
                        );
                      }
                      const open = sectionOpen(sec);
                      return (
                        <div key={sec.id}>
                          <div className={cn('sb-sec', items.some(it => isItemActive(it.path)) && 'active', open && 'open')} onClick={() => toggleSection(sec.id)}>
                            <span className="truncate">{isSpanish ? sec.labelEs : sec.label}</span>
                            <span className="meta">{items.length}<ChevronDown className="chev h-3.5 w-3.5" /></span>
                          </div>
                          <div className={cn('nav', !open && 'collapsed')}>
                            {items.map(it => (
                              <a key={it.path} className={cn(isItemActive(it.path) && 'on')} onClick={() => router.push(it.path)}>
                                <Icon name={it.icon} className="h-4 w-4" />
                                <span className="truncate">{isSpanish ? (it.labelEs ?? it.label) : it.label}</span>
                              </a>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Divider — separates the elevated AGENTS from the restrained utility row below */}
        <div className="sb-div" />

        {/* Search (⌘K) — utility */}
        <div className="sb-sec" onClick={() => setCommandPaletteOpen(true)}>
          <Command className="ti lead h-4 w-4" />
          <span>{isSpanish ? 'Buscar' : 'Search'}</span>
          <span className="meta">⌘K</span>
        </div>
      </div>

      {/* Footer: persona (docked) + user; theme toggle revealed behind the user chevron (HF-314 §3.1) */}
      <div className="sb-foot">
        {isVLAdmin && (
          <div className="persona">
            {PERSONAS.map(p => (
              <button key={p.key} className={cn(persona === p.key && 'on')} onClick={() => setPersonaOverride(p.key)}>{p.label}</button>
            ))}
          </div>
        )}
        {/* HF-314 §3.1: per-user theme override (Dark/Bliss/Vialuce) — revealed only when the user
            profile is expanded, not persistently visible. */}
        {userExpanded && (
          <div className="sb-theme" role="group" aria-label={isSpanish ? 'Tema' : 'Theme'}>
            <Palette className="h-3 w-3" />
            {THEME_ORDER.map(t => (
              <button
                key={t}
                className={cn(theme === t && 'on')}
                disabled={themeSaving}
                onClick={() => setTheme(t)}
              >
                {THEME_LABELS[t]}
              </button>
            ))}
          </div>
        )}
        <div
          className={cn('sb-user', userExpanded && 'open')}
          role="button"
          aria-expanded={userExpanded}
          onClick={() => setUserExpanded(v => !v)}
        >
          <div className="av">{initials}</div>
          <div className="min-w-0">
            <b className="truncate">{user?.name ?? 'User'}</b>
            <span>{isSpanish ? 'Sesión activa' : 'Active session'}</span>
          </div>
          <ChevronUp className="sb-user-chev h-4 w-4" />
        </div>
      </div>
    </aside>
  );
}

export default VialuceSidebar;
