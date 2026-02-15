/**
 * useLabels — React hook for domain-agnostic labels
 *
 * Reads tenant config and provides label functions.
 * Korean Test: all user-visible strings should use this hook.
 */

import { useMemo } from 'react';
import { useTenant } from '@/contexts/tenant-context';
import { createLabels, type TenantLabelConfig } from '@/lib/labels/label-service';

export function useLabels() {
  const { currentTenant } = useTenant();

  return useMemo(() => {
    const config: TenantLabelConfig | null = currentTenant ? {
      hierarchy_labels: (currentTenant as Record<string, unknown>).hierarchy_labels as Record<string, string> | undefined,
      entity_type_labels: (currentTenant as Record<string, unknown>).entity_type_labels as Record<string, string> | undefined,
      settings: (currentTenant as Record<string, unknown>).settings as TenantLabelConfig['settings'] | undefined,
    } : null;

    return createLabels(config);
  }, [currentTenant]);
}
