"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import {
  BarChart3,
  Receipt,
  Target,
  Settings,
  Database,
  LayoutDashboard,
  ChevronDown,
  ChevronRight,
  DollarSign,
  Shield,
  Wallet,
  CheckSquare,
  RotateCcw,
  Activity,
} from "lucide-react";
import { useTenant, useTerm, useFeature } from "@/contexts/tenant-context";
import { useLocale } from "@/contexts/locale-context";
import { useAuth } from "@/contexts/auth-context";
import { isVLAdmin } from "@/types/auth";
import { accessControl, type AppModule } from "@/lib/access-control";
import { MODULE_TOKENS, type ModuleId } from "@/lib/design-system/tokens";
import { getPageStatus, type PageStatus } from "@/lib/navigation/page-status";
import { canAccessWorkspace } from "@/lib/auth/role-permissions";

interface NavChild {
  name: string;
  href: string;
  feature?: keyof import("@/types/tenant").TenantConfig["features"];
  module?: AppModule; // For access control
  vlAdminOnly?: boolean; // Only visible to VL Admin users
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  children?: NavChild[];
  feature?: keyof import("@/types/tenant").TenantConfig["features"];
  module?: AppModule; // For access control
  moduleId?: ModuleId; // For design system wayfinding
}

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ isOpen = true, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { currentTenant } = useTenant();
  const { user } = useAuth();
  const { locale } = useLocale();
  const transactionTerm = useTerm("transaction", true);
  const locationTerm = useTerm("location", true);
  const salesFinanceEnabled = useFeature("salesFinance");
  const financialEnabled = useFeature("financial");

  const [expandedItems, setExpandedItems] = useState<string[]>(["Insights", "Transactions"]);

  // Check if user is VL Admin
  const userIsVLAdmin = user && isVLAdmin(user);

  // Standing Rule 3: VL Admin always sees English, regardless of tenant locale.
  // Other users follow their language selector preference.
  const isSpanish = userIsVLAdmin ? false : locale === 'es-MX';

  // Get user's accessible modules
  const accessibleModules = accessControl.getAccessibleModules(user);

  // Calculate current period dynamically based on current date
  const currentPeriod = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const monthNames = isSpanish
      ? ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
      : ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const shortMonthNames = isSpanish
      ? ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
      : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const dayOfMonth = now.getDate();
    const progress = Math.round((dayOfMonth / daysInMonth) * 100);

    return {
      name: `${monthNames[month]} ${year}`,
      dateRange: `${shortMonthNames[month]} 1 - ${shortMonthNames[month]} ${daysInMonth}`,
      progress,
    };
  }, [isSpanish]);

  // Dynamic navigation based on tenant terminology and features
  const navigation: NavItem[] = [
    {
      name: isSpanish ? "Panel" : "Dashboard",
      href: "/",
      icon: LayoutDashboard,
      module: "dashboard",
      moduleId: "insights", // Dashboard uses insights styling
    },
    {
      name: isSpanish ? "Mi Compensación" : "My Compensation",
      href: "/my-compensation",
      icon: Wallet,
      module: "my_compensation",
      moduleId: "insights", // Part of insights family
    },
    {
      name: isSpanish ? "Análisis" : "Insights",
      href: "/insights",
      icon: BarChart3,
      module: "insights",
      moduleId: "insights",
      children: [
        { name: isSpanish ? "Resumen" : "Overview", href: "/insights", module: "insights" },
        { name: isSpanish ? "Compensación" : "Compensation", href: "/insights/compensation", module: "insights" },
        { name: isSpanish ? "Rendimiento" : "Performance", href: "/insights/performance", module: "insights" },
        { name: isSpanish ? "Análisis de Disputas" : "Dispute Analytics", href: "/insights/disputes", module: "insights" },
        { name: isSpanish ? "Finanzas" : "Sales Finance", href: "/insights/sales-finance", feature: "salesFinance", module: "insights" },
        { name: isSpanish ? "Tendencias" : "Trends", href: "/insights/trends", module: "insights" },
      ],
    },
    {
      name: transactionTerm || (isSpanish ? "Transacciones" : "Transactions"),
      href: "/transactions",
      icon: Receipt,
      module: "transactions",
      moduleId: "transactions",
      children: [
        { name: transactionTerm || (isSpanish ? "Cheques" : "Orders"), href: "/transactions", module: "transactions" },
        { name: isSpanish ? "Buscar Cheque" : "Find My Order", href: "/transactions/find", module: "transactions" },
        { name: isSpanish ? "Consultas" : "Inquiries", href: "/transactions/inquiries", module: "disputes" },
        { name: isSpanish ? "Cola de Disputas" : "Dispute Queue", href: "/transactions/disputes", module: "dispute_queue" },
      ],
    },
    {
      name: isSpanish ? "Rendimiento" : "Performance",
      href: "/performance",
      icon: Target,
      module: "performance",
      moduleId: "performance",
      children: [
        { name: isSpanish ? "Gestión de Planes" : "Plan Management", href: "/performance/plans", module: "plans" },
        { name: isSpanish ? "Modelado de Escenarios" : "Scenario Modeling", href: "/performance/scenarios", module: "scenarios" },
        { name: isSpanish ? "Metas" : "Goals", href: "/performance/goals", module: "performance" },
        { name: isSpanish ? "Ajustes" : "Adjustments", href: "/performance/adjustments", module: "approvals" },
        { name: isSpanish ? "Aprobaciones" : "Approvals", href: "/performance/approvals", module: "approvals" },
      ],
    },
    // Financial Module - only shown when financial feature is enabled
    ...(financialEnabled ? [{
      name: isSpanish ? "Finanzas" : "Financial",
      href: "/financial",
      icon: Activity,
      module: "insights" as AppModule,
      moduleId: "insights" as ModuleId,
      feature: "financial" as keyof import("@/types/tenant").TenantConfig["features"],
      children: [
        { name: isSpanish ? "Pulso de Red" : "Network Pulse", href: "/financial", feature: "financial" as keyof import("@/types/tenant").TenantConfig["features"] },
        { name: isSpanish ? "Cronología de Ingresos" : "Revenue Timeline", href: "/financial/timeline", feature: "financial" as keyof import("@/types/tenant").TenantConfig["features"] },
        { name: isSpanish ? "Benchmarks de Ubicación" : "Location Benchmarks", href: "/financial/performance", feature: "financial" as keyof import("@/types/tenant").TenantConfig["features"] },
        { name: isSpanish ? "Rendimiento de Personal" : "Staff Performance", href: "/financial/staff", feature: "financial" as keyof import("@/types/tenant").TenantConfig["features"] },
        { name: isSpanish ? "Monitor de Fugas" : "Leakage Monitor", href: "/financial/leakage", feature: "financial" as keyof import("@/types/tenant").TenantConfig["features"] },
      ],
    }] : []),
    {
      name: isSpanish ? "Configuración" : "Configuration",
      href: "/configuration",
      icon: Settings,
      module: "configuration",
      moduleId: "configuration",
      children: [
        { name: isSpanish ? "Resumen" : "Overview", href: "/configuration", module: "configuration" },
        { name: isSpanish ? "Personal" : "Personnel", href: "/configure/people", module: "personnel" },
        { name: isSpanish ? "Usuarios" : "Users", href: "/configure/users", module: "configuration" },
        { name: isSpanish ? "Equipos" : "Teams", href: "/configuration/teams", module: "teams" },
        { name: locationTerm || (isSpanish ? "Franquicias" : "Locations"), href: "/configuration/locations", module: "configuration" },
        { name: isSpanish ? "Terminología" : "Terminology", href: "/configuration/terminology", module: "configuration" },
      ],
    },
    {
      name: isSpanish ? "Datos" : "Data",
      href: "/data",
      icon: Database,
      module: "data_import",
      moduleId: "data",
      children: [
        { name: isSpanish ? "Importar" : "Import", href: "/data/import", module: "data_import" },
        { name: isSpanish ? "Importación Avanzada" : "Enhanced Import", href: "/data/import/enhanced", module: "data_import" },
        { name: isSpanish ? "Operaciones Diarias" : "Daily Operations", href: "/data/operations", module: "data_import" },
        { name: isSpanish ? "Preparación de Datos" : "Data Readiness", href: "/data/readiness", module: "data_import" },
        { name: isSpanish ? "Calidad de Datos" : "Data Quality", href: "/data/quality", module: "data_import" },
      ],
    },
    {
      name: isSpanish ? "Aprobaciones" : "Approvals",
      href: "/approvals",
      icon: CheckSquare,
      module: "approvals",
      moduleId: "approvals",
    },
    {
      name: isSpanish ? "Operaciones" : "Operations",
      href: "/operations",
      icon: RotateCcw,
      module: "data_import",
      moduleId: "operations",
      children: [
        { name: isSpanish ? "Reversión" : "Rollback", href: "/operations/rollback", module: "data_import" },
      ],
    },
    {
      name: isSpanish ? "Admin" : "Admin",
      href: "/admin",
      icon: Shield,
      module: "audit_log",
      moduleId: "admin",
      children: [
        { name: isSpanish ? "Registro de Auditoría" : "Audit Log", href: "/admin/audit", module: "audit_log" },
        { name: isSpanish ? "Nuevo Inquilino" : "New Tenant", href: "/admin/tenants/new", vlAdminOnly: true },
        { name: isSpanish ? "Lanzamiento de Cliente" : "Customer Launch", href: "/admin/launch", vlAdminOnly: true },
        { name: isSpanish ? "Importar Plan" : "Plan Import", href: "/admin/launch/plan-import", vlAdminOnly: true },
        { name: isSpanish ? "Ejecutar Cálculos" : "Run Calculations", href: "/admin/launch/calculate", vlAdminOnly: true },
        { name: isSpanish ? "Aprobaciones de Calculo" : "Calculation Approvals", href: "/govern/calculation-approvals", vlAdminOnly: true },
        { name: isSpanish ? "Reconciliacion" : "Reconciliation", href: "/investigate/reconciliation", vlAdminOnly: true },
      ],
    },
  ];

  const toggleExpand = (name: string) => {
    setExpandedItems((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  };

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const isChildActive = (item: NavItem) => {
    if (!item.children) return false;
    return item.children.some((child) => pathname === child.href);
  };

  // Filter children based on feature flags, access control, and VL Admin status
  const filterChildren = (children: NavChild[]) => {
    return children.filter((child) => {
      // Check VL Admin only items
      if (child.vlAdminOnly && !userIsVLAdmin) return false;
      // Check feature flags
      if (child.feature) {
        if (child.feature === "salesFinance" && !salesFinanceEnabled) return false;
        if (child.feature === "financial" && !financialEnabled) return false;
      }
      // Check module access (skip for VL Admin only items)
      if (!child.vlAdminOnly && child.module && !accessibleModules.includes(child.module)) return false;
      return true;
    });
  };

  // Filter top-level navigation items based on module access
  const filterNavigation = (items: NavItem[]) => {
    return items.filter((item) => {
      // Check module access
      if (item.module && !accessibleModules.includes(item.module)) return false;
      return true;
    });
  };

  const filteredNavigation = filterNavigation(navigation);

  // OB-67: Resolve page status with role override
  const resolveStatus = (href: string): PageStatus => {
    const userRole = user?.role || 'viewer';
    if (!canAccessWorkspace(userRole, href)) return 'restricted';
    return getPageStatus(href);
  };

  // OB-67: Render status indicator dot
  const StatusBadge = ({ href }: { href: string }) => {
    const status = resolveStatus(href);
    if (status === 'active') return null;
    if (status === 'preview') {
      return <span className="w-1.5 h-1.5 rounded-full bg-blue-400 ml-1.5 flex-shrink-0" title="Preview — demo data" />;
    }
    if (status === 'coming') {
      return <span className="w-1.5 h-1.5 rounded-full border border-slate-500 ml-1.5 flex-shrink-0" title="Coming soon" />;
    }
    if (status === 'restricted') {
      return (
        <svg className="w-3 h-3 text-slate-500 ml-1.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-label="Restricted">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      );
    }
    return null;
  };

  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-50 flex h-screen w-64 flex-col border-r border-slate-800 bg-slate-950 transition-transform duration-300 md:z-30 md:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center gap-2 px-6 border-b border-slate-200 dark:border-slate-800">
          {currentTenant?.logo ? (
            <img
              src={currentTenant.logo}
              alt={`${currentTenant.displayName} logo`}
              className="h-9 w-9 rounded-lg object-contain"
              onError={(e) => {
                // Fallback to default icon on image load error
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                const fallback = target.nextElementSibling as HTMLElement;
                if (fallback) fallback.style.display = 'flex';
              }}
            />
          ) : null}
          <div
            className={`h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-navy-600 to-sky-500 ${currentTenant?.logo ? 'hidden' : 'flex'}`}
            style={currentTenant?.primaryColor ? { background: currentTenant.primaryColor } : undefined}
          >
            <DollarSign className="h-5 w-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-bold text-slate-50">
              {currentTenant?.displayName || "Vialuce"}
            </span>
            <span className="-mt-1" style={{ color: '#94A3B8', fontSize: '13px' }}>
              {currentTenant?.industry || "Sales Performance"}
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="space-y-1">
            {filteredNavigation.map((item) => {
              const isItemActive = isActive(item.href);
              const hasActiveChild = isChildActive(item);
              const isExpanded = expandedItems.includes(item.name);
              const showAsActive = isItemActive || hasActiveChild;
              const filteredChildItems = item.children ? filterChildren(item.children) : [];

              // Get module accent color for wayfinding
              const moduleToken = item.moduleId ? MODULE_TOKENS[item.moduleId] : null;
              const accentColor = moduleToken?.accent || 'hsl(210, 70%, 50%)';
              const accentLight = moduleToken?.accentLight || 'hsl(210, 70%, 95%)';

              return (
                <div key={item.name} className="relative">
                  {/* Module accent bar for active section */}
                  {showAsActive && (
                    <div
                      className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full transition-all duration-200"
                      style={{ backgroundColor: accentColor }}
                    />
                  )}
                  {item.children && filteredChildItems.length > 1 ? (
                    <>
                      <button
                        onClick={() => toggleExpand(item.name)}
                        className={cn(
                          "flex w-full items-center justify-between rounded-lg px-3 py-2.5 font-medium transition-all",
                          !showAsActive && "hover:bg-slate-800/50"
                        )}
                        style={{
                          color: showAsActive ? '#F8FAFC' : '#CBD5E1',
                          fontSize: '14px',
                          ...(showAsActive ? { backgroundColor: accentLight } : {}),
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <item.icon
                            className="h-5 w-5 transition-colors"
                            style={{ color: showAsActive ? accentColor : undefined }}
                          />
                          {item.name}
                        </div>
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" style={{ color: '#94A3B8' }} />
                        ) : (
                          <ChevronRight className="h-4 w-4" style={{ color: '#94A3B8' }} />
                        )}
                      </button>
                      {isExpanded && (
                        <div
                          className="ml-4 mt-1 space-y-1 border-l-2 pl-4 transition-colors"
                          style={{ borderColor: showAsActive ? accentColor : undefined }}
                        >
                          {filteredChildItems.map((child) => (
                            <Link
                              key={child.href}
                              href={child.href}
                              className={cn(
                                "block rounded-md px-3 py-2 transition-all",
                                pathname !== child.href && "hover:bg-slate-800/50"
                              )}
                              style={{
                                fontSize: '13px',
                                fontWeight: pathname === child.href ? 500 : 400,
                                ...(pathname === child.href
                                  ? { backgroundColor: accentLight, color: moduleToken?.accentDark || accentColor }
                                  : { color: '#CBD5E1' }),
                              }}
                            >
                              <span className="flex items-center">
                                {child.name}
                                <StatusBadge href={child.href} />
                              </span>
                            </Link>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <Link
                      href={filteredChildItems.length === 1 ? filteredChildItems[0].href : item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 font-medium transition-all",
                        !isItemActive && "hover:bg-slate-800/50"
                      )}
                      style={{
                        fontSize: '14px',
                        color: isItemActive ? '#F8FAFC' : '#CBD5E1',
                        ...(isItemActive ? { backgroundColor: accentLight } : {}),
                      }}
                    >
                      <item.icon
                        className="h-5 w-5 transition-colors"
                        style={{ color: isItemActive ? accentColor : '#94A3B8' }}
                      />
                      {item.name}
                      <StatusBadge href={item.href} />
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </nav>

        <Separator />

        {/* Footer */}
        <div className="p-4">
          <div className="rounded-lg bg-gradient-to-br from-navy-50 to-sky-50 p-4 dark:from-navy-900/30 dark:to-sky-900/30">
            <div className="flex items-center justify-between mb-2">
              <p style={{ color: '#94A3B8', fontSize: '13px', fontWeight: 500 }}>
                {isSpanish ? "Período Actual" : "Current Period"}
              </p>
              <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium" style={{ fontSize: '13px' }}>
                {isSpanish ? "Activo" : "Active"}
              </span>
            </div>
            <p className="text-sm font-semibold text-slate-50">
              {currentPeriod.name}
            </p>
            <p style={{ color: '#94A3B8', fontSize: '13px' }}>
              {currentPeriod.dateRange}
            </p>
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs mb-1">
                <span style={{ color: '#94A3B8', fontSize: '13px' }}>{isSpanish ? "Progreso" : "Progress"}</span>
                <span style={{ color: '#CBD5E1', fontSize: '13px', fontWeight: 500 }}>{currentPeriod.progress}%</span>
              </div>
              <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden dark:bg-slate-700">
                <div
                  className="h-full bg-gradient-to-r from-navy-500 to-sky-500 rounded-full"
                  style={{ width: `${currentPeriod.progress}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
