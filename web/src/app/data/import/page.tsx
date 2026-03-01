import { redirect } from 'next/navigation';

/**
 * Standard Import — REDIRECTED (OB-109)
 *
 * Superseded by Enhanced Import at /data/import/enhanced.
 * CLT72-F27: Duplicate import paths (3 → should be 1).
 */
export default function StandardImportPage() {
  redirect('/operate/import');
}
