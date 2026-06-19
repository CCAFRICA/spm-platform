'use client';

/**
 * OB-221 Phase 1 — Vialuce Sidebar (deep-indigo rail).
 *
 * Rendered ONLY under data-theme="vialuce" (MissionControlRail returns this instead of the existing
 * rail; the else-branch is unchanged → Current/Bliss cannot regress). Maps the platform's REAL nav
 * (WORKSPACES config: workspace → sections → items) onto the design package's .sb vocabulary:
 *   .ws 2×2 workspace switcher → accessible workspaces (role + feature filtered)
 *   .sb-sec expandable groups   → the active workspace's sections
 *   .nav a sub-items            → section items (real routes), active = current path
 *   .persona (footer, docked)   → persona override (fixes the floating-over-content defect)
 *   .sb-user                    → authenticated user
 * Icons: lucide-react (the platform's icon lib; the design's Tabler `.ti` webfont is not installed —
 * documented substitution). Labels come from the i18n-bearing WORKSPACES config (label/labelEs),
 * not hardcoded English (Korean Test). No "← Observatory" back link — the platform has no
 * Observatory sidebar concept (omitted per architect guidance).
 */

import { useMemo, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import * as LucideIcons from 'lucide-react';
import { DollarSign, ArrowLeftRight, Command, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWorkspace, useCommandPalette } from '@/contexts/navigation-context';
import { useTenant } from '@/contexts/tenant-context';
import { useAuth } from '@/contexts/auth-context';
import { usePersona } from '@/contexts/persona-context';
import { WORKSPACES } from '@/lib/navigation/workspace-config';
import { getAccessibleWorkspaces } from '@/lib/navigation/role-workspaces';
import type { WorkspaceId, WorkspaceSection, WorkspaceRoute } from '@/types/navigation';
import type { UserRole } from '@/types/auth';
import type { TenantFeatures } from '@/types/tenant';
import type { PersonaKey } from '@/lib/design/tokens';

const WS_ICON: Record<WorkspaceId, string> = {
  decide: 'TrendingUp', calculate: 'Zap', 'platform-core': 'Settings', finance: 'Activity',
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

  const accessibleWorkspaces = useMemo(() => effectiveRole
    ? getAccessibleWorkspaces(effectiveRole as UserRole).filter(wsId => {
        const ws = WORKSPACES[wsId];
        if (!ws?.featureFlag) return true;
        const features = currentTenant?.features as TenantFeatures | undefined;
        return features?.[ws.featureFlag as keyof TenantFeatures] === true;
      })
    : [], [effectiveRole, currentTenant?.features]);

  const sections = useMemo<WorkspaceSection[]>(() => WORKSPACES[activeWorkspace]?.sections ?? [], [activeWorkspace]);

  const itemVisible = (it: WorkspaceRoute) => !it.roles || !effectiveRole || it.roles.includes(effectiveRole as UserRole);
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

  const calcAccessible = accessibleWorkspaces.includes('calculate');

  return (
    <aside className="sb" style={{ width: '100%', height: '100vh' }}>
      {/* Brand */}
      <div className="sb-brand" onClick={isVLAdmin ? () => router.push('/select-tenant') : undefined} style={isVLAdmin ? { cursor: 'pointer' } : undefined}>
        <div className="sb-logo"><DollarSign className="h-4 w-4" /></div>
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
        {/* Gold Calculate CTA — the platform's primary action gets signal treatment (topbar has no
            slot in this shell; relocated to the rail head). */}
        {calcAccessible && (
          <button className="btn-gold" style={{ width: '100%', justifyContent: 'center', marginBottom: 10 }} onClick={() => navigateToWorkspace('calculate')}>
            <Icon name="Zap" className="h-4 w-4" /> {isSpanish ? 'Calcular' : 'Calculate'}
          </button>
        )}

        {/* Workspace switcher (2×2) */}
        <div className="sb-lbl">{isSpanish ? 'Espacios' : 'Workspaces'}</div>
        <div className="ws">
          {accessibleWorkspaces.map(wsId => {
            const ws = WORKSPACES[wsId];
            return (
              <a key={wsId} className={cn(wsId === activeWorkspace && 'on')} onClick={() => navigateToWorkspace(wsId)}>
                <Icon name={WS_ICON[wsId]} className="h-4 w-4" />
                <span className="truncate">{isSpanish ? ws.labelEs : ws.label}</span>
              </a>
            );
          })}
        </div>

        {/* Active workspace sections → expandable groups + sub-items */}
        {sections.map(sec => {
          const items = sec.routes.filter(itemVisible);
          if (items.length === 0) return null;
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

        {/* Search (⌘K) */}
        <div className="sb-sec" onClick={() => setCommandPaletteOpen(true)} style={{ marginTop: 8 }}>
          <Command className="ti lead h-4 w-4" />
          <span>{isSpanish ? 'Buscar' : 'Search'}</span>
          <span className="meta">⌘K</span>
        </div>
      </div>

      {/* Footer: persona (docked — defect fix) + user */}
      <div className="sb-foot">
        {isVLAdmin && (
          <div className="persona">
            {PERSONAS.map(p => (
              <button key={p.key} className={cn(persona === p.key && 'on')} onClick={() => setPersonaOverride(p.key)}>{p.label}</button>
            ))}
          </div>
        )}
        <div className="sb-user">
          <div className="av">{initials}</div>
          <div className="min-w-0">
            <b className="truncate">{user?.name ?? 'User'}</b>
            <span>{isSpanish ? 'Sesión activa' : 'Active session'}</span>
          </div>
        </div>
      </div>
    </aside>
  );
}

export default VialuceSidebar;
