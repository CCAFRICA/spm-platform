'use client';

import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
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
import { LogOut, Settings, User, Shield, ChevronDown } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { usePermissions } from '@/hooks/use-permissions';
import { isCCAdmin, isTenantUser } from '@/types/auth';

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
    toast.success('Logged out', {
      description: 'See you next time!'
    });
    router.push('/login');
  };

  const getRoleColor = (role: string) => {
    const colors: Record<string, string> = {
      'vl_admin': 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
      'admin': 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
      'manager': 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
      'sales_rep': 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    };
    return colors[role] || 'bg-gray-100 text-gray-700';
  };

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      'vl_admin': 'Platform Admin',
      'admin': 'Admin',
      'manager': 'Manager',
      'sales_rep': 'Sales Rep',
    };
    return labels[role] || role;
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="flex items-center gap-2 rounded-full p-1 pr-2 hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          <Avatar className="h-8 w-8">
            <AvatarFallback className={`text-sm font-medium ${getRoleColor(user.role)}`}>
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="text-left hidden md:block">
            <p className="text-sm font-medium leading-none">{user.name}</p>
            <p className="text-xs text-muted-foreground">{getRoleLabel(user.role)}</p>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground hidden md:block" />
        </motion.button>
      </DropdownMenuTrigger>

      <AnimatePresence>
        <DropdownMenuContent align="end" className="w-56">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <DropdownMenuLabel>
              <div className="flex flex-col gap-1">
                <span className="font-semibold">{user.name}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {user.email}
                </span>
                <div className="flex gap-1 mt-1">
                  <Badge variant="outline" className="w-fit text-xs">
                    {isCCAdmin(user) ? 'Platform Admin' : user.role}
                  </Badge>
                  {isTenantUser(user) && user.regionId && (
                    <Badge variant="secondary" className="w-fit text-xs">
                      {user.regionId}
                    </Badge>
                  )}
                </div>
              </div>
            </DropdownMenuLabel>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              className="cursor-pointer"
              onClick={() => toast.info('Profile page coming soon!')}
            >
              <User className="mr-2 h-4 w-4" />
              Profile
            </DropdownMenuItem>

            {isAdmin && (
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={() => router.push('/configuration')}
              >
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </DropdownMenuItem>
            )}

            {canViewAudit && (
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={() => router.push('/admin/audit')}
              >
                <Shield className="mr-2 h-4 w-4" />
                Audit Log
              </DropdownMenuItem>
            )}

            <DropdownMenuSeparator />

            <DropdownMenuItem
              onClick={handleLogout}
              className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </motion.div>
        </DropdownMenuContent>
      </AnimatePresence>
    </DropdownMenu>
  );
}
