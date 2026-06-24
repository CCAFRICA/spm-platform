'use client';

/**
 * OB-234 T1-C — Panel. The standard DS-003 card shell every surface composes with: dark surface,
 * optional section label + description + trailing action slot. Keeps card chrome identical across the
 * 8 surfaces so composition (not chrome) is where each surface differs.
 */

import type { ReactNode } from 'react';
import { CARD, CARD_PAD, SECTION_LABEL_CLASS, TEXT } from './ds003-tokens';

export interface PanelProps {
  title?: string;
  description?: string;
  /** trailing controls (e.g. a dimension selector, an export button, a StubAction chip). */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** remove inner padding (for charts that manage their own). */
  flush?: boolean;
}

export function Panel({ title, description, action, children, className, flush }: PanelProps) {
  return (
    <section className={`${CARD} ${flush ? '' : CARD_PAD} ${className ?? ''}`}>
      {(title || action) && (
        <header className={`flex items-start justify-between gap-3 ${flush ? `${CARD_PAD} pb-0` : 'mb-3'}`}>
          <div>
            {title && <h3 className={SECTION_LABEL_CLASS}>{title}</h3>}
            {description && <p className={`mt-0.5 text-xs ${TEXT.muted}`}>{description}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
