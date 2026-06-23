// HF-336 — platform semantic-role vocabulary (the contextualIdentity target set).
// These are PLATFORM-LEVEL SEMANTIC ROLES — domain-agnostic business concepts, analogous to BCL's
// convergence contextualIdentity vocabulary (loan_placement_amount, …). They are NOT tenant field
// names and NOT Spanish POS vocabulary. The LLM RECOGNIZES which of a tenant's fields maps to which
// role (Decision 158); page components read by ROLE. A Korean restaurant's 매출 maps to `revenue` and
// the page reads `revenue` — Korean Test passes (no field name in code; the role is platform-level).
//
// This is a HINT/preferred set for consistency, not a hard whitelist — the LLM may emit a snake_case
// role outside it when a field has no platform-role match. The generator never hardcodes a
// field→role MAPPING; only the role vocabulary itself lives here.

export const SEMANTIC_ROLES = [
  // measures
  'revenue', 'net_revenue', 'subtotal', 'tax', 'tips',
  'discount', 'cancellation', 'complimentary',
  'food_revenue', 'beverage_revenue',
  'payment_card', 'payment_cash',
  'guest_count', 'item_count',
  // identifiers
  'server_identifier', 'table_identifier', 'document_identifier', 'shift_identifier', 'location_identifier',
  // temporal / category
  'transaction_datetime', 'close_datetime', 'reporting_period_date',
  'shift_category', 'payment_method', 'service_type',
] as const;

export type StructuralType = 'measure' | 'identifier' | 'temporal' | 'category';
export const STRUCTURAL_TYPES: StructuralType[] = ['measure', 'identifier', 'temporal', 'category'];
