'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Lightbulb,
  ChevronRight,
  CheckCircle,
  X,
  Play,
  BookOpen,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { containerVariants, itemVariants } from '@/lib/animations';

interface CoachingTip {
  id: string;
  title: string;
  summary: string;
  content: string;
  category: 'skill' | 'strategy' | 'motivation' | 'product';
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  actionUrl?: string;
  videoUrl?: string;
  estimatedTime?: string;
  completed?: boolean;
}

interface CoachingCardProps {
  tips: CoachingTip[];
  onComplete?: (tipId: string) => void;
  onDismiss?: (tipId: string) => void;
  className?: string;
}

export function CoachingCard({
  tips,
  onComplete,
  onDismiss,
  className,
}: CoachingCardProps) {
  const [selectedTip, setSelectedTip] = useState<CoachingTip | null>(null);
  const [dismissedTips, setDismissedTips] = useState<string[]>([]);
  const [completedTips, setCompletedTips] = useState<string[]>([]);

  const getCategoryConfig = (category: CoachingTip['category']) => {
    switch (category) {
      case 'skill':
        return {
          label: 'Skill Building',
          color: 'text-purple-600',
          bg: 'bg-purple-100 dark:bg-purple-900/30',
        };
      case 'strategy':
        return {
          label: 'Strategy',
          color: 'text-sky-600',
          bg: 'bg-sky-100 dark:bg-sky-900/30',
        };
      case 'motivation':
        return {
          label: 'Motivation',
          color: 'text-amber-600',
          bg: 'bg-amber-100 dark:bg-amber-900/30',
        };
      case 'product':
        return {
          label: 'Product Knowledge',
          color: 'text-emerald-600',
          bg: 'bg-emerald-100 dark:bg-emerald-900/30',
        };
    }
  };

  const getDifficultyConfig = (difficulty: CoachingTip['difficulty']) => {
    switch (difficulty) {
      case 'beginner':
        return { label: 'Beginner', dots: 1 };
      case 'intermediate':
        return { label: 'Intermediate', dots: 2 };
      case 'advanced':
        return { label: 'Advanced', dots: 3 };
    }
  };

  const handleDismiss = (tipId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDismissedTips([...dismissedTips, tipId]);
    onDismiss?.(tipId);
  };

  const handleComplete = (tipId: string) => {
    setCompletedTips([...completedTips, tipId]);
    onComplete?.(tipId);
    setSelectedTip(null);
  };

  const visibleTips = tips.filter(
    (tip) => !dismissedTips.includes(tip.id) && !completedTips.includes(tip.id)
  );

  return (
    <>
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className={cn('space-y-3', className)}
      >
        <AnimatePresence mode="popLayout">
          {visibleTips.map((tip) => {
            const categoryConfig = getCategoryConfig(tip.category);
            const difficultyConfig = getDifficultyConfig(tip.difficulty);

            return (
              <motion.div
                key={tip.id}
                variants={itemVariants}
                layout
                exit={{ opacity: 0, x: -20, transition: { duration: 0.2 } }}
              >
                <Card
                  className="cursor-pointer hover:shadow-md transition-shadow group"
                  onClick={() => setSelectedTip(tip)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          'p-2 rounded-lg',
                          categoryConfig.bg
                        )}
                      >
                        <Lightbulb className={cn('h-5 w-5', categoryConfig.color)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-medium text-slate-50 line-clamp-1">
                            {tip.title}
                          </h4>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => handleDismiss(tip.id, e)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                        <p className="text-sm text-slate-500 mt-1 line-clamp-2">
                          {tip.summary}
                        </p>
                        <div className="flex items-center gap-3 mt-2">
                          <Badge
                            variant="secondary"
                            className={cn('text-xs', categoryConfig.bg, categoryConfig.color)}
                          >
                            {categoryConfig.label}
                          </Badge>
                          <div className="flex items-center gap-1">
                            {Array.from({ length: 3 }).map((_, i) => (
                              <div
                                key={i}
                                className={cn(
                                  'w-1.5 h-1.5 rounded-full',
                                  i < difficultyConfig.dots
                                    ? 'bg-slate-500'
                                    : 'bg-slate-200 dark:bg-slate-700'
                                )}
                              />
                            ))}
                            <span className="text-xs text-slate-400 ml-1">
                              {difficultyConfig.label}
                            </span>
                          </div>
                          {tip.estimatedTime && (
                            <span className="text-xs text-slate-400">
                              {tip.estimatedTime}
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-slate-500 transition-colors" />
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {visibleTips.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-8"
          >
            <CheckCircle className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
            <p className="text-slate-600 dark:text-slate-400">
              Great job! You&apos;ve reviewed all coaching tips.
            </p>
          </motion.div>
        )}
      </motion.div>

      {/* Detail Dialog */}
      <Dialog open={!!selectedTip} onOpenChange={() => setSelectedTip(null)}>
        <DialogContent className="max-w-lg">
          {selectedTip && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2 mb-2">
                  <Badge
                    variant="secondary"
                    className={cn(
                      getCategoryConfig(selectedTip.category).bg,
                      getCategoryConfig(selectedTip.category).color
                    )}
                  >
                    {getCategoryConfig(selectedTip.category).label}
                  </Badge>
                  {selectedTip.estimatedTime && (
                    <span className="text-xs text-slate-400">
                      {selectedTip.estimatedTime}
                    </span>
                  )}
                </div>
                <DialogTitle>{selectedTip.title}</DialogTitle>
                <DialogDescription>{selectedTip.summary}</DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <p className="text-slate-600 dark:text-slate-400 whitespace-pre-wrap">
                  {selectedTip.content}
                </p>

                {(selectedTip.actionUrl || selectedTip.videoUrl) && (
                  <div className="flex gap-3 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                    {selectedTip.videoUrl && (
                      <Button variant="outline" size="sm" asChild>
                        <a href={selectedTip.videoUrl} target="_blank" rel="noopener noreferrer">
                          <Play className="h-4 w-4 mr-2" />
                          Watch Video
                        </a>
                      </Button>
                    )}
                    {selectedTip.actionUrl && (
                      <Button variant="outline" size="sm" asChild>
                        <a href={selectedTip.actionUrl} target="_blank" rel="noopener noreferrer">
                          <BookOpen className="h-4 w-4 mr-2" />
                          Learn More
                        </a>
                      </Button>
                    )}
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setSelectedTip(null)}>
                  Close
                </Button>
                <Button onClick={() => handleComplete(selectedTip.id)}>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Mark Complete
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
