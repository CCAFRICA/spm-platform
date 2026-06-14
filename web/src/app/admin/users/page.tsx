'use client';

// OB-204 C.2 — /admin/users (platform). All of C.1 across tenants + tenant selector + F8
// platform-user invitation. Middleware restricts /admin to the platform role; the console's
// platform scope drives cross-tenant listing and the platform-assignment path.
import { RequireCapability } from '@/components/auth/RequireCapability';
import { UserAdminConsole } from '@/components/users/UserAdminConsole';

export default function AdminUsersPage() {
  return (
    <RequireCapability capability="tenant.manage_users">
      <UserAdminConsole scope="platform" />
    </RequireCapability>
  );
}
