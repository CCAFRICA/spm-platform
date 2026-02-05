'use client';

import { useState } from 'react';
import { Building2, ChevronDown, Check, LogOut } from 'lucide-react';
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
  const { currentTenant, availableTenants, setTenant, isCCAdmin } = useTenant();
  const { logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  // Only show for CC Admin users
  if (!isCCAdmin) {
    return null;
  }

  const flags: Record<string, string> = {
    US: '🇺🇸',
    MX: '🇲🇽',
    GB: '🇬🇧',
    CA: '🇨🇦',
    FR: '🇫🇷',
    DE: '🇩🇪',
  };

  const handleTenantSelect = async (tenantId: string) => {
    setIsOpen(false);
    if (tenantId !== currentTenant?.id) {
      await setTenant(tenantId);
    }
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Building2 className="h-4 w-4" />
          <span className="hidden sm:inline max-w-[120px] truncate">
            {currentTenant?.displayName || 'Select Tenant'}
          </span>
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Switch Tenant</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {availableTenants.map((tenant) => (
          <DropdownMenuItem
            key={tenant.id}
            onClick={() => handleTenantSelect(tenant.id)}
            className="cursor-pointer"
          >
            <span className="flex items-center gap-2 flex-1">
              <span>{flags[tenant.country] || '🌐'}</span>
              <span className="truncate">{tenant.displayName}</span>
            </span>
            {currentTenant?.id === tenant.id && (
              <Check className="h-4 w-4 ml-auto text-primary" />
            )}
          </DropdownMenuItem>
        ))}
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
