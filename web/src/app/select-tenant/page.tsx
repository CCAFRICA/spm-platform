'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Users, ChevronRight, LogOut, Loader2, Plus, Rocket, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/contexts/auth-context';
import { useTenant } from '@/contexts/tenant-context';
import { containerVariants, itemVariants } from '@/lib/animations';
import type { TenantSummary } from '@/types/tenant';

export default function SelectTenantPage() {
  const router = useRouter();
  const { user, isCCAdmin, logout, isLoading: authLoading } = useAuth();
  const { availableTenants: contextTenants, setTenant, isLoading: tenantLoading } = useTenant();
  const [selectingTenant, setSelectingTenant] = useState<string | null>(null);
  const [localTenants, setLocalTenants] = useState<TenantSummary[]>([]);
  const [loadingTenants, setLoadingTenants] = useState(false);
  const [deletingTenant, setDeletingTenant] = useState<TenantSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Static tenant IDs that cannot be deleted
  const STATIC_TENANT_IDS = ['retailco', 'restaurantmx', 'techcorp'];

  const isDynamicTenant = (tenantId: string) => !STATIC_TENANT_IDS.includes(tenantId);

  const handleDeleteTenant = async (tenant: TenantSummary, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click
    setDeletingTenant(tenant);
  };

  const confirmDeleteTenant = async () => {
    if (!deletingTenant) return;

    setIsDeleting(true);
    try {
      const tenantId = deletingTenant.id;

      // Remove from clearcomp_tenants array
      const tenantsJson = localStorage.getItem('clearcomp_tenants');
      if (tenantsJson) {
        const tenants = JSON.parse(tenantsJson);
        const filtered = tenants.filter((t: { id: string }) => t.id !== tenantId);
        localStorage.setItem('clearcomp_tenants', JSON.stringify(filtered));
      }

      // Remove from clearcomp_tenant_registry
      const registryJson = localStorage.getItem('clearcomp_tenant_registry');
      if (registryJson) {
        const registry = JSON.parse(registryJson);
        registry.tenants = (registry.tenants || []).filter((t: { id: string }) => t.id !== tenantId);
        registry.lastUpdated = new Date().toISOString();
        localStorage.setItem('clearcomp_tenant_registry', JSON.stringify(registry));
      }

      // Remove all tenant-specific data (clearcomp_tenant_data_${tenantId}_*)
      const prefix = `clearcomp_tenant_data_${tenantId}_`;
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) {
          keysToRemove.push(key);
        }
      }
      for (const key of keysToRemove) {
        localStorage.removeItem(key);
      }

      // Also remove any spm_ prefixed keys for this tenant
      const spmPrefix = `spm_${tenantId}_`;
      const spmKeysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(spmPrefix)) {
          spmKeysToRemove.push(key);
        }
      }
      for (const key of spmKeysToRemove) {
        localStorage.removeItem(key);
      }

      // Update local state
      setLocalTenants(prev => prev.filter(t => t.id !== tenantId));
    } catch (error) {
      console.error('Failed to delete tenant:', error);
    } finally {
      setIsDeleting(false);
      setDeletingTenant(null);
    }
  };

  // Load tenants directly if context doesn't have them (timing issue after login)
  useEffect(() => {
    async function loadTenants() {
      if (isCCAdmin && contextTenants.length === 0 && !loadingTenants) {
        setLoadingTenants(true);
        try {
          // Load static tenants from registry file
          const registry = await import('@/data/tenants/index.json');
          const staticTenants = (registry.tenants || []) as TenantSummary[];

          // Load dynamic tenants from localStorage
          let dynamicTenants: TenantSummary[] = [];
          try {
            const dynamicRegistry = localStorage.getItem('clearcomp_tenant_registry');
            if (dynamicRegistry) {
              const parsed = JSON.parse(dynamicRegistry);
              dynamicTenants = (parsed.tenants || []) as TenantSummary[];
            }
          } catch {
            // Ignore localStorage errors
          }

          // Merge, with dynamic tenants for IDs not in static
          const staticIds = new Set(staticTenants.map(t => t.id));
          const mergedTenants = [
            ...staticTenants,
            ...dynamicTenants.filter(t => !staticIds.has(t.id)),
          ];

          setLocalTenants(mergedTenants);
        } catch (e) {
          console.error('Failed to load tenant registry:', e);
          // Still try to load dynamic tenants if static fails
          try {
            const dynamicRegistry = localStorage.getItem('clearcomp_tenant_registry');
            if (dynamicRegistry) {
              const parsed = JSON.parse(dynamicRegistry);
              setLocalTenants((parsed.tenants || []) as TenantSummary[]);
            }
          } catch {
            // Ignore
          }
        } finally {
          setLoadingTenants(false);
        }
      }
    }
    loadTenants();
  }, [isCCAdmin, contextTenants.length, loadingTenants]);

  // Use context tenants if available, otherwise use locally loaded ones
  const availableTenants = contextTenants.length > 0 ? contextTenants : localTenants;

  useEffect(() => {
    // Redirect non-CC Admin users to home
    if (!authLoading && !isCCAdmin && user) {
      router.push('/');
    }
    // Redirect unauthenticated users to login
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [isCCAdmin, user, router, authLoading]);

  const handleSelectTenant = async (tenantId: string) => {
    setSelectingTenant(tenantId);
    try {
      await setTenant(tenantId);
    } catch (e) {
      console.error('Failed to select tenant:', e);
      setSelectingTenant(null);
    }
  };

  const icons: Record<string, string> = {
    Technology: '💻',
    Hospitality: '🍽️',
    Retail: '🛍️',
    Finance: '💰',
    Healthcare: '🏥',
    Manufacturing: '🏭',
    Other: '🏢',
  };

  const flags: Record<string, string> = {
    US: '🇺🇸',
    MX: '🇲🇽',
    GB: '🇬🇧',
    CA: '🇨🇦',
    FR: '🇫🇷',
    DE: '🇩🇪',
  };

  // Show loading state
  if (authLoading || tenantLoading || loadingTenants) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Don't render for non-CC Admin
  if (!isCCAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      {/* Header */}
      <header className="border-b bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-slate-700 to-sky-500 flex items-center justify-center">
              <span className="text-xl font-bold text-white">E</span>
            </div>
            <div>
              <h1 className="font-semibold">Entity B Platform</h1>
              <p className="text-xs text-muted-foreground">Administration Console</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium">{user?.name}</p>
              <p className="text-xs text-muted-foreground">Platform Administrator</p>
            </div>
            <Button variant="ghost" size="sm" onClick={logout}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          {/* Title */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-10"
          >
            <h2 className="text-3xl font-bold mb-2">Select Tenant</h2>
            <p className="text-muted-foreground">Choose a tenant to manage or start a new customer launch</p>
          </motion.div>

          {/* CC Admin Quick Actions */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-8"
          >
            <Link href="/admin/launch">
              <Card className="bg-gradient-to-r from-sky-500 to-indigo-600 text-white hover:from-sky-600 hover:to-indigo-700 transition-all cursor-pointer hover:shadow-xl">
                <CardContent className="py-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-full bg-white/20 flex items-center justify-center">
                        <Rocket className="h-6 w-6" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold">Customer Launch</h3>
                        <p className="text-white/80 text-sm">Start the O1→O8 onboarding flow for a new customer</p>
                      </div>
                    </div>
                    <ChevronRight className="h-6 w-6" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          </motion.div>

          {/* Tenant Cards */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid gap-4 md:grid-cols-2"
          >
            {availableTenants.map((tenant, index) => (
              <motion.div
                key={tenant.id}
                variants={itemVariants}
                custom={index}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Card
                  className={`cursor-pointer transition-all hover:shadow-lg hover:border-primary/50 ${
                    selectingTenant === tenant.id ? 'border-primary shadow-lg' : ''
                  }`}
                  onClick={() => handleSelectTenant(tenant.id)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-3">
                        <span className="text-3xl">{icons[tenant.industry] || '🏢'}</span>
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            {tenant.displayName}
                            <span>{flags[tenant.country] || '🌐'}</span>
                          </CardTitle>
                          <CardDescription>{tenant.industry}</CardDescription>
                        </div>
                      </div>
                      <Badge
                        variant={tenant.status === 'active' ? 'default' : 'secondary'}
                        className={
                          tenant.status === 'active'
                            ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100'
                            : ''
                        }
                      >
                        {tenant.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground flex items-center gap-1">
                        <Users className="h-4 w-4" /> {tenant.userCount} users
                      </span>
                      <div className="flex items-center gap-2">
                        {isDynamicTenant(tenant.id) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={(e) => handleDeleteTenant(tenant, e)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                        {selectingTenant === tenant.id ? (
                          <Loader2 className="h-5 w-5 animate-spin text-primary" />
                        ) : (
                          <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}

            {/* Create New Tenant Card */}
            <motion.div
              variants={itemVariants}
              custom={availableTenants.length}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Link href="/admin/tenants/new">
                <Card className="cursor-pointer transition-all hover:shadow-lg hover:border-primary/50 border-2 border-dashed border-muted-foreground/30 bg-muted/20 h-full min-h-[140px] flex flex-col justify-center">
                  <CardContent className="flex flex-col items-center justify-center py-8 text-center">
                    <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                      <Plus className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <h3 className="font-semibold text-foreground">Create New Tenant</h3>
                    <p className="text-sm text-muted-foreground mt-1">Provision a new customer environment</p>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>
          </motion.div>

          {/* Empty State - Still show Create New Tenant option */}
          {availableTenants.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-8"
            >
              <p className="text-muted-foreground mb-6">No tenants available yet</p>
              <Link href="/admin/tenants/new">
                <Card className="cursor-pointer transition-all hover:shadow-lg hover:border-primary/50 border-2 border-dashed border-muted-foreground/30 bg-muted/20 max-w-md mx-auto">
                  <CardContent className="flex flex-col items-center justify-center py-8 text-center">
                    <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                      <Plus className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <h3 className="font-semibold text-foreground">Create Your First Tenant</h3>
                    <p className="text-sm text-muted-foreground mt-1">Provision a new customer environment</p>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>
          )}
        </div>
      </main>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingTenant} onOpenChange={(open) => !open && setDeletingTenant(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Tenant</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Are you sure you want to delete <strong>{deletingTenant?.displayName}</strong>?
              </p>
              <p className="text-destructive font-medium">
                This will permanently remove this tenant and all associated data including users, plans, transactions, and calculations.
              </p>
              <p>This action cannot be undone.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteTenant}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Deleting...
                </>
              ) : (
                'Delete Tenant'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
