"use client";

import { useState } from "react";
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
} from "lucide-react";
import { useTenant, useTerm, useFeature } from "@/contexts/tenant-context";
import { useLocale } from "@/contexts/locale-context";
import { useAuth } from "@/contexts/auth-context";
import { accessControl, type AppModule } from "@/lib/access-control";

interface NavChild {
  name: string;
  href: string;
  feature?: keyof import("@/types/tenant").TenantConfig["features"];
  module?: AppModule; // For access control
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  children?: NavChild[];
  feature?: keyof import("@/types/tenant").TenantConfig["features"];
  module?: AppModule; // For access control
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

  const isSpanish = currentTenant?.locale === 'es-MX';

  // Get user's accessible modules
  const accessibleModules = accessControl.getAccessibleModules(user);

  // Dynamic navigation based on tenant terminology and features
  const navigation: NavItem[] = [
    {
      name: isSpanish ? "Panel" : "Dashboard",
      href: "/",
      icon: LayoutDashboard,
      module: "dashboard",
    },
    {
      name: isSpanish ? "Mi Compensación" : "My Compensation",
      href: "/my-compensation",
      icon: Wallet,
      module: "my_compensation",
    },
    {
      name: isSpanish ? "Análisis" : "Insights",
      href: "/insights",
      icon: BarChart3,
      module: "insights",
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
      children: [
        { name: isSpanish ? "Importar" : "Import", href: "/data/import", module: "data_import" },
        { name: isSpanish ? "Operaciones Diarias" : "Daily Operations", href: "/data/operations", module: "data_import" },
        { name: isSpanish ? "Preparación de Datos" : "Data Readiness", href: "/data/readiness", module: "data_import" },
        { name: isSpanish ? "Calidad de Datos" : "Data Quality", href: "/data/quality", module: "data_import" },
      ],
    },
    {
      name: isSpanish ? "Admin" : "Admin",
      href: "/admin",
      icon: Shield,
      module: "audit_log",
      children: [
        { name: isSpanish ? "Registro de Auditoría" : "Audit Log", href: "/admin/audit", module: "audit_log" },
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

  // Filter children based on feature flags and access control
  const filterChildren = (children: NavChild[]) => {
    return children.filter((child) => {
      // Check feature flag
      if (child.feature) {
        if (child.feature === "salesFinance" && !salesFinanceEnabled) return false;
      }
      // Check module access
      if (child.module && !accessibleModules.includes(child.module)) return false;
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

              return (
                <div key={item.name}>
                  {item.children ? (
                    <>
                      <button
                        onClick={() => toggleExpand(item.name)}
                        className={cn(
                          "flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                          showAsActive
                            ? "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-50"
                            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-50"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <item.icon
                            className={cn(
                              "h-5 w-5",
                              showAsActive
                                ? "text-navy-600 dark:text-sky-400"
                                : "text-slate-400 dark:text-slate-500"
                            )}
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
                        <div className="ml-4 mt-1 space-y-1 border-l-2 border-slate-200 pl-4 dark:border-slate-700">
                          {filteredChildItems.map((child) => (
                            <Link
                              key={child.href}
                              href={child.href}
                              className={cn(
                                "block rounded-md px-3 py-2 text-sm transition-all",
                                pathname === child.href
                                  ? "bg-navy-50 text-navy-700 font-medium dark:bg-navy-900/30 dark:text-sky-400"
                                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-300"
                              )}
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
                          ? "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-50"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-50"
                      )}
                    >
                      <item.icon
                        className={cn(
                          "h-5 w-5",
                          isItemActive
                            ? "text-navy-600 dark:text-sky-400"
                            : "text-slate-400 dark:text-slate-500"
                        )}
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
              {isSpanish ? "Enero 2025" : "January 2025"}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-500">
              {isSpanish ? "1 Ene - 31 Ene" : "Jan 1 - Jan 31"}
            </p>
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-slate-500">{isSpanish ? "Progreso" : "Progress"}</span>
                <span className="font-medium text-slate-700 dark:text-slate-300">90%</span>
              </div>
              <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden dark:bg-slate-700">
                <div
                  className="h-full bg-gradient-to-r from-navy-500 to-sky-500 rounded-full"
                  style={{ width: "90%" }}
                />
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
