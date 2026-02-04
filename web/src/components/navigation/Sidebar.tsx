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
  Zap,
  LayoutDashboard,
  ChevronDown,
  ChevronRight,
  DollarSign,
} from "lucide-react";

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  children?: { name: string; href: string }[];
}

const navigation: NavItem[] = [
  {
    name: "Dashboard",
    href: "/",
    icon: LayoutDashboard,
  },
  {
    name: "Insights",
    href: "/insights",
    icon: BarChart3,
    children: [
      { name: "Overview", href: "/insights" },
      { name: "Compensation", href: "/insights/compensation" },
      { name: "Performance", href: "/insights/performance" },
      { name: "Trends", href: "/insights/trends" },
    ],
  },
  {
    name: "Transactions",
    href: "/transactions",
    icon: Receipt,
    children: [
      { name: "Overview", href: "/transactions" },
      { name: "Orders", href: "/transactions/orders" },
    ],
  },
  {
    name: "Performance",
    href: "/performance",
    icon: Target,
    children: [
      { name: "Overview", href: "/performance" },
      { name: "Plans", href: "/performance/plans" },
      { name: "Goals", href: "/performance/goals" },
    ],
  },
  {
    name: "Configuration",
    href: "/configuration",
    icon: Settings,
  },
  {
    name: "Data",
    href: "/data",
    icon: Database,
  },
  {
    name: "Acceleration",
    href: "/acceleration",
    icon: Zap,
  },
];

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ isOpen = true, onClose }: SidebarProps) {
  const pathname = usePathname();
  const [expandedItems, setExpandedItems] = useState<string[]>(["Insights", "Performance"]);

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
              ClearComp
            </span>
            <span className="text-[10px] text-slate-500 -mt-1">
              Sales Performance Management
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="space-y-1">
            {navigation.map((item) => {
              const isItemActive = isActive(item.href);
              const hasActiveChild = isChildActive(item);
              const isExpanded = expandedItems.includes(item.name);
              const showAsActive = isItemActive || hasActiveChild;

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
                          {item.children.map((child) => (
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
                Current Period
              </p>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">
                Active
              </span>
            </div>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">
              Q4 2024
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-500">
              Oct 1 - Dec 31
            </p>
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-slate-500">Progress</span>
                <span className="font-medium text-slate-700 dark:text-slate-300">85%</span>
              </div>
              <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden dark:bg-slate-700">
                <div
                  className="h-full bg-gradient-to-r from-navy-500 to-sky-500 rounded-full"
                  style={{ width: "85%" }}
                />
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
