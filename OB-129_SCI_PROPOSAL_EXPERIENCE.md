# OB-129: SCI PROPOSAL EXPERIENCE — THE IMPORT THAT UNDERSTANDS
## Unified Upload Surface + Agent Proposal UI + Customer Vocabulary Display
## Date: 2026-03-01
## Type: Overnight Batch
## Estimated Duration: 18-22 hours

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply
2. `Vialuce_Synaptic_Content_Ingestion_Specification.md` — SCI architecture (Decision 77)
3. `DS-003_VISUALIZATION_VOCABULARY.md` — component library, page composition rules
4. `web/src/lib/sci/sci-types.ts` — SCI type definitions
5. `web/src/app/api/import/sci/analyze/route.ts` — SCI analyze API (OB-127)
6. `web/src/app/api/import/sci/execute/route.ts` — SCI execute API (OB-127)

---

## WHY THIS OB EXISTS

The SCI infrastructure works (OB-127/128). Agents classify content. Convergence wires targets. The engine calculates. But there's no UI. A customer can't use any of this.

OB-129 builds the import experience that replaces the old DPI stepper. This isn't a facelift — it's a new paradigm. The old experience asked the customer to choose a path, select a plan, map fields to platform vocabulary, and validate against cryptic rules. The new experience:

1. Customer drops a file
2. The platform thinks (visibly — not a spinner, but observable intelligence)
3. The platform proposes what it found, in the customer's language
4. Customer confirms or corrects
5. Done

**This is the first surface a customer interacts with.** It sets the tone for everything. If this feels like every other enterprise data import, we've failed. If this feels like the platform understood their business the moment they uploaded a file, we've succeeded.

---

## DESIGN VISION

### The Experience Philosophy

The import experience embodies all three pillars of IAP:

**Intelligence:** The platform doesn't just parse files — it comprehends them. When a customer uploads a spreadsheet with plan rules, entity targets, and transaction data, the platform separates them, identifies what each piece is, and explains its understanding in the customer's own vocabulary. The customer sees: "I found your team's growth targets — 12 officers with individual goals." Not: "12 rows classified as reference data mapped to entity_id."

**Acceleration:** The customer reaches a calculated result faster than any competitor. One upload, one confirmation, and the data flows to the engine. No multi-step wizard. No plan selection. No field mapping screen where the customer translates their vocabulary into the platform's. The platform did that translation already.

**Performance:** The proposal is communicable in 5 seconds. A manager glances at the screen and immediately knows: the platform found 2 things in my file, it classified them correctly, I press confirm. No cognitive load. No training manual.

### The Design Language

**The platform is the expert, the customer is the authority.**

The platform presents its understanding with confidence but not arrogance. Every proposal includes:
- What the platform found (clear, simple language)
- Why it believes this (confidence indicators — not percentages, but confidence language)
- What will happen next (concrete actions, not abstract pipeline descriptions)
- The ability to correct (always accessible, never hidden)

**Confidence levels are expressed as language, not numbers:**
- ≥ 0.80: "I identified..." / "This contains..." (declarative)
- 0.60–0.79: "This appears to be..." / "I believe this contains..." (qualified)
- < 0.60: "I'm not sure about this one — please confirm" (honest uncertainty)

**The correction flow is respectful, not defensive:**
When the customer corrects a classification, the platform doesn't say "Are you sure?" or explain why it was wrong. It says "Got it — processing as [corrected type]." The correction is a gift, not a failure.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. Final step: `gh pr create --base main --head dev --title "OB-129: SCI Proposal Experience" --body "..."`
4. **Fix logic, not data.**
5. **Commit this prompt to git as first action.**
6. **Git from repo root (spm-platform), NOT web/.**
7. **Zero domain vocabulary in component code.** Korean Test applies.
8. **IAP Gate on every component.** Every element must score on Intelligence, Acceleration, or Performance. Elements failing all 3 are cut.

### COMPLETION REPORT RULES (25-28)
25. Report file created BEFORE final build, not after
26. Mandatory structure: Commits → Files → Hard Gates → Soft Gates → Compliance → Issues
27. Evidence = paste code/output. NOT "this was implemented."
28. One commit per phase. Collapsed commits = standing rule violation.

---

## BRAND REFERENCE

| Element | Value |
|---------|-------|
| Primary color | Deep Indigo `#2D2F8F` |
| Accent color | Gold `#E8A838` |
| Primary font | DM Sans |
| Code/technical font | DM Mono |
| Brand name | Vialuce (lowercase L always) |
| Tagline | Intelligence. Acceleration. Performance. |

**Design tone:** Confident, clean, intelligent. Not flashy. Not sterile. The platform communicates expertise through restraint and clarity. Every pixel earns its place.

---

## PHASE 0: DIAGNOSTIC — CURRENT IMPORT INFRASTRUCTURE

### 0A: Current import pages

```bash
echo "=== CURRENT IMPORT PAGES ==="
find web/src/app -path "*import*" -name "page.tsx" | sort
find web/src/app -path "*upload*" -name "page.tsx" | sort
find web/src/app -path "*ingest*" -name "page.tsx" | sort

echo ""
echo "=== CURRENT IMPORT COMPONENTS ==="
find web/src/components -name "*import*" -o -name "*upload*" -o -name "*ingest*" -o -name "*dpi*" | sort

echo ""
echo "=== CURRENT OPERATE LAYOUT ==="
cat web/src/app/operate/layout.tsx 2>/dev/null | head -40
ls web/src/app/operate/
```

### 0B: Current navigation structure

```bash
echo "=== SIDEBAR / NAV ==="
grep -rn "import\|Import\|upload\|Upload\|ingest\|Ingest" web/src/components/navigation/ --include="*.tsx" | head -10
grep -rn "import\|Import\|upload\|Upload" web/src/components/sidebar/ --include="*.tsx" | head -10

echo ""
echo "=== OPERATE ROUTES ==="
find web/src/app/operate -name "page.tsx" | sort
```

### 0C: SCI API availability

```bash
echo "=== SCI ANALYZE ROUTE ==="
cat web/src/app/api/import/sci/analyze/route.ts | head -30

echo ""
echo "=== SCI EXECUTE ROUTE ==="
cat web/src/app/api/import/sci/execute/route.ts | head -30

echo ""
echo "=== SCI TYPES ==="
cat web/src/lib/sci/sci-types.ts | head -50
```

### 0D: Existing design patterns

```bash
echo "=== EXISTING PAGE PATTERNS (for consistency) ==="
cat web/src/app/operate/page.tsx 2>/dev/null | head -60

echo ""
echo "=== EXISTING CARD COMPONENTS ==="
find web/src/components -name "*card*" -o -name "*Card*" | sort | head -10

echo ""
echo "=== TAILWIND CONFIG ==="
cat web/tailwind.config.ts 2>/dev/null | head -40
grep -n "indigo\|gold\|brand\|primary" web/tailwind.config.ts 2>/dev/null
```

### 0E: Current DPI stepper (what we're replacing)

```bash
echo "=== OLD DPI FLOW ==="
find web/src/app/operate/import -name "*.tsx" | sort
find web/src/components -name "*stepper*" -o -name "*Step*" -o -name "*wizard*" | sort
```

**Commit:** `OB-129 Phase 0: Diagnostic — current import UI, navigation, SCI APIs, design patterns`

---

## PHASE 1: ARCHITECTURE DECISION

```
ARCHITECTURE DECISION RECORD — OB-129
=====================================

Problem: Build the SCI proposal UI — the primary import experience.

Option A: New page at /operate/import replacing old DPI
  - Users navigate to Import, drop file, see proposal
  - Consistent with existing Operate workspace structure
  - Import is one step in the Operate lifecycle

Option B: Full-screen modal/overlay from any Operate page
  - Import feels like a primary action, not a sub-page
  - Can be triggered from multiple entry points
  - Returns to context after completion

Option C: New page at /operate/intake (new name, new experience)
  - Clean break from old "import" language
  - "Intake" aligns with SCI vocabulary (ingestion, comprehension)
  - No confusion with deprecated DPI

CHOSEN: Option A — /operate/import with complete replacement.
  The route is familiar. The experience is new. Users who have muscle memory
  for "go to Import" still find it. The old DPI components are removed (not
  hidden). The URL stays, the experience transforms.

  Import is the entry point to the Operate lifecycle (Standing Rule 24:
  one canonical location per surface).

REJECTED: Option B — modal overlays break browser navigation and accessibility.
REJECTED: Option C — "Intake" is platform jargon. Users say "import" and "upload."
```

**Commit:** `OB-129 Phase 1: Architecture decision — replace /operate/import with SCI experience`

---

## PHASE 2: SCI UPLOAD COMPONENT

### File: `web/src/components/sci/SCIUpload.tsx`

The upload surface. This is the first thing the customer sees.

**Design requirements:**

1. **Drop zone** — Full-width area with clear visual affordance. Not a tiny box. The entire content area IS the drop zone when no file is loaded. Supports drag-and-drop and click-to-browse.

2. **Accepted formats** — `.xlsx`, `.xls`, `.csv`, `.tsv`, `.pdf` (PDF for plan documents). Display supported formats as subtle text below the drop zone.

3. **File preview** — After file selection (before upload), show: filename, size, detected sheet count (for XLSX). This is instant — no server call yet.

4. **Upload state** — When the customer drops a file:
   - **Parsing phase** (< 1s): "Reading your file..." with a subtle progress indicator
   - **Analysis phase** (1-3s): "Understanding your data..." — this is the SCI analyze API call
   - **Proposal phase**: Proposal appears (handled by SCIProposal component)

5. **Multiple files** — Support uploading multiple files in one action. Each file is analyzed independently but presented as a unified proposal.

6. **Error handling** — If file can't be parsed: clear error message with suggestion. "This file format isn't supported. Try XLSX, CSV, or PDF." If API fails: "Something went wrong analyzing your file. Try again or contact support."

**Visual design:**
- Drop zone uses a dashed border (indigo-200) that fills with a subtle gold shimmer on hover/drag-over
- Upload icon is minimal — not a cloud with an arrow, just a clean upward-pointing indicator
- The transition from "empty drop zone" to "analyzing" to "proposal" should feel like the platform is waking up and paying attention — not like a loading spinner

**IAP Gate:**
- Intelligence: File preview shows sheet count before upload — the platform is already observing
- Acceleration: Drag-and-drop. No steps before the file. No configuration before the upload.
- Performance: Customer sees what they uploaded in < 1 second

**Commit:** `OB-129 Phase 2: SCIUpload component — drop zone, file handling, analysis trigger`

---

## PHASE 3: SCI PROPOSAL COMPONENT

### File: `web/src/components/sci/SCIProposal.tsx`

The proposal display. This is the heart of the experience — where the platform demonstrates comprehension.

**Takes as prop:** `SCIProposal` from the SCI analyze API response.

**Design requirements:**

### 3.1: Proposal Header

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  [filename.xlsx]  •  2 sheets detected  •  Ready to process

  I found plan rules and per-entity performance targets.
  Here's what I'll do with each.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

The opening statement is generated from the proposal data:
- Count of content units by classification type
- One plain-language sentence summarizing what was found
- Tone: confident, helpful, specific

**Confidence-based language:**
- High confidence (≥ 0.80): "I found [X] and [Y]."
- Medium confidence (0.60-0.79): "This appears to contain [X] and [Y]."
- Low confidence (< 0.60): "I'm not certain about the contents — please review."

### 3.2: Content Unit Cards

Each content unit (tab or file) gets a card. Cards are ordered by processing order (plan → entity → target → transaction).

**Card structure:**

```
┌─────────────────────────────────────────────────────────┐
│  📋  Sheet: "Growth Targets"                            │
│                                                         │
│  I identified this as per-entity performance targets.   │
│                                                         │
│  What I found:                                          │
│    Officer ID — identifies each team member (12 found)  │
│    Target Growth (MXN) — individual growth target       │
│    Opening Balance (MXN) — starting balance             │
│                                                         │
│  What happens next:                                     │
│    → Commit as reference data linked to Deposit Growth  │
│    → 12 of 25 team members matched                      │
│                                                         │
│  ┌──────────────┐  ┌─────────────────────────┐         │
│  │  ✓ Confirm   │  │  ✎ Change Classification │         │
│  └──────────────┘  └─────────────────────────┘         │
└─────────────────────────────────────────────────────────┘
```

**Critical design details:**

1. **Tab/sheet name** from the source file (customer vocabulary — immutable)

2. **Classification statement** using confidence-based language (see above). Not "Classification: target (0.85)" — that's platform-speak. Instead: "I identified this as per-entity performance targets."

3. **Field listing** — Each field shows:
   - The customer's field name (bold — their vocabulary)
   - A dash separator
   - The platform's understanding in plain language (the `displayContext` from SemanticBinding)
   - For entity fields: how many entities were matched ("12 of 25 team members found")
   
   The platform vocabulary (entity_id, performance_target, baseline_value) is NEVER shown by default. It's available behind an "Advanced" or "Technical Details" toggle for power users.

4. **Action preview** — "What happens next" tells the customer exactly what the platform will do. Not "Route to Reference Data Pipeline" — that's internal language. Instead: "Commit as reference data linked to Deposit Growth."

5. **Confirm button** — Primary action. Indigo background, gold text/border. Pressing Confirm on ALL cards is the most common path.

6. **Change Classification button** — Secondary action. Opens a dropdown with the four classification types, explained in customer language:
   - "Plan Rules — this describes how performance is measured and rewarded"
   - "Team Roster — this lists the people in my organization"
   - "Performance Targets — this sets goals for each team member"
   - "Operational Data — this contains transactions, events, or activity records"
   
   When the customer changes classification, the card re-renders with new field bindings appropriate to the new classification. The correction is logged as a Level 2 signal (but the customer doesn't see this — it's invisible learning).

7. **Warnings** — If the proposal has warnings (e.g., "0 periods detected" for reference data), display them as subtle info callouts, not scary red error banners. Reference data not having periods is NORMAL — the platform shouldn't make the customer feel something is wrong when nothing is.

### 3.3: Proposal Summary Footer

Below all cards:

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  Processing order: Plan Rules → Targets → Data          │
│                                                         │
│  ┌──────────────────────┐  ┌─────────────┐             │
│  │  ✓ Confirm All & Go  │  │  Cancel      │             │
│  └──────────────────────┘  └─────────────┘             │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

- **Processing order** — Shown as a breadcrumb: which content units are processed first and why (dependencies). This is the platform being transparent about its reasoning.
- **Confirm All & Go** — The fast path. One click confirms everything and triggers execution.
- **Cancel** — Returns to upload. File is discarded. No data committed.

### 3.4: Special States

**Single-file, single-sheet:** Simplified proposal. No processing order (nothing to order). Just the classification card and confirm.

**All high confidence:** The platform can display a streamlined view: "Everything looks clear. I found [summary]. Confirm to proceed." with a single button. Individual cards available via "Show Details."

**Low confidence on any unit:** That card gets a subtle gold border (attention needed) and the language shifts to uncertain: "I'm not sure about this one — please review the classification."

**No human review needed (all > 0.80):** Still show the proposal. Never auto-execute without customer confirmation. Decision 73 — Proposal + Confirmation is inviolable.

**IAP Gate:**
- Intelligence: Every card explains what the platform found and why, using the customer's vocabulary
- Acceleration: "Confirm All & Go" is one click from proposal to execution
- Performance: The proposal is scannable in under 5 seconds — the customer knows what was found without reading

**Commit:** `OB-129 Phase 3: SCIProposal component — content cards, confidence language, customer vocabulary`

---

## PHASE 4: SCI EXECUTION + PROGRESS

### File: `web/src/components/sci/SCIExecution.tsx`

When the customer confirms, this component shows execution progress.

**Design requirements:**

1. **Progress display** — Each content unit shows its processing status:
   - Pending: ○ (outline circle)
   - Processing: ◉ (animated pulse)
   - Complete: ● (filled, with checkmark)
   - Error: ✕ (red, with error message)

2. **Processing order is visible** — Content units are listed in dependency order. The customer can see that plan rules process before targets, and targets before transactions. This is the platform demonstrating its understanding of dependencies.

3. **Real-time updates** — As each content unit completes, its status updates. This should feel responsive — not a single spinner that sits for 10 seconds.

4. **Completion state** — When all units are processed:

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  ✓ All done.                                            │
│                                                         │
│  • Plan Rules interpreted — 4 components extracted      │
│  • 12 performance targets committed                     │
│  • Ready to calculate                                   │
│                                                         │
│  ┌────────────────────┐  ┌──────────────────────┐      │
│  │  Go to Calculate   │  │  Upload More Files   │      │
│  └────────────────────┘  └──────────────────────┘      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

5. **Error handling** — If any unit fails:
   - Show what succeeded and what failed
   - Provide clear error message for the failure
   - Allow retry of failed units without re-uploading
   - Don't lose successful results

6. **Outcome summary** — Concrete numbers: how many entities found, how many records committed, how many plan components extracted. These are proof that the platform did real work.

**IAP Gate:**
- Intelligence: Processing order shows the platform understands dependencies
- Acceleration: Direct link to Calculate from completion state — one click to results
- Performance: Outcome summary is scannable — "12 targets committed, ready to calculate"

**Commit:** `OB-129 Phase 4: SCIExecution component — progress, completion, next actions`

---

## PHASE 5: IMPORT PAGE ASSEMBLY

### File: `web/src/app/operate/import/page.tsx` (REPLACE — full rewrite)

Assemble the three components into the import page. This replaces the old DPI stepper entirely.

**Page states:**

1. **Initial state** — SCIUpload is the full page. Drop zone fills the content area. Clean, inviting, obvious.

2. **Analyzing state** — SCIUpload shrinks to show the file info. Analysis progress appears below.

3. **Proposal state** — SCIProposal fills the content area. SCIUpload remains visible at top (collapsed, showing the filename) so the customer knows which file they uploaded.

4. **Executing state** — SCIExecution replaces SCIProposal. Progress indicators visible.

5. **Complete state** — SCIExecution shows completion with next actions.

**State management:**
```typescript
type ImportState = 
  | { phase: 'upload' }
  | { phase: 'analyzing'; files: File[] }
  | { phase: 'proposal'; proposal: SCIProposal; rawData: ParsedFileData }
  | { phase: 'executing'; proposal: SCIProposal }
  | { phase: 'complete'; results: SCIExecutionResult }
  | { phase: 'error'; error: string; canRetry: boolean };
```

**File parsing:** The page handles client-side XLSX/CSV parsing via SheetJS (already available in the project). It extracts columns, sample rows (max 50 for analysis), and total row count. This parsed data is sent to the SCI analyze API.

**Full data transmission:** When executing, the page sends the FULL row data (not just the 50-row sample) to the SCI execute API. The analysis was done on a sample; the execution processes everything.

**Navigation integration:**
- The page lives within the Operate layout
- Sidebar shows "Import" as active
- Breadcrumb: Operate → Import
- After completion, "Go to Calculate" navigates to the calculation page

**Delete old DPI components:**
- Remove the old stepper components (upload → sheet analysis → field mapping → validate → approve)
- Remove old import page code
- Remove any import-related components that are no longer referenced
- Do NOT remove the old API routes (/api/import/*) — they may still be called by the execute API internally

**IAP Gate for the page:**
- Intelligence: The platform demonstrates comprehension at every phase — parsing awareness, classification reasoning, field understanding
- Acceleration: Upload → Proposal → Confirm → Done. Four states, one confirm click in the critical path.
- Performance: A returning customer (muscle memory) can import a file and be at "ready to calculate" in under 30 seconds

**Commit:** `OB-129 Phase 5: Import page assembly — state machine, file parsing, old DPI removal`

---

## PHASE 6: CUSTOMER VOCABULARY IN EXISTING SURFACES

The two-vocabulary architecture (Decision 77) requires that downstream surfaces show customer vocabulary. This phase updates existing components to read `semantic_roles` from `committed_data` metadata and display customer field names.

### 6.1: Calculate results page

If calculation results display field names or data type names, they should show the customer's vocabulary:
- "Officer ID" not "Entity ID"  
- "Consumer Lending" not "consumer_lending_commission"
- Column headers from source data, not platform internal names

**Find and update:** Wherever `data_type` or `entity_id` labels appear in results components, add a lookup for the display label from semantic bindings.

### 6.2: Committed data display

If any UI surface shows committed_data records (e.g., data validation, import history), show:
- Source file name
- Customer field names
- Semantic role descriptions (on hover or in a details panel)

### 6.3: Minimal scope

This is NOT a full rework of the results page (that's OB-130). This phase makes the minimum changes needed so that the SCI-imported data doesn't show platform jargon when the customer encounters it downstream. Focus on:
- Replace `data_type` raw strings with human-readable labels
- Replace `entity_id` column headers with the customer's entity identifier field name
- Any display that currently shows `__` separated data_type strings

**Commit:** `OB-129 Phase 6: Customer vocabulary in downstream surfaces — minimal jargon removal`

---

## PHASE 7: BROWSER VERIFICATION (CLT)

### 7.1: Upload flow

1. Navigate to `/operate/import`
2. Verify: Drop zone renders, clean design, no remnants of old DPI
3. Drop a multi-tab XLSX file (use DG plan file as test case)
4. Verify: File info appears (name, size, sheet count)
5. Verify: Analysis triggers automatically
6. Verify: "Understanding your data..." message appears during analysis

### 7.2: Proposal display

7. Verify: Proposal appears with content unit cards
8. Verify: Tab names from the source file are displayed (customer vocabulary)
9. Verify: Field descriptions use customer language, not platform types
10. Verify: Confidence language matches the score (declarative vs qualified vs uncertain)
11. Verify: Processing order shown (plan before targets)
12. Verify: "Confirm All & Go" button is prominent

### 7.3: Classification correction

13. Click "Change Classification" on one card
14. Verify: Dropdown shows 4 options with customer-friendly descriptions
15. Select a different classification
16. Verify: Card re-renders with appropriate field bindings
17. Change it back (or proceed with correction)

### 7.4: Execution

18. Click "Confirm All & Go"
19. Verify: Execution progress visible with per-unit status
20. Verify: Processing order honored (plan before targets)
21. Verify: Completion state shows concrete numbers
22. Verify: "Go to Calculate" button works

### 7.5: Error states

23. Upload an empty file → Verify: clean error message
24. Upload a non-supported format (e.g., .zip) → Verify: format error
25. Verify: no console errors throughout the flow

**Screenshots of each step. Document any issues found.**

**Commit:** `OB-129 Phase 7: Browser verification — full upload-to-completion flow`

---

## PHASE 8: KOREAN TEST + BUILD CLEAN + IAP AUDIT

### 8.1: Korean Test

```bash
grep -rn "compensation\|commission\|loan\|officer\|mortgage\|insurance\|deposit\|referral\|salary\|payroll\|bonus" \
  web/src/components/sci/ --include="*.tsx" --include="*.ts"

grep -rn "compensation\|commission\|loan\|officer\|mortgage\|insurance\|deposit\|referral\|salary\|payroll\|bonus" \
  web/src/app/operate/import/ --include="*.tsx" --include="*.ts"

# Expected: 0 matches in both
```

### 8.2: IAP Audit

Every component must pass the IAP Gate. Document:

| Component | Intelligence | Acceleration | Performance |
|-----------|-------------|--------------|-------------|
| SCIUpload | Sheet count preview | Drag-and-drop, no config | File info in < 1s |
| SCIProposal | Classification reasoning in customer language | Confirm All & Go (one click) | Scannable in 5s |
| Content Cards | Field descriptions explain purpose | Correction via dropdown (2 clicks) | Card structure is immediately clear |
| SCIExecution | Dependency order visible | Direct link to Calculate | Outcome numbers scannable |

All 4 components must score on all 3 dimensions. If any fails, fix before proceeding.

### 8.3: Build clean

```bash
cd web && rm -rf .next && npm run build
```

**Commit:** `OB-129 Phase 8: Korean Test PASS + IAP audit PASS + build clean`

---

## PHASE 9: COMPLETION REPORT + PR

Create `OB-129_COMPLETION_REPORT.md` at project root.

### Proof Gates — Hard

| # | Gate | Criterion |
|---|------|-----------|
| PG-01 | Build exits 0 | npm run build clean |
| PG-02 | Import page renders | /operate/import shows SCI upload surface |
| PG-03 | Old DPI removed | No stepper components, no old import flow |
| PG-04 | File drop triggers analysis | XLSX/CSV upload → SCI analyze API called |
| PG-05 | Proposal displays content cards | Each tab/file shows as a classified card |
| PG-06 | Customer vocabulary in proposal | Field names from source file, not platform types |
| PG-07 | Confidence language correct | ≥0.80 declarative, 0.60-0.79 qualified, <0.60 uncertain |
| PG-08 | Classification correction works | Dropdown changes classification, card re-renders |
| PG-09 | Confirm All triggers execution | All content units processed via SCI execute API |
| PG-10 | Execution progress visible | Per-unit status updates during processing |
| PG-11 | Completion shows next actions | "Go to Calculate" and "Upload More Files" buttons |
| PG-12 | Processing order correct | Plan before entity before target before transaction |
| PG-13 | Error states clean | Bad files show helpful messages, not crashes |
| PG-14 | Korean Test | 0 domain vocabulary in SCI components |
| PG-15 | IAP audit | All components score on all 3 dimensions |
| PG-16 | No auth files modified | Middleware unchanged |

### Proof Gates — Soft

| # | Gate | Criterion |
|---|------|-----------|
| SPG-01 | Visual consistency | SCI components match existing Operate page design patterns |
| SPG-02 | Responsive layout | Upload and proposal work at different viewport widths |
| SPG-03 | Customer vocabulary downstream | data_type labels humanized in at least one downstream surface |
| SPG-04 | Transition animations | State changes feel smooth, not abrupt |

**Create PR:** `gh pr create --base main --head dev --title "OB-129: SCI Proposal Experience — Upload, Comprehension, Confirmation" --body "Replaces the DPI stepper with SCI-powered import. Agents classify content, platform proposes in customer vocabulary, customer confirms with one click. IAP audit: all components pass. Old DPI removed."`

**Commit:** `OB-129 Phase 9: Completion report + PR`

---

## FILES CREATED/MODIFIED (Expected)

| File | Change |
|------|--------|
| `web/src/components/sci/SCIUpload.tsx` | **NEW** — upload drop zone with analysis trigger |
| `web/src/components/sci/SCIProposal.tsx` | **NEW** — agent proposal display with content cards |
| `web/src/components/sci/SCIExecution.tsx` | **NEW** — execution progress and completion |
| `web/src/app/operate/import/page.tsx` | **REPLACED** — full rewrite with SCI state machine |
| Various old DPI components | **DELETED** — old stepper, field mapping, validate/preview |
| Downstream display components | **MODIFIED** — minimal customer vocabulary patches |

---

## WHAT SUCCESS LOOKS LIKE

A customer navigates to Import. They see a clean drop zone. They drop a file. The platform says "I found plan rules and 12 performance targets." Each piece is explained in their vocabulary — "Officer ID identifies each team member, Target Growth is their individual goal." They press "Confirm All & Go." Thirty seconds later, they're looking at calculation results.

At no point did the customer select an import path. At no point did they choose a plan from a dropdown. At no point did they map "Officer ID" to "Entity ID." At no point did they see a percentage confidence score or a pipeline name.

The platform understood their file. The platform told them what it found. The platform asked for permission. The platform did the work.

That's Intelligence. That's Acceleration. That's Performance.

---

*"The old way: choose a path, select a plan, map your fields, validate against our rules, approve our interpretation. Five steps where the customer serves the platform."*

*"The new way: drop a file, review what we found, confirm. Three steps where the platform serves the customer."*

*"The platform is the expert. The customer is the authority."*
