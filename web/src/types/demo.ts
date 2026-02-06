/**
 * Demo System Types
 *
 * Types for demo reset, snapshots, and guided tours.
 */

export interface DemoSnapshot {
  id: string;
  name: string;
  nameEs: string;
  description: string;
  descriptionEs: string;
  createdAt: string;
  createdBy: string;
  size: number; // bytes
  data: Record<string, string>; // localStorage key -> value
  tags: string[];
}

export interface DemoState {
  isInitialized: boolean;
  lastReset: string | null;
  activeSnapshot: string | null;
  tourCompleted: boolean;
  tourStep: number;
}

export interface TourStep {
  id: string;
  title: string;
  titleEs: string;
  description: string;
  descriptionEs: string;
  target: string; // CSS selector or route
  route?: string;
  position: 'top' | 'bottom' | 'left' | 'right' | 'center';
  action?: 'click' | 'navigate' | 'highlight';
  duration?: number; // ms for auto-advance
}

export interface GuidedTour {
  id: string;
  name: string;
  nameEs: string;
  description: string;
  descriptionEs: string;
  steps: TourStep[];
  estimatedDuration: number; // minutes
  category: 'onboarding' | 'feature' | 'admin' | 'workflow';
}

export interface DemoValidationResult {
  isValid: boolean;
  timestamp: string;
  checks: ValidationCheck[];
  summary: {
    passed: number;
    failed: number;
    warnings: number;
  };
}

export interface ValidationCheck {
  id: string;
  name: string;
  nameEs: string;
  category: 'data' | 'relationship' | 'integrity' | 'consistency';
  status: 'passed' | 'failed' | 'warning';
  message: string;
  messageEs: string;
  details?: Record<string, unknown>;
}

export interface DemoScript {
  id: string;
  name: string;
  nameEs: string;
  description: string;
  descriptionEs: string;
  sections: ScriptSection[];
  totalDuration: number; // minutes
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  tags: string[];
}

export interface ScriptSection {
  id: string;
  title: string;
  titleEs: string;
  duration: number; // minutes
  route: string;
  talkingPoints: TalkingPoint[];
  actions: ScriptAction[];
}

export interface TalkingPoint {
  text: string;
  textEs: string;
  emphasis?: boolean;
}

export interface ScriptAction {
  type: 'click' | 'input' | 'navigate' | 'wait' | 'highlight';
  target?: string;
  value?: string;
  delay?: number;
}

export interface RehearsalSession {
  id: string;
  scriptId: string;
  startedAt: string;
  currentSection: number;
  currentPoint: number;
  elapsedTime: number; // seconds
  notes: string[];
  status: 'active' | 'paused' | 'completed';
}

// Demo storage keys
export const DEMO_STORAGE_KEYS = [
  'alert_rules',
  'alert_preferences',
  'saved_scenarios',
  'plan_approval_requests',
  'quality_scores',
  'quarantine_records',
  'rbac_roles',
  'rbac_assignments',
  'rbac_audit_log',
  'saved_reports',
  'demo_state',
  'demo_snapshots',
] as const;

export type DemoStorageKey = typeof DEMO_STORAGE_KEYS[number];

// Tour categories
export const TOUR_CATEGORIES: Record<GuidedTour['category'], {
  name: string;
  nameEs: string;
  icon: string;
}> = {
  onboarding: {
    name: 'Getting Started',
    nameEs: 'Primeros Pasos',
    icon: 'Rocket',
  },
  feature: {
    name: 'Feature Tours',
    nameEs: 'Tours de Funciones',
    icon: 'Sparkles',
  },
  admin: {
    name: 'Administration',
    nameEs: 'Administración',
    icon: 'Settings',
  },
  workflow: {
    name: 'Workflows',
    nameEs: 'Flujos de Trabajo',
    icon: 'GitBranch',
  },
};
