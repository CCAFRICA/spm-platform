-- ============================================================
-- HF-048 Migration 011: Backfill periods from committed_data
--
-- The import pipeline (HF-047) had a bug: it used 'period_key'
-- column name but the actual schema uses 'canonical_key'.
-- This caused zero periods to be created and all committed_data
-- rows to have period_id = NULL.
--
-- This migration:
--   1. Creates periods from year/month data in committed_data.row_data
--   2. Updates committed_data.period_id to point to the correct period
--
-- Handles both 'Año'/'Mes' and 'year'/'month' field names in row_data.
-- Safe to run multiple times (uses ON CONFLICT DO NOTHING).
-- ============================================================

-- Helper: extract year from row_data (handles Año, año, year, ano, anio)
CREATE OR REPLACE FUNCTION _hf048_extract_year(rd JSONB) RETURNS INT AS $$
  SELECT COALESCE(
    (rd->>'Año')::int,
    (rd->>'año')::int,
    (rd->>'year')::int,
    (rd->>'Ano')::int,
    (rd->>'ano')::int,
    (rd->>'anio')::int
  )
  WHERE COALESCE(
    (rd->>'Año')::int,
    (rd->>'año')::int,
    (rd->>'year')::int,
    (rd->>'Ano')::int,
    (rd->>'ano')::int,
    (rd->>'anio')::int
  ) BETWEEN 2000 AND 2100;
$$ LANGUAGE SQL IMMUTABLE;

-- Helper: extract month from row_data (handles Mes, mes, month)
CREATE OR REPLACE FUNCTION _hf048_extract_month(rd JSONB) RETURNS INT AS $$
  SELECT COALESCE(
    (rd->>'Mes')::int,
    (rd->>'mes')::int,
    (rd->>'month')::int
  )
  WHERE COALESCE(
    (rd->>'Mes')::int,
    (rd->>'mes')::int,
    (rd->>'month')::int
  ) BETWEEN 1 AND 12;
$$ LANGUAGE SQL IMMUTABLE;

-- Step 1: Extract unique year/month combinations and create periods
INSERT INTO periods (tenant_id, canonical_key, label, period_type, start_date, end_date, status, metadata)
SELECT DISTINCT
  cd.tenant_id,
  _hf048_extract_year(cd.row_data) || '-' || LPAD(_hf048_extract_month(cd.row_data)::text, 2, '0') AS canonical_key,
  CASE _hf048_extract_month(cd.row_data)
    WHEN 1 THEN 'January'
    WHEN 2 THEN 'February'
    WHEN 3 THEN 'March'
    WHEN 4 THEN 'April'
    WHEN 5 THEN 'May'
    WHEN 6 THEN 'June'
    WHEN 7 THEN 'July'
    WHEN 8 THEN 'August'
    WHEN 9 THEN 'September'
    WHEN 10 THEN 'October'
    WHEN 11 THEN 'November'
    WHEN 12 THEN 'December'
  END || ' ' || _hf048_extract_year(cd.row_data) AS label,
  'monthly' AS period_type,
  MAKE_DATE(_hf048_extract_year(cd.row_data), _hf048_extract_month(cd.row_data), 1) AS start_date,
  (MAKE_DATE(_hf048_extract_year(cd.row_data), _hf048_extract_month(cd.row_data), 1) + INTERVAL '1 month' - INTERVAL '1 day')::date AS end_date,
  'open' AS status,
  jsonb_build_object('year', _hf048_extract_year(cd.row_data), 'month', _hf048_extract_month(cd.row_data)) AS metadata
FROM committed_data cd
WHERE _hf048_extract_year(cd.row_data) IS NOT NULL
  AND _hf048_extract_month(cd.row_data) IS NOT NULL
ON CONFLICT (tenant_id, canonical_key) DO NOTHING;

-- Step 2: Update committed_data.period_id to match the created periods
UPDATE committed_data cd
SET period_id = p.id
FROM periods p
WHERE cd.period_id IS NULL
  AND cd.tenant_id = p.tenant_id
  AND _hf048_extract_year(cd.row_data) IS NOT NULL
  AND _hf048_extract_month(cd.row_data) IS NOT NULL
  AND p.canonical_key = _hf048_extract_year(cd.row_data) || '-' || LPAD(_hf048_extract_month(cd.row_data)::text, 2, '0');

-- Cleanup: drop helper functions
DROP FUNCTION IF EXISTS _hf048_extract_year(JSONB);
DROP FUNCTION IF EXISTS _hf048_extract_month(JSONB);
