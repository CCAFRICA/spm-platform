/**
 * User Journey Milestones
 *
 * Each milestone represents a key action in the user's learning path.
 * Used by CoachMark components and the useUserJourney hook.
 */

export interface Milestone {
  id: string;
  label: string;
  category: string;
  persona: 'admin' | 'manager' | 'rep' | 'all';
}

export const MILESTONES: Milestone[] = [
  // Onboarding
  { id: 'first_login', label: 'First Login', category: 'onboarding', persona: 'all' },
  { id: 'profile_viewed', label: 'Profile Viewed', category: 'onboarding', persona: 'all' },
  { id: 'gpv_completed', label: 'GPV Completed', category: 'onboarding', persona: 'admin' },

  // Data
  { id: 'plan_imported', label: 'Plan Imported', category: 'data', persona: 'admin' },
  { id: 'data_uploaded', label: 'Data Uploaded', category: 'data', persona: 'admin' },
  { id: 'field_mapping_reviewed', label: 'Field Mapping Reviewed', category: 'data', persona: 'admin' },

  // Calculation
  { id: 'first_calculation', label: 'First Calculation', category: 'calculation', persona: 'admin' },
  { id: 'outlier_reviewed', label: 'Outlier Reviewed', category: 'calculation', persona: 'admin' },
  { id: 'calculation_approved', label: 'Calculation Approved', category: 'calculation', persona: 'admin' },

  // Manager
  { id: 'team_viewed', label: 'Team Dashboard Viewed', category: 'manager', persona: 'manager' },
  { id: 'coaching_insight_read', label: 'Coaching Insight Read', category: 'manager', persona: 'manager' },

  // Rep
  { id: 'payout_viewed', label: 'Payout Viewed', category: 'rep', persona: 'rep' },
  { id: 'dispute_submitted', label: 'Dispute Submitted', category: 'rep', persona: 'rep' },
  { id: 'forensics_explored', label: 'Forensics Explored', category: 'rep', persona: 'rep' },

  // Advanced
  { id: 'lifecycle_advanced', label: 'Lifecycle Advanced', category: 'advanced', persona: 'admin' },
  { id: 'canvas_explored', label: 'Canvas Explored', category: 'advanced', persona: 'admin' },
  { id: 'agent_recommendation_acted', label: 'Agent Recommendation Acted', category: 'advanced', persona: 'all' },
  { id: 'upgrade_explored', label: 'Upgrade Page Explored', category: 'advanced', persona: 'admin' },
];

export function getMilestone(id: string): Milestone | undefined {
  return MILESTONES.find(m => m.id === id);
}

export function getMilestonesByPersona(persona: string): Milestone[] {
  return MILESTONES.filter(m => m.persona === persona || m.persona === 'all');
}

export function getMilestonesByCategory(category: string): Milestone[] {
  return MILESTONES.filter(m => m.category === category);
}
