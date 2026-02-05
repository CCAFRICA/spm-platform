'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Users, ChevronRight, LogOut, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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

  // Load tenants directly if context doesn't have them (timing issue after login)
  useEffect(() => {
    async function loadTenants() {
      if (isCCAdmin && contextTenants.length === 0 && !loadingTenants) {
        setLoadingTenants(true);
        try {
          const registry = await import('@/data/tenants/index.json');
          setLocalTenants((registry.tenants || []) as TenantSummary[]);
        } catch (e) {
          console.error('Failed to load tenant registry:', e);
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
            <p className="text-muted-foreground">Choose a tenant to manage</p>
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
                      {selectingTenant === tenant.id ? (
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>

          {/* Empty State */}
          {availableTenants.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-12"
            >
              <p className="text-muted-foreground">No tenants available</p>
            </motion.div>
          )}
        </div>
      </main>
    </div>
  );
}
