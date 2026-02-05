# Session 2A - Phase 4: Authentication & Personas
## Duration: 1 hour

### Objective
Create authentication system with 4 demo personas showing role-based access.

---

## Task 4.1: Create Auth Context (25 min)

**File:** `src/contexts/auth-context.tsx`

```typescript
'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { audit } from '@/lib/audit-service';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'Sales Rep' | 'Manager' | 'VP' | 'Admin';
  region: string;
  team: string;
  managerId?: string;
  permissions: string[];
  dataAccessLevel: 'own' | 'team' | 'region' | 'all';
}

// Demo users
export const DEMO_USERS: User[] = [
  {
    id: 'user-sarah',
    name: 'Sarah Chen',
    email: 'sarah.chen@clearcomp.com',
    role: 'Sales Rep',
    region: 'West',
    team: 'West-Enterprise',
    managerId: 'user-mike',
    permissions: ['view_own_compensation', 'view_reports', 'submit_inquiry'],
    dataAccessLevel: 'own',
  },
  {
    id: 'user-mike',
    name: 'Mike Chen',
    email: 'mike.chen@clearcomp.com',
    role: 'Manager',
    region: 'West',
    team: 'West-Enterprise',
    managerId: 'user-lisa',
    permissions: [
      'view_own_compensation',
      'view_team_compensation',
      'view_reports',
      'submit_inquiry',
      'create_adjustment',
      'approve_adjustment_tier2',
    ],
    dataAccessLevel: 'team',
  },
  {
    id: 'user-lisa',
    name: 'Lisa Park',
    email: 'lisa.park@clearcomp.com',
    role: 'VP',
    region: 'West',
    team: 'West-Region',
    permissions: [
      'view_own_compensation',
      'view_team_compensation',
      'view_all_compensation',
      'view_reports',
      'submit_inquiry',
      'create_adjustment',
      'approve_adjustment_tier2',
      'approve_adjustment_tier3',
      'view_configuration',
    ],
    dataAccessLevel: 'region',
  },
  {
    id: 'user-admin',
    name: 'Admin User',
    email: 'admin@clearcomp.com',
    role: 'Admin',
    region: 'All',
    team: 'System',
    permissions: [
      'view_own_compensation',
      'view_team_compensation',
      'view_all_compensation',
      'view_reports',
      'submit_inquiry',
      'view_configuration',
      'edit_terminology',
      'manage_users',
      'view_audit_log',
      'import_transactions',
      'export_data',
    ],
    dataAccessLevel: 'all',
  },
];

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (userId: string) => void;
  logout: () => void;
  hasPermission: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for existing session
    const stored = localStorage.getItem('currentUser');
    if (stored) {
      try {
        const userData = JSON.parse(stored);
        const fullUser = DEMO_USERS.find((u) => u.id === userData.id);
        if (fullUser) {
          setUser(fullUser);
        }
      } catch {}
    }
    setIsLoading(false);
  }, []);

  const login = (userId: string) => {
    const selectedUser = DEMO_USERS.find((u) => u.id === userId);
    if (selectedUser) {
      setUser(selectedUser);
      localStorage.setItem('currentUser', JSON.stringify(selectedUser));

      audit.log({
        action: 'login',
        entityType: 'user',
        entityId: selectedUser.id,
        entityName: selectedUser.name,
        metadata: { role: selectedUser.role, region: selectedUser.region },
      });
    }
  };

  const logout = () => {
    if (user) {
      audit.log({
        action: 'logout',
        entityType: 'user',
        entityId: user.id,
        entityName: user.name,
      });
    }
    setUser(null);
    localStorage.removeItem('currentUser');
  };

  const hasPermission = (permission: string): boolean => {
    if (!user) return false;
    return user.permissions.includes(permission);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        hasPermission,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
```

---

## Task 4.2: Create Permissions Hook (10 min)

**File:** `src/hooks/use-permissions.ts`

```typescript
import { useAuth } from '@/contexts/auth-context';

export function usePermissions() {
  const { user, hasPermission } = useAuth();

  return {
    // Role checks
    isAdmin: user?.role === 'Admin',
    isVP: user?.role === 'VP',
    isManager: user?.role === 'Manager' || user?.role === 'VP',
    isRep: user?.role === 'Sales Rep',

    // Permission checks
    hasPermission,

    // Common shortcuts
    canViewTeam: hasPermission('view_team_compensation'),
    canViewAll: hasPermission('view_all_compensation'),
    canApprove: hasPermission('approve_adjustment_tier2') || hasPermission('approve_adjustment_tier3'),
    canEditConfig: hasPermission('edit_terminology'),
    canManageUsers: hasPermission('manage_users'),
    canViewAudit: hasPermission('view_audit_log'),

    // Data access level
    dataAccessLevel: user?.dataAccessLevel || 'own',
  };
}
```

---

## Task 4.3: Create Login Page (15 min)

**File:** `src/app/login/page.tsx`

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { User, Users, Building, Settings, Shield, Check } from 'lucide-react';
import { useAuth, DEMO_USERS } from '@/contexts/auth-context';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleLogin = () => {
    if (selectedId) {
      login(selectedId);
      router.push('/');
    }
  };

  const getRoleIcon = (role: string) => {
    const icons: Record<string, React.ReactNode> = {
      'Sales Rep': <User className="h-5 w-5" />,
      'Manager': <Users className="h-5 w-5" />,
      'VP': <Building className="h-5 w-5" />,
      'Admin': <Settings className="h-5 w-5" />,
    };
    return icons[role] || <User className="h-5 w-5" />;
  };

  const getRoleColor = (role: string) => {
    const colors: Record<string, string> = {
      'Sales Rep': 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
      'Manager': 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
      'VP': 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
      'Admin': 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
    };
    return colors[role] || 'bg-gray-100 text-gray-700';
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4">
      <div className="w-full max-w-2xl">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary text-primary-foreground mb-4">
            <Shield className="h-8 w-8" />
          </div>
          <h1 className="text-3xl font-bold">ClearComp</h1>
          <p className="text-muted-foreground">Sales Performance Management</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Select Demo User</CardTitle>
            <CardDescription>
              Choose a persona to explore different permission levels
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* User Selection */}
            <div className="grid gap-3">
              {DEMO_USERS.map((demoUser) => (
                <button
                  key={demoUser.id}
                  onClick={() => setSelectedId(demoUser.id)}
                  className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                    selectedId === demoUser.id
                      ? 'border-primary bg-primary/5'
                      : 'border-transparent bg-muted/50 hover:bg-muted'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`p-2 rounded-full ${getRoleColor(demoUser.role)}`}>
                      {getRoleIcon(demoUser.role)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-semibold truncate">{demoUser.name}</h3>
                        <Badge variant="outline">{demoUser.role}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {demoUser.email}
                      </p>
                      <div className="flex gap-2 mt-2 flex-wrap">
                        <Badge variant="secondary" className="text-xs">
                          {demoUser.region}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          {demoUser.dataAccessLevel} access
                        </Badge>
                      </div>
                    </div>
                    {selectedId === demoUser.id && (
                      <Check className="h-5 w-5 text-primary flex-shrink-0" />
                    )}
                  </div>
                </button>
              ))}
            </div>

            {/* Login Button */}
            <Button
              className="w-full"
              size="lg"
              onClick={handleLogin}
              disabled={!selectedId}
            >
              Continue as {DEMO_USERS.find((u) => u.id === selectedId)?.name || '...'}
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              Demo environment • Azure AD B2C in production
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

---

## Task 4.4: Create User Menu Component (10 min)

**File:** `src/components/layout/user-menu.tsx`

```typescript
'use client';

import { useRouter } from 'next/navigation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { LogOut, Settings, User, Shield } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { usePermissions } from '@/hooks/use-permissions';

export function UserMenu() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { isAdmin, canViewAudit } = usePermissions();

  if (!user) {
    return null;
  }

  const initials = user.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase();

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-full p-1 hover:bg-muted transition-colors">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary/10 text-primary text-sm">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="text-left hidden md:block">
            <p className="text-sm font-medium leading-none">{user.name}</p>
            <p className="text-xs text-muted-foreground">{user.role}</p>
          </div>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col">
            <span>{user.name}</span>
            <span className="text-xs font-normal text-muted-foreground">
              {user.email}
            </span>
            <Badge variant="outline" className="mt-1 w-fit text-xs">
              {user.role}
            </Badge>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem>
          <User className="mr-2 h-4 w-4" />
          Profile
        </DropdownMenuItem>

        {isAdmin && (
          <DropdownMenuItem onClick={() => router.push('/admin/settings')}>
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </DropdownMenuItem>
        )}

        {canViewAudit && (
          <DropdownMenuItem onClick={() => router.push('/admin/audit')}>
            <Shield className="mr-2 h-4 w-4" />
            Audit Log
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={handleLogout} className="text-red-600">
          <LogOut className="mr-2 h-4 w-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

---

## Task 4.5: Update Root Layout

Update `src/app/layout.tsx` to include the AuthProvider:

```typescript
import { AuthProvider } from '@/contexts/auth-context';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          {/* Your existing layout wrapper */}
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
```

---

## Task 4.6: Add User Menu to Navbar

Update your navbar component to include the UserMenu:

```typescript
import { UserMenu } from '@/components/layout/user-menu';

// In your navbar JSX, add:
<div className="flex items-center gap-4">
  {/* Other navbar items */}
  <UserMenu />
</div>
```

---

## Verification

After completing Phase 4:

```bash
npm run build
npm run dev
```

**Test:**
1. Navigate to `/login` → Page loads with 4 personas ✓
2. Select Sarah Chen → Click Continue ✓
3. Redirected to dashboard → See "Sarah Chen" in navbar ✓
4. Check audit log → Login event recorded ✓
5. Click user menu → See profile options ✓
6. Log out → Redirected to login ✓
7. Login as Admin → See additional menu items (Audit Log) ✓

**If all tests pass, proceed to Phase 5.**
