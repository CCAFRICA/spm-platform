"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DollarSign,
  TrendingUp,
  Trophy,
  Target,
  ArrowUpRight,
  ArrowRight,
  BarChart3,
  Receipt,
  Settings,
  Clock,
  CheckCircle2,
  Utensils,
  Users,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useTenant, useCurrency } from "@/contexts/tenant-context";
import { useLocale } from "@/contexts/locale-context";
import { isTenantUser } from "@/types/auth";
import { getCheques } from "@/lib/restaurant-service";
import {
  listCalculationBatches,
  getCalculationResults as getSupabaseResults,
} from "@/lib/supabase/calculation-service";
import type { Cheque } from "@/types/cheques";

const STATIC_TENANT_IDS = ['retailco', 'restaurantmx', 'techcorp'];
function isStaticTenant(tenantId: string | undefined | null): boolean {
  return !!tenantId && STATIC_TENANT_IDS.includes(tenantId);
}

// Mock dashboard data
const dashboardData = {
  stats: {
    ytdCompensation: 127450,
    mtdCompensation: 14700,
    quotaAttainment: 122.5,
    ranking: 1,
    rankingTotal: 40,
    pendingCommissions: 12000,
  },
  recentActivity: [
    {
      id: 1,
      type: "commission",
      description: "Outcome earned - Acme Corp deal",
      amount: 7500,
      date: "2024-12-15",
      status: "completed",
    },
    {
      id: 2,
      type: "bonus",
      description: "Q4 Accelerator Bonus",
      amount: 5000,
      date: "2024-12-14",
      status: "completed",
    },
    {
      id: 3,
      type: "commission",
      description: "Outcome - TechGiant Industries",
      amount: 2700,
      date: "2024-12-14",
      status: "processing",
    },
    {
      id: 4,
      type: "spif",
      description: "Product Launch SPIF",
      amount: 1500,
      date: "2024-12-12",
      status: "completed",
    },
  ],
  quickLinks: [
    {
      title: "View Insights",
      description: "Outcome & performance analytics",
      href: "/insights",
      icon: BarChart3,
      color: "bg-indigo-500",
    },
    {
      title: "Transactions",
      description: "View all your transactions",
      href: "/transactions",
      icon: Receipt,
      color: "bg-emerald-500",
    },
    {
      title: "Performance",
      description: "Goals and plan details",
      href: "/performance",
      icon: Target,
      color: "bg-amber-500",
    },
    {
      title: "Configuration",
      description: "Plan settings and rules",
      href: "/configuration",
      icon: Settings,
      color: "bg-slate-500",
    },
  ],
};

// Removed hardcoded formatCurrency function - use useCurrency().format instead

export default function DashboardPage() {
  const { user: authUser } = useAuth();
  const { currentTenant } = useTenant();
  const { format } = useCurrency();
  const { stats, recentActivity, quickLinks } = dashboardData;

  // Language follows the user's language selector preference
  const { locale } = useLocale();
  const isSpanish = locale === 'es-MX';
  const isHospitality = currentTenant?.industry === 'Hospitality';

  // Only show mock data for static tenants
  const hasMockData = isStaticTenant(currentTenant?.id);

  // Wire dynamic tenants to real calculation results from Supabase
  const [dynamicStats, setDynamicStats] = useState<typeof stats | null>(null);
  useEffect(() => {
    if (hasMockData || isHospitality || !currentTenant?.id) return;
    const loadResults = async () => {
      try {
        const batches = await listCalculationBatches(currentTenant.id);
        if (batches.length === 0) return;
        const batch = batches[0];
        const results = await getSupabaseResults(currentTenant.id, batch.id);
        if (!results.length) return;

        const userId = authUser?.email?.split('@')[0] || '';
        const myResult = results.find(r => r.entity_id === userId);
        const totalPayout = results.reduce((sum, r) => sum + (r.total_payout || 0), 0);

        if (myResult) {
          const sorted = [...results].sort((a, b) => (b.total_payout || 0) - (a.total_payout || 0));
          const rank = sorted.findIndex(r => r.entity_id === userId) + 1;
          setDynamicStats({
            ytdCompensation: myResult.total_payout || 0,
            mtdCompensation: myResult.total_payout || 0,
            quotaAttainment: 0,
            ranking: rank,
            rankingTotal: results.length,
            pendingCommissions: 0,
          });
        } else {
          const avgPayout = totalPayout / results.length;
          setDynamicStats({
            ytdCompensation: totalPayout,
            mtdCompensation: avgPayout,
            quotaAttainment: 0,
            ranking: 0,
            rankingTotal: results.length,
            pendingCommissions: 0,
          });
        }
      } catch (err) {
        console.warn('[Home] Failed to load results:', err);
      }
    };
    loadResults();
  }, [hasMockData, isHospitality, currentTenant?.id, authUser?.email]);

  // Use real data for dynamic tenants, mock for static
  const displayStats = dynamicStats || (hasMockData ? stats : {
    ytdCompensation: 0,
    mtdCompensation: 0,
    quotaAttainment: 0,
    ranking: 0,
    rankingTotal: 0,
    pendingCommissions: 0,
  });
  const displayActivity = hasMockData ? recentActivity : [];

  // Hospitality-specific data
  const [cheques, setCheques] = useState<Cheque[]>([]);

  // Get user's meseroId for hospitality filtering
  const userMeseroId = useMemo(() => {
    if (authUser && isTenantUser(authUser) && 'meseroId' in authUser) {
      return (authUser as { meseroId?: number }).meseroId;
    }
    return undefined;
  }, [authUser]);

  useEffect(() => {
    async function loadHospitalityData() {
      if (isHospitality) {
        try {
          const chequesData = await getCheques();
          setCheques(chequesData);
        } catch (error) {
          console.error('Error loading data:', error);
        }
      }
    }
    loadHospitalityData();
  }, [isHospitality]);

  // Calculate hospitality stats for this user
  const hospitalityStats = useMemo(() => {
    if (!isHospitality || !userMeseroId) return null;

    const myCheques = cheques.filter(c => c.mesero_id === userMeseroId);
    const paidCheques = myCheques.filter(c => c.pagado === 1);
    const pendingCheques = myCheques.filter(c => c.pagado === 0 && c.cancelado !== 1);

    const totalVentas = paidCheques.reduce((sum, c) => sum + c.subtotal, 0);
    const totalPropinas = paidCheques.reduce((sum, c) => sum + c.propina, 0);
    const totalPersonas = paidCheques.reduce((sum, c) => sum + c.numero_de_personas, 0);
    const avgTicket = paidCheques.length > 0 ? totalVentas / paidCheques.length : 0;

    return {
      totalCheques: myCheques.length,
      chequesPagados: paidCheques.length,
      chequesPendientes: pendingCheques.length,
      totalVentas,
      totalPropinas,
      totalPersonas,
      avgTicket,
      propinaRate: totalVentas > 0 ? (totalPropinas / totalVentas) * 100 : 0,
    };
  }, [isHospitality, userMeseroId, cheques]);

  // Recent cheques for hospitality user
  const recentCheques = useMemo(() => {
    if (!isHospitality || !userMeseroId) return [];
    return cheques
      .filter(c => c.mesero_id === userMeseroId)
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
      .slice(0, 4);
  }, [isHospitality, userMeseroId, cheques]);

  // Filter quick links by industry and role
  const filteredQuickLinks = useMemo(() => {
    const role = authUser?.role;

    if (isHospitality) {
      return [
        {
          title: isSpanish ? "Mis Cheques" : "My Checks",
          description: isSpanish ? "Ver todos tus cheques" : "View all your checks",
          href: "/transactions",
          icon: Receipt,
          color: "bg-emerald-500",
        },
        {
          title: isSpanish ? "Reportes" : "Reports",
          description: isSpanish ? "Análisis de ventas y propinas" : "Sales and tips analytics",
          href: "/insights",
          icon: BarChart3,
          color: "bg-indigo-500",
        },
      ];
    }

    // Scope by role
    if (role === 'sales_rep') {
      return [
        { title: isSpanish ? "Mi Compensacion" : "My Outcome", description: isSpanish ? "Ver tus resultados" : "View your results", href: "/perform", icon: BarChart3, color: "bg-indigo-500" },
        { title: isSpanish ? "Transacciones" : "Transactions", description: isSpanish ? "Ver tus transacciones" : "View your transactions", href: "/transactions", icon: Receipt, color: "bg-emerald-500" },
      ];
    }

    if (role === 'manager') {
      return [
        { title: isSpanish ? "Rendimiento del Equipo" : "Team Performance", description: isSpanish ? "Monitorear equipo" : "Monitor your team", href: "/perform", icon: Target, color: "bg-amber-500" },
        { title: isSpanish ? "Aprobaciones" : "Approvals", description: isSpanish ? "Pendientes de revision" : "Pending review", href: "/govern/calculation-approvals", icon: Settings, color: "bg-slate-500" },
        { title: isSpanish ? "Transacciones" : "Transactions", description: isSpanish ? "Ver transacciones" : "View transactions", href: "/transactions", icon: Receipt, color: "bg-emerald-500" },
      ];
    }

    // Admin / VL Admin - full access
    return quickLinks;
  }, [isHospitality, isSpanish, quickLinks, authUser?.role]);

  // Use logged-in user info, fallback to demo data
  const userName = authUser?.name || "User";
  const userRole = authUser?.role === 'admin'
    ? (isSpanish ? 'Administrador' : 'Administrator')
    : authUser?.role === 'manager'
      ? (isSpanish ? 'Gerente' : 'Manager')
      : (isSpanish ? 'Mesero' : 'Associate');
  const userInitials = userName.split(' ').map(n => n[0]).join('').toUpperCase();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="container mx-auto px-6 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-2">
            <Avatar className="h-12 w-12 border-2 border-white shadow-md">
              <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white text-lg">
                {userInitials}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
                {isSpanish ? `¡Bienvenido, ${userName.split(" ")[0]}!` : `Welcome back, ${userName.split(" ")[0]}!`}
              </h1>
              <p className="text-slate-600 dark:text-slate-400">
                {userRole}
              </p>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
          {isHospitality && hospitalityStats ? (
            <>
              {/* Total Ventas */}
              <Card className="border-0 shadow-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-white">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-indigo-100">
                        {isSpanish ? 'Total Ventas' : 'Total Sales'}
                      </p>
                      <p className="text-3xl font-bold mt-1">
                        {format(hospitalityStats.totalVentas)}
                      </p>
                      <p className="text-sm text-indigo-100 mt-2">
                        {hospitalityStats.chequesPagados} {isSpanish ? 'cheques pagados' : 'paid checks'}
                      </p>
                    </div>
                    <div className="p-3 bg-white/20 rounded-full">
                      <DollarSign className="h-6 w-6" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Total Propinas */}
              <Card className="border-0 shadow-lg">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-500">
                        {isSpanish ? 'Total Propinas' : 'Total Tips'}
                      </p>
                      <p className="text-3xl font-bold text-emerald-600 mt-1">
                        {format(hospitalityStats.totalPropinas)}
                      </p>
                      <Badge className="mt-2 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                        {hospitalityStats.propinaRate.toFixed(1)}% {isSpanish ? 'promedio' : 'average'}
                      </Badge>
                    </div>
                    <div className="p-3 bg-emerald-100 rounded-full dark:bg-emerald-900/30">
                      <TrendingUp className="h-6 w-6 text-emerald-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Clientes Atendidos */}
              <Card className="border-0 shadow-lg">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-500">
                        {isSpanish ? 'Clientes Atendidos' : 'Customers Served'}
                      </p>
                      <p className="text-3xl font-bold text-slate-900 dark:text-slate-50 mt-1">
                        {hospitalityStats.totalPersonas}
                      </p>
                      <p className="text-sm text-slate-500 mt-2">
                        {isSpanish ? 'personas' : 'people'}
                      </p>
                    </div>
                    <div className="p-3 bg-amber-100 rounded-full dark:bg-amber-900/30">
                      <Users className="h-6 w-6 text-amber-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Ticket Promedio */}
              <Card className="border-0 shadow-lg">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-500">
                        {isSpanish ? 'Ticket Promedio' : 'Average Ticket'}
                      </p>
                      <p className="text-3xl font-bold text-slate-900 dark:text-slate-50 mt-1">
                        {format(hospitalityStats.avgTicket)}
                      </p>
                      <p className="text-sm text-slate-500 mt-2">
                        {hospitalityStats.chequesPendientes} {isSpanish ? 'pendientes' : 'pending'}
                      </p>
                    </div>
                    <div className="p-3 bg-blue-100 rounded-full dark:bg-blue-900/30">
                      <Receipt className="h-6 w-6 text-blue-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <>
              {/* YTD Compensation */}
              <Card className="border-0 shadow-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-white">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-indigo-100">
                        YTD Outcome
                      </p>
                      <p className="text-3xl font-bold mt-1">
                        {format(displayStats.ytdCompensation)}
                      </p>
                      <div className="flex items-center gap-1 mt-2">
                        <ArrowUpRight className="h-4 w-4 text-emerald-300" />
                        <span className="text-sm text-indigo-100">
                          <span className="text-emerald-300 font-medium">+12.5%</span> vs last year
                        </span>
                      </div>
                    </div>
                    <div className="p-3 bg-white/20 rounded-full">
                      <DollarSign className="h-6 w-6" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Quota Attainment */}
              <Card className="border-0 shadow-lg">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-500">
                        Target Achievement
                      </p>
                      <p className="text-3xl font-bold text-slate-900 dark:text-slate-50 mt-1">
                        {displayStats.quotaAttainment}%
                      </p>
                      <Badge className="mt-2 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                        Exceeding
                      </Badge>
                    </div>
                    <div className="p-3 bg-emerald-100 rounded-full dark:bg-emerald-900/30">
                      <TrendingUp className="h-6 w-6 text-emerald-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Ranking */}
              <Card className="border-0 shadow-lg">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-500">
                        Team Ranking
                      </p>
                      <p className="text-3xl font-bold text-slate-900 dark:text-slate-50 mt-1">
                        #{displayStats.ranking}
                      </p>
                      <p className="text-sm text-slate-500 mt-2">
                        of {displayStats.rankingTotal} entities
                      </p>
                    </div>
                    <div className="p-3 bg-amber-100 rounded-full dark:bg-amber-900/30">
                      <Trophy className="h-6 w-6 text-amber-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Pending Commissions */}
              <Card className="border-0 shadow-lg">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-500">
                        Pending Outcomes
                      </p>
                      <p className="text-3xl font-bold text-slate-900 dark:text-slate-50 mt-1">
                        {format(displayStats.pendingCommissions)}
                      </p>
                      <p className="text-sm text-slate-500 mt-2">2 transactions</p>
                    </div>
                    <div className="p-3 bg-blue-100 rounded-full dark:bg-blue-900/30">
                      <Clock className="h-6 w-6 text-blue-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Main Content Grid */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Recent Activity */}
          <Card className="border-0 shadow-lg lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>{isHospitality ? (isSpanish ? 'Cheques Recientes' : 'Recent Checks') : 'Recent Activity'}</CardTitle>
                <CardDescription>
                  {isHospitality
                    ? (isSpanish ? 'Tus últimos cheques atendidos' : 'Your latest served checks')
                    : 'Your latest outcome events'}
                </CardDescription>
              </div>
              <Link href="/transactions">
                <Button variant="ghost" size="sm" className="gap-1">
                  {isSpanish ? 'Ver todos' : 'View all'}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {isHospitality && recentCheques.length > 0 ? (
                <div className="space-y-4">
                  {recentCheques.map((cheque) => (
                    <div
                      key={`${cheque.numero_franquicia}-${cheque.numero_cheque}`}
                      className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`p-2 rounded-full ${
                            cheque.pagado === 1
                              ? "bg-emerald-100 dark:bg-emerald-900/30"
                              : "bg-blue-100 dark:bg-blue-900/30"
                          }`}
                        >
                          {cheque.pagado === 1 ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <Clock className="h-4 w-4 text-blue-600" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-slate-900 dark:text-slate-50">
                            Cheque #{cheque.numero_cheque}
                          </p>
                          <p className="text-sm text-slate-500">
                            {new Date(cheque.fecha).toLocaleDateString(isSpanish ? 'es-MX' : 'en-US', {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })} • {cheque.numero_de_personas} {isSpanish ? 'personas' : 'guests'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-slate-900 dark:text-slate-50">
                          {format(cheque.total)}
                        </p>
                        <p className="text-sm text-emerald-600">
                          +{format(cheque.propina)} {isSpanish ? 'propina' : 'tip'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : isHospitality && recentCheques.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <Utensils className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>{isSpanish ? 'No hay cheques recientes' : 'No recent checks'}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {displayActivity.map((activity) => (
                    <div
                      key={activity.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`p-2 rounded-full ${
                            activity.status === "completed"
                              ? "bg-emerald-100 dark:bg-emerald-900/30"
                              : "bg-blue-100 dark:bg-blue-900/30"
                          }`}
                        >
                          {activity.status === "completed" ? (
                            <CheckCircle2
                              className={`h-4 w-4 ${
                                activity.status === "completed"
                                  ? "text-emerald-600"
                                  : "text-blue-600"
                              }`}
                            />
                          ) : (
                            <Clock className="h-4 w-4 text-blue-600" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-slate-900 dark:text-slate-50">
                            {activity.description}
                          </p>
                          <p className="text-sm text-slate-500">
                            {new Date(activity.date).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-slate-900 dark:text-slate-50">
                          +{format(activity.amount)}
                        </p>
                        <Badge
                          variant="secondary"
                          className={
                            activity.status === "completed"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-blue-100 text-blue-700"
                          }
                        >
                          {activity.status === "completed" ? "Paid" : "Processing"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Links */}
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle>{isSpanish ? 'Acciones Rápidas' : 'Quick Actions'}</CardTitle>
              <CardDescription>{isSpanish ? 'Navegar a secciones clave' : 'Navigate to key sections'}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {filteredQuickLinks.map((link) => (
                  <Link key={link.href} href={link.href}>
                    <div className="flex items-center gap-4 p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer group">
                      <div className={`p-2.5 rounded-lg ${link.color}`}>
                        <link.icon className="h-5 w-5 text-white" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-slate-900 dark:text-slate-50 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                          {link.title}
                        </p>
                        <p className="text-sm text-slate-500">{link.description}</p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors" />
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Performance Summary - only show for hospitality with data OR static tenants with mock data */}
        {isHospitality && hospitalityStats ? (
          <Card className="border-0 shadow-lg mt-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{isSpanish ? 'Resumen del Período' : 'Period Summary'}</CardTitle>
                  <CardDescription>{isSpanish ? 'Enero 2025' : 'January 2025'}</CardDescription>
                </div>
                <Link href="/transactions">
                  <Button variant="outline" size="sm" className="gap-1">
                    {isSpanish ? 'Ver Cheques' : 'View Checks'}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 md:grid-cols-4">
                <div className="text-center p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                  <p className="text-3xl font-bold text-slate-900 dark:text-slate-50">
                    {hospitalityStats.totalCheques}
                  </p>
                  <p className="text-sm text-slate-500 mt-1">{isSpanish ? 'Total Cheques' : 'Total Checks'}</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                  <p className="text-3xl font-bold text-slate-900 dark:text-slate-50">
                    {format(hospitalityStats.totalVentas + hospitalityStats.totalPropinas)}
                  </p>
                  <p className="text-sm text-slate-500 mt-1">{isSpanish ? 'Ingresos Totales' : 'Total Revenue'}</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                  <p className="text-3xl font-bold text-slate-900 dark:text-slate-50">
                    {format(hospitalityStats.avgTicket)}
                  </p>
                  <p className="text-sm text-slate-500 mt-1">{isSpanish ? 'Ticket Promedio' : 'Avg Ticket'}</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                  <p className="text-3xl font-bold text-emerald-600">
                    {hospitalityStats.propinaRate.toFixed(1)}%
                  </p>
                  <p className="text-sm text-slate-500 mt-1">{isSpanish ? 'Tasa de Propina' : 'Tip Rate'}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : hasMockData ? (
          <Card className="border-0 shadow-lg mt-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Q4 Performance Summary</CardTitle>
                  <CardDescription>October - December 2024</CardDescription>
                </div>
                <Link href="/performance">
                  <Button variant="outline" size="sm" className="gap-1">
                    View Details
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 md:grid-cols-4">
                <div className="text-center p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                  <p className="text-3xl font-bold text-slate-900 dark:text-slate-50">
                    {format(520000)}
                  </p>
                  <p className="text-sm text-slate-500 mt-1">Total Revenue</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                  <p className="text-3xl font-bold text-slate-900 dark:text-slate-50">18</p>
                  <p className="text-sm text-slate-500 mt-1">Deals Closed</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                  <p className="text-3xl font-bold text-slate-900 dark:text-slate-50">
                    {format(28889)}
                  </p>
                  <p className="text-sm text-slate-500 mt-1">Avg Deal Size</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                  <p className="text-3xl font-bold text-emerald-600">86.7%</p>
                  <p className="text-sm text-slate-500 mt-1">Goal Progress</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
