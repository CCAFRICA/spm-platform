# HF-373 Phase 0 — EPG-0.2

**Verdict:** CONFIRMED

**Root cause:**  

**HALT-1 notes:** Framing CONFIRMED with two precision refinements: (1) the tokens are scavenged from committed_data.row_data string VALUES (all columns, including underscore metadata like _sheetName="Datos" and ID/branch/date/name fragments) — the "file fragments" in the log are the _sheetName column plus external-ID substrings, not the storage filename; (2) the 13 survivors survive not because of their OWN role but because manager-attributed subordinate roster rows leak 'ejecutivo'/'senior' tokens into their token sets — 4 discriminant-match variant_0, 9 fall to variant_1 via default_last; V1's discriminant set is structurally EMPTY. Both refinements strengthen, not contradict, the directive.

**Fix implications:** The fix must make variant selection read the entity's model-recognized role attribute instead of scavenging row-value tokens. Constraints and touchpoints observed: (1) The authoritative role is ALREADY computed in the exact scope where matching happens — materializedState (run/route.ts:2043-2091) resolves temporal_attributes as-of period end with entities.metadata.role backstop, and is persisted to period_entity_state.resolved_attributes; the matcher (2356-2434) must consult materializedState.get(entityId) (e.g., match resolved role value against variantName/variantId per variant, exact/normalized equality) BEFORE any token fallback. (2) Structural trap to eliminate: discriminant-token logic can never select a variant whose name is a token-subset of another ("Ejecutivo" ⊂ "Ejecutivo Senior" → V1 discriminants = []); any residual token path must not rely on discriminant uniqueness across nested names. (3) The OB-194 exclusion gate (2414-2433) currently drops 72/85 of the population; with role-attribute matching, exclusion should fire only when the resolved role matches NO variant — and both live variants carry eligibilityCriteria:{} (empty) and population_config.eligible_roles=[], so variant identity must come from variantName/variantId (present and distinct in rule_sets.components.variants) unless eligibilityCriteria gets populated upstream. (4) Label fix: run/route.ts:2440 must render the SELECTED VARIANT's identity (variants[selectedVariantIndex].variantName) for the variant part of variantKey (entity role can remain as a separate field); this key feeds T2 result lines (3436) and the T1 variantDistribution footer (3874-3875). (5) Data caveat the fix must tolerate: import stamps temporal_attributes.effective_from with the IMPORT date (2026-07-02), which post-dates all calc periods (2025-10..2026-03), so as-of resolution yields nothing and only metadata.role survives — role matching must accept the metadata.role backstop (it does today via 2083) or import must stamp period-true effective_from. (6) Row-attribution side-finding (separate but adjacent): Personal-sheet rows attach to the MANAGER via entity_id_field="ID_Gerente", so an entity's own roster values are never its own signal — any future row-derived matching must not assume self-attribution. Files: web/src/app/api/calculation/run/route.ts only (matcher, gate, label); tables read: rule_sets.components.variants, entities.metadata/temporal_attributes, period_entity_state; no migration required. Note: all 13 included results have total_payout=0 — a separate defect (component binding/metrics), out of EPG-0.2 scope but visible in the same batches.

## Evidence

### web/src/app/api/calculation/run/route.ts:2012-2034 — (a) tokenizer + variant token sets + discriminants

```
  // HF-119: Token overlap variant matching — build token sets once before entity loop
  const variantTokenize = (text: string): string[] =>
    text
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove accents
      .replace(/[^a-z0-9\s_]/g, ' ')
      .split(/[\s_]+/)
      .filter(t => t.length > 2);

  const variantTokenSets = variants.map(v => {
    const text = [
      String(v.variantName ?? ''),
      String(v.description ?? ''),
      String(v.variantId ?? ''),
    ].join(' ');
    return new Set(variantTokenize(text));
  });

  // Discriminant tokens: tokens unique to each variant (not in any other variant)
  const variantDiscriminants = variantTokenSets.map((tokens, i) => {
    const otherTokens = new Set<string>();
    variantTokenSets.forEach((t, j) => { if (j !== i) t.forEach(tok => otherTokens.add(tok)); });
    return new Set(Array.from(tokens).filter(t => !otherTokens.has(t)));
  });
```

### web/src/app/api/calculation/run/route.ts:2356-2369 — (a) what is tokenized: ALL string values of the entity's committed rows (row_data), incl. underscore metadata columns; NOT the materialized role

```
    if (variants.length > 1) {
      // Build entity token set from ALL string field values
      const entityTokens = new Set<string>();
      for (const row of entityRowsFlat) {
        const rd = (row.row_data && typeof row.row_data === 'object' && !Array.isArray(row.row_data))
          ? row.row_data as Record<string, unknown> : {};
        for (const val of Object.values(rd)) {
          if (typeof val === 'string' && val.length > 1) {
            for (const token of variantTokenize(val)) {
              entityTokens.add(token);
            }
          }
        }
      }
```

### web/src/app/api/calculation/run/route.ts:2372-2399 — (a) matching: discriminant argmax, then total overlap, then default_last

```
      const discScores = variantDiscriminants.map((disc, i) => {
        const matched = Array.from(disc).filter(t => entityTokens.has(t));
        return { index: i, matches: matched.length, tokens: matched };
      });
      discScores.sort((a, b) => b.matches - a.matches);

      let method = 'default_last';
      if (discScores[0].matches > (discScores[1]?.matches ?? 0)) {
        // Clear discriminant winner
        selectedVariantIndex = discScores[0].index;
        method = 'discriminant_token';
      } else {
        // Tie on discriminants — try total overlap
        const overlapScores = variantTokenSets.map((tokens, i) => ({
          index: i,
          overlap: Array.from(tokens).filter(t => entityTokens.has(t)).length,
        }));
        overlapScores.sort((a, b) => b.overlap - a.overlap);

        if (overlapScores[0].overlap > (overlapScores[1]?.overlap ?? 0)) {
          selectedVariantIndex = overlapScores[0].index;
          method = 'total_overlap';
        } else {
          // Still tied — default to last variant (less-specific / Standard)
          selectedVariantIndex = variants.length - 1;
          method = 'default_last';
        }
      }
```

### web/src/app/api/calculation/run/route.ts:2410-2433 — (a) the exclusion gate (OB-194): tokens absent → entity dropped from calculation with `continue`

```
      // OB-194: Variant Eligibility Gate
      // When a plan defines 2+ variants (explicit population segments) and an entity
      // matches NONE with score > 0, the entity is excluded from calculation.
      // Architecture: "An entity matching NO variant is an explicit error, not a silent zero."
      if (method === 'default_last') {
        const bestDiscScore = discScores[0]?.matches ?? 0;
        const bestOverlap = variantTokenSets.reduce((best, tokens) => {
          const overlap = Array.from(tokens).filter(t => entityTokens.has(t)).length;
          return Math.max(best, overlap);
        }, 0);

        if (bestDiscScore === 0 && bestOverlap === 0) {
          const entityName = entityInfo?.display_name ?? entityId;
          const tokenList = Array.from(entityTokens).slice(0, 10).join(',');
          console.log(`[VARIANT] ${entityName}: NO MATCH — excluded (disc=0, overlap=0, variants=${variants.length}, tokens=[${tokenList}])`);
          excludedEntities.push({
            entityId,
            entityName,
            externalId: entityInfo?.external_id ?? entityId,
            reason: 'no_qualifying_variant',
            tokens: tokenList,
          });
          continue; // Skip calculation for this entity
        }
      }
```

### web/src/app/api/calculation/run/route.ts:2043-2091 (build) + 2094-2108 (period_entity_state write) — (b) materializedState EXISTS in this exact scope: role resolved from temporal_attributes as-of period date, with metadata.role backstop

```
  const materializedState = new Map<string, Record<string, unknown>>();
  if (variants.length > 1) {
    ...
      if (entitiesWithAttrs.length > 0) {
        for (const ent of entitiesWithAttrs) {
          const attrs = (ent.temporal_attributes || []) as Array<{ key: string; value: Json; effective_from: string; effective_to: string | null }>;
          const resolved: Record<string, unknown> = {};
          // Resolve each temporal attribute as-of period date
          const sorted = [...attrs].sort((a, b) => (b.effective_from || '').localeCompare(a.effective_from || ''));
          for (const attr of sorted) {
            if (attr.key in resolved) continue;
            if (attr.effective_from && attr.effective_from > asOfDate) continue;
            if (attr.effective_to && attr.effective_to < asOfDate) continue;
            resolved[attr.key] = attr.value;
          }
          // Also include metadata.role if present (backward compat)
          const meta = (ent.metadata || {}) as Record<string, unknown>;
          if (meta.role && !resolved['role']) resolved['role'] = meta.role;
          if (Object.keys(resolved).length > 0) {
            materializedState.set(ent.id, resolved);
          }
        }
```

### web/src/app/api/calculation/run/route.ts:2121-2146 — (b) VARIANT-DIAG proves availability: the diagnostic block reads materializedState.get(eid) and even tokenizes it ('what tokens WOULD be generated'), but the actual matcher at 2358-2369 never touches it. grep 'materializedState' → ONLY lines 2043,2085,2088,2094,2096,2121,2126,2132,2146 — zero uses inside the entity loop (2328-2435)

```
      const resolvedAttrs = materializedState.get(eid);
      ...
      addLog(`[VARIANT-DIAG] ${eName}: materializedState=${JSON.stringify(resolvedAttrs || {})}`);
      ...
      // Show what tokens would be generated from materializedState
      const testTokens = new Set<string>();
      if (resolvedAttrs) {
        for (const val of Object.values(resolvedAttrs)) {
          if (typeof val === 'string' && val.length > 1) {
            for (const token of variantTokenize(val)) {
              testTokens.add(token);
            }
          }
        }
      }
      addLog(`[VARIANT-DIAG] ${eName}: generated tokens=[${Array.from(testTokens).join(',')}]`);
```

### web/src/app/api/calculation/run/route.ts:2437-2441 — (c) label source: parenthesized label = ENTITY's metadata.role, NOT the variant's name

```
    // HF-212: Increment variant distribution counter for non-excluded entities.
    // Variant key composition: variant_<index>(<role>) — index for engine routing,
    // role for population-segment granularity. Surfaced in Tier 1 footer.
    const variantKey = `variant_${selectedVariantIndex}(${(entityInfo as { metadata?: { role?: string } })?.metadata?.role ?? 'unknown'})`;
    variantCounts.set(variantKey, (variantCounts.get(variantKey) ?? 0) + 1);
```

### web/src/app/api/calculation/run/route.ts:3436 (T2 result line) + 3874-3875 (T1 footer) — (c) where the label is printed

```
      addLog(`[CalcRecon-T2] ${t2ExternalId} | ${t2EntityName} | variant=${variantKey} | total=${entityTotal} | components=[${t2Breakdown}] | flags=[${currentEntityFlags.join(',')}]`);
...
  const t1VariantBreakdown = Array.from(variantCounts.entries()).map(([k, v]) => `${k}:${v}`).join(' | ');
  addLog(`[CalcRecon-T1] variantDistribution={${t1VariantBreakdown}}`);
```

### _hf373_epg02_variant_evidence.ts — (d) live rule_set variants verbatim (VLTEST2, rule_sets.components.variants)

```
--- rule_set id=91f822b1-186e-419b-9627-64d801fe323f name="BANCO CUMBRE DEL LITORAL" status=active updated=2026-07-02T01:02:15.508721+00:00
  components keys = ["variants"]
  VARIANTS count=2
  V0 meta = {"variantId":"senior","description":"Ejecutivo Senior","variantName":"Ejecutivo Senior","eligibilityCriteria":{}}
  V0 components (4) = [Colocación de Crédito | Captación de Depósitos | Productos Cruzados | Cumplimiento Regulatorio]
  V1 meta = {"variantId":"ejecutivo","description":"Ejecutivo","variantName":"Ejecutivo","eligibilityCriteria":{}}
  V1 components (4) = [Colocación de Crédito | Captación de Depósitos | Productos Cruzados | Cumplimiento Regulatorio]
  population_config = {"eligible_roles":[]}
NOTE: eligibilityCriteria is EMPTY {} on both variants; population_config.eligible_roles is [].
```

### _hf373_epg02_token_simulation.ts — (d)+(a) live variant token sets and discriminants computed by the EXACT code algorithm: V1 discriminant set is EMPTY (Ejecutivo ⊂ Ejecutivo Senior)

```
V0 tokenSet = [ejecutivo,senior]  (from name="Ejecutivo Senior" desc="Ejecutivo Senior" id="senior")
V1 tokenSet = [ejecutivo]  (from name="Ejecutivo" desc="Ejecutivo" id="ejecutivo")
V0 DISCRIMINANTS = [senior]
V1 DISCRIMINANTS = []
```

### _hf373_epg02_variant_evidence.ts — (d) 3 sample entities: role lives in entities.metadata.role AND temporal_attributes (nivel_cargo/Nivel_Cargo keys); all temporal effective_from=2026-07-02 (import date) which POST-DATES every calc period (2025-10..2026-03) so as-of resolution drops them and only metadata.role survives into materializedState

```
--- entity BCL-5001 "Adriana Reyes Molina"
    metadata = {"role":"Ejecutivo Senior","region":"ALL","nivel_cargo":"Ejecutivo Senior","sucursal_id":"HQ","fecha_ingreso":"2015-03-10"}
    temporal_attributes = [{"key":"sucursal_id","value":"HQ","source":"import","effective_to":null,"effective_from":"2026-07-02"},{"key":"nivel_cargo","value":"Ejecutivo Senior","source":"import","effective_to":null,"effective_from":"2026-07-02"},...,{"key":"Nivel_Cargo","value":"Ejecutivo Senior","effective_to":null,"effective_from":"2026-07-02"}]
--- entity BCL-5002 "Fernando Hidalgo Paredes"
    metadata = {"role":"Ejecutivo Senior",...}
--- entity BCL-5003 "Gabriela Vascones Delgado"
    metadata = {"role":"Ejecutivo Senior",...}
=== role distribution across 85 entities:
    13x  metaRole="Ejecutivo Senior" tempRole=undefined
    72x  metaRole="Ejecutivo" tempRole=undefined
```

### _hf373_epg02_variant_evidence.ts — (d) the materialized state store: period_entity_state (written at run/route.ts:2094-2108), 255 rows for VLTEST2; matches the directive's materializedState={"role":"Ejecutivo"} log exactly

```
=== period_entity_state keys = ["id","tenant_id","entity_id","period_id","resolved_attributes","resolved_relationships","entity_type","status","materialized_at"]
    resolved_attributes={"role":"Ejecutivo Senior"} entity_id=f1189abf-3d13-4c9e-8463-2b51af821c1f period_id=8fcd6564-f183-4538-9378-6172145b5232
    resolved_attributes={"role":"Ejecutivo Senior"} entity_id=f0f8da02-a043-4318-9036-95c1d13485e5 period_id=8fcd6564-f183-4538-9378-6172145b5232
    resolved_attributes={"role":"Ejecutivo"} entity_id=851adf67-c55a-4800-8249-bbea6fd38d7e period_id=8fcd6564-f183-4538-9378-6172145b5232
    total rows=255
```

### _hf373_epg02_variant_evidence.ts — (e) last calc runs (2026-07-02T01:04-01:05, evidentiary window): calculation_batches.summary persists excluded_count=72, entity_count=13, total_payout=0 on EVERY period's batch

```
--- batch c5f04eac-003c-4ae7-a85a-4da7fe7b1b7c state=PREVIEW created=2026-07-02T01:05:03.64217+00:00 entity_count=13 rule_set_id=91f822b1-186e-419b-9627-64d801fe323f period_id=2e12b59d-7785-44d9-83ff-20a33cdf131a
    summary={..."entity_count":13,"total_payout":0,"rule_set_name":"BANCO CUMBRE DEL LITORAL","excluded_count":72,"component_count":4}
--- batch 37e0698a-d76b-48f2-84c6-731c7636a459 state=PREVIEW created=2026-07-02T01:04:56 ... excluded_count":72 ...
--- batch c94d24c5-a0e2-458f-a8e7-32ecc3e2899c state=PREVIEW created=2026-07-02T01:04:50 ... excluded_count":72 ...
```

### _hf373_epg02_excluded_confirm.ts — (e) exactly WHICH entities: 13 calculation_results rows for latest batch = ALL 13 metadata.role="Ejecutivo Senior" entities (all payout=0); the 72 with no result = ALL 72 role="Ejecutivo" entities

```
INCLUDED (13): BCL-5024, BCL-5001, BCL-5002, BCL-5077, BCL-5004, BCL-5033, BCL-5043, BCL-5052, BCL-5069, BCL-5015, BCL-5061, BCL-5005, BCL-5003 — every one role="Ejecutivo Senior" payout=0
EXCLUDED (72) role distribution: {"Ejecutivo":72}
  first 10 excluded: BCL-5006, BCL-5007, BCL-5008, BCL-5009, BCL-5010, BCL-5011, BCL-5012, BCL-5013, BCL-5014, BCL-5016
period 2e12b59d key=monthly_2025-11-01_2025-11-30 start=2025-11-01 end=2025-11-30  <-- batch period
```

### _hf373_epg02_token_simulation.ts — full matcher simulation over live data reproduces the run EXACTLY (13 in / 72 out) and shows BOTH variant indices are populated ONLY by Ejecutivo-Senior-role entities → both render "(Ejecutivo Senior)" via route.ts:2440

```
=== simulated matcher outcomes over 85 entities-with-rows:
  4x variant_0 via discriminant_token (metaRole=Ejecutivo Senior)  e.g. [BCL-5002,BCL-5003,BCL-5004,BCL-5001]
  9x variant_1 via default_last (metaRole=Ejecutivo Senior)  e.g. [BCL-5005,BCL-5015,BCL-5024,BCL-5033,BCL-5043,BCL-5052]
  72x EXCLUDED (metaRole=Ejecutivo)  e.g. [BCL-5016,BCL-5017,BCL-5018,BCL-5019,BCL-5020,BCL-5021]
```

### _hf373_epg02_token_simulation.ts — token provenance: the 13 survivors get 'ejecutivo'/'senior' tokens from their SUBORDINATES' Personal-sheet rows (attributed to the manager via ID_Gerente), not from their own role

```
ENTITY BCL-5005 "Carlos Mauricio Reyes Vega" metaRole="Ejecutivo Senior" rows=15 dataTypes=[entity,transaction]
  tokenSources: oficial<-(Cargo="Oficial de Crédito") ; costa<-(Region="Costa") ; bcl<-(ID_Gerente="BCL-5005") ; 5005<-(ID_Gerente="BCL-5005") ; personal<-(_sheetName="Personal") ; 5014<-(ID_Empleado="BCL-5014") ; ejecutivo<-(Nivel_Cargo="Ejecutivo") ; gye<-(Sucursal_ID="BCL-GYE-001") ; ...
  discScores=[{"index":0,"matches":0},{"index":1,"matches":0}] → variant_1 via default_last (metaRole=Ejecutivo Senior)
fallbackEntityIdField="ID_Gerente"
data_type counts: {"entity":85,"reference":20,"transaction":510}
```

### _hf373_epg02_excluded_confirm.ts — (a) proof of what the excluded entities' tokens ARE (matches the directive's live log [2026,bcl,mac,001,datos,5078,rosa,...]): only Datos transaction rows attach to non-managers; their string values contain no role words

```
sample excluded entity: BCL-5006 "Ricardo José Andrade Mendieta"
  FK row dt=transaction row_data={"Periodo":"2025-12-01","Sucursal":"BCL-GYE-001","_rowIndex":5,"_sheetName":"Datos","ID_Empleado":"BCL-5006","Meta_Depositos":35000,"Meta_Colocacion":120000,"Nombre_Completo":"Ricardo José Andrade Mendieta","Monto_Colocacion":118319.36,...} meta.entity_id_field="ID_Empleado"
→ tokenize yields [2025,gye,001,datos,bcl,5006,ricardo,jose,andrade,mendieta,...] — 'datos' from _sheetName, 'bcl/5006' from ID, name fragments (log's 'rosa','mac' = another entity's name + sucursal code) — zero variant words → disc=0, overlap=0 → excluded
```

### web/src/app/api/calculation/run/route.ts:880-917 — how rows attach to entities (why roster rows land on the manager): per-row metadata.entity_id_field, else global fallback

```
    if (!resolvedEntityId) {
      const rowMeta = row.metadata as Record<string, unknown> | null;
      const rowEntityIdField = (rowMeta?.entity_id_field as string) || fallbackEntityIdField;
      if (rowEntityIdField) {
        const rd = row.row_data as Record<string, unknown> | null;
        const extId = rd?.[rowEntityIdField];
        if (extId != null) {
          resolvedEntityId = extIdToUuid.get(String(extId).trim()) || null;
...
      flatDataByEntity.get(resolvedEntityId)!.push({ row_data: row.row_data });
```

