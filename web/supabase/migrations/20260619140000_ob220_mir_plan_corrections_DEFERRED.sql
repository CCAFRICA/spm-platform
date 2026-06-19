-- OB-220 MIR plan corrections.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════╗
-- ║  DEFERRED — architect applies via Supabase SQL Editor (SR-44), then recalculates MIR    ║
-- ║  January and reconciles against MIR_Resultados_Esperados.xlsx. CC cannot run MIR calcs  ║
-- ║  (the /api/calculation/run route is middleware-auth-gated).                             ║
-- ╚══════════════════════════════════════════════════════════════════════════════════════╝
--
-- Tenant MIR = 972c8eb0-e3ae-4e4c-ad30-8b34804c893a. All plans store components as
-- {variants:[{components:[...]}]} (1 variant).
--
-- Covered here (safe, high-confidence): Plan 1 vocabulary; Plan 5 clawback fields + modifier.
-- Plan 2 (temporal binding) and Plan 4 (verified-count) are documented at the bottom — they need a
-- convergence re-bind / structural re-interpretation (OB-214 class); see the completion report.

-- ── Correction A — Plan 1 (COMISIONES POR VENTA MAYORISTA) category vocabulary ──
-- The conditional compares row_data.Categoria to 3-letter codes; the data carries full Spanish names.
-- Replacement targets standalone quoted JSON string VALUES, so it cannot touch substrings.
-- NOTE (important): the vocabulary fix is NECESSARY but NOT SUFFICIENT on its own. The component's
-- prime DAG uses reference(Categoria) at the ENTITY level, but `metrics` is numeric-only and a vendor
-- sells MIXED categories — so a per-transaction categorical commission cannot be computed by an
-- entity-level reference. Correct computation needs a per-category filter+aggregate restructure
-- (OB-214 structural; see report §Plan 1). This vocab fix lands the values so the restructure (or any
-- per-row path) compares against the right strings, and the OB-220 engine fix prevents the crash.
UPDATE rule_sets
SET components = replace(replace(replace(replace(
      components::text,
      '"ALI"', '"Alimentos"'),
      '"BEB"', '"Bebidas"'),
      '"LIM"', '"Limpieza"'),
      '"CPE"', '"Cuidado Personal"')::jsonb
WHERE id = 'fbff27cc-6c80-4e53-8df6-05ece8414f37'
  AND tenant_id = '972c8eb0-e3ae-4e4c-ad30-8b34804c893a';

-- ── Correction C — Plan 5 (AJUSTES Y DEVOLUCIONES / CLAWBACK) ──
-- The DAG references Monto_Original, Tasa_Comision_Original, Multiplicador_Acelerador_Original —
-- the latter two are OUTPUTS of Plan 1, not data columns, so the binding phase aborts (and the
-- HF-205 "metrics missing" invariant would throw). Replace the DAG with a constant 0 (no data
-- references → no binding abort; January total = 0, correct since returns are in March), and add the
-- per-transaction-reversal modifier the OB-218 clawback engine (Pattern D) reads. Returns live in the
-- Ventas sheets (Folio_Original populated + negative Monto_Total); Folio is globally unique.
UPDATE rule_sets
SET components = jsonb_set(
      jsonb_set(
        components,
        '{variants,0,components,0,calculationIntent}',
        '{"prime":"constant","value":0}'::jsonb
      ),
      '{variants,0,components,0,modifiers}',
      '[{
        "modifier": "temporal_adjustment",
        "adjustmentType": "per_transaction_reversal",
        "referenceMapping": {
          "returnField": "Folio_Original",
          "originalField": "Folio",
          "originalDataType": "transaction"
        },
        "recoveryRate": 1.0,
        "lookbackPeriods": 6,
        "metadata": { "description": "Full reversal of the original transaction commission via stored-trace lookup (OB-218 Pattern D)." }
      }]'::jsonb
    )
WHERE id = 'b8e80151-9b4c-4561-99e2-888f50dc7bfe'
  AND tenant_id = '972c8eb0-e3ae-4e4c-ad30-8b34804c893a';

-- Verify (after apply):
--   SELECT components::text LIKE '%"Alimentos"%' AS p1_has_full_name,
--          components::text LIKE '%"ALI"%'       AS p1_still_coded
--   FROM rule_sets WHERE id='fbff27cc-6c80-4e53-8df6-05ece8414f37';
--   SELECT components#>'{variants,0,components,0,modifiers}' AS p5_modifier
--   FROM rule_sets WHERE id='b8e80151-9b4c-4561-99e2-888f50dc7bfe';

-- ── Correction B (Plan 2 temporal binding) — DOCUMENTED, NOT APPLIED ──
-- Plan 2 (BONO POR CUOTA MENSUAL) has NO convergence_bindings (the wide-format Cuotas sheet
-- Enero_2025..Junio_2025 caused the LLM to abstain). The calc-time temporal RESOLUTION is now built
-- (OB-220: ConvergenceBindingEntry.columnMap + effCol/effRed in resolveMetricsFromConvergenceBindings).
-- Generate the binding via a convergence re-bind (wire detectTemporalColumnMap into the abstain path),
-- OR hand-author it, e.g. (verify entity keying — Cuotas keys by DNI, Ventas by DNI_Vendedor):
--   input_bindings.convergence_bindings.component_0 = {
--     "entity_identifier": { "column": "DNI_Vendedor" },
--     "ventas_brutas_mensuales": { "column": "Monto_Total", "reduction": "sum" },
--     "cuota_mensual_asignada": { "column": "",
--        "columnMap": {"2025-01":"Enero_2025","2025-02":"Febrero_2025","2025-03":"Marzo_2025",
--                      "2025-04":"Abril_2025","2025-05":"Mayo_2025","2025-06":"Junio_2025"},
--        "reduction": "snapshot" } }

-- ── Correction D (Plan 4 verified-count) — DOCUMENTED, NOT APPLIED (OB-214 structural) ──
-- Plan 4 (BONO POR CARTERA NUEVA) is multiply(aggregate(count, Codigo_Cliente_Nuevo), 150). It must
-- count VERIFIED new clients only and scope activeRows to the Clientes_Nuevos sheet, i.e.
-- multiply(filter(Verificado==true) -> aggregate(count), 150). This is a structural re-interpretation
-- (OB-214 class); see the completion report.
