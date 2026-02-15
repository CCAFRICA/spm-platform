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
    const tenant = currentTenant as unknown as Record<string, unknown> | null;
    const config: TenantLabelConfig | null = tenant ? {
      hierarchy_labels: tenant.hierarchy_labels as Record<string, string> | undefined,
      entity_type_labels: tenant.entity_type_labels as Record<string, string> | undefined,
      settings: tenant.settings as TenantLabelConfig['settings'] | undefined,
    } : null;

    return createLabels(config);
  }, [currentTenant]);
}
