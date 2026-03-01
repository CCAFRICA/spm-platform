import { redirect } from 'next/navigation';

/**
 * Enhanced Import — REDIRECTED (OB-129)
 *
 * Superseded by SCI Import at /operate/import.
 */
export default function EnhancedImportRedirect() {
  redirect('/operate/import');
}
