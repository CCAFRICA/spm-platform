'use client';

/**
 * User Identity Component
 *
 * Shows user avatar, name, and role at the bottom of Mission Control.
 */

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
import { LogOut, Settings, User, ChevronUp } from 'lucide-react';
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
                <DropdownMenuItem>
                  <User className="mr-2 h-4 w-4" />
                  {isSpanish ? 'Mi Perfil' : 'My Profile'}
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Settings className="mr-2 h-4 w-4" />
                  {isSpanish ? 'Configuración' : 'Settings'}
                </DropdownMenuItem>
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
        <DropdownMenuItem>
          <User className="mr-2 h-4 w-4" />
          {isSpanish ? 'Mi Perfil' : 'My Profile'}
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Settings className="mr-2 h-4 w-4" />
          {isSpanish ? 'Configuración' : 'Settings'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={logout} className="text-red-600">
          <LogOut className="mr-2 h-4 w-4" />
          {isSpanish ? 'Cerrar Sesión' : 'Sign Out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
