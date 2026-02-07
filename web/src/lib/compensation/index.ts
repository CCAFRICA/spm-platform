/**
 * Compensation Module - Entity B SPM Platform
 *
 * Exports all compensation-related types, services, and utilities
 */

// Types
export * from '@/types/compensation-plan';

// Services
export * from './plan-storage';

// Calculation engine
export * from './calculation-engine';

// Plan interpreter (includes AI-powered interpretation)
export * from './plan-interpreter';

// AI Plan Interpreter (direct access)
export * from './ai-plan-interpreter';

// RetailCGMX Plan
export * from './retailcgmx-plan';
export * from './retailcgmx-validation';
