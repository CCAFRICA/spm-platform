'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Globe, Check } from 'lucide-react';
import { useLocale } from '@/contexts/locale-context';
import { useAuth } from '@/contexts/auth-context';
import { useTenant } from '@/contexts/tenant-context';
import { createClient } from '@/lib/supabase/client';
import { SUPPORTED_LOCALES, Locale } from '@/lib/i18n';

/** Map locale code to profiles.language column value */
const LOCALE_TO_LANG: Record<string, string> = {
  'es-MX': 'es',
  'en-US': 'en',
  'pt-BR': 'pt',
};

export function LanguageSwitcher() {
  const { locale, setLocale } = useLocale();
  const { user } = useAuth();
  const { currentTenant } = useTenant();

  // Use context locale as source of truth (user selection overrides tenant default)
  const currentLocale = SUPPORTED_LOCALES.find((l) => l.code === locale);
  const isSpanish = locale === 'es-MX';

  const handleLocaleChange = async (newLocale: Locale) => {
    if (newLocale !== locale) {
      setLocale(newLocale);
      const selectedLocale = SUPPORTED_LOCALES.find((l) => l.code === newLocale);
      toast.success(isSpanish ? 'Idioma cambiado' : 'Language changed', {
        description: selectedLocale?.name || newLocale,
      });

      // Persist language preference to profiles.locale in Supabase (OB-58)
      if (user && currentTenant) {
        try {
          const supabase = createClient();
          await supabase
            .from('profiles')
            .update({ locale: LOCALE_TO_LANG[newLocale] || 'es' })
            .eq('auth_user_id', user.id)
            .eq('tenant_id', currentTenant.id);
        } catch (err) {
          console.warn('[LanguageSwitcher] Failed to persist language:', err);
        }
      }
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 gap-2 px-2"
        >
          <Globe className="h-4 w-4" />
          <span className="hidden sm:inline text-sm">
            {currentLocale?.flag} {currentLocale?.name}
          </span>
          <span className="sm:hidden text-sm">{currentLocale?.flag}</span>
        </Button>
      </DropdownMenuTrigger>

      <AnimatePresence>
        <DropdownMenuContent align="end" className="w-40">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            {SUPPORTED_LOCALES.map((loc) => (
              <DropdownMenuItem
                key={loc.code}
                onClick={() => handleLocaleChange(loc.code)}
                className="cursor-pointer flex items-center justify-between"
              >
                <span className="flex items-center gap-2">
                  <span>{loc.flag}</span>
                  <span>{loc.name}</span>
                </span>
                {locale === loc.code && (
                  <Check className="h-4 w-4 text-primary" />
                )}
              </DropdownMenuItem>
            ))}
          </motion.div>
        </DropdownMenuContent>
      </AnimatePresence>
    </DropdownMenu>
  );
}
