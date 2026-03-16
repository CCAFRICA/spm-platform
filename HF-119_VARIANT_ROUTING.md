# HF-119: VARIANT ROUTING VIA TOKEN OVERLAP MATCHING
## Cross-Language Variant-to-Entity Matching Using Structural Token Scoring

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply
2. `SCHEMA_REFERENCE_LIVE.md` — authoritative column reference

**Read both before writing any code.**

---

## CONTEXT

**The variant routing problem, precisely:**

Plan variants (from AI plan interpretation):
- `variantName: "Senior Logistics Coordinator"`, `description: "Coordinador de Logística Senior"`
- `variantName: "Standard Logistics Coordinator"`, `description: "Coordinador de Logística"`

Data field values (from committed_data, column `Tipo_Coordinador`):
- `"Coordinador Senior"` (26 employees)
- `"Coordinador"` (41 employees)

HF-117's fix: scan entity field VALUES for exact match against `variantName`. Fails because `"Coordinador Senior" ≠ "Senior Logistics Coordinator"` and `"Coordinador" ≠ "Standard Logistics Coordinator"`. All employees default to `variants[0]` (Senior).

**The abstracted problem:** Plan vocabulary (English or mixed) doesn't match data vocabulary (Spanish or any other language). This is the same class of cross-language bridging problem that HF-114 solved for column mapping. The solution pattern is the same: token overlap scoring.

**The proven pattern:** HF-082 used token overlap matching for license-to-plan assignment. Tokenize both strings, remove noise words, count overlapping tokens. Highest overlap wins. This works across languages because many domain terms are shared or cognate (coordinator/coordinador, senior/senior, logistics/logística).

---

## THE MATCHING ALGORITHM

For each entity, for each variant, compute a token overlap score:

**Step 1: Build variant token sets** (once per calculation, not per entity)
For each variant, tokenize `variantName` + `description` + `variantId`:
```
Variant 0: "Senior Logistics Coordinator" + "Coordinador de Logística Senior" + "senior_coordinator"
→ tokens: {senior, logistics, coordinator, coordinador, logistica, senior_coordinator}

Variant 1: "Standard Logistics Coordinator" + "Coordinador de Logística" + "standard_coordinator"  
→ tokens: {standard, logistics, coordinator, coordinador, logistica, standard_coordinator}
```

**Step 2: Build entity token set** (from ALL string field values in entity's committed_data)
```
Claudia's row_data includes: "Coordinador", "Norte", "Monterrey Hub", "Claudia Cruz Ramírez"
→ tokens: {coordinador, norte, monterrey, hub, claudia, cruz, ramirez}
```

**Step 3: Score each variant**
```
Variant 0 tokens ∩ entity tokens = {coordinador, senior?}
  - "senior" NOT in Claudia's tokens → overlap = {coordinador} → score = 1
  
Variant 1 tokens ∩ entity tokens = {coordinador}
  - overlap = {coordinador} → score = 1

TIE at score 1.
```

**Step 4: Tiebreaker — discriminating tokens**

When scores tie, check which variant has UNIQUE tokens (tokens in that variant but not in any other variant) that appear in the entity data:

```
Variant 0 unique tokens (not in Variant 1): {senior}
Variant 1 unique tokens (not in Variant 0): {standard}

Claudia's data contains "Coordinador" (no "Senior", no "Standard")
→ Neither variant's unique tokens match
```

**Step 5: Reverse check — entity has discriminating tokens**

Check if the entity has tokens that match ONLY one variant's unique tokens:
```
Claudia's token "coordinador" appears in BOTH variants → not discriminating

But wait — "Coordinador Senior" has token "senior"
If the entity value IS "Coordinador Senior", token "senior" matches Variant 0's unique token
If the entity value IS "Coordinador", no unique token match → lower variant index wins (or AI call)
```

**The key insight:** The token `"senior"` is the discriminator. Entities with "senior" in ANY field value → Variant 0. Entities WITHOUT "senior" → Variant 1.

**For this to work generically:** Build a discriminant token set per variant (tokens unique to that variant). Match entity field tokens against discriminant sets. The variant with the most discriminant token matches wins.

```
Variant 0 discriminant: {senior}  
Variant 1 discriminant: {standard}

Entity "Coordinador Senior" → has "senior" → matches Variant 0 discriminant → Senior ✓
Entity "Coordinador" → has neither "senior" nor "standard" → no discriminant match → FALLBACK
```

**Fallback for no discriminant match:** When no discriminant token matches, use the variant with the FEWER unmatched discriminant tokens. Variant 0 expects "senior" (missing) = 1 unmatched. Variant 1 expects "standard" (missing) = 1 unmatched. Still tied → default to `variants[1]` (the less-specific variant, which is typically the Standard/default variant).

**Alternative fallback:** The variant whose description has the highest overlap with entity values. Variant 0 description `"Coordinador de Logística Senior"` — Claudia has `"Coordinador"` → 1 token. Variant 1 description `"Coordinador de Logística"` — Claudia has `"Coordinador"` → 1 token. Still tied.

**The robust approach:** When token matching can't resolve, and there are exactly 2 variants, the entity that LACKS the discriminating token gets the variant that ALSO lacks it. "Senior" is the discriminating token. Claudia lacks "Senior". Variant 1 (Standard) lacks "Senior" in its discriminant expectations. Match by absence.

**Or most simply:** If one variant has the word "senior" (or equivalent seniority indicator) and the entity data contains "senior", route to that variant. Otherwise, route to the other variant. The seniority token is the discriminant.

This must be **structural and language-agnostic.** The algorithm doesn't know what "senior" means — it just knows it's a token that appears in one variant but not the other. ANY discriminating token works the same way.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. Git commands from repo root (spm-platform), NOT from web/.
4. Commit this prompt as first action.
5. DO NOT MODIFY ANY AUTH FILE.
6. Supabase .in() ≤ 200 items.

---

## COMPLETION REPORT RULES (25-28)

25. Report file created BEFORE final build, not after
26. Mandatory structure: Commits → Files → Hard Gates → Soft Gates → Compliance → Issues
27. Evidence = paste code/output. NOT "this was implemented."
28. One commit per phase. Collapsed commits = standing rule violation.

---

## GROUND TRUTH VERIFICATION

| Employee | Tipo_Coordinador | Expected Variant | GT Total |
|---|---|---|---|
| Claudia (70001) | Coordinador | Standard | MX$1,573 |
| Antonio (70010) | Coordinador Senior | Senior | MX$6,263 |

**DO NOT hardcode "Coordinador" or "Senior". The matching must be token-based and structural.**

---

## PHASE 0: DIAGNOSTIC

```bash
echo "============================================"
echo "HF-119 PHASE 0: VARIANT ROUTING CODE"
echo "============================================"

echo ""
echo "=== 1. FIND HF-117's VARIANT ROUTING FIX ==="
grep -n "variant\|variantName\|entityRole\|HF-117" \
  web/src/app/api/calculation/run/route.ts | head -30

echo ""
echo "=== 2. PRINT THE FULL VARIANT SELECTION BLOCK ==="
# Print ~80 lines around the variant routing code
grep -n "variant" web/src/app/api/calculation/run/route.ts | head -5
# Then sed the relevant range

echo ""
echo "=== 3. WHAT TOKEN OVERLAP UTILITIES EXIST? ==="
# HF-082 implemented token overlap for license matching
grep -rn "tokenize\|tokenOverlap\|matchLicense\|NOISE_WORDS" \
  web/src/ --include="*.ts" | head -15

echo ""
echo "=== 4. HOW DOES THE INTENT PATH SELECT VARIANTS? ==="
# The concordance is broken — intent path doesn't have the gate fix
grep -rn "variant.*intent\|intent.*variant\|selectVariant.*intent" \
  web/src/lib/calculation/ --include="*.ts" | head -10
```

### PHASE 0 DELIVERABLE

Write `HF-119_ARCHITECTURE_DECISION.md`:

```
ARCHITECTURE DECISION RECORD
============================
Problem: Plan variant names (English) don't match data field values (Spanish).
HF-117's exact-match scan finds no match. All employees default to Senior.

VARIANT NAMES IN PLAN:
- Variant 0: variantName="Senior Logistics Coordinator", description="Coordinador de Logística Senior"
- Variant 1: variantName="Standard Logistics Coordinator", description="Coordinador de Logística"

DATA VALUES: "Coordinador Senior", "Coordinador"

APPROACH: Token overlap scoring with discriminant token resolution
- Tokenize variant (name + description + id)
- Tokenize entity field values  
- Score by overlap
- Resolve ties using discriminant tokens (unique to one variant)
- Entity with discriminant token → matching variant
- Entity WITHOUT discriminant token → non-discriminant variant

Korean Test: Zero hardcoded tokens. Discriminant tokens discovered structurally.
Scale: Works for any number of variants, any language combination.
```

**Commit:** `git add -A && git commit -m "HF-119 Phase 0: Variant routing diagnostic + token overlap architecture" && git push origin dev`

---

## PHASE 1: IMPLEMENT TOKEN OVERLAP VARIANT MATCHING

Replace HF-117's exact-match scan with token overlap scoring in the variant routing code.

### Algorithm Implementation

```typescript
function matchEntityToVariant(
  entityRows: any[],
  variants: any[]
): { variantIndex: number; confidence: number; method: string } {
  
  // Step 1: Build variant token sets (name + description + id)
  const variantTokenSets = variants.map(v => {
    const text = [
      v.variantName || '',
      v.description || '',
      v.variantId || ''
    ].join(' ');
    return tokenize(text);
  });
  
  // Step 2: Build discriminant token sets (tokens unique to each variant)
  const discriminants = variantTokenSets.map((tokens, i) => {
    const otherTokens = new Set(
      variantTokenSets.filter((_, j) => j !== i).flatMap(t => t)
    );
    return tokens.filter(t => !otherTokens.has(t));
  });
  
  // Step 3: Build entity token set from ALL string field values
  const entityTokens = new Set<string>();
  for (const row of entityRows) {
    const rd = row.row_data as Record<string, unknown>;
    for (const val of Object.values(rd)) {
      if (typeof val === 'string' && val.length > 1) {
        for (const token of tokenize(val)) {
          entityTokens.add(token);
        }
      }
    }
  }
  
  // Step 4: Score — count discriminant token matches
  const scores = discriminants.map((disc, i) => {
    const matches = disc.filter(t => entityTokens.has(t));
    return { index: i, matches: matches.length, discriminantSize: disc.length, matchedTokens: matches };
  });
  
  // Step 5: Highest discriminant match wins
  scores.sort((a, b) => b.matches - a.matches);
  
  if (scores[0].matches > scores[1]?.matches) {
    return { variantIndex: scores[0].index, confidence: 0.9, method: 'discriminant_token' };
  }
  
  // Step 6: Tie — fall back to total overlap score
  const overlapScores = variantTokenSets.map((tokens, i) => {
    const overlap = tokens.filter(t => entityTokens.has(t));
    return { index: i, overlap: overlap.length };
  });
  overlapScores.sort((a, b) => b.overlap - a.overlap);
  
  if (overlapScores[0].overlap > overlapScores[1]?.overlap) {
    return { variantIndex: overlapScores[0].index, confidence: 0.7, method: 'total_overlap' };
  }
  
  // Step 7: Still tied — default to last variant (typically Standard/default)
  return { variantIndex: variants.length - 1, confidence: 0.5, method: 'default_last' };
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^a-z0-9\s_]/g, ' ')
    .split(/[\s_]+/)
    .filter(t => t.length > 2);
}
```

### Logging

```
[VARIANT] Claudia Cruz Ramírez: discriminant scores [senior:0, standard:0], overlap scores [0:1, 1:1], result=variant_1 (default_last, confidence=0.5)
[VARIANT] Antonio López Hernández: discriminant scores [senior:1, standard:0], result=variant_0 (discriminant_token, confidence=0.9)
```

### Also Fix: Concordance (Intent Path)

The intent path also needs variant routing. If the intent executor has its own variant selection, it must use the same `matchEntityToVariant` function. If it doesn't do variant selection (just uses the first variant's intent), that's why concordance broke.

### Proof Gates — Phase 1

- PG-1: `matchEntityToVariant` function implemented (paste code)
- PG-2: Discriminant token discovery is structural (paste — no hardcoded tokens)
- PG-3: Tokenize removes accents (NFD normalization — paste)
- PG-4: Logging shows variant selection per entity (paste format)
- PG-5: Intent path uses same variant selection (paste evidence)
- PG-6: `npm run build` exits 0

**Commit:** `git add -A && git commit -m "HF-119 Phase 1: Token overlap variant matching with discriminant resolution" && git push origin dev`

---

## PHASE 2: BUILD + PR + PRODUCTION VERIFICATION

```bash
rm -rf .next
npm run build
npm run dev

gh pr create --base main --head dev \
  --title "HF-119: Variant routing via token overlap — cross-language matching" \
  --body "## What
Replace exact-match variant routing with token overlap scoring. Discriminant tokens (unique to one variant) determine the match. Cross-language: plan in English, data in Spanish, matching works structurally.

## Why
Plan variants: 'Senior Logistics Coordinator' / 'Standard Logistics Coordinator' (English)
Data values: 'Coordinador Senior' / 'Coordinador' (Spanish)
HF-117 exact match found no match. All 67 employees defaulted to Senior.

## How
Tokenize variant names+descriptions and entity field values. Find discriminant tokens (unique to each variant). Entity containing 'senior' token → Senior variant. Entity without → Standard variant. No hardcoded tokens — discriminants discovered structurally."
```

### Post-Merge Steps (FOR ANDREW)

1. Merge PR
2. Nuclear clear + re-import (full sequence)
3. Create period + activate plan
4. Calculate
5. Verify:

```sql
-- Grand total must be MX$185,063
SELECT SUM(total_payout) as grand_total
FROM calculation_results
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';

-- Claudia = MX$1,573 (Standard)
SELECT e.external_id, e.display_name, cr.total_payout
FROM calculation_results cr
JOIN entities e ON e.id = cr.entity_id  
WHERE cr.tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
  AND e.external_id = '70001';

-- Antonio = MX$6,263 (Senior)
SELECT e.external_id, e.display_name, cr.total_payout
FROM calculation_results cr
JOIN entities e ON e.id = cr.entity_id
WHERE cr.tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
  AND e.external_id = '70010';

-- Entity count = 67
SELECT count(*) FROM calculation_results
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
```

6. Check Vercel logs for `[VARIANT]` entries showing discriminant_token matches

### Proof Gates — Phase 2

- PG-7: `npm run build` exits 0 (paste)
- PG-8: PR created (paste URL)
- PG-9: Grand total = MX$185,063 (FOR ANDREW)
- PG-10: Claudia = MX$1,573 (FOR ANDREW)
- PG-11: Antonio = MX$6,263 (FOR ANDREW)
- PG-12: 67 calculation_results (FOR ANDREW)
- PG-13: Vercel logs show variant routing (FOR ANDREW)

**Commit:** `git add -A && git commit -m "HF-119 Phase 2: Build + PR" && git push origin dev`

---

## COMPLETION REPORT

Create `HF-119_COMPLETION_REPORT.md` in PROJECT ROOT.

**Commit:** `git add -A && git commit -m "HF-119 Completion Report" && git push origin dev`

---

## WHAT SUCCESS LOOKS LIKE

1. Token overlap discovers "senior" as the discriminant token — without being told
2. Entities with "Coordinador Senior" → Senior variant (discriminant match)
3. Entities with "Coordinador" → Standard variant (default — no discriminant match)
4. 26 Senior + 41 Standard = 67 total
5. Grand total = MX$185,063
6. Zero hardcoded tokens, variant names, or language-specific strings

**"The plan speaks English. The data speaks Spanish. The tokens speak both."**
