# HF-169: SCI Entity Identifier Classification Fix
## Type: HF (Hotfix)
## Date: March 23, 2026

SCI classifies transaction_id as entity_identifier instead of sales_rep_id.
Fix: use structural cardinality (Decision 105) — distinctCount/rowCount > 0.8
= transaction_identifier, <= 0.8 = entity_identifier. Korean Test compliant.
