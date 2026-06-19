'use client';

// OB-204 C.1 — /configure/users (admin, own tenant). Completes the OB-67 partial: the list is now
// server-endpoint-backed (CLT166-F10 fix), and every action routes through the Phase A single door.
import { RequireCapability } from '@/components/auth/RequireCapability';
import { UserAdminConsole } from '@/components/users/UserAdminConsole';
import { useIsVialuce } from '@/hooks/use-is-vialuce';

export default function UsersPage() {
  // HF-313: Vialuce wraps the console in the .page frame (padding/max-width/center); else unchanged.
  // UserAdminConsole renders the header/content and gets color parity from globals.css remaps.
  const isVialuce = useIsVialuce();
  return (
    <RequireCapability capability="tenant.manage_users">
      {isVialuce ? (
        <div className="page">
          <UserAdminConsole scope="tenant" />
        </div>
      ) : (
        <UserAdminConsole scope="tenant" />
      )}
    </RequireCapability>
  );
}
