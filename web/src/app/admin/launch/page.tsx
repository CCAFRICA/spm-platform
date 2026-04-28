import { redirect } from 'next/navigation';

/**
 * Admin Launch — REDIRECTED
 *
 * Original 7-step sequential onboarding concept superseded by the import pipeline (HF-072).
 * Plan-management UI removed in OB-196 Phase 1.7 (era-artifact, future plan-editing
 * reconstructs on engine foundation). Redirects to /stream — platform central command surface.
 */
export default function LaunchPage() {
  redirect('/stream');
}
