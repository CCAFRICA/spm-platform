'use client';

/**
 * Keyboard Shortcuts Dialog Component
 *
 * Displays all available keyboard shortcuts.
 */

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Keyboard } from 'lucide-react';
import { getShortcutsByCategory } from '@/lib/help/help-service';
import { SHORTCUT_CATEGORIES } from '@/types/help';
import type { ShortcutCategory } from '@/types/help';
import { useLocale } from '@/contexts/locale-context';

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function KeyboardShortcutsDialog({
  open,
  onOpenChange,
}: KeyboardShortcutsDialogProps) {
  const { locale } = useLocale();
  const isSpanish = locale === 'es-MX';

  const shortcutsByCategory = getShortcutsByCategory();

  const formatKey = (key: string) => {
    const keyMap: Record<string, string> = {
      cmd: '⌘',
      ctrl: 'Ctrl',
      alt: '⌥',
      shift: '⇧',
      esc: 'Esc',
      enter: '↵',
    };
    return keyMap[key] || key.toUpperCase();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            {isSpanish ? 'Atajos de Teclado' : 'Keyboard Shortcuts'}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-6">
            {(Object.keys(shortcutsByCategory) as ShortcutCategory[]).map((category) => {
              const categoryConfig = SHORTCUT_CATEGORIES[category];
              const shortcuts = shortcutsByCategory[category];

              return (
                <div key={category}>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-3">
                    {isSpanish ? categoryConfig.nameEs : categoryConfig.name}
                  </h3>
                  <div className="space-y-2">
                    {shortcuts.map((shortcut) => (
                      <div
                        key={shortcut.id}
                        className="flex items-center justify-between py-2"
                      >
                        <div>
                          <p className="font-medium">
                            {isSpanish ? shortcut.actionEs : shortcut.action}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {isSpanish ? shortcut.descriptionEs : shortcut.description}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          {shortcut.keys.map((key, index) => (
                            <span key={index} className="flex items-center">
                              <kbd className="px-2 py-1 bg-muted border rounded text-sm font-mono">
                                {formatKey(key)}
                              </kbd>
                              {index < shortcut.keys.length - 1 && (
                                <span className="mx-1 text-muted-foreground">+</span>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <div className="pt-4 border-t text-sm text-muted-foreground text-center">
          {isSpanish
            ? 'Presione ? en cualquier momento para ver esta ayuda'
            : 'Press ? anytime to view this help'}
        </div>
      </DialogContent>
    </Dialog>
  );
}
