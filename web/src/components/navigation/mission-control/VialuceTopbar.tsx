'use client';

/**
 * HF-312 Phase 1 — Vialuce Topbar (.top bar).
 *
 * Rendered ONLY under data-theme="vialuce" (auth-shell renders this INSTEAD of <Navbar> for Vialuce;
 * the else-branch keeps <Navbar> unchanged → Dark/Bliss cannot regress). Sticky at the top of the
 * content column (position:sticky from the scoped .top CSS shipped in OB-221). Maps the design spec's
 * .top vocabulary onto real platform state:
 *   .crumb     → Tenant › Section › Page, derived from WORKSPACES + the current route (i18n labels)
 *   .btn-calc  → the gold Calculate CTA (MOVED here from VialuceSidebar per the design spec; the
 *                topbar is its home). Gated on calculate-workspace access.
 *   .top-search→ opens the existing command palette (⌘K) — functional, not a dead placeholder
 *   .top-right → help (presentational), alerts+ping (presentational), language (toggles locale),
 *                tenant pill (VL admin → tenant picker)
 * Icons: lucide-react (the design's Tabler `.ti` webfont is not installed — documented substitution).
 * Labels come from WORKSPACES (label/labelEs) and isSpanish — no new hardcoded English (Korean Test).
 */

import { useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  Zap, Search, HelpCircle, Bell, Globe, Landmark, ChevronDown, ChevronRight, Menu,
} from 'lucide-react';
import { useWorkspace, useCommandPalette } from '@/contexts/navigation-context';
import { useTenant } from '@/contexts/tenant-context';
import { useAuth } from '@/contexts/auth-context';
import { useLocale } from '@/contexts/locale-context';
import { WORKSPACES } from '@/lib/navigation/workspace-config';
import { getAccessibleWorkspaces } from '@/lib/navigation/role-workspaces';
import type { WorkspaceId } from '@/types/navigation';
import type { UserRole } from '@/types/auth';
import type { TenantFeatures } from '@/types/tenant';

interface VialuceTopbarProps {
  onMenuToggle?: () => void;
}

export function VialuceTopbar({ onMenuToggle }: VialuceTopbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { activeWorkspace, navigateToWorkspace, isSpanish, effectiveRole } = useWorkspace();
  const { setOpen: setCommandPaletteOpen } = useCommandPalette();
  const { currentTenant } = useTenant();
  const { isVLAdmin } = useAuth();
  const { locale, setLocale } = useLocale();

  // Breadcrumb: Tenant › Section › Page. Find the section + route in the active workspace whose
  // path matches the current route; labels come from the i18n-bearing WORKSPACES config.
  const crumb = useMemo(() => {
    const ws = WORKSPACES[activeWorkspace];
    const tenantName = currentTenant?.displayName || 'Platform';
    let sectionLabel = ws ? (isSpanish ? ws.labelEs : ws.label) : '';
    let pageLabel = '';
    for (const sec of ws?.sections ?? []) {
      const route = sec.routes.find(r => pathname === r.path || (r.path !== '/' && pathname?.startsWith(r.path + '/')));
      if (route) {
        sectionLabel = isSpanish ? sec.labelEs : sec.label;
        pageLabel = isSpanish ? (route.labelEs ?? route.label) : route.label;
        break;
      }
    }
    return { tenantName, sectionLabel, pageLabel };
  }, [activeWorkspace, currentTenant?.displayName, pathname, isSpanish]);

  const calcAccessible = useMemo(() => {
    if (!effectiveRole) return false;
    if (!getAccessibleWorkspaces(effectiveRole as UserRole).includes('calculate' as WorkspaceId)) return false;
    const ws = WORKSPACES['calculate' as WorkspaceId];
    if (!ws?.featureFlag) return true;
    const features = currentTenant?.features as TenantFeatures | undefined;
    return features?.[ws.featureFlag as keyof TenantFeatures] === true;
  }, [effectiveRole, currentTenant?.features]);

  return (
    <div className="top">
      {/* Mobile menu toggle — replaces Navbar's hamburger under Vialuce (hidden on desktop). */}
      {onMenuToggle && (
        <div className="top-icon md:hidden" onClick={onMenuToggle} role="button" aria-label={isSpanish ? 'Menú' : 'Menu'}>
          <Menu className="h-[18px] w-[18px]" />
        </div>
      )}

      {/* Breadcrumb */}
      <div className="crumb">
        <span>{crumb.tenantName}</span>
        {crumb.sectionLabel && <><ChevronRight className="h-3.5 w-3.5" /><span>{crumb.sectionLabel}</span></>}
        {crumb.pageLabel && <><ChevronRight className="h-3.5 w-3.5" /><b>{crumb.pageLabel}</b></>}
      </div>

      {/* Gold Calculate CTA — the platform's primary action (moved here from the sidebar). */}
      {calcAccessible && (
        <button className="btn-calc" onClick={() => navigateToWorkspace('calculate' as WorkspaceId)}>
          <Zap className="h-4 w-4" /> {isSpanish ? 'Calcular' : 'Calculate'}
        </button>
      )}

      {/* Search → command palette (⌘K) */}
      <div className="top-search" onClick={() => setCommandPaletteOpen(true)} role="button">
        <Search className="h-4 w-4" />
        {isSpanish ? 'Buscar páginas, personas, acciones…' : 'Search pages, people, actions…'}
        <kbd>⌘K</kbd>
      </div>

      <div className="top-right">
        {/* Help — presentational (no help route wired; documented residual) */}
        <div className="top-icon" role="button" aria-label={isSpanish ? 'Ayuda' : 'Help'}>
          <HelpCircle className="h-[18px] w-[18px]" />
        </div>
        {/* Alerts — presentational with ping (no alerts surface wired here; documented residual) */}
        <div className="top-icon" role="button" aria-label={isSpanish ? 'Alertas' : 'Alerts'}>
          <Bell className="h-[18px] w-[18px]" />
          <span className="ping" />
        </div>
        {/* Language — toggles en-US ↔ es-MX */}
        <div
          className="top-pill"
          role="button"
          onClick={() => setLocale(locale === 'es-MX' ? 'en-US' : 'es-MX')}
          aria-label={isSpanish ? 'Idioma' : 'Language'}
        >
          <Globe className="h-3.5 w-3.5" /> {locale === 'es-MX' ? 'ES' : 'EN'}
        </div>
        {/* Tenant pill — VL admin returns to the tenant picker */}
        <div
          className="top-pill"
          role="button"
          onClick={isVLAdmin ? () => router.push('/select-tenant') : undefined}
          style={isVLAdmin ? undefined : { cursor: 'default' }}
        >
          <Landmark className="h-3.5 w-3.5" /> {currentTenant?.displayName || 'Platform'}
          {isVLAdmin && <ChevronDown className="h-3.5 w-3.5" />}
        </div>
      </div>
    </div>
  );
}

export default VialuceTopbar;
