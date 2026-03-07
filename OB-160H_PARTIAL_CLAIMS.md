# OB-160H PHASE H: FIELD-LEVEL PARTIAL CLAIMS
## "One sheet, multiple agents, field-level routing"
## SCI Development Plan Phase H of 12 (A through L)
## Target: Current release
## Depends on: OB-160G (PR #189 — merged)
## Priority: P0 — Implements SCI Spec Layer 4, Round 3
## CLT after ALL phases (A-L) complete. NO browser testing until after Phase L.

---

## AUTONOMY DIRECTIVE
NEVER ask yes/no. NEVER say "shall I". Just act. Execute all phases sequentially. Commit after each phase. Push after each commit.

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply
2. `Vialuce_Synaptic_Content_Ingestion_Specification.md` — Layer 4: Negotiation Protocol (Round 3: Resolution, PARTIAL claims)
3. `web/src/lib/sci/synaptic-ingestion-state.ts` — SynapticIngestionState, classifyContentUnits, Round 2 negotiation
4. `web/src/lib/sci/sci-types.ts` — ContentClaim, ClaimType, ContentUnitProposal, ContentUnitExecution
5. `web/src/app/api/import/sci/execute/route.ts` — execute route (filterFieldsForPartialClaim already exists from OB-134)
6. `web/src/app/api/import/sci/analyze/route.ts` — analyze route (where classification happens)

---

## MANDATORY INTERFACE VERIFICATION

Phase F revealed all five execute pipelines already existed. Phase G revealed convergence was fully built. Phase H MUST discover what PARTIAL claim infrastructure already exists before proposing any code.

```bash
# 1. Does PARTIAL claim logic already exist in scoring/classification?
grep -rn "PARTIAL\|partial.*claim\|claimType\|field.*claim\|split.*detect" \
  web/src/lib/sci/ --include="*.ts" | head -30

# 2. filterFieldsForPartialClaim — what does it do?
grep -B 5 -A 40 "filterFieldsForPartialClaim" \
  web/src/app/api/import/sci/execute/route.ts

# 3. ContentClaim interface — what fields exist?
grep -A 20 "interface ContentClaim\|type ContentClaim" \
  web/src/lib/sci/sci-types.ts

# 4. ClaimType — is PARTIAL already defined?
grep -n "ClaimType\|FULL.*PARTIAL\|DERIVED" \
  web/src/lib/sci/sci-types.ts

# 5. ContentUnitProposal / ContentUnitExecution — do they carry claimType, ownedFields, sharedFields?
grep -n "claimType\|ownedFields\|sharedFields\|fields\?" \
  web/src/lib/sci/sci-types.ts | head -15

# 6. How does Round 2 negotiation currently handle close scores?
grep -B 5 -A 30 "round2\|Round 2\|negotiat\|spatial" \
  web/src/lib/sci/synaptic-ingestion-state.ts | head -80

# 7. How does the analyze route determine final classification?
grep -B 5 -A 20 "resolution\|finalClassification\|winner\|gap.*<\|threshold" \
  web/src/lib/sci/synaptic-ingestion-state.ts | head -60

# 8. Does field affinity logic exist?
grep -rn "affinity\|field.*assign\|column.*assign\|fieldAssignment" \
  web/src/lib/sci/ --include="*.ts" | head -15

# 9. How does execute route handle split content units (multiple classifications)?
grep -B 5 -A 20 "split\|multiple.*class\|PARTIAL" \
  web/src/app/api/import/sci/execute/route.ts | head -40

# 10. What does the SCI proposal show the user for PARTIAL claims?
grep -rn "PARTIAL\|partial\|split\|ownedFields\|sharedFields" \
  web/src/app/ --include="*.tsx" | head -15
```

Paste ALL output. Document:
- **EXISTS AND WORKING:** [what PARTIAL claim infrastructure is already built]
- **EXISTS BUT INCOMPLETE:** [what's stubbed or partially implemented]
- **DOES NOT EXIST:** [what must be built]

Determine **Path A/B/C** before proceeding.

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-160H Phase 0: Interface verification — PARTIAL claim infrastructure discovery" && git push origin dev`

---

## CONTEXT

### What Phase H Delivers

Before Phase H, every sheet gets ONE classification — FULL claim by the winning agent. This works when each sheet contains only one type of content. But real-world files often mix content types: a roster with targets, an entity list with performance data, a reference table with entity attributes.

Phase H enables PARTIAL claims — two agents can claim different FIELDS within the same sheet. The identifier column becomes a shared join key. Each agent routes only its claimed fields through its pipeline.

### SCI Specification — Layer 4, Round 3

The SCI spec defines three resolution scenarios:
1. **Clear winner (gap > 0.30):** FULL claim. Single agent owns the entire content unit.
2. **Multiple agents above threshold (gap < 0.15):** Field-level PARTIAL claims. Each agent claims its relevant fields. Shared fields marked as join keys.
3. **No agent above 0.50:** Escalate to LLM or human review.

Phase C implemented Scenario 1 (FULL claims). Phase H implements Scenario 2 (PARTIAL claims). Scenario 3 is handled by existing human review flow.

### Example: Roster-with-Goals Sheet

```
| ID   | Name          | Region  | Role      | Revenue Target | Growth Target |
|------|---------------|---------|-----------|----------------|---------------|
| C001 | Ana Garcia    | Norte   | Senior    | 150,000        | 12,000        |
| C002 | Carlos Lopez  | Sur     | Coord     | 120,000        | 10,000        |
```

Entity Agent sees: identifier, name, categorical attributes (Region, Role) → Entity claim on [ID, Name, Region, Role]
Target Agent sees: identifier + numeric goals → Target claim on [ID, Revenue Target, Growth Target]
Shared field: ID (join key — both agents need it for different purposes)

### SCI Development Plan Position

```
  Phase A: Content Profile Foundation ✅ (PR #182)
  Phase B: Header Comprehension ✅ (PR #183)
  Phase C: Agent Scoring + Signatures + Negotiation ✅ (PR #184)
  Phase D: Tenant Context ✅ (PR #185)
  Phase E: Classification Signals + Flywheel ✅ (PR #186)
  HF-092: Schema Correction ✅ (PR #187)
  Phase F: Execute Pipeline + Routing ✅ (PR #188)
  Phase G: Convergence + input_bindings ✅ (PR #189)
→ PHASE H: Field-Level PARTIAL Claims ← YOU ARE HERE
  Phase I: Cross-Tenant Flywheel
  Phase J: Domain Flywheel
  Phase K: Synaptic Density for SCI
  Phase L: Pattern Promotion
```

### Controlling Decisions

| # | Decision | Relevance |
|---|---|---|
| 25 | Korean Test | Field assignment uses columnRole from header comprehension + data distribution, not column names |
| 99 | Composite signatures as confidence floors | PARTIAL claims trigger when signatures DON'T produce a clear winner |
| 101 | Headers are content to be understood | Header comprehension informs which fields belong to which agent |

---

## ARCHITECTURE DECISION GATE

**PROVISIONAL — determined by Phase 0 findings.**

```
DECISION 1: When do PARTIAL claims trigger?

  Trigger condition (from SCI Spec):
  After Round 2, if the gap between the top two agents is < 0.15 AND both are > 0.50:
  → PARTIAL claim negotiation begins
  
  If gap > 0.30 → FULL claim (existing behavior, no change)
  If gap 0.15-0.30 → FULL claim to winner, but flag for human review
  If gap < 0.15 AND both > 0.50 → PARTIAL claim with field-level assignment
  
  CHOSEN: Gap < 0.15 with both agents > 0.50 triggers PARTIAL

DECISION 2: How are fields assigned to agents?

  Each field gets assigned based on its structural properties + header comprehension:
  
  Field → Entity Agent when:
  - columnRole = 'identifier' (join key — SHARED)
  - columnRole = 'name' (person name)
  - columnRole = 'attribute' (categorical: region, role, department)
  
  Field → Target Agent when:
  - columnRole = 'identifier' (join key — SHARED)
  - columnRole = 'measure' AND header comprehension suggests goal/target/quota
  - Numeric columns with non-temporal, non-transactional distribution
  
  Field → Transaction Agent when:
  - columnRole = 'identifier' (join key — SHARED)
  - columnRole = 'measure' AND high repeat ratio (multiple values per entity)
  - columnRole = 'temporal' (date/month columns travel with transactions)
  
  Shared fields: identifier columns are ALWAYS shared. Both agents get them.
  
  CHOSEN: Role-based field assignment using Phase A/B structural detection

DECISION 3: How does the execute route handle PARTIAL claims?

  A content unit with PARTIAL claims generates MULTIPLE execution requests:
  - One per claiming agent
  - Each with only its ownedFields + sharedFields
  - Each routed to the correct pipeline (entity pipeline, target pipeline, etc.)
  
  The filterFieldsForPartialClaim function (OB-134, already in execute route)
  likely handles this. Phase 0 will confirm.
  
  CHOSEN: Split into multiple execution requests, one per agent
```

---

## PHASE 1: SPLIT DETECTION IN SCORING PIPELINE

Based on Phase 0 findings, implement or enhance split detection:

### What Must Work

1. **After Round 2**, check if the gap between top two agents is < 0.15 and both are > 0.50
2. If so, trigger field-level assignment using header comprehension columnRole + structural properties
3. Create PARTIAL ContentClaims with `fields[]` and `sharedFields[]`
4. Record field assignments in ClassificationTrace
5. Set `claimType: 'PARTIAL'` on the ContentUnitProposal

```typescript
// In the resolution step of classifyContentUnits (synaptic-ingestion-state.ts):

// After Round 2 scores are finalized:
const sorted = [...round2Scores].sort((a, b) => b.confidence - a.confidence);
const top = sorted[0];
const runner = sorted[1];
const gap = top.confidence - runner.confidence;

if (gap < 0.15 && top.confidence > 0.50 && runner.confidence > 0.50) {
  // PARTIAL claim — field-level assignment
  const fieldAssignments = assignFieldsToAgents(
    profile,           // Content Profile with structural observations
    headerComp,        // Header Comprehension with columnRole per field
    top.agent,         // winning agent
    runner.agent       // runner-up agent
  );
  
  // Create two PARTIAL claims
  const topClaim: ContentClaim = {
    contentUnitId,
    agent: top.agent,
    claimType: 'PARTIAL',
    confidence: top.confidence,
    fields: fieldAssignments.filter(f => f.agent === top.agent).map(f => f.column),
    sharedFields: fieldAssignments.filter(f => f.shared).map(f => f.column),
    semanticBindings: [],
    reasoning: `Split claim: gap ${(gap * 100).toFixed(1)}% between ${top.agent} and ${runner.agent}`
  };
  
  // ... similar for runner claim
  
  // Record in trace
  trace.fieldAssignments = fieldAssignments;
  trace.claimType = 'PARTIAL';
} else {
  // FULL claim — existing behavior
  trace.claimType = 'FULL';
}
```

### Field Assignment Function

```typescript
interface FieldAssignment {
  column: string;
  agent: string;
  reason: string;
  shared: boolean;      // true for identifier columns used by both agents
}

function assignFieldsToAgents(
  profile: ContentProfile,
  headerComp: HeaderComprehension | null,
  primaryAgent: string,
  secondaryAgent: string
): FieldAssignment[] {
  const assignments: FieldAssignment[] = [];
  
  // For each column, determine which agent it belongs to
  // Use columnRole from header comprehension (Phase B)
  // Use structural properties from content profile (Phase A)
  // NEVER match on column name strings (Korean Test)
  
  for (const field of profile.fields) {
    const role = headerComp?.interpretations?.get(field.columnName)?.columnRole;
    
    if (role === 'identifier') {
      // Shared — both agents need identifier for linkage
      assignments.push({ column: field.columnName, agent: primaryAgent, reason: 'identifier (shared)', shared: true });
    } else if (role === 'name' || role === 'attribute') {
      // Entity-type fields
      assignments.push({ column: field.columnName, agent: 'entity', reason: `${role} → entity`, shared: false });
    } else if (role === 'measure') {
      // Determine if measure is target/goal or transaction
      // Target: low repeat ratio (one value per entity)
      // Transaction: high repeat ratio (multiple values per entity)
      const isTarget = profile.identifierRepeatRatio <= 1.5;
      assignments.push({
        column: field.columnName,
        agent: isTarget ? 'target' : 'transaction',
        reason: `measure → ${isTarget ? 'target' : 'transaction'} (repeatRatio: ${profile.identifierRepeatRatio})`,
        shared: false
      });
    } else if (role === 'temporal') {
      // Temporal fields travel with transaction data
      assignments.push({ column: field.columnName, agent: 'transaction', reason: 'temporal → transaction', shared: false });
    } else {
      // Default to primary agent
      assignments.push({ column: field.columnName, agent: primaryAgent, reason: 'default → primary', shared: false });
    }
  }
  
  return assignments;
}
```

### Proof Gates — Phase 1
- PG-01: Phase 0 verification complete (ALL 10 commands, output pasted)
- PG-02: Path A/B/C determined with evidence
- PG-03: Split detection triggers when gap < 0.15 and both agents > 0.50
- PG-04: Field assignment uses columnRole from header comprehension (not column names)
- PG-05: Identifier columns marked as shared (both agents receive them)
- PG-06: PARTIAL ContentClaims created with fields[] and sharedFields[]
- PG-07: ClassificationTrace records field assignments
- PG-08: FULL claims unchanged when gap > 0.30 (no regression)
- PG-09: `npm run build` exits 0

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-160H Phase 1: Split detection + field assignment — PARTIAL claims when agents are close" && git push origin dev`

---

## PHASE 2: FIELD-LEVEL ROUTING IN EXECUTE

### 2A: Split Execution for PARTIAL Claims

When the execute route receives a content unit with `claimType: 'PARTIAL'`, it must split execution:

```typescript
// In execute route:
if (unit.claimType === 'PARTIAL' && unit.ownedFields && unit.sharedFields) {
  // This content unit needs split routing
  // filterFieldsForPartialClaim (OB-134) likely already handles this
  
  // For each claiming agent:
  // 1. Filter row_data to only ownedFields + sharedFields for that agent
  // 2. Route filtered data through the appropriate pipeline
  // 3. Shared fields (identifiers) appear in both pipelines
  
  // Entity portion → entity pipeline
  // Target/Transaction portion → committed_data pipeline
  // Both get the identifier column for linkage
}
```

### 2B: Row Data Filtering

```typescript
// filterFieldsForPartialClaim (verify OB-134's implementation):
function filterFieldsForPartialClaim(
  rows: Record<string, unknown>[],
  ownedFields: string[],
  sharedFields: string[]
): Record<string, unknown>[] {
  const allowedFields = new Set([...ownedFields, ...sharedFields]);
  return rows.map(row => {
    const filtered: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      if (allowedFields.has(key)) {
        filtered[key] = value;
      }
    }
    return filtered;
  });
}
```

### 2C: Carry Everything Still Applies

IMPORTANT: `filterFieldsForPartialClaim` filters which fields go to which pipeline, but the ORIGINAL full row is STILL preserved in `row_data` for the primary pipeline. The Carry Everything principle means the complete row is never lost — it's just that each pipeline only PROCESSES its relevant fields. The full data is preserved in at least one pipeline's `row_data`.

### Proof Gates — Phase 2
- PG-10: PARTIAL claims split into multiple execute requests (one per agent)
- PG-11: Each agent receives only ownedFields + sharedFields
- PG-12: Shared fields (identifiers) appear in both split executions
- PG-13: Entity fields route to entity pipeline
- PG-14: Target/Transaction fields route to committed_data pipeline
- PG-15: Full row preserved in at least one pipeline (Carry Everything)
- PG-16: `npm run build` exits 0

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-160H Phase 2: Field-level routing — split execution for PARTIAL claims" && git push origin dev`

---

## PHASE 3: PROPOSAL UI INTEGRATION + SIGNALS

### 3A: PARTIAL Claims in Proposal

The SCI proposal returned to the UI must indicate when a content unit has PARTIAL claims:

```typescript
// ContentUnitProposal should carry:
{
  classification: 'entity+target',   // or similar indicator of split
  claimType: 'PARTIAL',
  claims: [
    { agent: 'entity', confidence: 0.72, fields: ['Name', 'Region', 'Role'], sharedFields: ['ID'] },
    { agent: 'target', confidence: 0.68, fields: ['Revenue Target', 'Growth Target'], sharedFields: ['ID'] }
  ],
  fieldAssignments: [...],           // for trace visibility
}
```

### 3B: Classification Signals for PARTIAL Claims

Each PARTIAL claim generates its own classification signal:

```typescript
// Two signals for one content unit:
// Signal 1: entity portion
await writeClassificationSignal(tenantId, fileName, sheetName, fingerprint,
  'entity', entityConfidence, 'partial_claim', trace, ...);

// Signal 2: target portion  
await writeClassificationSignal(tenantId, fileName, sheetName, fingerprint,
  'target', targetConfidence, 'partial_claim', trace, ...);
```

### Proof Gates — Phase 3
- PG-17: PARTIAL claims visible in proposal response (claimType, claims, fieldAssignments)
- PG-18: Classification signals written per PARTIAL claim (one per agent)
- PG-19: Signals use decision_source = 'partial_claim'
- PG-20: `npm run build` exits 0

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-160H Phase 3: PARTIAL claims in proposal + classification signals" && git push origin dev`

---

## PHASE 4: BUILD + VERIFY + PR

### 4A: Build Verification

```bash
kill dev server
rm -rf .next
npm run build   # must exit 0
npm run dev
# Confirm localhost:3000 responds
```

### 4B: Code Review Verification

```bash
# 1. Verify PARTIAL claim detection in scoring pipeline
grep -rn "gap.*0.15\|PARTIAL\|claimType.*PARTIAL\|split.*detect" \
  web/src/lib/sci/synaptic-ingestion-state.ts | head -10

# 2. Verify field assignment uses columnRole, not column names
grep -rn "columnRole\|role.*identifier\|role.*name\|role.*measure\|role.*attribute" \
  web/src/lib/sci/synaptic-ingestion-state.ts | head -10

# 3. Verify Korean Test — no column name matching in field assignment
grep -rn '"Revenue"\|"Name"\|"Region"\|"Target"\|"Goal"\|"Sales"' \
  web/src/lib/sci/synaptic-ingestion-state.ts | grep -v "// " | grep -v "console.log"
# Should return ZERO

# 4. Verify filterFieldsForPartialClaim in execute route
grep -n "filterFieldsForPartialClaim\|ownedFields\|sharedFields" \
  web/src/app/api/import/sci/execute/route.ts | head -10

# 5. Verify FULL claims unchanged (no regression)
grep -n "FULL\|claimType.*FULL\|gap.*0.30" \
  web/src/lib/sci/synaptic-ingestion-state.ts | head -5

# 6. Verify classification signals for PARTIAL claims
grep -n "partial_claim" \
  web/src/lib/sci/ web/src/app/api/import/sci/ --include="*.ts" -r | head -5

# 7. Verify shared fields include identifiers
grep -n "shared.*true\|shared.*identifier\|sharedFields" \
  web/src/lib/sci/synaptic-ingestion-state.ts | head -5
```

### 4C: PR Creation

```bash
cd /Users/AndrewAfrica/spm-platform
gh pr create --base main --head dev \
  --title "OB-160H: Field-Level PARTIAL Claims — one sheet, multiple agents, field-level routing" \
  --body "Phase H of 12-phase SCI Development Plan. Implements SCI Spec Layer 4, Round 3.

## What Changed

### 1. Split Detection
When two agents score within 0.15 of each other (both > 0.50), the system
triggers PARTIAL claim negotiation instead of awarding a FULL claim to the winner.
Uses structural exit criteria — gap threshold, not file-specific logic.

### 2. Field Assignment
Each column assigned to an agent based on columnRole from header comprehension
+ structural properties from content profile:
- Identifier columns → SHARED (both agents receive them as join keys)
- Name/attribute columns → Entity Agent
- Measure columns → Target or Transaction (based on repeat ratio)
- Temporal columns → Transaction Agent
Korean Test compliant: zero column name matching.

### 3. Split Execution
PARTIAL claims split into multiple execute requests, one per claiming agent.
Each receives only its ownedFields + sharedFields.
filterFieldsForPartialClaim (OB-134) handles row data filtering.
Full row preserved in primary pipeline (Carry Everything).

### 4. Proposal + Signals
PARTIAL claims visible in proposal response with per-agent field assignments.
Each PARTIAL claim generates its own classification signal for the flywheel.

## Implementation Completeness
SCI Spec Layer 4 Round 3: 'Multiple agents above threshold → field-level PARTIAL claims.'
Phase H delivers: split detection, field assignment, split execution, signal capture.
Exercises ContentClaim.claimType, ContentClaim.fields, ContentClaim.sharedFields
interfaces defined in Phase C."
```

### Proof Gates — Phase 4
- PG-21: `npm run build` exits 0
- PG-22: localhost:3000 responds
- PG-23: Zero Korean Test violations in field assignment
- PG-24: FULL claims unchanged (no regression)
- PG-25: PARTIAL claims visible in proposal
- PG-26: Split execution routes to correct pipelines
- PG-27: Shared fields include identifiers
- PG-28: PR created with URL

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-160H Complete: Field-Level PARTIAL Claims — SCI Spec Layer 4 Round 3" && git push origin dev`

---

## SCOPE BOUNDARIES

### IN SCOPE
- Split detection trigger (gap < 0.15, both > 0.50)
- Field assignment function (columnRole + structural properties)
- PARTIAL ContentClaim creation with fields[] and sharedFields[]
- ClassificationTrace field assignment recording
- Split execution routing in execute route
- filterFieldsForPartialClaim enhancement (if needed)
- Proposal response with PARTIAL claim details
- Classification signals per PARTIAL claim

### OUT OF SCOPE — DO NOT TOUCH
- Agent scoring logic (Phases A-D — unchanged)
- FULL claim resolution (existing behavior preserved)
- Convergence (Phase G — unchanged)
- Execute pipelines internally (Phase F — unchanged, just called with filtered data)
- Signal service internals (Phase E)
- Cross-tenant flywheel (Phase I)
- Calculation engine
- Auth files

### CRITICAL CONSTRAINTS

1. **No regression on FULL claims.** When gap > 0.30, behavior is identical to current. PARTIAL claims only trigger on close scores. Test FULL claim path is unchanged.
2. **Korean Test.** Field assignment uses columnRole and structural properties, never column name strings.
3. **Shared fields are always identifiers.** The identifier column appears in BOTH agents' field lists. It's the join key that links entity data to target/transaction data from the same sheet.
4. **Carry Everything.** The full original row is preserved in at least one pipeline's row_data. Field filtering selects which fields each pipeline PROCESSES, not which data is STORED.
5. **Existing filterFieldsForPartialClaim.** OB-134 built this function. Use it. Don't create a parallel implementation (AP-32).

---

## IMPLEMENTATION COMPLETENESS GATE

**SCI Specification Layer 4, Round 3 says:**
"Multiple agents above threshold (gap < 0.15): Field-level PARTIAL claims. Each agent claims its relevant fields. Shared fields (entity IDs) are marked as join keys."

**After Phase H:**
- Split detection: ✅ Gap < 0.15 with both > 0.50 triggers PARTIAL
- Field assignment: ✅ columnRole-based, Korean Test compliant
- Shared fields: ✅ Identifiers marked as join keys for both agents
- Split execution: ✅ Each agent's fields routed to correct pipeline
- Carry Everything: ✅ Full row preserved
- Proposal visibility: ✅ PARTIAL claims shown with field assignments
- Classification signals: ✅ One signal per PARTIAL claim

**Layer 4 is complete (Rounds 1-3).** Phase I builds the Cross-Tenant Flywheel.

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `OB-160H_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification

### Completion Report Structure
1. **Phase 0 discovery** — paste ALL 10 verification outputs. Document EXISTS/INCOMPLETE/MISSING.
2. **Path determination** — A/B/C with evidence
3. **Architecture Decisions** — trigger threshold, field assignment logic, execution split
4. **Commits** — all with hashes, one per phase
5. **Split detection logic** — paste the gap check + PARTIAL trigger code
6. **Field assignment function** — paste the full function showing columnRole-based assignment
7. **Execute split** — paste how PARTIAL claims are routed to multiple pipelines
8. **FULL claim regression check** — paste evidence that FULL claims are unchanged
9. **Korean Test** — paste grep results
10. **Proof gates** — 28 gates, each PASS/FAIL with pasted evidence
11. **Implementation Completeness Gate** — Layer 4 complete

---

## SECTION F QUICK CHECKLIST

```
Before submitting completion report, verify:
□ CC_STANDING_ARCHITECTURE_RULES.md read?
□ Phase 0 verification complete (ALL 10 commands, output pasted)?
□ Path A/B/C determined with evidence?
□ Split detection triggers at gap < 0.15 with both > 0.50?
□ Field assignment uses columnRole, not column names?
□ Identifier columns marked as shared?
□ PARTIAL ContentClaims have fields[] and sharedFields[]?
□ ClassificationTrace records field assignments?
□ Execute route splits PARTIAL claims to multiple pipelines?
□ filterFieldsForPartialClaim used (not reimplemented)?
□ Full row preserved in at least one pipeline?
□ FULL claims unchanged (no regression)?
□ ZERO Korean Test violations (grep)?
□ Classification signals per PARTIAL claim?
□ npm run build exits 0?
□ localhost:3000 responds?
□ Implementation Completeness Gate in completion report?
□ gh pr create executed?
```

---

*ViaLuce.ai — The Way of Light*
*OB-160H: "A roster with targets isn't one thing — it's two things sharing a key. The identifier column is the bridge. Entity attributes go to the entity table. Numeric goals go to committed data. The same row, understood differently by two agents, routed correctly to two destinations. That's spatial intelligence."*
