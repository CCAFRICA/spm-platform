/**
 * VialuceMark — the production Vialuce diamond mark.
 *
 * This is NOT a bespoke logo: it is the exact production geometry rendered in the
 * app shell (VialuceSidebar.tsx:131-135 / ChromeSidebar.tsx), extracted here so the
 * portal reuses the real mark instead of duplicating it a third time. Colors are
 * theme-portable (Vialuce → --vialuce-*, Bliss → --color-*, light/dark → the login
 * hex) so the mark renders correctly under every theme.
 */
export function VialuceMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden className={className}>
      <rect
        x="11"
        y="11"
        width="18"
        height="18"
        rx="1"
        transform="rotate(45 20 20)"
        stroke="var(--vialuce-indigo, var(--color-indigo, #2D2F8F))"
        strokeWidth="1.25"
      />
      <rect
        x="15.5"
        y="15.5"
        width="9"
        height="9"
        rx="0.5"
        transform="rotate(45 20 20)"
        fill="var(--vialuce-indigo, var(--color-indigo, #2D2F8F))"
      />
      <circle cx="20" cy="20" r="1.6" fill="var(--vialuce-gold, var(--color-gold, #E8A838))" />
    </svg>
  );
}
