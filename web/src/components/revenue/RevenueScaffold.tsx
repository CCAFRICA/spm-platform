'use client';

/**
 * RevenueScaffold — shared page chrome for the Revenue surfaces (OB-257).
 *
 * Dual-render pattern (HF-313 precedent, financial/pulse): the Vialuce theme renders the
 * design-spec `.page` / `.phead` template classes; other themes render the semantic-Tailwind
 * shell. Titles/subtitles are bilingual props (EN + ES) selected via the platform locale.
 */

import type { ReactNode } from 'react';
import { useIsVialuce } from '@/hooks/use-is-vialuce';
import { useLocale, isSpanishLocale } from '@/contexts/locale-context';

interface RevenueScaffoldProps {
  title: string;
  titleEs: string;
  subtitle?: string;
  subtitleEs?: string;
  children: ReactNode;
}

export function RevenueScaffold({ title, titleEs, subtitle, subtitleEs, children }: RevenueScaffoldProps) {
  const { locale } = useLocale();
  const isSpanish = isSpanishLocale(locale);
  const isVialuce = useIsVialuce();

  const heading = isSpanish ? titleEs : title;
  const sub = isSpanish ? (subtitleEs ?? subtitle) : subtitle;

  if (isVialuce) {
    return (
      <div className="page space-y-6">
        <div className="phead">
          <div>
            <h1>{heading}</h1>
            {sub && <div className="sub">{sub}</div>}
          </div>
        </div>
        {children}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{heading}</h1>
        {sub && <p className="text-muted-foreground">{sub}</p>}
      </div>
      {children}
    </div>
  );
}
