/**
 * Compensation Module - ViaLuce SPM Platform
 *
 * Exports all compensation-related types, services, and utilities
 */

// Types
export * from '@/types/compensation-plan';

// Calculation engine
export * from './calculation-engine';

// OB-196 Phase 1.6: plan-interpreter.ts deleted (heuristic fallback per architect Option b).
// AI Plan Interpreter (direct access)
export * from './ai-plan-interpreter';

