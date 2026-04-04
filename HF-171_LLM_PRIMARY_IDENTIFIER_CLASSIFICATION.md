# HF-171: Use LLM SemanticMeaning for Identifier Classification
## Classification: Hotfix — SCI / Classification / Intelligence Utilization
## Priority: P0 — CRP calculation pipeline blocked
## Scope: 2 files — agents.ts, negotiation.ts
## Principle: Stop discarding LLM intelligence. Use what we already have.

---

## CC_STANDING_ARCHITECTURE_RULES v3.0 — LOAD FROM REPO ROOT

Before ANY implementation, read `CC_STANDING_ARCHITECTURE_RULES.md` at repo root. All rules 1-39 active.

- **Rules 25-28 (Completion Reports):** Full completion report with pasted evidence mandatory.
- **Korean Test (AP-25):** The LLM performs the language-to-semantic translation. Code reads LLM output. No field-name matching in code.

---

## AUTONOMY DIRECTIVE

NEVER ask yes/no. NEVER say "shall I." Just act. Execute every phase in sequence. Commit after each phase. Push after each commit.

---

## THE PROBLEM — WE ALREADY HAVE THE ANSWER AND WE'RE THROWING IT AWAY

### What the LLM tells us

The HC (Header Comprehension) LLM call returns per-column:

```typescript
interface HeaderInterpretation {
  columnName: string;
  semanticMeaning: string;    // "person_identifier", "transaction_identifier", "employee_id", etc.
  dataExpectation: string;    // "unique_numeric_id", "text_code", etc.
  columnRole: ColumnRole;     // "identifier" — LOSSY BUCKET
  confidence: number;
}
```

For the CRP data file, the LLM returned (from Vercel logs):

```
transaction_id:identifier@1.00
sales_rep_id:identifier@1.00
```

Both got `columnRole: "identifier"`. But `semanticMeaning` — which the LLM also returned — distinguishes them. The LLM KNOWS `transaction_id` is a per-record identifier and `sales_rep_id` is a person identifier. It expressed this in `semanticMeaning`. We never read it.

### What `assignSemanticRole` receives

```typescript
function assignSemanticRole(field, agent, hcRole, rowCount) {
  // hcRole = "identifier" — the lossy columnRole
  // semanticMeaning is NOT passed — DISCARDED
  if (hcRole === 'identifier') {
    // HF-169 cardinality check (doesn't work due to sample/population mismatch)
    return { role: 'entity_identifier', ... };
  }
}
```

The function receives `hcRole` (the 7-option bucket) but NOT `semanticMeaning` (the rich LLM interpretation). We paid for the LLM call, got a precise answer, and threw it away.

### The FieldIdentity infrastructure already exists

```typescript
interface FieldIdentity {
  structuralType: ColumnRole;       // "identifier"
  contextualIdentity: string;       // "person_identifier" — THE ANSWER WE NEED
  confidence: number;
}
```

The `contextualIdentity` field was designed exactly for this purpose. The execute route already has `buildFieldIdentitiesFromBindings` which maps `entity_identifier` → `contextualIdentity: 'person_identifier'` and `transaction_identifier` → `contextualIdentity: 'record_identifier'`.

### The principle being violated

**"LLM-Primary, Deterministic Fallback, Human Authority."** We have LLM intelligence that distinguishes person identifiers from transaction identifiers. We're ignoring it and falling back to a deterministic cardinality heuristic that doesn't work. The architecture says the LLM should be primary. We should use what it tells us.

---

## THE FIX — USE WHAT WE ALREADY HAVE

### Change 1: Pass `semanticMeaning` to `assignSemanticRole`

`generateSemanticBindings` has access to the full `HeaderInterpretation` via `hc.interpretations.get(field.fieldName)`. It currently extracts only `columnRole`. It should also extract `semanticMeaning` and pass it through.

### Change 2: In `assignSemanticRole`, when `hcRole === 'identifier'`, use `semanticMeaning` to distinguish

The LLM's `semanticMeaning` values for identifier columns will contain words like:
- **Person/entity identifiers:** "person_identifier", "employee_identifier", "employee_id", "sales_rep_identifier", "representative_id", "agent_code"
- **Transaction/record identifiers:** "transaction_identifier", "transaction_id", "order_id", "record_identifier", "invoice_number"

The code should check if `semanticMeaning` contains indicators of a person/entity vs. a record/transaction. Since the LLM normalizes to English regardless of input language (Korean Test compliant — the LLM does the translation), a simple check works:

```typescript
const PERSON_INDICATORS = ['person', 'employee', 'rep', 'agent', 'staff', 'worker', 'member', 'user', 'customer', 'client', 'entity'];
const RECORD_INDICATORS = ['transaction', 'order', 'invoice', 'receipt', 'record', 'ticket', 'case', 'batch'];
```

**Wait — is this a Korean Test violation?** NO. These are not field-name patterns matched against customer data. These are vocabulary checks against the LLM's OWN ENGLISH OUTPUT. The LLM reads Korean column headers and returns `semanticMeaning: "person_identifier"` in English. The code reads the LLM's English output. The customer's language is never in the code path.

However, maintaining a hardcoded list of indicator words is fragile. A more robust approach:

### Change 2 (PREFERRED): Ask the LLM to tell us directly

Modify the HC prompt to include a new field: `identifiesWhat` for identifier columns.

**Current HC prompt response schema:**
```json
{
  "semanticMeaning": "...",
  "dataExpectation": "...",
  "columnRole": "...",
  "confidence": 0.00
}
```

**New HC prompt response schema:**
```json
{
  "semanticMeaning": "...",
  "dataExpectation": "...",
  "columnRole": "...",
  "identifiesWhat": "person|transaction|location|product|organization|other",
  "confidence": 0.00
}
```

The LLM already knows the answer. We just add one field to the response schema and one line to the prompt instructions. This scales to any identifier type without code changes.

---

## Architecture Decision Record

```
ARCHITECTURE DECISION RECORD
============================
Problem: assignSemanticRole receives only columnRole ("identifier")
         from HC. The LLM knows whether it's a person or transaction
         identifier but we don't read that intelligence.

Option A: Read semanticMeaning and check for person/transaction keywords
  - Scale test: YES
  - AI-first: PARTIAL — reads LLM output but uses hardcoded keyword list
  - Transport: N/A
  - Atomicity: YES

Option B: Add identifiesWhat field to HC prompt response + read it
  - Scale test: YES — one LLM prompt change covers all future identifier types
  - AI-first: YES — LLM provides the answer directly, no keyword matching
  - Transport: N/A
  - Atomicity: YES

Option C: Keep cardinality threshold from HF-169
  - Scale test: NO — fails when entity cardinality is high relative to transactions
  - AI-first: NO — pure heuristic, ignores LLM intelligence
  - Atomicity: YES

CHOSEN: Option B — AI-first. The LLM already knows the answer. One prompt
        field addition. No keyword lists. No cardinality thresholds. Scales
        to any identifier type (person, location, product, organization)
        without code changes. Falls back to cardinality check (HF-169) if
        LLM doesn't provide identifiesWhat.

REJECTED: Option A (fragile keyword list), Option C (broken heuristic)
```

---

## CC FAILURE PATTERNS TO AVOID

| Pattern | How to Avoid |
|---------|--------------|
| FP-69 | Fix ALL places that read HC output for identifiers. Both agents.ts AND negotiation.ts. |
| FP-36 | CRP clean slate + reimport + verify. |

---

## PHASE 1: DIAGNOSTIC — Read Current Code

### Step 1.1: Find the HC prompt

```bash
cd /Users/$(whoami)/Projects/spm-platform
grep -n "header_comprehension" web/src/lib/ai/anthropic-adapter.ts | head -5
```

Then read the full prompt:
```bash
# Find the header_comprehension prompt text
grep -n -A50 "header_comprehension:" web/src/lib/ai/anthropic-adapter.ts | head -60
```

### Step 1.2: Read the HC response interface

```bash
grep -n "LLMHeaderResponse\|HeaderInterpretation" web/src/lib/sci/header-comprehension.ts | head -10
grep -n -A10 "interface LLMHeaderResponse" web/src/lib/sci/header-comprehension.ts
```

### Step 1.3: Read current assignSemanticRole

```bash
grep -n -A25 "function assignSemanticRole" web/src/lib/sci/agents.ts
```

### Step 1.4: Read current generateSemanticBindings — what HC data is available

```bash
grep -n -A15 "function generateSemanticBindings" web/src/lib/sci/agents.ts
```

### Step 1.5: Find ALL places that read hcRole from HC interpretations

```bash
grep -rn "hcRole\|columnRole\|hcInterp" web/src/lib/sci/ --include="*.ts"
```

### Step 1.6: Find where HeaderInterpretation is consumed — ALL locations that truncate to columnRole

```bash
grep -rn "interp.columnRole\|interpretation.columnRole\|\.columnRole" web/src/lib/sci/ --include="*.ts"
```

### Step 1.7: Check if semanticMeaning is used ANYWHERE currently

```bash
grep -rn "semanticMeaning" web/src/lib/sci/ --include="*.ts"
```

**PASTE all diagnostic output in the completion report.**

---

## PHASE 2: IMPLEMENTATION

### Change 2A: Update the HC prompt — add `identifiesWhat`

**File:** `web/src/lib/ai/anthropic-adapter.ts` — the `header_comprehension` prompt

Find the response schema in the prompt. Currently:
```
- columnRole: one of: identifier, name, temporal, measure, attribute, reference_key, unknown
  - identifier: uniquely identifies something (person, location, transaction)
```

**ADD** a new field to the prompt instructions AND the response schema:

In the prompt instructions, after the columnRole description, add:
```
- identifiesWhat: (ONLY for identifier and reference_key columns) what kind of thing this column identifies. Must be one of: person, transaction, location, product, organization, account, other. This tells downstream systems whether this identifier links to an entity (person, organization, account) or to a record (transaction, order, invoice). For non-identifier columns, omit this field or set to null.
```

In the response schema example, update:
```json
{
  "semanticMeaning": "...",
  "dataExpectation": "...",
  "columnRole": "...",
  "identifiesWhat": "person|transaction|location|product|organization|account|other",
  "confidence": 0.00
}
```

### Change 2B: Update the LLMHeaderResponse and HeaderInterpretation interfaces

**File:** `web/src/lib/sci/header-comprehension.ts`

Add `identifiesWhat` to the LLM response parsing interface:

```typescript
interface LLMHeaderResponse {
  sheets: Record<string, { columns: Record<string, {
    semanticMeaning: string;
    dataExpectation: string;
    columnRole: string;
    identifiesWhat?: string;  // HF-171: what kind of thing this identifier identifies
    confidence: number;
  }> }>;
  crossSheetInsights: string[];
}
```

**File:** `web/src/lib/sci/sci-types.ts`

Add `identifiesWhat` to `HeaderInterpretation`:

```typescript
export interface HeaderInterpretation {
  columnName: string;
  semanticMeaning: string;
  dataExpectation: string;
  columnRole: ColumnRole;
  identifiesWhat?: string;  // HF-171: person, transaction, location, product, organization, account, other
  confidence: number;
}
```

### Change 2C: Pass `identifiesWhat` through to HeaderInterpretation in buildComprehensionFromLLM

**File:** `web/src/lib/sci/header-comprehension.ts`

Find `buildComprehensionFromLLM`. Where it builds `HeaderInterpretation` objects:

**BEFORE:**
```typescript
interpretations.set(colName, {
  columnName: colName,
  semanticMeaning: interp.semanticMeaning || 'unknown',
  dataExpectation: interp.dataExpectation || 'unknown',
  columnRole: toColumnRole(interp.columnRole),
  confidence: typeof interp.confidence === 'number' ? ...
});
```

**AFTER:**
```typescript
interpretations.set(colName, {
  columnName: colName,
  semanticMeaning: interp.semanticMeaning || 'unknown',
  dataExpectation: interp.dataExpectation || 'unknown',
  columnRole: toColumnRole(interp.columnRole),
  identifiesWhat: interp.identifiesWhat || undefined,  // HF-171
  confidence: typeof interp.confidence === 'number' ? ...
});
```

### Change 2D: Pass `identifiesWhat` (or full interpretation) to assignSemanticRole

**File:** `web/src/lib/sci/agents.ts`

In `generateSemanticBindings`, extract `identifiesWhat` from the HC interpretation and pass it:

**BEFORE:**
```typescript
const hcInterp = hc?.interpretations.get(field.fieldName);
const hcRole = hcInterp?.columnRole;
const binding = assignSemanticRole(field, agent, hcRole, rowCount);
```

**AFTER:**
```typescript
const hcInterp = hc?.interpretations.get(field.fieldName);
const hcRole = hcInterp?.columnRole;
const identifiesWhat = hcInterp?.identifiesWhat;
const binding = assignSemanticRole(field, agent, hcRole, rowCount, identifiesWhat);
```

Update `assignSemanticRole` signature to accept `identifiesWhat`:

```typescript
function assignSemanticRole(
  field: ContentProfile['fields'][0],
  agent: AgentType,
  hcRole?: string,
  rowCount?: number,
  identifiesWhat?: string,  // HF-171: from LLM HC
): { role: SemanticRole; context: string; confidence: number } {
```

### Change 2E: Use `identifiesWhat` in the identifier classification

Replace the HF-169 cardinality-only check with LLM-primary, cardinality-fallback:

**BEFORE (HF-169):**
```typescript
if (hcRole === 'identifier' || hcRole === 'reference_key') {
  const uniquenessRatio = rowCount > 0 ? field.distinctCount / rowCount : 0;
  if (uniquenessRatio > 0.8) {
    return { role: 'transaction_identifier', ... };
  }
  return { role: 'entity_identifier', ... };
}
```

**AFTER (HF-171):**
```typescript
if (hcRole === 'identifier' || hcRole === 'reference_key') {
  // HF-171: LLM-Primary identifier classification.
  // The LLM already knows whether this identifies a person, transaction,
  // location, etc. Use its answer directly. Cardinality is fallback only.
  const ENTITY_TYPES = ['person', 'organization', 'account', 'employee', 'customer', 'client', 'member'];
  const RECORD_TYPES = ['transaction', 'order', 'invoice', 'receipt', 'record', 'ticket'];

  if (identifiesWhat) {
    const iw = identifiesWhat.toLowerCase();
    if (ENTITY_TYPES.some(t => iw.includes(t))) {
      return { role: 'entity_identifier', context: `${field.fieldName} — entity identifier (LLM: ${identifiesWhat})`, confidence: 0.95 };
    }
    if (RECORD_TYPES.some(t => iw.includes(t))) {
      return { role: 'transaction_identifier', context: `${field.fieldName} — record identifier (LLM: ${identifiesWhat})`, confidence: 0.95 };
    }
    // LLM provided identifiesWhat but it's not entity or record — use it as context
    return { role: 'entity_identifier', context: `${field.fieldName} — identifier (LLM: ${identifiesWhat})`, confidence: 0.85 };
  }

  // FALLBACK: No identifiesWhat from LLM — use semanticMeaning if available
  // (This covers cases where the prompt change hasn't reached cached vocabulary bindings)
  // Then fall back to HF-169 cardinality check
  const rCount = rowCount ?? 0;
  const uniquenessRatio = rCount > 0 ? field.distinctCount / rCount : 0;
  if (uniquenessRatio > 0.8) {
    return { role: 'transaction_identifier', context: `${field.fieldName} — per-row identifier (uniqueness ${(uniquenessRatio * 100).toFixed(0)}%, no LLM context)`, confidence: 0.80 };
  }
  return { role: 'entity_identifier', context: `${field.fieldName} — identifier (cardinality fallback)`, confidence: 0.85 };
}
```

**NOTE on Korean Test compliance:** The `ENTITY_TYPES` and `RECORD_TYPES` arrays match against the LLM's ENGLISH output, not against customer column names. The LLM translates any language → English `identifiesWhat` value. The code reads English. No customer vocabulary in the matching path.

### Change 2F: Apply same changes to inferRoleForAgent in negotiation.ts

Same pattern: pass `identifiesWhat`, use LLM-primary classification.

**File:** `web/src/lib/sci/negotiation.ts`

Update `generatePartialBindings` to extract and pass `identifiesWhat`:
```typescript
const identifiesWhat = hcInterp?.identifiesWhat;
const role = inferRoleForAgent(field, agent, hcRole, rowCount, identifiesWhat);
```

Update `inferRoleForAgent` signature and identifier logic — same changes as 2D and 2E.

### Change 2G: Verify ALL other places that consume HC interpretations

```bash
grep -rn "columnRole\|hcRole\|headerComprehension" web/src/lib/sci/ --include="*.ts" | grep -v "test\|\.d\.ts"
```

Any location that reads `columnRole` to make identifier decisions should also read `identifiesWhat`. List all findings and address them.

### Step 2H: Commit

```bash
cd /Users/$(whoami)/Projects/spm-platform
git add web/src/lib/ai/anthropic-adapter.ts web/src/lib/sci/agents.ts web/src/lib/sci/negotiation.ts web/src/lib/sci/header-comprehension.ts web/src/lib/sci/sci-types.ts
git commit -m "HF-171: LLM-primary identifier classification — use identifiesWhat from HC prompt"
git push origin dev
```

---

## PHASE 3: BUILD

```bash
cd web
kill $(lsof -ti:3000) 2>/dev/null || true
rm -rf .next
npm run build
```

**Build MUST pass.**

---

## PHASE 4: CRP CLEAN SLATE

CRP data may need clean slate if previous import data is still present. Check:

```sql
SELECT COUNT(*) FROM committed_data WHERE tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7';
```

If > 0, run the clean slate SQL from HF-169 Phase 4. If 0, skip.

Also clear any cached vocabulary bindings that might bypass the new LLM call:

```sql
DELETE FROM classification_signals
WHERE tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7';
```

---

## PHASE 5: PR CREATION

```bash
cd /Users/$(whoami)/Projects/spm-platform
gh pr create --base main --head dev \
  --title "HF-171: LLM-primary identifier classification — use HC identifiesWhat" \
  --body "## Problem
The HC LLM call returns semanticMeaning that distinguishes person identifiers from transaction identifiers, but assignSemanticRole only reads columnRole ('identifier' for both). We pay for LLM intelligence and discard it.

## Fix
1. HC prompt: added identifiesWhat field (person/transaction/location/product/organization/account/other) to response schema for identifier columns
2. HeaderInterpretation: added identifiesWhat field
3. assignSemanticRole + inferRoleForAgent: LLM-primary classification using identifiesWhat, cardinality fallback
4. Both agents.ts and negotiation.ts updated (FP-69 compliance)

## Principle
LLM-Primary, Deterministic Fallback, Human Authority. The LLM already knows the answer. We asked it, it answered, we ignored the answer. Now we use it.

## Korean Test
The LLM translates any language → English identifiesWhat value. Code reads the LLM's English output. Customer vocabulary is never in the code path.

## Files Changed
- web/src/lib/ai/anthropic-adapter.ts — HC prompt: identifiesWhat field
- web/src/lib/sci/sci-types.ts — HeaderInterpretation: identifiesWhat
- web/src/lib/sci/header-comprehension.ts — Parse + pass identifiesWhat
- web/src/lib/sci/agents.ts — LLM-primary identifier classification
- web/src/lib/sci/negotiation.ts — Same fix for partial bindings path
"
```

---

## PHASE 6: PRODUCTION VERIFICATION (POST-MERGE)

After Andrew merges PR and Vercel deploys:

1. **Clean slate CRP** (if needed) + clear classification_signals
2. **Reimport CRP data file**
3. **Check Vercel logs:** Look for HC output — `identifiesWhat` values for `transaction_id` and `sales_rep_id`
4. **Verify:**
```sql
SELECT metadata->>'entity_id_field' as entity_id_field, COUNT(*)
FROM committed_data
WHERE tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7'
GROUP BY 1;
```
**Expected:** `entity_id_field = 'sales_rep_id'`

5. **If correct:** Reimport roster, create period, calculate Plan 1
6. **Check Grand total:** Should be >> $5,000

---

## COMPLETION REPORT REQUIREMENTS

1. **Phase 1 diagnostic output** — all grep results showing current state
2. **Phase 2 diff** — git diff showing all changes
3. **Phase 3 build output** — exit 0
4. **Phase 4 clean slate verification** (if applicable)
5. **Phase 5 PR URL**

**SELF-ATTESTATION IS NOT ACCEPTED.**

---

## BROADER PRINCIPLE THIS HF ESTABLISHES

This HF establishes a pattern: **when the LLM provides a specific answer, use it.** Do not reduce it to a generic bucket and then try to reconstruct the specificity with heuristics.

Other places this principle should be applied (future work, not this HF):

1. **Measure classification:** HC returns `semanticMeaning: "revenue_amount"` vs `"unit_count"` — this could help convergence distinguish between sum vs count operations
2. **Temporal classification:** HC returns `semanticMeaning: "transaction_date"` vs `"period_indicator"` — this could help source_date extraction
3. **Name classification:** HC returns `semanticMeaning: "person_name"` vs `"product_name"` — this could help entity resolution

The HC prompt and response schema should be reviewed holistically to ensure NO LLM intelligence is being discarded by downstream code. This HF addresses the most critical case (identifier disambiguation) but the pattern applies broadly.

---

*"The LLM read the column headers. It understood the difference. It told us. We didn't listen. Three HFs later, we're finally asking the question we should have asked first: what does the LLM already know?"*
