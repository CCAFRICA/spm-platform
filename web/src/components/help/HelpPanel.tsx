'use client';

/**
 * Help Panel Component
 *
 * Contextual help panel with articles and tips.
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  HelpCircle,
  Search,
  BookOpen,
  ExternalLink,
  ChevronRight,
  Rocket,
  Receipt,
  DollarSign,
  TrendingUp,
  Settings,
} from 'lucide-react';
import type { HelpArticle, HelpCategory } from '@/types/help';
import { HELP_CATEGORIES } from '@/types/help';
import {
  getHelpArticles,
  getArticlesByCategory,
  searchArticles,
  getArticlesForRoute,
} from '@/lib/help/help-service';
import { useLocale } from '@/contexts/locale-context';

interface HelpPanelProps {
  currentRoute?: string;
}

const ICON_MAP: Record<string, React.ElementType> = {
  Rocket,
  Receipt,
  DollarSign,
  TrendingUp,
  Settings,
  HelpCircle,
};

export function HelpPanel({ currentRoute = '/' }: HelpPanelProps) {
  const { locale } = useLocale();
  const isSpanish = locale === 'es-MX';

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedArticle, setSelectedArticle] = useState<HelpArticle | null>(null);
  const [contextualArticles, setContextualArticles] = useState<HelpArticle[]>([]);

  useEffect(() => {
    setContextualArticles(getArticlesForRoute(currentRoute));
  }, [currentRoute]);

  const articles = searchQuery
    ? searchArticles(searchQuery)
    : getHelpArticles();

  const getCategoryIcon = (category: HelpCategory) => {
    const iconName = HELP_CATEGORIES[category]?.icon || 'HelpCircle';
    return ICON_MAP[iconName] || HelpCircle;
  };

  if (selectedArticle) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedArticle(null)}
            >
              ← {isSpanish ? 'Volver' : 'Back'}
            </Button>
          </div>
          <CardTitle className="text-lg">
            {isSpanish ? selectedArticle.titleEs : selectedArticle.title}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">
              {isSpanish
                ? HELP_CATEGORIES[selectedArticle.category].nameEs
                : HELP_CATEGORIES[selectedArticle.category].name}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {isSpanish ? 'Actualizado' : 'Updated'}: {selectedArticle.lastUpdated}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="prose prose-sm max-w-none">
            <div
              className="whitespace-pre-wrap text-sm"
              dangerouslySetInnerHTML={{
                __html: (isSpanish ? selectedArticle.contentEs : selectedArticle.content)
                  .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                  .replace(/\n\n/g, '<br/><br/>')
                  .replace(/- /g, '• '),
              }}
            />
          </div>

          {selectedArticle.tags.length > 0 && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-xs text-muted-foreground mb-2">
                {isSpanish ? 'Etiquetas' : 'Tags'}
              </p>
              <div className="flex flex-wrap gap-1">
                {selectedArticle.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <HelpCircle className="h-5 w-5" />
          {isSpanish ? 'Centro de Ayuda' : 'Help Center'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={isSpanish ? 'Buscar artículos...' : 'Search articles...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Contextual Articles */}
        {!searchQuery && contextualArticles.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-2 uppercase">
              {isSpanish ? 'Relevante para esta página' : 'Relevant to this page'}
            </p>
            <div className="space-y-2">
              {contextualArticles.map((article) => (
                <button
                  key={article.id}
                  onClick={() => setSelectedArticle(article)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border hover:bg-muted text-left"
                >
                  <BookOpen className="h-4 w-4 text-primary" />
                  <span className="flex-1 text-sm font-medium">
                    {isSpanish ? article.titleEs : article.title}
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Categories */}
        <ScrollArea className="h-[300px]">
          <Accordion type="multiple" className="w-full">
            {(Object.keys(HELP_CATEGORIES) as HelpCategory[]).map((category) => {
              const categoryConfig = HELP_CATEGORIES[category];
              const categoryArticles = searchQuery
                ? articles.filter((a) => a.category === category)
                : getArticlesByCategory(category);

              if (categoryArticles.length === 0) return null;

              const Icon = getCategoryIcon(category);

              return (
                <AccordionItem key={category} value={category}>
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      <span>
                        {isSpanish ? categoryConfig.nameEs : categoryConfig.name}
                      </span>
                      <Badge variant="secondary" className="ml-2">
                        {categoryArticles.length}
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-1 pt-2">
                      {categoryArticles.map((article) => (
                        <button
                          key={article.id}
                          onClick={() => setSelectedArticle(article)}
                          className="w-full flex items-center justify-between p-2 rounded hover:bg-muted text-left text-sm"
                        >
                          <span>{isSpanish ? article.titleEs : article.title}</span>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </button>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </ScrollArea>

        {/* External Link */}
        <div className="pt-4 border-t">
          <Button variant="outline" className="w-full" asChild>
            <a href="#" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-2" />
              {isSpanish ? 'Documentación Completa' : 'Full Documentation'}
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
