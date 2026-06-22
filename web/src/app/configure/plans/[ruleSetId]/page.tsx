/**
 * OB-228 — /configure/plans/[ruleSetId] (Zone B canvas). Renders the selected plan's
 * Living Plan Canvas through the persona seam.
 */
'use client';
import { useParams } from 'next/navigation';
import { PlanSurfaceShell } from '@/components/plan-surface/PlanSurfaceShell';

export default function PlanCanvasPage() {
  const params = useParams();
  const ruleSetId = (params?.ruleSetId as string) ?? null;
  return <PlanSurfaceShell selectedId={ruleSetId} />;
}
