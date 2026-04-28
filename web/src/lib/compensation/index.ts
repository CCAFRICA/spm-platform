/**
 * Compensation Module - ViaLuce SPM Platform
 *
 * Exports all compensation-related types, services, and utilities
 */

// Types
export * from '@/types/compensation-plan';

// OB-196 Phase 1.6.5: calculation-engine.ts deleted (demo-era parallel-authority artifact).
// OB-196 Phase 1.6: plan-interpreter.ts deleted (heuristic fallback per architect Option b).
// AI Plan Interpreter (direct access)
export * from './ai-plan-interpreter';

