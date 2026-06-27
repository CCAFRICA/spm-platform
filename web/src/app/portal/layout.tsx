'use client';

/**
 * /portal — the Customer Data Administrator's focused portal (DS-032 §6).
 *
 * Operator chrome is suppressed one level up in AuthShell (showShell=false for
 * /portal/*), so this layout owns the entire frame: a branded header (the
 * production Vialuce mark + the signed-in account + sign out) and a bare main.
 * NO sidebar, breadcrumb, persona switcher, command palette, or workspace nav —
 * the "no operator surface" invariant. Account identity is real (the session);
 * brand reuses the production mark. Theme-aware (Vialuce / Dark / Bliss).
 */

import { LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { VialuceMark } from '@/components/brand/VialuceMark';

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  // Canonical logout (clears the session AND the vialuce-tenant-id cookie).
  const { user, logout } = useAuth();
  const email = user?.email ?? '';
  // Real initials: first letter of the first two name tokens (surrogate-safe), else email.
  const name = (user?.name ?? '').trim();
  const initials =
    (name
      ? name
          .split(/\s+/)
          .slice(0, 2)
          .map((part) => Array.from(part)[0] ?? '')
          .join('')
      : Array.from(email)[0] ?? '?'
    ).toUpperCase() || '?';

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <VialuceMark size={28} />
            <span className="text-base font-semibold tracking-tight text-foreground">Vialuce</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {email && (
              <div className="flex items-center gap-2" title={email}>
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
                  {initials}
                </span>
                <span className="hidden max-w-[180px] truncate text-sm text-muted-foreground sm:inline">{email}</span>
              </div>
            )}
            <button
              onClick={logout}
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
