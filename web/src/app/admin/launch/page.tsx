import { redirect } from 'next/navigation';

/**
 * Customer Launch Dashboard — REDIRECTED (HF-072)
 *
 * This page was an abandoned 7-step sequential onboarding concept
 * that was superseded by the current import pipeline.
 * CLT-102 F-7, F-8: Dead page with "0 launches" undermines demo credibility.
 *
 * Redirects to Performance > Plans which shows the actual plan list.
 */
export default function LaunchPage() {
  redirect('/performance/plans');
}
