'use client';

// OB-204 C.1 — /configure/users (admin, own tenant). Completes the OB-67 partial: the list is now
// server-endpoint-backed (CLT166-F10 fix), and every action routes through the Phase A single door.
import { RequireCapability } from '@/components/auth/RequireCapability';
import { UserAdminConsole } from '@/components/users/UserAdminConsole';

export default function UsersPage() {
  return (
    <RequireCapability capability="tenant.manage_users">
      <UserAdminConsole scope="tenant" />
    </RequireCapability>
  );
}
