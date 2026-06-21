/**
 * OB-224 — Drill-through data layer types.
 *
 * The five-layer chain (entity → result → component → trace → source transaction) is rendered
 * from data the engine already produced (Decision 158: deterministic, no LLM). Component names,
 * input labels, period labels all come from the DATA — never hardcoded (Korean Test / Rule 1).
 *
 * AP-17 (single code path): the component/transaction layer re-exports the OB-219 commission-
 * statement shapes so ComponentCards/TransactionRows consume the SAME types getCommissionStatement
 * produces — there is exactly one trace-assembly path in the codebase.
 */
import type {
  CommissionStatement,
  StatementComponent,
  StatementTransaction,
} from '@/lib/compensation/commission-statement';

export type { CommissionStatement, StatementComponent, StatementTransaction };

/**
 * A profile's visibility envelope. Empty `visibleEntityIds` = no restriction = "all"
 * (admin default; profile_scope is unpopulated today — substrate verification §3.1).
 */
export interface EntityScope {
  visibleEntityIds: string[];
  visibleRuleSetIds: string[];
  visiblePeriodIds: string[];
  /** Provenance, so a surface can say "all entities" vs "your team" honestly. */
  scopeType: 'all' | 'graph_derived' | 'explicit';
}

/** One row of the top drill-through layer: an entity's payout for a period. */
export interface EntityResult {
  entityId: string;
  externalId: string;
  displayName: string;
  totalPayout: number;
  componentCount: number;
  periodId: string;
  periodLabel: string;
  lifecycleState: string | null;
  /** component display name → payout, when resolvable (from outcomes or components[]). */
  componentBreakdown?: Record<string, number>;
}

/** A raw source row (bottom layer) for an entity+period. */
export interface SourceTransaction {
  id: string;
  dataType: string;
  rowData: Record<string, unknown>;
  sourceDate: string | null;
}

/** Caller-supplied dispute payload. tenant_id + status + filed_by are applied by submitDispute. */
export interface DisputeInput {
  entityId: string;
  periodId?: string | null;
  batchId?: string | null;
  category?: string | null;
  description: string;
  amountDisputed?: number | null;
  /** profiles.id of the filer (useAuth().user.id). */
  filedBy?: string | null;
}

export interface PeriodOption {
  id: string;
  label: string;
  /** OB-227 Fix B: ISO start_date from the periods table, so callers sort chronologically (Decision 92/93) rather than by label string. */
  start_date?: string;
}
