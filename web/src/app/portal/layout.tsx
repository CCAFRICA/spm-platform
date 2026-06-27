'use client';

/**
 * /portal — the Customer Data Administrator's focused portal (DS-032 §6).
 *
 * Operator chrome is suppressed one level up in AuthShell (showShell=false for
 * /portal/*), so this layout owns the entire frame: a minimal header (brand +
 * sign out) and a bare main. NO sidebar, breadcrumb, persona switcher, command
 * palette, or workspace nav — the "no operator surface" invariant. Theme-aware
 * (shadcn semantic classes), so it renders under Vialuce / Dark / Bliss.
 */

import { LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  // Use the canonical logout (clears the session AND the vialuce-tenant-id cookie) —
  // not a second sign-out impl.
  const { logout } = useAuth();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold tracking-tight text-foreground">Vialuce</span>
            <span className="text-xs text-muted-foreground">· Data Delivery</span>
          </div>
          <button
            onClick={logout}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
