# OB-171: PERFORM WORKSPACE + LIFECYCLE COMPLETION

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` at the project root — all rules apply
2. `SCHEMA_REFERENCE_LIVE.md` — authoritative column reference (34 tables)
3. `PRE_PROMPT_COMPLIANCE_DIRECTIVE.md` — 10-gate checklist

**If you have not read all three files, STOP and read them now.**

---

## WHY THIS OB EXISTS

The calculation engine is proven: BCL $44,590 (100% reconciliation), Meridian MX$185,063. The intelligence stream shows admins what matters. But the people who EARNED those commissions — the reps — cannot see their own numbers. The Statements page is empty. The Transactions page is empty. The Team Performance page is empty. And even for admins, there's no path from "calculation complete" to "approved for payment." The lifecycle stops at OFFICIAL.

This is the gap between "engine works" and "product works." This OB closes it.

**Mission Control items addressed:**
- **MC#1 (P0):** Individual Commission Statements
- **MC#2 (P0):** Transaction-Level Detail
- **MC#3 (P0):** Approval Workflow
- **MC#4 (P0):** Full Lifecycle State Machine

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000 responds
3. Final step: `gh pr create --base main --head dev` with descriptive title and body
4. **Git commands from repo root (spm-platform), NOT from web/.**
5. **Commit this prompt to git as first action.**
6. **Fix logic, not data.** Do not insert test data. Do not hardcode values.
7. **Domain-agnostic always.** Component names from rule_sets.components. Entity names from entities.display_name. Period labels from periods.label. ZERO hardcoded domain terms.
8. **Application-level tenant_id filtering on EVERY query.** Defense in depth — do not rely on RLS alone.
9. **Entity scoping:** Rep sees only their own entity. Manager sees entities in their team. Admin sees all. Scope is derived from the authenticated profile, not from URL parameters.

---

## CRITICAL CONTEXT

### BCL Tenant State (Post OB-169 + OB-170)

- Tenant ID: `b1c2d3e4-aaaa-bbbb-cccc-111111111111`
- 85 entities, 4 components, 6 periods (Oct 2025 – Mar 2026)
- October 2025 calculated: $44,590, 100% reconciliation, lifecycle_state = PREVIEW
- Patricia Zambrano: tenant admin (role = 'admin')
- 85 entities: 13 Ejecutivo Senior, 72 Ejecutivo

### Verification Anchors

| Entity | ID | Total | C1 | C2 | C3 | C4 |
|--------|-----|-------|-----|-----|-----|-----|
| Valentina Salazar | BCL-5012 | $198 | $80 | $0 | $18 | $100 |
| Gabriela Vascones | BCL-5003 | $1,400 | $600 | $400 | $250 | $150 |
| Fernando Hidalgo | BCL-5002 | $230 | $80 | $0 | $150 | $0 |

### Key Schema References

**calculation_results:** `id`, `tenant_id`, `batch_id`, `entity_id`, `rule_set_id`, `period_id`, `total_payout` (numeric), `components` (jsonb), `metrics` (jsonb), `attainment` (jsonb), `metadata` (jsonb)

**committed_data:** `id`, `tenant_id`, `import_batch_id`, `entity_id`, `period_id` (nullable), `data_type`, `row_data` (jsonb), `metadata` (jsonb), `source_date` (date)

**calculation_batches:** `id`, `tenant_id`, `period_id`, `rule_set_id`, `batch_type`, `lifecycle_state`, `entity_count`, `summary` (jsonb), `config` (jsonb), `created_by`, `created_at`

**approval_requests:** `id`, `tenant_id`, `batch_id`, `period_id`, `request_type`, `status` (pending/approved/rejected), `requested_by`, `decided_by`, `decision_notes`, `requested_at`, `decided_at`

**audit_logs:** `id`, `tenant_id`, `profile_id`, `action`, `resource_type`, `resource_id`, `changes` (jsonb), `metadata` (jsonb)

**entities:** `id`, `tenant_id`, `external_id`, `display_name`, `metadata` (jsonb)

**profiles:** `id`, `tenant_id`, `auth_user_id`, `display_name`, `email`, `role`, `capabilities` (jsonb)

### Lifecycle Transition Matrix (from Backlog Update 20260214)

```
DRAFT → PREVIEW → OFFICIAL → PENDING_APPROVAL → APPROVED → POSTED
```

| From | Action | Capability Required | Result |
|------|--------|-------------------|--------|
| DRAFT | Calculate (Preview) | run_calculations | → PREVIEW |
| PREVIEW | Re-calculate | run_calculations | → PREVIEW (same batch) |
| PREVIEW | Make Official | run_calculations | → OFFICIAL |
| OFFICIAL | Submit for Approval | run_calculations | → PENDING_APPROVAL |
| PENDING_APPROVAL | Approve | approve_outcomes + different user | → APPROVED |
| PENDING_APPROVAL | Reject | approve_outcomes + reason | → OFFICIAL |
| APPROVED | Post Results | export_results | → POSTED |

**Prohibited:** OFFICIAL → PREVIEW, OFFICIAL → DRAFT, APPROVED → PREVIEW, APPROVED → DRAFT

---

## PHASE 0: DIAGNOSTIC — MAP CURRENT STATE (Zero Code Changes)

### 0A: Map Existing Perform Pages

```bash
# Find all perform-related pages
find web/src/app -path "*perform*" -name "page.tsx" -o -path "*perform*" -name "*.tsx" | sort
find web/src/app -path "*statement*" -name "page.tsx" -o -path "*statement*" -name "*.tsx" | sort
find web/src/app -path "*transaction*" -name "page.tsx" -o -path "*transaction*" -name "*.tsx" | sort

# Check if they're stubs or have content
for f in $(find web/src/app -path "*perform*" -name "page.tsx"); do
  echo "=== $f ==="
  head -30 "$f"
  echo ""
done
```

### 0B: Map Existing Lifecycle Service

```bash
# Find lifecycle service
find web/src -name "*lifecycle*" -o -name "*transition*" | sort
grep -rn "lifecycle_state\|canTransition\|PREVIEW\|OFFICIAL\|PENDING" web/src/lib/ --include="*.ts" | head -30

# Find existing lifecycle UI buttons
grep -rn "Advance\|Submit.*Approval\|Approve\|Reject\|Post.*Result" web/src/ --include="*.tsx" | head -20
```

### 0C: Examine calculation_results.components JSONB Structure

```sql
-- BCL: What does the components JSONB look like?
SELECT
  e.external_id,
  e.display_name,
  cr.total_payout,
  cr.components,
  cr.metrics,
  cr.attainment
FROM calculation_results cr
JOIN entities e ON cr.entity_id = e.id
WHERE cr.tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
AND e.external_id IN ('BCL-5012', 'BCL-5003', 'BCL-5002')
ORDER BY e.external_id;
```

**Paste the FULL components JSONB for all 3 anchors.** The statement page must parse this structure.

### 0D: Examine committed_data.row_data Structure

```sql
-- BCL: What does committed_data look like for Valentina Salazar?
SELECT
  cd.data_type,
  cd.source_date,
  cd.row_data,
  cd.metadata
FROM committed_data cd
JOIN entities e ON cd.entity_id = e.id
WHERE cd.tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
AND e.external_id = 'BCL-5012'
LIMIT 5;
```

**Paste the FULL row_data JSONB.** The transactions page must parse this structure.

### 0E: Check Entity-to-Profile Linking

```sql
-- Can we link an authenticated user to an entity?
SELECT
  p.id as profile_id,
  p.email,
  p.role,
  p.auth_user_id,
  e.id as entity_id,
  e.external_id,
  e.display_name,
  e.profile_id as entity_profile_link
FROM profiles p
LEFT JOIN entities e ON e.profile_id = p.id
WHERE p.tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
```

**This tells us whether entities are linked to profiles.** If `entity_profile_link` is NULL for all, we need to understand how entity scoping works for reps.

Document the results. The scoping strategy depends on this.

**Commit:** `git add -A && git commit -m "OB-171 Phase 0: Diagnostic — Perform pages, lifecycle, JSONB structure mapped" && git push origin dev`

---

## PHASE 1: LIFECYCLE SERVICE — FULL STATE MACHINE

### 1A: Find and Extend the Lifecycle Service

The lifecycle service manages transitions between batch states. Find it and extend to support the full matrix.

**Required transitions (add any that are missing):**

```typescript
const TRANSITIONS: Record<string, { action: string; capability: string; result: string; }[]> = {
  'DRAFT':              [{ action: 'preview',    capability: 'run_calculations',  result: 'PREVIEW' }],
  'PREVIEW':            [{ action: 'preview',    capability: 'run_calculations',  result: 'PREVIEW' },   // re-run
                         { action: 'official',   capability: 'run_calculations',  result: 'OFFICIAL' }],
  'OFFICIAL':           [{ action: 'submit',     capability: 'run_calculations',  result: 'PENDING_APPROVAL' }],
  'PENDING_APPROVAL':   [{ action: 'approve',    capability: 'approve_outcomes',  result: 'APPROVED' },
                         { action: 'reject',     capability: 'approve_outcomes',  result: 'OFFICIAL' }],
  'APPROVED':           [{ action: 'post',       capability: 'export_results',    result: 'POSTED' }],
  'POSTED':             [],  // Terminal for this OB. CLOSED/PAID/PUBLISHED deferred.
};
```

### 1B: Transition API Route

Create or update `web/src/app/api/lifecycle/transition/route.ts`:

**POST /api/lifecycle/transition**

```typescript
// Request body:
{
  batchId: string;
  action: string;           // 'preview' | 'official' | 'submit' | 'approve' | 'reject' | 'post'
  notes?: string;           // Required for 'reject'
}

// Process:
// 1. Load batch, verify tenant_id matches authenticated user
// 2. Verify current lifecycle_state allows this action
// 3. Verify user has required capability
// 4. For 'approve': verify user is NOT the same as requested_by (separation of duties)
// 5. For 'reject': require notes
// 6. Execute transition:
//    - Update calculation_batches.lifecycle_state
//    - For 'submit': INSERT into approval_requests
//    - For 'approve'/'reject': UPDATE approval_requests
//    - INSERT into audit_logs
// 7. Return updated batch
```

### 1C: Separation of Duties

For approval, the approver MUST be a different user than the submitter:

```typescript
if (action === 'approve' || action === 'reject') {
  const { data: request } = await supabase
    .from('approval_requests')
    .select('requested_by')
    .eq('batch_id', batchId)
    .eq('status', 'pending')
    .single();
  
  if (request?.requested_by === currentProfileId) {
    return NextResponse.json(
      { error: 'Cannot approve your own submission. A different user must approve.' },
      { status: 403 }
    );
  }
}
```

**Note:** For BCL with a single admin user, this creates a chicken-and-egg problem. For demo purposes, if ONLY one admin exists, allow self-approval with a warning. For production, enforce separation.

### 1D: Audit Trail

Every transition writes to audit_logs:

```typescript
await supabase.from('audit_logs').insert({
  tenant_id: tenantId,
  profile_id: currentProfileId,
  action: `lifecycle_${action}`,
  resource_type: 'calculation_batch',
  resource_id: batchId,
  changes: {
    from: currentState,
    to: newState,
    notes: notes || null,
  },
  metadata: {
    period_id: batch.period_id,
    entity_count: batch.entity_count,
  },
});
```

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-1 | Transition matrix covers DRAFT through POSTED | All 6 states with allowed actions |
| PG-2 | API route exists | POST /api/lifecycle/transition builds |
| PG-3 | Prohibited transitions rejected | OFFICIAL → PREVIEW returns 400 |
| PG-4 | Separation of duties enforced | Same user approve returns 403 |
| PG-5 | audit_logs written on every transition | INSERT confirmed |
| PG-6 | `npm run build` exits 0 | Clean build |

**Commit:** `git add -A && git commit -m "OB-171 Phase 1: Lifecycle service — full state machine DRAFT through POSTED" && git push origin dev`

---

## PHASE 2: COMMISSION STATEMENT PAGE — REP SEES THEIR PAY

### Route: `/perform/statements`

This is the page where a rep (or any user viewing as a specific entity) sees their commission results.

### 2A: Data Loading

```typescript
// Statement page loader
async function loadStatement(tenantId: string, entityId: string, periodId?: string) {
  const supabase = createClient();
  
  // Get the latest calculated batch for the period (or most recent if no period specified)
  // Get calculation_results for this entity in that batch
  // Get committed_data for this entity (source transactions)
  // Get entity details
  
  const [results, transactions, entity, periods] = await Promise.all([
    supabase
      .from('calculation_results')
      .select('*, calculation_batches!inner(lifecycle_state, period_id, periods!inner(label, start_date))')
      .eq('tenant_id', tenantId)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false }),
    supabase
      .from('committed_data')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('entity_id', entityId)
      .eq('data_type', 'transaction')
      .order('source_date', { ascending: false }),
    supabase
      .from('entities')
      .select('*')
      .eq('id', entityId)
      .single(),
    supabase
      .from('periods')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('start_date', { ascending: false }),
  ]);
  
  return { results: results.data, transactions: transactions.data, entity: entity.data, periods: periods.data };
}
```

### 2B: Entity Scoping

The statement page needs to know WHICH entity the authenticated user is viewing:

- **Rep:** `entities.profile_id = current_profile.id` → the user's own entity. If no link exists, check `entities.metadata` for email match or show "No entity linked to your account."
- **Manager:** Can view any entity in their team. Entity selected via URL parameter or team list.
- **Admin:** Can view any entity. Entity selected via URL parameter or entity list.

```typescript
// Determine viewable entity
async function getViewableEntity(profileId: string, tenantId: string, requestedEntityId?: string) {
  const profile = await getProfile(profileId);
  
  if (profile.role === 'admin' || profile.role === 'platform') {
    // Admin can view any entity
    return requestedEntityId || null; // null = show entity picker
  }
  
  // For member/viewer: find their linked entity
  const { data: myEntity } = await supabase
    .from('entities')
    .select('id')
    .eq('profile_id', profileId)
    .eq('tenant_id', tenantId)
    .single();
  
  return myEntity?.id || null;
}
```

### 2C: Statement UI

```
COMMISSION STATEMENT
[Entity Name] · [Entity ID] · [Variant]
Period: [Period Label] ▾ (dropdown to switch periods)

━━━ TOTAL PAYOUT ━━━
$198.00
Status: PREVIEW | Lifecycle: ●●○○○○

━━━ COMPONENT BREAKDOWN ━━━

Component          Payout      % of Total    Metric
─────────────────────────────────────────────────────
C1 Credit Placement   $80.00      40.4%      Attainment: 80%
C2 Account Growth      $0.00       0.0%      Below minimum threshold
C3 Products           $18.00       9.1%      1 product × $18
C4 Compliance        $100.00      50.5%      0 infractions → qualified

━━━ SOURCE TRANSACTIONS ━━━
[Sortable table of committed_data rows for this entity]

Date        Type          Data
───────────────────────────────────────
2025-10-01  transaction   {source data fields}
2025-10-01  roster        {roster data fields}

[Submit Dispute] button (links to dispute form pre-populated with entity + period)
```

### 2D: Five Elements Compliance

| Element | Content |
|---------|---------|
| Value | $198.00 total payout |
| Context | 4 components, October 2025, Ejecutivo variant |
| Comparison | % of total per component, lifecycle status |
| Action | Submit Dispute, View Plan (links to plan detail), Switch Period |
| Impact | "Reaching next C2 tier requires [X] more account growth" (if computable) |

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-7 | /perform/statements renders | No crash, no empty page |
| PG-8 | Valentina Salazar shows $198 | Total matches GT |
| PG-9 | 4 components listed with correct values | C1:$80, C2:$0, C3:$18, C4:$100 |
| PG-10 | Source transactions visible | committed_data rows for this entity |
| PG-11 | Period selector works | Can switch between periods (only October has data) |
| PG-12 | Entity scoping works | Rep view shows only their own entity |

**Commit:** `git add -A && git commit -m "OB-171 Phase 2: Commission statement page — entity-scoped payout + component breakdown" && git push origin dev`

---

## PHASE 3: LIFECYCLE UI — BUTTONS ON EVERY STATE

### 3A: Lifecycle Action Buttons

The /stream System Health section and the /operate/calculate page both need lifecycle action buttons that call the Phase 1 API. The buttons are context-aware based on current lifecycle_state:

| lifecycle_state | Button Text | Action | Capability |
|-----------------|-------------|--------|------------|
| PREVIEW | "Make Official →" | official | run_calculations |
| OFFICIAL | "Submit for Approval →" | submit | run_calculations |
| PENDING_APPROVAL | "Approve ✓" / "Reject ✗" | approve/reject | approve_outcomes |
| APPROVED | "Post Results →" | post | export_results |
| POSTED | (no action — terminal for now) | — | — |

### 3B: Approval Request Display

When a batch is in PENDING_APPROVAL, show who submitted it and when:

```
⏳ Awaiting Approval
Submitted by [name] on [date]
[Approve ✓]  [Reject ✗]
```

Reject requires a reason (textarea that appears on click).

### 3C: Post Results Behavior

When an admin clicks "Post Results" and batch advances to POSTED:
- Results become visible to ALL personas in /perform/statements
- The /stream intelligence for reps activates: "Your October results are ready. View Statement →"
- The lifecycle stepper updates to show POSTED state

### 3D: Wire Buttons to API

Every button calls `POST /api/lifecycle/transition` with the appropriate action. Show loading state during API call. Show success/error toast. Re-render lifecycle state on success.

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-13 | "Make Official" button visible in PREVIEW state | On /stream and /operate/calculate |
| PG-14 | "Submit for Approval" visible in OFFICIAL state | Button renders after advancing |
| PG-15 | "Approve" / "Reject" visible in PENDING_APPROVAL | Approval request details shown |
| PG-16 | "Post Results" visible in APPROVED state | Button renders |
| PG-17 | Lifecycle stepper updates after each transition | Visual state matches DB state |
| PG-18 | audit_logs entries created | One entry per transition |

**Commit:** `git add -A && git commit -m "OB-171 Phase 3: Lifecycle UI — action buttons for every state" && git push origin dev`

---

## PHASE 4: BROWSER VERIFICATION (CLT-171)

### The Vertical Slice Test

As Patricia (BCL admin), complete the FULL lifecycle:

1. **Start at /stream** — System Health shows $44,590, PREVIEW state
2. **Click "Make Official →"** — batch advances to OFFICIAL. Stepper updates.
3. **Click "Submit for Approval →"** — batch advances to PENDING_APPROVAL. approval_requests row created.
4. **Click "Approve ✓"** — batch advances to APPROVED. (Note: BCL has single admin. If separation of duties blocks this, document and allow for demo with warning.)
5. **Click "Post Results →"** — batch advances to POSTED. Stepper shows POSTED.
6. **Navigate to /perform/statements** — Patricia (as admin) selects Valentina Salazar → sees $198 with component breakdown.
7. **Verify source transactions** — committed_data rows visible for Valentina.

### Verification Anchors

| Check | Expected | Gate |
|-------|----------|------|
| Valentina Salazar total | $198 | PG-8 |
| Valentina C1 | $80 | PG-9 |
| Valentina C2 | $0 | PG-9 |
| Valentina C3 | $18 | PG-9 |
| Valentina C4 | $100 | PG-9 |
| Lifecycle reaches POSTED | POSTED in stepper | PG-17 |
| audit_logs count | ≥4 entries (official, submit, approve, post) | PG-18 |

### Meridian Regression

Switch to Meridian. Verify:
- /stream shows MX$185,063
- Lifecycle buttons work
- /perform/statements accessible

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-19 | Full lifecycle: PREVIEW → OFFICIAL → PENDING → APPROVED → POSTED | All 4 transitions succeed |
| PG-20 | Valentina Salazar statement shows $198 | Component breakdown correct |
| PG-21 | Source transactions visible | committed_data rows rendered |
| PG-22 | Meridian MX$185,063 | No regression |
| PG-23 | Console clean | No errors |

**Commit:** `git add -A && git commit -m "OB-171 Phase 4: CLT-171 — full lifecycle + statement verification" && git push origin dev`

---

## PHASE 5: COMPLETION REPORT + PR

### 5A: Completion Report

Create `OB-171_COMPLETION_REPORT.md` at project root:

```markdown
# OB-171: Perform Workspace + Lifecycle Completion — Completion Report

## Status: [COMPLETE / PARTIAL / FAILED]

## Phase 0: Diagnostic
- Existing Perform pages: [list with status]
- Lifecycle service location: [path]
- Existing transitions: [list]
- calculation_results.components JSONB shape: [paste sample]
- committed_data.row_data JSONB shape: [paste sample]
- Entity-to-profile linking status: [linked / not linked / partial]

## Phase 1: Lifecycle Service
- Transitions implemented: [list all 6 states + actions]
- API route: /api/lifecycle/transition
- Separation of duties: [enforced / single-admin exception]
- audit_logs: [writing / not writing]

## Phase 2: Commission Statement
- Route: /perform/statements
- Entity scoping: [admin/manager/rep tested]
- Valentina Salazar: $[amount] (expected: $198)
  - C1: $[amount] (expected: $80)
  - C2: $[amount] (expected: $0)
  - C3: $[amount] (expected: $18)
  - C4: $[amount] (expected: $100)
- Source transactions: [visible / not visible]
- Period selector: [working / not working]

## Phase 3: Lifecycle UI
- Buttons rendered per state: [list]
- Approval request created on submit: [yes/no]
- Reject requires reason: [yes/no]
- Stepper updates on transition: [yes/no]

## Phase 4: CLT-171
- Full lifecycle PREVIEW → POSTED: [completed / blocked at state]
- Valentina statement correct: [yes/no]
- Meridian regression: MX$[amount] (expected: MX$185,063)
- audit_logs entries: [count]

## Proof Gates Summary
[PG-1 through PG-23: PASS/FAIL for each]
```

### 5B: Create PR

```bash
gh pr create --base main --head dev \
  --title "OB-171: Perform Workspace + Lifecycle Completion — Rep Sees Their Pay" \
  --body "## What This Delivers

### Lifecycle State Machine (MC#3, MC#4 — P0)
- Full transition matrix: DRAFT → PREVIEW → OFFICIAL → PENDING_APPROVAL → APPROVED → POSTED
- POST /api/lifecycle/transition with capability checks
- Separation of duties on approval
- audit_logs entry on every transition
- Prohibited transitions enforced (OFFICIAL cannot regress)

### Commission Statement (MC#1 — P0)
- /perform/statements: entity-scoped payout view
- Component breakdown with values from calculation_results.components JSONB
- Source transactions from committed_data
- Period selector
- Entity scoping: rep sees own, manager sees team, admin sees all

### Transaction Detail (MC#2 — P0)
- Source data visible on statement page
- committed_data.row_data rendered per entity per period

### Lifecycle UI (MC#4 — P0)
- Context-aware action buttons on /stream and /operate/calculate
- Approval request display with submitter info
- Reject requires reason
- Stepper updates in real-time

### Proof
- BCL: Valentina Salazar \$198 (C1:\$80, C2:\$0, C3:\$18, C4:\$100)
- Full lifecycle: PREVIEW → POSTED in browser
- Meridian: MX\$185,063 (no regression)
- 4+ audit_log entries from lifecycle transitions

## Proof Gates: see OB-171_COMPLETION_REPORT.md"
```

**Commit:** `git add -A && git commit -m "OB-171 Phase 5: Completion report + PR" && git push origin dev`

---

## PRODUCTION VERIFICATION — FOR ANDREW (Post-Merge)

### Step 1: BCL Lifecycle
1. Login as Patricia at vialuce.ai
2. Navigate to /stream — verify $44,590 in PREVIEW
3. Click "Make Official →" — verify transition
4. Click "Submit for Approval →" — verify PENDING_APPROVAL
5. Click "Approve ✓" — verify APPROVED
6. Click "Post Results →" — verify POSTED

### Step 2: BCL Statement
1. Navigate to /perform/statements
2. Select Valentina Salazar (BCL-5012)
3. Verify: $198 total, C1:$80, C2:$0, C3:$18, C4:$100
4. Verify source transactions visible

### Step 3: Meridian Regression
1. Switch to Meridian
2. Verify MX$185,063 on /stream
3. Verify lifecycle buttons visible

### Step 4: Audit Trail (READ ONLY)
```sql
SELECT action, resource_type, changes, created_at
FROM audit_logs
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
AND resource_type = 'calculation_batch'
ORDER BY created_at DESC
LIMIT 10;
```

**ZERO data-modifying SQL.**

---

## WHAT SUCCESS LOOKS LIKE

Patricia advances October through the full lifecycle: Official → Submit → Approve → Post. Then she navigates to /perform/statements, selects Valentina Salazar, and sees exactly $198 — broken down into $80 Credit Placement, $0 Account Growth, $18 Products, $100 Compliance. Below that, Valentina's source transactions are visible. Every number traceable. Every calculation explainable.

This is the first time a vialuce entity can see their own commission statement through the browser. The engine has been proven since OB-169. Now the product proves it too.

---

*OB-171 — March 14, 2026*
*"The engine produces the right number. Now the person who earned it can see it."*
*vialuce.ai — Intelligence. Acceleration. Performance.*
