/**
 * OB-224 — Drill-through data layer barrel.
 *
 * The single source of truth for the five-layer chain. Every drill-through component and every
 * host surface consumes data through THESE functions — no component queries the database directly.
 */
export * from './types';
export { resolveEntityScope } from './entity-scope';
export { getEntityResults, getPeriodsWithResults } from './entity-results';
export { getEntityStatement, getComponentTraces } from './component-traces';
export type { RawComponentTrace } from './component-traces';
export { getSourceTransactions, SOURCE_TX_LIMIT } from './source-transactions';
export { submitDispute } from './dispute-submit';
