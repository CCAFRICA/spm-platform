'use client';

/**
 * Global Search Dialog Component
 *
 * Command palette style search with categories and recent searches.
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Search,
  Clock,
  TrendingUp,
  Receipt,
  Users,
  FileText,
  AlertTriangle,
  BarChart2,
  Settings,
  ArrowRight,
  X,
  Command,
} from 'lucide-react';
import type { SearchResult, SearchCategory } from '@/types/search';
import { SEARCH_CATEGORIES } from '@/types/search';
import {
  globalSearch,
  getRecentSearches,
  addRecentSearch,
  getSearchSuggestions,
} from '@/lib/search/search-service';
import { useLocale } from '@/contexts/locale-context';
import { useAuth } from '@/contexts/auth-context';

interface GlobalSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ICON_MAP: Record<string, React.ElementType> = {
  Search,
  Receipt,
  Users,
  User: Users,
  FileText,
  AlertTriangle,
  BarChart2,
  Settings,
};

export function GlobalSearchDialog({ open, onOpenChange }: GlobalSearchDialogProps) {
  const { locale } = useLocale();
  const { user } = useAuth();
  const router = useRouter();
  const isSpanish = locale === 'es-MX';
  const userId = user?.id || 'demo-user';

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<SearchCategory>('all');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [suggestions, setSuggestions] = useState<ReturnType<typeof getSearchSuggestions>>([]);
  const [recentSearches, setRecentSearches] = useState<ReturnType<typeof getRecentSearches>>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (open) {
      setRecentSearches(getRecentSearches(userId));
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
    }
  }, [open, userId]);

  useEffect(() => {
    if (query.trim()) {
      setIsSearching(true);
      const timer = setTimeout(() => {
        const searchResults = globalSearch({ text: query, category });
        setResults(searchResults);
        setSuggestions(getSearchSuggestions(userId, query, category));
        setIsSearching(false);
        setSelectedIndex(0);
      }, 150);
      return () => clearTimeout(timer);
    } else {
      setResults([]);
      setSuggestions([]);
    }
  }, [query, category, userId]);

  const handleSelect = useCallback((result: SearchResult) => {
    addRecentSearch(userId, query, category, results.length);
    onOpenChange(false);
    router.push(result.route);
  }, [userId, query, category, results.length, onOpenChange, router]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const items = results.length > 0 ? results : recentSearches.map((r) => ({
      id: r.id,
      route: '',
      title: r.query,
    }));

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && results.length > 0) {
      e.preventDefault();
      handleSelect(results[selectedIndex]);
    } else if (e.key === 'Escape') {
      onOpenChange(false);
    }
  }, [results, recentSearches, selectedIndex, handleSelect, onOpenChange]);

  const getCategoryIcon = (cat: SearchCategory) => {
    const iconName = SEARCH_CATEGORIES[cat]?.icon || 'Search';
    return ICON_MAP[iconName] || Search;
  };

  const getResultIcon = (result: SearchResult) => {
    return ICON_MAP[result.icon] || Search;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] p-0 gap-0 overflow-hidden">
        {/* Search Input */}
        <div className="flex items-center border-b px-4 py-3">
          <Search className="h-5 w-5 text-muted-foreground mr-3" />
          <Input
            placeholder={isSpanish ? 'Buscar en toda la plataforma...' : 'Search across the platform...'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="border-0 focus-visible:ring-0 text-base"
            autoFocus
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1 hover:bg-muted rounded"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Category Filters */}
        <div className="flex items-center gap-2 px-4 py-2 border-b overflow-x-auto">
          {(Object.keys(SEARCH_CATEGORIES) as SearchCategory[]).map((cat) => {
            const config = SEARCH_CATEGORIES[cat];
            const Icon = getCategoryIcon(cat);
            return (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
                  category === cat
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted hover:bg-muted/80'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {isSpanish ? config.nameEs : config.name}
              </button>
            );
          })}
        </div>

        {/* Results */}
        <ScrollArea className="max-h-[400px]">
          {/* Search Results */}
          {results.length > 0 ? (
            <div className="py-2">
              <p className="px-4 py-2 text-xs text-muted-foreground uppercase">
                {isSpanish ? 'Resultados' : 'Results'} ({results.length})
              </p>
              {results.map((result, index) => {
                const Icon = getResultIcon(result);
                return (
                  <button
                    key={result.id}
                    onClick={() => handleSelect(result)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted transition-colors ${
                      index === selectedIndex ? 'bg-muted' : ''
                    }`}
                  >
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">
                        {isSpanish ? result.titleEs : result.title}
                      </p>
                      {result.subtitle && (
                        <p className="text-sm text-muted-foreground truncate">
                          {isSpanish ? result.subtitleEs : result.subtitle}
                        </p>
                      )}
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {isSpanish
                        ? SEARCH_CATEGORIES[result.type].nameEs
                        : SEARCH_CATEGORIES[result.type].name}
                    </Badge>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                );
              })}
            </div>
          ) : query && !isSearching ? (
            <div className="py-12 text-center text-muted-foreground">
              <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{isSpanish ? 'No se encontraron resultados' : 'No results found'}</p>
              <p className="text-sm">
                {isSpanish ? 'Intente con otros términos' : 'Try different search terms'}
              </p>
            </div>
          ) : !query ? (
            <>
              {/* Suggestions */}
              {suggestions.length > 0 && (
                <div className="py-2">
                  <p className="px-4 py-2 text-xs text-muted-foreground uppercase">
                    {isSpanish ? 'Sugerencias' : 'Suggestions'}
                  </p>
                  {suggestions.map((suggestion, index) => (
                    <button
                      key={index}
                      onClick={() => setQuery(suggestion.text)}
                      className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-muted"
                    >
                      {suggestion.type === 'recent' ? (
                        <Clock className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span>{isSpanish ? suggestion.textEs : suggestion.text}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Recent Searches */}
              {recentSearches.length > 0 && (
                <div className="py-2">
                  <p className="px-4 py-2 text-xs text-muted-foreground uppercase">
                    {isSpanish ? 'Búsquedas Recientes' : 'Recent Searches'}
                  </p>
                  {recentSearches.slice(0, 5).map((recent) => (
                    <button
                      key={recent.id}
                      onClick={() => setQuery(recent.query)}
                      className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-muted"
                    >
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="flex-1">{recent.query}</span>
                      <Badge variant="outline" className="text-xs">
                        {recent.resultCount} {isSpanish ? 'resultados' : 'results'}
                      </Badge>
                    </button>
                  ))}
                </div>
              )}

              {/* Empty state */}
              {recentSearches.length === 0 && suggestions.length === 0 && (
                <div className="py-12 text-center text-muted-foreground">
                  <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>{isSpanish ? 'Comience a escribir para buscar' : 'Start typing to search'}</p>
                </div>
              )}
            </>
          ) : null}
        </ScrollArea>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t bg-muted/50 text-xs text-muted-foreground">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-background border rounded">↑</kbd>
              <kbd className="px-1.5 py-0.5 bg-background border rounded">↓</kbd>
              {isSpanish ? 'navegar' : 'navigate'}
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-background border rounded">↵</kbd>
              {isSpanish ? 'seleccionar' : 'select'}
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-background border rounded">esc</kbd>
              {isSpanish ? 'cerrar' : 'close'}
            </span>
          </div>
          <span className="flex items-center gap-1">
            <Command className="h-3 w-3" />K
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
