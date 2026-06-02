# HF-262 R2 — Lever-Confirmation ADR (Phase 1, READ-ONLY)

**HF:** HF-262 R2 — Meridian Fleet (C5) boundary-metadata population + scope guard + hub-payee exclusion
**Date:** 2026-06-01 · **HEAD read:** `03eba21e` (branch `dev`)
**Tenant:** Meridian `5035b1e8-0754-4527-b7ec-9f93f85e4c79` · rule_set `2fb555d4-53fe-42e8-9662-cae3d07da4f4`
**Cites:** `DIAG-58_AGGREGATE_SCOPE_CAPABILITY_OUTPUT.md`, `AUD-005_..._e85a7678.md`
**Classification:** read-only. **No code, no SQL, no calc run.**

> **VERDICT: HALT-1 (on §3.1) — and a deeper refutation the directive's gate does not cover.**
> §3.1 is **NO**: the enrichment dictionary does not carry the hub boundary for employees, and hub
> (reference-provenance) entities never traverse the enrichment-spread path at all. The directive's own
> HALT-1 fires. **Beyond that, Phase-1 reading shows D1 (boundary-in-metadata) is *inert* for the fleet
> even if §3.1 were satisfied:** the fleet `reference`-tree intent resolves its metrics by
> **employee-keyed column lookup**, which never reads `entities.metadata` and never invokes the scope
> prime. The R2 premise — "the existing scope prime resolves the fleet the instant the boundary is in
> `entities.metadata`" — holds only for a **scope-node intent**, which the fleet is not. Await architect
> disposition.

---

## §3.1 — Enrichment-spread population path → **NO** (HALT-1)

**The HF-190 enrichment-spread write-site** (`app/api/import/sci/execute-bulk/route.ts:588-601`, `processEntityUnit`):
```ts
temporal_attributes: buildTemporalAttrs(meta?.enrichment || {}) as Json[],
metadata: {
  ...(meta?.enrichment || {}),  // HF-190: All enrichment fields in metadata for scope resolution
  ...(meta?.role ? { role: meta.role } : {}),
  ...(meta?.licenses ? { product_licenses: meta.licenses } : {}),
} as Record<string, Json>,
```
**The enrichment-*collection*** (`:516-552`):
```ts
const enrichmentBindings = unit.confirmedBindings.filter(b =>
  b.semanticRole === 'entity_attribute' || b.semanticRole === 'descriptive_label');   // :518-519
...
for (const binding of enrichmentBindings) {
  const val = row[binding.sourceField];
  if (val != null && typeof val === 'string' && val.trim()) {
    const normalizedKey = binding.sourceField.toLowerCase().replace(/[\s]+/g, '_');
    meta.enrichment[normalizedKey] = val.trim();                                       // :543-548
  }
}
```

**Live state (HEAD `03eba21e`):**
- **Employees** carry `metadata = {region, fecha_ingreso, tipo_coordinador}` — the enrichment-spread works, but the **hub-grouping boundary is absent** (the hub field is not among the collected `entity_attribute`/`descriptive_label` bindings).
- **Hubs** carry `metadata = {}`. Hub entities are **reference-provenance** (created from the `Datos_Flota_Hub`/`reference` sheet); they are **not processed by `processEntityUnit`**, so they never reach the enrichment-spread at all.

⇒ The enrichment dictionary does **not** structurally carry the hub boundary for **either** population. Per §3.1: **HALT-1.** And per §0/§2: extending the store-field literal in `store-metadata-population.ts` is **AP-25/HALT-2** — not done.

---

## §3.1-DEEPER — D1 is inert for the fleet even if the boundary were populated

This is the decisive finding, and it is *not* what §3.1's gate checks — but it determines whether the whole R2 mechanism can work.

**The fleet intent is a `reference` tree with no scope node** (live, `03eba21e`):
- `componentType = prime_dag`; intent top prime `arithmetic`; `JSON.stringify(intent).includes('"scope"') === false`.
- Shape: `multiply( conditional( gt(divide(ref:cargas_totales_hub, ref:capacidad_total_hub), 1.5) ? 1.5 : divide(…) ), 800 )`.

**The fleet metric is resolved by employee-keyed column lookup, never via entity metadata** — `resolveMetricsFromConvergenceBindings` prime_dag branch (`run/route.ts:1318-1337`):
```ts
if (compType === 'prime_dag' || intentIsPrimeNode) {
  const refs = extractReferencesFromDAG(intent);              // ['cargas_totales_hub','capacidad_total_hub']
  for (const field of refs) {
    const fieldBinding = compBindings[field];                 // → column 'Cargas_Totales' / 'Capacidad_Total'
    const rawValue = resolveColumnFromBatch(fieldBinding.column, lookupKey, fieldBinding.filters);
    if (rawValue === null) continue;                          // hub column, employee key → null → metric absent
    dagMetrics[field] = ...;
  }
}
```
`resolveColumnFromBatch` keys strictly on the entity external id (`:1480 map.get(entityExternalId)`); **it does not read `entities.metadata`.** Live binding (`component_4`): `entity_identifier = No_Empleado`, **no `via`**; `cargas_totales_hub → Cargas_Totales`, `capacidad_total_hub → Capacidad_Total` (the hub-keyed reference columns), **no `via`, no `scope`**.

**Therefore:** the fleet `reference` prime reads `context.metrics['cargas_totales_hub']`, which is populated only if `resolveColumnFromBatch('Cargas_Totales', <employee>)` finds a row — it cannot (hub-keyed column, employee key). **The scope prime (the one path that reads `entities.metadata[boundary]`) is never invoked, because the fleet intent contains no `scope` node.** Populating the boundary into `entities.metadata` changes nothing for this resolution path.

**Cross-check against DIAG-58:** line `(b′) = 500` used a **synthetic `scope` node** (`scope(hub)→aggregate(sum,loads)`); line `(c2) = 960` used the persisted `reference` tree **with metrics already present**. Neither shows the persisted reference-tree fleet resolving from metadata. The R2 directive read `(b′)` as "metadata population alone fixes it" — but `(b′)` presumes a **scope-node intent**. The persisted fleet intent is not one.

**Consequence:** D1 + D2 + D3 as specified (no `calculationIntent` edit, §3.5) **cannot produce a nonzero fleet** — Phase-3 gate 5.1 (fleet nonzero) would fail. The R2 mechanism is contradicted by live code.

---

## §3.2 — Scope-prime guard site (D2) — confirmed, valid independently
`intent-executor.ts:223-238`; the boundary-match line is `:232-234`:
```ts
.filter(r => r.entityMetadata[node.boundary] === boundaryValue
          && r.entityMetadata.entityId !== selfEntityId)
```
When `boundaryValue` is `undefined`, every sibling whose `entityMetadata[boundary]` is also `undefined` matches (AUD-005 §7 footgun). The guard lands here (reject null/undefined `boundaryValue`). **This fix is sound and tenant-general regardless of the fleet outcome** — but note it only matters once a `scope`-node intent exists and a boundary is populated.

## §3.3 — Hub-payee exclusion via roster provenance (D3) — confirmed, valid independently
- Roster filter (`run/route.ts:1007-1052`); Tier-3 literal keyword list `['datos colaborador','roster','employee','empleados']` (`:1025`) — Meridian's `Plantilla` matches none → filter inert → 12 hubs paid.
- Provenance signal: hub = no person-roster (`entity`/`Plantilla`) committed_data row; `external_id` = hub name; `metadata={}`.
- **Source/recipient ordering confirmed:** `dataByEntity` is built from **all** entities' committed_data (`:634-710`); `allEntityRowsForPeriod` is built at `:1704-1720`; `calculationEntityIds` is filtered at `:1046` — earlier in file order but the **payee** set is independent of `dataByEntity`. Hubs can be dropped from payees while their reference rows remain the fleet scope **source**. **D3 is sound and implementable independently.**

## §3.4 — DD-7 isolation — confirmed
The four non-fleet components bind to **employee-keyed** columns (e.g. `component_0 → Ingreso_Meta/Ingreso_Real`, batch `50b6d0d5`) and resolve via `resolveColumnFromBatch` on `No_Empleado`. None reads entity metadata, the scope prime, or the hub columns. Untouched by D1/D2/D3.

---

## §3.5 — ADR verdict
- **§3.1 = NO → HALT-1** (the directive's own gate).
- **Deeper:** D1 is **inert for the fleet** — the fleet `reference`-tree intent resolves via employee-keyed column lookup and never invokes the scope prime. **R2's core premise (D1 alone resolves the fleet) is refuted by live code.**
- **D2 and D3 are sound and independently implementable**, but D2 only bites once a scope-node fleet intent + populated boundary exist; D3 alone fixes the phantom payees but not the zero fleet.

### Corrected lever landscape (for architect disposition — HALT-1)
To make the fleet **resolve nonzero through the one scope prime**, the persisted fleet intent must be a **scope node**, AND the boundary must be populated:
1. **Scope-node emission (the SR-42 surface R2 rejected) + D1.** Reshape the fleet intent to `divide( scope(hubBoundary)→aggregate(sum, loads), scope(hubBoundary)→aggregate(sum, capacity) )` (under the existing conditional/rate), and populate the hub boundary into **hub + employee** entity metadata. **DIAG-58 `(b′)=500` proves exactly this composition projects the hub's reference value onto members.** (R2's claim that `scope_aggregate` is "the wrong shape, peer-sum" is imprecise: summing `loads` over the scoped siblings — where the hub's single reference row is the only carrier of `loads` — yields the hub's loads, i.e. the projection.) This **is** a convergence/intent-emission change → **SR-42 fires**, contrary to §1.
2. **HF-216 via-join binding (alternative, also emission-side).** `resolveMetricsFromConvergenceBindings` already supports a `via` roster-join that translates the lookup key (`:1287-1304`). A fleet binding with `via: {employee → hub}` (resolving `Hub_Asignado===Hub` structurally) would let `resolveColumnFromBatch` read `Cargas_Totales` from the hub's reference row **without the scope prime and without metadata population**. This is a convergence-binding (emission) change → **also SR-42**.
3. **Metrics-injection** — rejected (AP-17/HALT-6), as both R1 and R2 agree.

**Every viable lever that makes the fleet nonzero touches the SR-42 emission/binding surface.** R2's premise that the edits "none touches convergence-bound calculation math or intent emission" cannot hold while keeping the fleet a `reference` tree. This is the architect decision the HALT surfaces.

**No edits performed. D1/D2/D3 not implemented. Awaiting architect disposition.**

*HF-262 ADR R2 — read-only at `03eba21e`. HALT-1 on §3.1 + live-code refutation of the D1-only mechanism. No code, no SQL, no calc run.*
