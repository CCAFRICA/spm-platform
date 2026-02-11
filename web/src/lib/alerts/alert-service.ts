/**
 * Alert Service
 *
 * Manages alert rules and user preferences.
 */

import type {
  AlertRule,
  UserAlertPreferences,
  AlertTrigger,
  AlertChannel,
  AlertFrequency,
} from '@/types/alert';

const RULES_STORAGE_KEY = 'alert_rules';
const PREFS_STORAGE_KEY = 'alert_preferences';

// ============================================
// ALERT RULES CRUD
// ============================================

/**
 * Get all alert rules
 */
export function getAllAlertRules(): AlertRule[] {
  if (typeof window === 'undefined') return getDefaultAlertRules();

  const stored = localStorage.getItem(RULES_STORAGE_KEY);
  if (!stored) {
    const defaults = getDefaultAlertRules();
    localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(defaults));
    return defaults;
  }

  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

/**
 * Get alert rules for a tenant
 */
export function getAlertRules(tenantId: string): AlertRule[] {
  return getAllAlertRules()
    .filter((r) => r.tenantId === tenantId)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

/**
 * Get an alert rule by ID
 */
export function getAlertRule(ruleId: string): AlertRule | null {
  const rules = getAllAlertRules();
  return rules.find((r) => r.id === ruleId) || null;
}

/**
 * Create a new alert rule
 */
export function createAlertRule(
  tenantId: string,
  data: Omit<AlertRule, 'id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'triggerCount'>
): AlertRule {
  const now = new Date().toISOString();

  const rule: AlertRule = {
    ...data,
    id: `rule-${Date.now()}`,
    tenantId,
    createdAt: now,
    updatedAt: now,
    triggerCount: 0,
  };

  const rules = getAllAlertRules();
  rules.push(rule);
  saveRules(rules);

  return rule;
}

/**
 * Update an alert rule
 */
export function updateAlertRule(
  ruleId: string,
  updates: Partial<Omit<AlertRule, 'id' | 'tenantId' | 'createdAt' | 'createdBy'>>
): AlertRule | null {
  const rules = getAllAlertRules();
  const index = rules.findIndex((r) => r.id === ruleId);

  if (index < 0) return null;

  const updated: AlertRule = {
    ...rules[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  rules[index] = updated;
  saveRules(rules);

  return updated;
}

/**
 * Delete an alert rule
 */
export function deleteAlertRule(ruleId: string): boolean {
  const rules = getAllAlertRules();
  const filtered = rules.filter((r) => r.id !== ruleId);

  if (filtered.length === rules.length) return false;

  saveRules(filtered);
  return true;
}

/**
 * Toggle an alert rule enabled state
 */
export function toggleAlertRule(ruleId: string): AlertRule | null {
  const rule = getAlertRule(ruleId);
  if (!rule) return null;

  return updateAlertRule(ruleId, { enabled: !rule.enabled });
}

// ============================================
// USER PREFERENCES
// ============================================

/**
 * Get user preferences
 */
export function getUserPreferences(userId: string, tenantId: string): UserAlertPreferences {
  if (typeof window === 'undefined') return getDefaultPreferences(userId, tenantId);

  const stored = localStorage.getItem(PREFS_STORAGE_KEY);
  if (!stored) return getDefaultPreferences(userId, tenantId);

  try {
    const all: UserAlertPreferences[] = JSON.parse(stored);
    const prefs = all.find((p) => p.userId === userId && p.tenantId === tenantId);
    return prefs || getDefaultPreferences(userId, tenantId);
  } catch {
    return getDefaultPreferences(userId, tenantId);
  }
}

/**
 * Update user preferences
 */
export function updateUserPreferences(
  userId: string,
  tenantId: string,
  updates: Partial<Omit<UserAlertPreferences, 'userId' | 'tenantId'>>
): UserAlertPreferences {
  const current = getUserPreferences(userId, tenantId);

  const updated: UserAlertPreferences = {
    ...current,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  const all = getAllPreferencesInternal();
  const index = all.findIndex((p) => p.userId === userId && p.tenantId === tenantId);

  if (index >= 0) {
    all[index] = updated;
  } else {
    all.push(updated);
  }

  savePreferences(all);
  return updated;
}

/**
 * Update trigger preference
 */
export function updateTriggerPreference(
  userId: string,
  tenantId: string,
  trigger: AlertTrigger,
  settings: {
    enabled?: boolean;
    channels?: AlertChannel[];
    frequency?: AlertFrequency;
  }
): UserAlertPreferences {
  const prefs = getUserPreferences(userId, tenantId);

  const currentTrigger = prefs.triggerPreferences[trigger] || {
    enabled: true,
    channels: ['in_app'],
    frequency: 'immediate',
  };

  const updatedTrigger = {
    ...currentTrigger,
    ...settings,
  };

  return updateUserPreferences(userId, tenantId, {
    triggerPreferences: {
      ...prefs.triggerPreferences,
      [trigger]: updatedTrigger,
    },
  });
}

// ============================================
// STATISTICS
// ============================================

/**
 * Get alert statistics
 */
export function getAlertStats(tenantId: string): {
  totalRules: number;
  enabledRules: number;
  byTrigger: Record<AlertTrigger, number>;
  recentlyTriggered: AlertRule[];
} {
  const rules = getAlertRules(tenantId);

  const byTrigger = {} as Record<AlertTrigger, number>;
  rules.forEach((r) => {
    byTrigger[r.trigger] = (byTrigger[r.trigger] || 0) + 1;
  });

  const recentlyTriggered = rules
    .filter((r) => r.lastTriggered)
    .sort((a, b) => new Date(b.lastTriggered!).getTime() - new Date(a.lastTriggered!).getTime())
    .slice(0, 5);

  return {
    totalRules: rules.length,
    enabledRules: rules.filter((r) => r.enabled).length,
    byTrigger,
    recentlyTriggered,
  };
}

// ============================================
// HELPERS
// ============================================

function saveRules(rules: AlertRule[]): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(rules));
  }
}

function savePreferences(prefs: UserAlertPreferences[]): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
  }
}

function getAllPreferencesInternal(): UserAlertPreferences[] {
  if (typeof window === 'undefined') return [];

  const stored = localStorage.getItem(PREFS_STORAGE_KEY);
  if (!stored) return [];

  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

function getDefaultPreferences(userId: string, tenantId: string): UserAlertPreferences {
  const defaultTriggerPrefs: UserAlertPreferences['triggerPreferences'] = {
    quota_attainment: { enabled: true, channels: ['in_app', 'email'], frequency: 'immediate' },
    payout_ready: { enabled: true, channels: ['in_app', 'email'], frequency: 'immediate' },
    dispute_status: { enabled: true, channels: ['in_app'], frequency: 'immediate' },
    plan_change: { enabled: true, channels: ['in_app', 'email'], frequency: 'immediate' },
    approval_required: { enabled: true, channels: ['in_app', 'email'], frequency: 'immediate' },
    data_quality: { enabled: true, channels: ['in_app'], frequency: 'daily_digest' },
    goal_progress: { enabled: true, channels: ['in_app'], frequency: 'weekly_digest' },
    team_performance: { enabled: true, channels: ['in_app'], frequency: 'weekly_digest' },
    custom: { enabled: true, channels: ['in_app'], frequency: 'immediate' },
  };

  return {
    userId,
    tenantId,
    globalEnabled: true,
    quietHoursEnabled: false,
    channels: {
      in_app: true,
      email: true,
      sms: false,
      push: false,
    },
    triggerPreferences: defaultTriggerPrefs,
    digestTime: '09:00',
    digestDay: 1, // Monday
    updatedAt: new Date().toISOString(),
  };
}

// ============================================
// DEMO DATA
// ============================================

function getDefaultAlertRules(): AlertRule[] {
  const now = new Date().toISOString();

  return [
    {
      id: 'rule-quota-90',
      tenantId: 'retailco',
      name: 'High Quota Attainment',
      nameEs: 'Alto Cumplimiento de Cuota',
      description: 'Alert when quota attainment exceeds 90%',
      descriptionEs: 'Alerta cuando el cumplimiento de cuota supera 90%',
      trigger: 'quota_attainment',
      condition: 'above_threshold',
      threshold: 90,
      thresholdUnit: '%',
      targetType: 'all',
      targetIds: [],
      channels: ['in_app', 'email'],
      frequency: 'immediate',
      enabled: true,
      createdBy: 'admin',
      createdAt: now,
      updatedAt: now,
      triggerCount: 12,
    },
    {
      id: 'rule-payout',
      tenantId: 'retailco',
      name: 'Payout Notification',
      nameEs: 'Notificaci\u00f3n de Pago',
      description: 'Notify when payout is ready',
      descriptionEs: 'Notificar cuando el pago est\u00e9 listo',
      trigger: 'payout_ready',
      condition: 'new_item',
      targetType: 'all',
      targetIds: [],
      channels: ['in_app', 'email'],
      frequency: 'immediate',
      enabled: true,
      createdBy: 'admin',
      createdAt: now,
      updatedAt: now,
      triggerCount: 45,
    },
    {
      id: 'rule-data-quality',
      tenantId: 'retailco',
      name: 'Data Quality Issues',
      nameEs: 'Problemas de Calidad de Datos',
      description: 'Alert when critical data quality issues are detected',
      descriptionEs: 'Alerta cuando se detectan problemas cr\u00edticos de calidad de datos',
      trigger: 'data_quality',
      condition: 'above_threshold',
      threshold: 5,
      thresholdUnit: 'issues',
      targetType: 'role',
      targetIds: ['admin', 'vl_admin'],
      channels: ['in_app'],
      frequency: 'daily_digest',
      enabled: true,
      createdBy: 'admin',
      createdAt: now,
      updatedAt: now,
      triggerCount: 8,
    },
    {
      id: 'rule-approval',
      tenantId: 'retailco',
      name: 'Approval Required',
      nameEs: 'Aprobaci\u00f3n Requerida',
      description: 'Notify approvers when items need review',
      descriptionEs: 'Notificar a aprobadores cuando hay elementos pendientes',
      trigger: 'approval_required',
      condition: 'new_item',
      targetType: 'role',
      targetIds: ['manager', 'admin'],
      channels: ['in_app', 'email'],
      frequency: 'immediate',
      enabled: true,
      createdBy: 'admin',
      createdAt: now,
      updatedAt: now,
      triggerCount: 23,
    },
  ];
}

/**
 * Initialize alert rules
 */
export function initializeAlerts(): void {
  if (typeof window === 'undefined') return;

  const existing = localStorage.getItem(RULES_STORAGE_KEY);
  if (!existing) {
    const defaults = getDefaultAlertRules();
    localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(defaults));
  }
}

/**
 * Reset to defaults
 */
export function resetAlerts(): void {
  if (typeof window === 'undefined') return;

  const defaults = getDefaultAlertRules();
  localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(defaults));
  localStorage.removeItem(PREFS_STORAGE_KEY);
}
