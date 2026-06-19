-- OB-218 Correction A: MIR Ventas plan category-code -> full Spanish names.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════╗
-- ║  DEFERRED — DO NOT APPLY YET.                                                          ║
-- ║  MIR's convergence bindings are cross-wired: the Ventas plan ("COMISIONES POR VENTA    ║
-- ║  MAYORISTA", 3c195e87) binds Categoria -> column "Monto_Cobrado" and Monto_Total ->    ║
-- ║  "Saldo_Pendiente" (both COBRANZA columns), and period -> "Fecha_Cobro". So Categoria  ║
-- ║  never resolves to the Categoria column at all — applying this code fix changes nothing ║
-- ║  observable until the bindings are REGENERATED (convergence re-bind / re-import; OB-214 ║
-- ║  class, out of OB-218 scope). Apply this AFTER MIR bindings are corrected.             ║
-- ╚══════════════════════════════════════════════════════════════════════════════════════╝
--
-- The plan's prime-DAG conditional compares row_data.Categoria to 3-letter codes; the data carries
-- full Spanish names. Codes -> names:  ALI -> Alimentos,  BEB -> Bebidas,  LIM -> Limpieza.
-- Replacement targets the standalone quoted JSON string values (e.g. "ALI"), so it cannot touch
-- substrings. Scoped to the single Ventas rule_set + tenant.
--
-- NOTE (architect disposition): the data also contains a 4th category "Cuidado Personal" with NO
-- code/condition in the plan; after this fix it falls to the else-branch rate (0.035). Confirm
-- whether "Cuidado Personal" needs its own rate condition.

UPDATE rule_sets
SET components = replace(replace(replace(
      components::text,
      '"ALI"', '"Alimentos"'),
      '"BEB"', '"Bebidas"'),
      '"LIM"', '"Limpieza"')::jsonb
WHERE id = '3c195e87-b970-4c5e-975b-e4e9039092c8'
  AND tenant_id = '972c8eb0-e3ae-4e4c-ad30-8b34804c893a';

-- Verify (after a future apply): the conditional constants are full Spanish names.
-- SELECT components::text LIKE '%"Alimentos"%' AS has_alimentos,
--        components::text LIKE '%"ALI"%'       AS still_has_code
-- FROM rule_sets WHERE id = '3c195e87-b970-4c5e-975b-e4e9039092c8';
