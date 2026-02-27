import { redirect } from 'next/navigation';

/**
 * Operate > Import — REDIRECTED (OB-109)
 *
 * Superseded by Enhanced Import at /data/import/enhanced.
 * CLT72-F27: Single import entry point.
 */
export default function OperateImportPage() {
  redirect('/data/import/enhanced');
}
