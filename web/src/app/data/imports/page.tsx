import { redirect } from 'next/navigation';

/**
 * Import History (old) — REDIRECTED (OB-109)
 *
 * Superseded by Enhanced Import at /data/import/enhanced.
 * CLT72-F27: Duplicate import paths → single entry point.
 */
export default function ImportsPage() {
  redirect('/operate/import');
}
