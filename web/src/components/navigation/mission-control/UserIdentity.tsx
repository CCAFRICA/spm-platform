'use client';

/**
 * User Identity Component
 *
 * Shows user avatar, name, and role at the bottom of Mission Control.
 */

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useLocale } from '@/contexts/locale-context';
import { usePersona } from '@/contexts/persona-context';
import { getUserDisplayRole, isVLAdmin } from '@/types/auth';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LogOut, ChevronUp, Palette } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface UserIdentityProps {
  collapsed?: boolean;
}

export function UserIdentity({ collapsed = false }: UserIdentityProps) {
  const { user, logout } = useAuth();
  const { locale } = useLocale();
  const { persona } = usePersona();

  // HF-310: the per-user theme toggle belongs in THIS (the live bottom-left sidebar) menu —
  // HF-309 placed it in the top-bar menu, which is not the menu users open. The HF-309 mechanism
  // (POST /api/user/theme → cookie + profiles.preferences → reload) is unchanged.
  const [theme, setThemeState] = useState<'current' | 'bliss'>('current');
  const [themeSaving, setThemeSaving] = useState(false);
  useEffect(() => {
    const t = document.documentElement.getAttribute('data-theme') === 'bliss' ? 'bliss' : 'current';
    setThemeState(t);
    // sync vl-theme cookie (theme name only) so pre-auth surfaces (login) reflect it
    document.cookie = `vl-theme=${t}; Path=/; SameSite=Lax; Secure; Max-Age=31536000`;
  }, []);
  const setTheme = async (next: 'current' | 'bliss') => {
    if (next === theme || themeSaving) return;
    setThemeSaving(true);
    try {
      const res = await fetch('/api/user/theme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: next }),
      });
      if (res.ok) window.location.reload();
      else setThemeSaving(false);
    } catch {
      setThemeSaving(false);
    }
  };

  if (!user) return null;

  const userIsVLAdmin = isVLAdmin(user);
  const isSpanish = locale === 'es-MX';
  const baseRole = getUserDisplayRole(user);

  // HF-063D: Show active persona role when VL Admin has persona override
  const PERSONA_ROLE_LABELS: Record<string, string> = {
    admin: 'Admin',
    manager: isSpanish ? 'Gerente' : 'Manager',
    rep: isSpanish ? 'Representante' : 'Rep',
  };
  const displayRole = userIsVLAdmin && persona !== 'admin'
    ? `${PERSONA_ROLE_LABELS[persona]} (demo)`
    : baseRole;

  const initials = user.name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  // HF-310: theme toggle rendered directly in the dropdown (zero navigation steps).
  const themeToggle = (
    <div className="px-2 py-1.5">
      <div className="flex items-center gap-1.5 px-1 pb-1 text-xs text-muted-foreground">
        <Palette className="h-3.5 w-3.5" /> {isSpanish ? 'Tema' : 'Theme'}
      </div>
      <div className="inline-flex w-full rounded-md border border-border overflow-hidden text-xs">
        {(['current', 'bliss'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTheme(t)}
            disabled={themeSaving}
            className={`flex-1 px-2 py-1.5 transition-colors ${
              theme === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
            } ${themeSaving ? 'opacity-60 cursor-wait' : 'cursor-pointer'}`}
          >
            {t === 'current' ? 'Current' : 'Bliss'}
          </button>
        ))}
      </div>
    </div>
  );

  // Collapsed view
  if (collapsed) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center justify-center w-full py-3 hover:bg-zinc-800/50 transition-colors">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-zinc-700 text-zinc-200 text-xs font-medium">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="right" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col">
                    <span className="font-medium">{user.name}</span>
                    <span className="text-xs text-muted-foreground">{user.email}</span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {themeToggle}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} className="text-red-600">
                  <LogOut className="mr-2 h-4 w-4" />
                  {isSpanish ? 'Cerrar Sesión' : 'Sign Out'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </TooltipTrigger>
          <TooltipContent side="right">
            <div className="text-sm">
              <p className="font-medium">{user.name}</p>
              <p className="text-muted-foreground text-xs">{displayRole}</p>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Expanded view
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="w-full flex items-center gap-3 px-3 py-3 hover:bg-zinc-800/50 transition-colors rounded-lg">
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-zinc-700 text-zinc-200 text-sm font-medium">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-sm font-medium text-zinc-200 truncate">
              {user.name}
            </p>
            <p className="text-xs text-zinc-400 truncate">
              {displayRole}
            </p>
          </div>
          <ChevronUp className="h-4 w-4 text-zinc-400 shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col">
            <span className="font-medium">{user.name}</span>
            <span className="text-xs text-muted-foreground">{user.email}</span>
            {userIsVLAdmin && (
              <Badge variant="secondary" className="mt-1 w-fit text-xs">
                VL Admin
              </Badge>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {themeToggle}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={logout} className="text-red-600">
          <LogOut className="mr-2 h-4 w-4" />
          {isSpanish ? 'Cerrar Sesión' : 'Sign Out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
