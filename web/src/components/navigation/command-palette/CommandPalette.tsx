'use client';

/**
 * Command Palette Component
 *
 * Search and command overlay triggered by ⌘K / Ctrl+K.
 * Provides instant access to any page or action.
 */

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
// cn is available if needed for conditional classes
import { useCommandPalette, useNavigation } from '@/contexts/navigation-context';
import { useAuth } from '@/contexts/auth-context';
import { useTenant } from '@/contexts/tenant-context';
import type { UserRole } from '@/types/auth';
import type { CommandItem, CommandCategory } from '@/types/navigation';
import {
  getCommands,
  searchCommands,
  addRecentCommand,
  getRecentCommands,
  getRecentCommandItems,
} from '@/lib/navigation/command-registry';
import { logSearch, logCommandSelect } from '@/lib/navigation/navigation-signals';
import { WORKSPACES } from '@/lib/navigation/workspace-config';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem as CommandUIItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  Upload,
  Calculator,
  GitCompare,
  CheckCircle,
  Wallet,
  TrendingUp,
  Search,
  Palette,
  Settings,
  Shield,
  FileText,
  Users,
  Receipt,
  HelpCircle,
  History,
  Sparkles,
  Target,
  PlusCircle,
  ShieldCheck,
  LayoutDashboard,
  BarChart3,
  LineChart,
  PieChart,
  Edit,
  MapPin,
  Calendar,
  Plug,
  Download,
  Key,
  Route,
  FlaskConical,
  Copy,
  Network,
  FileSpreadsheet,
  FileDown,
  Languages,
  Trophy,
  User,
  Activity,
  Database,
  Sliders,
  Layers,
  RefreshCw,
  AlertTriangle,
  MessageCircle,
  ClipboardCheck,
  GitBranch,
  FileSearch,
  Table,
} from 'lucide-react';

// Icon mapping for command items
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Upload,
  Calculator,
  GitCompare,
  CheckCircle,
  Wallet,
  TrendingUp,
  Search,
  Palette,
  Settings,
  Shield,
  FileText,
  Users,
  Receipt,
  HelpCircle,
  History,
  Sparkles,
  Target,
  PlusCircle,
  ShieldCheck,
  LayoutDashboard,
  BarChart3,
  LineChart,
  PieChart,
  Edit,
  MapPin,
  Calendar,
  Plug,
  Download,
  Key,
  Route,
  FlaskConical,
  Copy,
  Network,
  FileSpreadsheet,
  FileDown,
  Languages,
  Trophy,
  User,
  Activity,
  Database,
  Sliders,
  Layers,
  RefreshCw,
  AlertTriangle,
  MessageCircle,
  ClipboardCheck,
  GitBranch,
  FileSearch,
  Table,
  Zap: TrendingUp,
};

export function CommandPalette() {
  const router = useRouter();
  const { isOpen, setOpen } = useCommandPalette();
  const { userRole } = useNavigation();
  const { user } = useAuth();
  const { currentTenant } = useTenant();

  const isSpanish = currentTenant?.locale === 'es-MX';
  const tenantId = currentTenant?.id || 'default';

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CommandItem[]>([]);
  const [recentItems, setRecentItems] = useState<CommandItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load all commands based on user role - memoized to prevent infinite loops
  const allCommands = useMemo(
    () => (userRole ? getCommands(userRole as UserRole, isSpanish) : []),
    [userRole, isSpanish]
  );

  // Load recent commands
  useEffect(() => {
    if (!user) return;
    const recentIds = getRecentCommands(user.id);
    const items = getRecentCommandItems(recentIds, allCommands);
    setRecentItems(items);
  }, [user, allCommands]);

  // Search commands when query changes
  useEffect(() => {
    if (query.trim()) {
      const searchResults = searchCommands(allCommands, query, 10);
      setResults(searchResults);
    } else {
      setResults([]);
    }
  }, [query, allCommands]);

  // Handle keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(!isOpen);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, setOpen]);

  // Focus input when opening
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      setQuery('');
    }
  }, [isOpen]);

  // Handle command selection
  const handleSelect = useCallback((command: CommandItem) => {
    // Log the selection
    if (user) {
      logCommandSelect(command.id, query || undefined, user.id, tenantId);
      addRecentCommand(user.id, command.id);

      // Log search if there was a query
      if (query.trim()) {
        logSearch(query, user.id, tenantId);
      }
    }

    // Navigate and close
    router.push(command.route);
    setOpen(false);
    setQuery('');
  }, [router, setOpen, user, query, tenantId]);

  // Get icon component for a command
  const getIcon = (iconName: string) => {
    const Icon = ICON_MAP[iconName] || FileText;
    return Icon;
  };

  // Group results by category
  const groupedResults: Record<CommandCategory, CommandItem[]> = {
    recent: recentItems,
    page: results.filter(r => r.category === 'page'),
    action: results.filter(r => r.category === 'action'),
    person: results.filter(r => r.category === 'person'),
  };

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0 shadow-lg max-w-2xl">
        <Command className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-4 [&_[cmdk-item]_svg]:w-4">
          <CommandInput
            ref={inputRef}
            placeholder={isSpanish ? 'Buscar páginas, acciones...' : 'Search pages, actions...'}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList className="max-h-[400px]">
            <CommandEmpty>
              {isSpanish ? 'No se encontraron resultados.' : 'No results found.'}
            </CommandEmpty>

            {/* Recent - show only when no query */}
            {!query.trim() && recentItems.length > 0 && (
              <CommandGroup heading={isSpanish ? 'Recientes' : 'Recent'}>
                {recentItems.slice(0, 3).map(item => {
                  const workspace = WORKSPACES[item.workspace];

                  return (
                    <CommandUIItem
                      key={item.id}
                      value={item.label}
                      onSelect={() => handleSelect(item)}
                      className="flex items-center gap-3"
                    >
                      <History className="h-4 w-4 text-muted-foreground" />
                      <div className="flex flex-col flex-1">
                        <span>{isSpanish ? item.labelEs : item.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {isSpanish ? workspace.labelEs : workspace.label}
                        </span>
                      </div>
                    </CommandUIItem>
                  );
                })}
              </CommandGroup>
            )}

            {/* Search Results - Actions */}
            {groupedResults.action.length > 0 && (
              <CommandGroup heading={isSpanish ? 'Acciones' : 'Actions'}>
                {groupedResults.action.map(item => {
                  return (
                    <CommandUIItem
                      key={item.id}
                      value={`${item.label} ${item.labelEs}`}
                      onSelect={() => handleSelect(item)}
                      className="flex items-center gap-3"
                    >
                      <Sparkles className="h-4 w-4 text-purple-500" />
                      <div className="flex flex-col flex-1">
                        <span>{isSpanish ? item.labelEs : item.label}</span>
                        {item.description && (
                          <span className="text-xs text-muted-foreground">
                            {isSpanish ? item.descriptionEs : item.description}
                          </span>
                        )}
                      </div>
                    </CommandUIItem>
                  );
                })}
              </CommandGroup>
            )}

            {/* Search Results - Pages */}
            {groupedResults.page.length > 0 && (
              <>
                {groupedResults.action.length > 0 && <CommandSeparator />}
                <CommandGroup heading={isSpanish ? 'Páginas' : 'Pages'}>
                  {groupedResults.page.map(item => {
                    const Icon = getIcon(item.icon);
                    const workspace = WORKSPACES[item.workspace];

                    return (
                      <CommandUIItem
                        key={item.id}
                        value={`${item.label} ${item.labelEs} ${item.keywords.join(' ')}`}
                        onSelect={() => handleSelect(item)}
                        className="flex items-center gap-3"
                      >
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <div className="flex flex-col flex-1">
                          <span>{isSpanish ? item.labelEs : item.label}</span>
                          <span className="text-xs text-muted-foreground">
                            {isSpanish ? workspace.labelEs : workspace.label} › {isSpanish ? item.descriptionEs : item.description}
                          </span>
                        </div>
                      </CommandUIItem>
                    );
                  })}
                </CommandGroup>
              </>
            )}

            {/* Suggestions when no query */}
            {!query.trim() && recentItems.length === 0 && (
              <CommandGroup heading={isSpanish ? 'Sugerencias' : 'Suggestions'}>
                <CommandUIItem
                  value="my compensation"
                  onSelect={() => router.push('/perform/compensation')}
                  className="flex items-center gap-3"
                >
                  <Wallet className="h-4 w-4 text-muted-foreground" />
                  <span>{isSpanish ? 'Ver Mi Compensación' : 'View My Compensation'}</span>
                </CommandUIItem>
                <CommandUIItem
                  value="transactions"
                  onSelect={() => router.push('/perform/transactions')}
                  className="flex items-center gap-3"
                >
                  <Receipt className="h-4 w-4 text-muted-foreground" />
                  <span>{isSpanish ? 'Mis Transacciones' : 'My Transactions'}</span>
                </CommandUIItem>
                {(userRole === 'admin' || userRole === 'vl_admin') && (
                  <CommandUIItem
                    value="import data"
                    onSelect={() => router.push('/operate/import/enhanced')}
                    className="flex items-center gap-3"
                  >
                    <Upload className="h-4 w-4 text-muted-foreground" />
                    <span>{isSpanish ? 'Importar Datos' : 'Import Data'}</span>
                  </CommandUIItem>
                )}
              </CommandGroup>
            )}
          </CommandList>

          {/* Footer with keyboard hints */}
          <div className="flex items-center border-t border-slate-100 px-3 py-2 text-xs text-slate-400">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1">
                <kbd className="rounded border bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono">↵</kbd>
                <span>{isSpanish ? 'seleccionar' : 'select'}</span>
              </div>
              <div className="flex items-center gap-1">
                <kbd className="rounded border bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono">↑↓</kbd>
                <span>{isSpanish ? 'navegar' : 'navigate'}</span>
              </div>
              <div className="flex items-center gap-1">
                <kbd className="rounded border bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono">esc</kbd>
                <span>{isSpanish ? 'cerrar' : 'close'}</span>
              </div>
            </div>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

export default CommandPalette;
