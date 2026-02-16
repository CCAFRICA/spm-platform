'use client';

import { Building2, ArrowLeftRight, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTenant } from '@/contexts/tenant-context';
import { useAuth } from '@/contexts/auth-context';

export function TenantSwitcher() {
  const router = useRouter();
  const { currentTenant, clearTenant, isVLAdmin } = useTenant();
  const { logout } = useAuth();

  // Only show for VL Admin users
  if (!isVLAdmin) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Building2 className="h-4 w-4" />
          <span className="hidden sm:inline max-w-[140px] truncate">
            {currentTenant?.displayName || 'Select Tenant'}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          {currentTenant?.displayName || 'No tenant selected'}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            clearTenant();
            router.push('/select-tenant');
          }}
          className="cursor-pointer"
        >
          <ArrowLeftRight className="h-4 w-4 mr-2" />
          Switch Organization
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={logout}
          className="cursor-pointer text-destructive focus:text-destructive"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
