'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Users, ChevronRight, LogOut, Loader2, Plus, Activity, Scale } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getStateLabel, getStateColor } from '@/lib/calculation/lifecycle-utils';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/auth-context';
import { useTenant } from '@/contexts/tenant-context';
import { containerVariants, itemVariants } from '@/lib/animations';

interface TenantCard {
  id: string;
  name: string;
  industry: string;
  country: string;
  status: string;
  entityCount: number;
  lifecycleState: string | null;
  lastActivity: string | null;
}

export default function SelectTenantPage() {
  const router = useRouter();
  const { user, isVLAdmin, logout, isLoading: authLoading } = useAuth();
  const { setTenant, isLoading: tenantLoading } = useTenant();
  const [selectingTenant, setSelectingTenant] = useState<string | null>(null);
  const [tenants, setTenants] = useState<TenantCard[]>([]);
  const [loading, setLoading] = useState(true);

  // Load tenants from Supabase ONLY
  useEffect(() => {
    if (!isVLAdmin || authLoading || tenantLoading) return;

    async function loadTenants() {
      setLoading(true);
      try {
        const supabase = createClient();

        // Fetch all tenants
        const { data: dbTenants, error } = await supabase
          .from('tenants')
          .select('id, name, slug, locale, currency, settings, features, created_at')
          .order('name');

        if (error || !dbTenants) {
          console.error('[SelectTenant] Failed to load tenants:', error);
          setTenants([]);
          setLoading(false);
          return;
        }

        // Build tenant cards with stats
        const cards: TenantCard[] = [];

        for (const t of dbTenants) {
          const settings = (t.settings || {}) as Record<string, unknown>;

          // Entity count
          const { count: entityCount } = await supabase
            .from('entities')
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', t.id);

          // Latest calc batch
          const { data: batches } = await supabase
            .from('calculation_batches')
            .select('lifecycle_state, created_at')
            .eq('tenant_id', t.id)
            .order('created_at', { ascending: false })
            .limit(1);

          cards.push({
            id: t.id,
            name: t.name,
            industry: (settings.industry as string) || 'Retail',
            country: (settings.country_code as string) || 'MX',
            status: 'active',
            entityCount: entityCount || 0,
            lifecycleState: batches?.[0]?.lifecycle_state || null,
            lastActivity: batches?.[0]?.created_at || t.created_at,
          });
        }

        setTenants(cards);
      } catch (err) {
        console.error('[SelectTenant] Error:', err);
        setTenants([]);
      } finally {
        setLoading(false);
      }
    }

    loadTenants();
  }, [isVLAdmin, authLoading, tenantLoading]);

  // Redirect guards
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
    } else if (!isVLAdmin) {
      router.push('/');
    }
  }, [isVLAdmin, user, router, authLoading]);

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
    Optical: '👓',
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

  if (authLoading || tenantLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isVLAdmin) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      {/* Header */}
      <header className="border-b bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-slate-700 to-sky-500 flex items-center justify-center">
              <span className="text-xl font-bold text-white">V</span>
            </div>
            <div>
              <h1 className="font-semibold">ViaLuce Platform</h1>
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
            <h2 className="text-3xl font-bold mb-2">Select Organization</h2>
            <p className="text-muted-foreground">Choose an organization to manage</p>
          </motion.div>

          {/* Tenant Cards */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid gap-4 md:grid-cols-2"
          >
            {tenants.map((tenant, index) => (
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
                            {tenant.name}
                            <span>{flags[tenant.country] || '🌐'}</span>
                          </CardTitle>
                          <CardDescription>{tenant.industry}</CardDescription>
                        </div>
                      </div>
                      <Badge
                        variant="default"
                        className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                      >
                        active
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Users className="h-3.5 w-3.5" /> {tenant.entityCount} entities
                          </span>
                          {tenant.lifecycleState && (
                            <Badge className={`text-[10px] px-1.5 py-0 ${getStateColor(tenant.lifecycleState)}`}>
                              <Scale className="h-2.5 w-2.5 mr-0.5" />
                              {getStateLabel(tenant.lifecycleState)}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {selectingTenant === tenant.id ? (
                            <Loader2 className="h-5 w-5 animate-spin text-primary" />
                          ) : (
                            <ChevronRight className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                      {tenant.lastActivity && (
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground/70">
                          <Activity className="h-3 w-3" />
                          Last activity: {new Date(tenant.lastActivity).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}

            {/* Create New Tenant Card */}
            <motion.div
              variants={itemVariants}
              custom={tenants.length}
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

          {/* Empty State */}
          {tenants.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-8"
            >
              <p className="text-muted-foreground mb-6">No tenants available yet</p>
            </motion.div>
          )}
        </div>
      </main>
    </div>
  );
}
