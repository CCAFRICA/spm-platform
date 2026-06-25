# OB-237 T1: WIRE PRODUCTS MODE

**Branch:** `ob-237-materialized-serving-path` (continue)
**Context:** The finer-materialization spec confirmed `products` mode aggregates per-location food (`total_alimentos`) vs beverage (`total_bebidas`) category totals — fields already carried in `summary_artifacts.metrics`. No migration needed. Same proven pattern as timeline/summary/performance.
**Standing rules:** All active. Commit + push after every change. Build clean. Git from repo root.

---

## EXECUTE

Wire `products` to `summary_artifacts` using the identical procedure proven on the 4 preceding modes:

1. **Build `aggregateProductsFromSummaries`** reading `summary_artifacts` with `field_name` measure resolution. Group by entity. Extract food/beverage category metrics from `metrics` JSONB (the keys are the `field_name` equivalents of `total_alimentos` and `total_bebidas` — use `recognize()` to resolve them, same as every other mode).

2. **Wire as summary-primary early-return** in the products handler block, before the raw path.

3. **Value-match grand totals against deterministic truth** ($100,068,158.15 revenue / 263,250 checks). The food + beverage category totals must sum consistently with per-location revenue.

4. **Delete raw `aggregateProducts`** function and its switch case (AP-17).

5. **`npm run build`** — must exit 0.

6. **Commit + push:**
```bash
cd ~/spm-platform && git add -A && \
git commit -m "OB-237 T1: wire products to summary_artifacts — truth-matched, raw path removed" && \
git push origin ob-237-materialized-serving-path
```

7. **Capture timing** (before and after) from dev server log. Add to the empirical performance table in the completion report.

8. **Update completion report** with products result. The T1 wired count is now 5 of 6 wirable modes (network_pulse + timeline + summary + performance + products). Update PR #598.

---

## HALT CONDITIONS

| ID | Trigger | Action |
|---|---|---|
| HALT-BYTEMATCH | Grand totals don't match truth ± $0.01 | Report. Do not delete raw path. |
| HALT-RECOGNIZE | Food/beverage measure keys don't resolve via `recognize()` | Report which keys. The field names may need binding. |
| HALT-BUILD | `npm run build` fails | Fix or revert. |

---

## SCOPE

IN SCOPE: `products` mode in `route.ts`. One mode, one commit.
OUT OF SCOPE: Everything else. The 5 coverage-gap modes (leakage, staff, location_detail, patterns, server_detail) await architect migrations. Do NOT merge PR (SR-44).
