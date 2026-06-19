-- OB-217: Per-transaction trace columns
ALTER TABLE calculation_traces
  ADD COLUMN committed_data_id uuid REFERENCES committed_data(id),
  ADD COLUMN transaction_ref text;

CREATE INDEX idx_calc_traces_committed_data
  ON calculation_traces (tenant_id, committed_data_id)
  WHERE committed_data_id IS NOT NULL;

CREATE INDEX idx_calc_traces_transaction_ref
  ON calculation_traces (tenant_id, transaction_ref)
  WHERE transaction_ref IS NOT NULL;

COMMENT ON COLUMN calculation_traces.committed_data_id IS 'FK to source transaction row -- structural identity for per-row traces';
COMMENT ON COLUMN calculation_traces.transaction_ref IS 'Business reference key extracted from row_data -- for display and cross-period linking';
