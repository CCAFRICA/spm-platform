'use client';

/**
 * StructuredAbsence — the C2 explicit-absence surface (OB-257).
 *
 * When a revenue role is unresolved or a materialization is missing, surfaces render THIS —
 * a named role and a named reason — never zeros or an empty chart. The reason string arrives
 * verbatim from the server (ResolvedRevenueRole.reason / RoleAbsence.reason /
 * notMaterialized.reason) and is shown as-is; only the heading is localized.
 */

import { useLocale, isSpanishLocale } from '@/contexts/locale-context';

interface StructuredAbsenceProps {
  /** the semantic role that is absent (rendered as a monospace chip), when role-scoped */
  role?: string;
  /** the named reason, rendered verbatim */
  reason: string;
  /** overrides the default bilingual heading */
  title?: string;
  className?: string;
}

export function StructuredAbsence({ role, reason, title, className }: StructuredAbsenceProps) {
  const { locale } = useLocale();
  const isSpanish = isSpanishLocale(locale);

  const heading =
    title ?? (isSpanish ? 'No disponible para esta organizacion' : 'Not available for this tenant');

  return (
    <div className={`rounded-lg border border-border bg-card p-4 ${className ?? ''}`}>
      <p className="text-sm font-semibold text-foreground">{heading}</p>
      {role && (
        <p className="mt-2 text-xs text-muted-foreground">
          {isSpanish ? 'Rol' : 'Role'}:{' '}
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">{role}</span>
        </p>
      )}
      <p className="mt-2 text-sm text-muted-foreground">{reason}</p>
    </div>
  );
}
