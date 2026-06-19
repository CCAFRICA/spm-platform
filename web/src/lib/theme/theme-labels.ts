/**
 * HF-312 — user-facing theme display names (single canonical map; T1-E902 Carry Everything).
 *
 * The internal data-theme value `'current'` is the original look; its user-facing label is **Dark**
 * ("Current" was an internal development name, never a user-facing one). The internal value never
 * changes — only the display label. Every theme toggle/selector imports this map so the labels and
 * the selectable order live in exactly one place.
 *
 * Type-only import of AppTheme is erased at compile time, so this client-safe module does NOT pull
 * the server-side active-theme.ts runtime (service-role client) into client bundles.
 */
import type { AppTheme } from './active-theme';

export const THEME_LABELS: Record<AppTheme, string> = {
  current: 'Dark',
  bliss: 'Bliss',
  vialuce: 'Vialuce',
};

/** Canonical selectable order for theme toggles/selectors. */
export const THEME_ORDER: readonly AppTheme[] = ['current', 'bliss', 'vialuce'] as const;
