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
} from "lucide-react";
import { useTenant, useTerm, useFeature } from "@/contexts/tenant-context";
import { useLocale } from "@/contexts/locale-context";
import { useAuth } from "@/contexts/auth-context";
import { isCCAdmin } from "@/types/auth";
import { accessControl, type AppModule } from "@/lib/access-control";
import { MODULE_TOKENS, type ModuleId } from "@/lib/design-system/tokens";

interface NavChild {
  name: string;
  href: string;
  feature?: keyof import("@/types/tenant").TenantConfig["features"];
  module?: AppModule; // For access control
  ccAdminOnly?: boolean; // Only visible to CC Admin users
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
  useLocale(); // Initialize locale context
  const transactionTerm = useTerm("transaction", true);
  const locationTerm = useTerm("location", true);
  const salesFinanceEnabled = useFeature("salesFinance");

  const [expandedItems, setExpandedItems] = useState<string[]>(["Insights", "Transactions"]);

  // Check if user is CC Admin
  const userIsCCAdmin = user && isCCAdmin(user);

  // Language follows the LOGGED-IN USER's context, not the tenant's setting
  // CC Admin always sees English; tenant users see their tenant's locale
  const isSpanish = userIsCCAdmin ? false : currentTenant?.locale === 'es-MX';

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
    {
      name: isSpanish ? "Configuración" : "Configuration",
      href: "/configuration",
      icon: Settings,
      module: "configuration",
      moduleId: "configuration",
      children: [
        { name: isSpanish ? "Resumen" : "Overview", href: "/configuration", module: "configuration" },
        { name: isSpanish ? "Personal" : "Personnel", href: "/configuration/personnel", module: "personnel" },
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
        { name: isSpanish ? "Nuevo Inquilino" : "New Tenant", href: "/admin/tenants/new", ccAdminOnly: true },
        { name: isSpanish ? "Lanzamiento de Cliente" : "Customer Launch", href: "/admin/launch", ccAdminOnly: true },
        { name: isSpanish ? "Importar Plan" : "Plan Import", href: "/admin/launch/plan-import", ccAdminOnly: true },
        { name: isSpanish ? "Ejecutar Cálculos" : "Run Calculations", href: "/admin/launch/calculate", ccAdminOnly: true },
        { name: isSpanish ? "Reconciliación" : "Reconciliation", href: "/admin/launch/reconciliation", ccAdminOnly: true },
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

  // Filter children based on feature flags, access control, and CC Admin status
  const filterChildren = (children: NavChild[]) => {
    return children.filter((child) => {
      // Check CC Admin only items
      if (child.ccAdminOnly && !userIsCCAdmin) return false;
      // Check feature flag
      if (child.feature) {
        if (child.feature === "salesFinance" && !salesFinanceEnabled) return false;
      }
      // Check module access (skip for CC Admin only items)
      if (!child.ccAdminOnly && child.module && !accessibleModules.includes(child.module)) return false;
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
          "fixed left-0 top-0 z-50 flex h-screen w-64 flex-col border-r border-slate-200 bg-white transition-transform duration-300 dark:border-slate-800 dark:bg-slate-950 md:z-30 md:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center gap-2 px-6 border-b border-slate-200 dark:border-slate-800">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-navy-600 to-sky-500">
            <DollarSign className="h-5 w-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-bold text-slate-900 dark:text-slate-50">
              Entity B
            </span>
            <span className="text-[10px] text-slate-500 -mt-1">
              {currentTenant?.displayName || "Sales Performance"}
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
                  {item.children ? (
                    <>
                      <button
                        onClick={() => toggleExpand(item.name)}
                        className={cn(
                          "flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                          showAsActive
                            ? "text-slate-900 dark:text-slate-50"
                            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-50"
                        )}
                        style={showAsActive ? { backgroundColor: accentLight } : undefined}
                      >
                        <div className="flex items-center gap-3">
                          <item.icon
                            className="h-5 w-5 transition-colors"
                            style={{ color: showAsActive ? accentColor : undefined }}
                          />
                          {item.name}
                        </div>
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-slate-400" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-slate-400" />
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
                                "block rounded-md px-3 py-2 text-sm transition-all",
                                pathname === child.href
                                  ? "font-medium"
                                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-300"
                              )}
                              style={
                                pathname === child.href
                                  ? { backgroundColor: accentLight, color: moduleToken?.accentDark || accentColor }
                                  : undefined
                              }
                            >
                              {child.name}
                            </Link>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                        isItemActive
                          ? "text-slate-900 dark:text-slate-50"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-50"
                      )}
                      style={isItemActive ? { backgroundColor: accentLight } : undefined}
                    >
                      <item.icon
                        className="h-5 w-5 transition-colors"
                        style={{ color: isItemActive ? accentColor : undefined }}
                      />
                      {item.name}
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
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
                {isSpanish ? "Período Actual" : "Current Period"}
              </p>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">
                {isSpanish ? "Activo" : "Active"}
              </span>
            </div>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">
              {currentPeriod.name}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-500">
              {currentPeriod.dateRange}
            </p>
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-slate-500">{isSpanish ? "Progreso" : "Progress"}</span>
                <span className="font-medium text-slate-700 dark:text-slate-300">{currentPeriod.progress}%</span>
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
