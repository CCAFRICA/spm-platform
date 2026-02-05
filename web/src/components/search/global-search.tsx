'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, Building2, User, Receipt } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useTenant } from '@/contexts/tenant-context';
import { useDebounce } from '@/hooks/use-debounce';
import { getFranquicias, getMeseros, getCheques } from '@/lib/restaurant-service';
import Link from 'next/link';
import type { Franquicia, Mesero, Cheque } from '@/types/cheques';

interface SearchResult {
  id: string;
  type: 'franchise' | 'server' | 'check';
  title: string;
  subtitle: string;
  href: string;
}

export function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { currentTenant } = useTenant();
  const debouncedQuery = useDebounce(query, 300);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const performSearch = useCallback(async (q: string) => {
    if (!q || q.length < 2) {
      setResults([]);
      return;
    }

    setIsLoading(true);
    const searchResults: SearchResult[] = [];
    const lower = q.toLowerCase();

    try {
      if (currentTenant?.industry === 'Hospitality') {
        const [franquicias, meseros, cheques] = await Promise.all([
          getFranquicias(),
          getMeseros(),
          getCheques(),
        ]);

        // Search franchises
        franquicias
          .filter(
            (f: Franquicia) =>
              f.nombre.toLowerCase().includes(lower) ||
              f.numero_franquicia.toLowerCase().includes(lower) ||
              f.ciudad.toLowerCase().includes(lower)
          )
          .slice(0, 3)
          .forEach((f: Franquicia) =>
            searchResults.push({
              id: f.numero_franquicia,
              type: 'franchise',
              title: f.nombre,
              subtitle: `${f.ciudad} • ${f.tier}`,
              href: `/config/locations/${f.numero_franquicia}`,
            })
          );

        // Search servers
        meseros
          .filter((m: Mesero) => m.nombre.toLowerCase().includes(lower))
          .slice(0, 3)
          .forEach((m: Mesero) =>
            searchResults.push({
              id: String(m.mesero_id),
              type: 'server',
              title: m.nombre,
              subtitle: m.numero_franquicia,
              href: `/config/personnel/${m.mesero_id}`,
            })
          );

        // Search checks by number
        cheques
          .filter((c: Cheque) => c.numero_cheque.toString().includes(q))
          .slice(0, 3)
          .forEach((c: Cheque) =>
            searchResults.push({
              id: `${c.numero_franquicia}-${c.numero_cheque}`,
              type: 'check',
              title: `Cheque #${c.numero_cheque}`,
              subtitle: `${c.numero_franquicia} • $${c.total.toFixed(2)}`,
              href: `/transactions/${c.numero_cheque}`,
            })
          );
      }
    } catch (error) {
      console.error('Search error:', error);
    }

    setResults(searchResults);
    setIsLoading(false);
  }, [currentTenant]);

  useEffect(() => {
    performSearch(debouncedQuery);
  }, [debouncedQuery, performSearch]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard shortcut to focus search (Cmd/Ctrl + K)
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
      }
      if (event.key === 'Escape') {
        setIsOpen(false);
        inputRef.current?.blur();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const icons = {
    franchise: Building2,
    server: User,
    check: Receipt,
  };

  const typeLabels = {
    franchise: currentTenant?.locale === 'es-MX' ? 'Franquicia' : 'Franchise',
    server: currentTenant?.locale === 'es-MX' ? 'Mesero' : 'Server',
    check: currentTenant?.locale === 'es-MX' ? 'Cheque' : 'Check',
  };

  const placeholder =
    currentTenant?.locale === 'es-MX'
      ? 'Buscar franquicias, meseros, cheques...'
      : 'Search franchises, servers, checks...';

  const noResultsText =
    currentTenant?.locale === 'es-MX'
      ? 'No se encontraron resultados'
      : 'No results found';

  const handleClear = () => {
    setQuery('');
    setResults([]);
    inputRef.current?.focus();
  };

  const handleResultClick = () => {
    setIsOpen(false);
    setQuery('');
    setResults([]);
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-xl">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <Input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setIsOpen(true)}
        placeholder={placeholder}
        className="w-full pl-10 pr-10 bg-slate-50 border-slate-200 focus:bg-white dark:bg-slate-900 dark:border-slate-700"
      />
      {query && (
        <button
          onClick={handleClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      )}

      {/* Keyboard shortcut hint */}
      {!query && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 hidden md:flex items-center gap-1">
          <kbd className="px-1.5 py-0.5 text-xs font-medium bg-muted rounded border">
            ⌘K
          </kbd>
        </div>
      )}

      {/* Results dropdown */}
      {isOpen && query.length >= 2 && (
        <div className="absolute top-full mt-2 w-full bg-background border rounded-lg shadow-lg z-50 overflow-hidden">
          {isLoading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full mx-auto" />
            </div>
          ) : results.length > 0 ? (
            <div className="py-2">
              {results.map((result) => {
                const Icon = icons[result.type];
                return (
                  <Link
                    key={result.id}
                    href={result.href}
                    onClick={handleResultClick}
                    className="flex items-center gap-3 px-4 py-2 hover:bg-muted transition-colors"
                  >
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{result.title}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {result.subtitle}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                      {typeLabels[result.type]}
                    </span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="p-4 text-center text-sm text-muted-foreground">
              {noResultsText}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
