'use client';

/**
 * TopBar — Persona-aware top navigation bar
 *
 * Shows:
 *   - ViaLuce logo with persona accent gradient
 *   - Tenant name
 *   - Persona intent label (italic, subtle)
 *   - User avatar + name + role
 *
 * Created as standalone (OB-46A) — wired into layout in OB-46B.
 */

import { PERSONA_TOKENS, type PersonaKey } from '@/lib/design/tokens';

interface TopBarProps {
  persona?: PersonaKey;
  tenantName?: string;
  userName?: string;
  userRole?: string;
  avatarUrl?: string | null;
}

export function TopBar({
  persona = 'rep',
  tenantName = 'ViaLuce',
  userName = '',
  userRole = '',
  avatarUrl,
}: TopBarProps) {
  const tokens = PERSONA_TOKENS[persona];

  return (
    <header className="flex items-center justify-between px-6 py-3 border-b border-zinc-800/50 bg-zinc-950/60 backdrop-blur-sm">
      {/* Left: Logo + Tenant */}
      <div className="flex items-center gap-4">
        <span className={`text-lg font-bold bg-gradient-to-r ${tokens.accentGrad} bg-clip-text text-transparent`}>
          ViaLuce
        </span>
        {tenantName && tenantName !== 'ViaLuce' && (
          <>
            <div className="w-px h-5 bg-zinc-700" />
            <span className="text-sm text-zinc-400">{tenantName}</span>
          </>
        )}
        <span className={`text-xs italic ${tokens.heroTextMuted}`}>
          {tokens.intent}
        </span>
      </div>

      {/* Right: User info */}
      <div className="flex items-center gap-3">
        {userRole && (
          <span className="text-xs text-zinc-500">{userRole}</span>
        )}
        {userName && (
          <span className="text-sm text-zinc-300">{userName}</span>
        )}
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={userName || 'User'}
            className="w-7 h-7 rounded-full border border-zinc-700"
          />
        ) : userName ? (
          <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${tokens.accentGrad} flex items-center justify-center text-xs font-medium text-white`}>
            {userName.charAt(0).toUpperCase()}
          </div>
        ) : null}
      </div>
    </header>
  );
}
