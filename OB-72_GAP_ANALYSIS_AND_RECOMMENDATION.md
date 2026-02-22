# COMPREHENSIVE GAP ANALYSIS — PRE-OB-72
## February 21, 2026

---

## A. KNOWN ISSUES FROM COMPLETION REPORTS

These were explicitly flagged as "Known Issues" in completion reports but never fixed.

| # | Issue | Source | Severity | Status |
|---|-------|--------|----------|--------|
| A1 | Anomaly detection not auto-invoked — `detectAnomalies()` exists but never called automatically before assessment | OB-71 Known Issue #1 | MEDIUM | Utility built, not wired |
| A2 | Period label locale default remains 'es-MX' in persona-queries.ts | OB-71 Known Issue #2 | LOW | Acceptable per OB-71 |
| A3 | Dispute service remains in-memory — `getDispute()` returns from internal array, not Supabase | OB-71 Known Issue #3 | HIGH | Individual dispute view broken |
| A4 | Sync `getSignals()` deprecated but returns `[]` — callers should use `getSignalsAsync()` | HF-055 Known Issue #1 | LOW | OB-71 confirmed zero callers |
| A5 | Assessment route was bypassing AIService — direct Anthropic | HF-055 Known Issue #2 | ✅ FIXED | OB-71 Mission 2 |
| A6 | Server-side signal persistence requires `SUPABASE_SERVICE_ROLE_KEY` | HF-055 Known Issue #3 | LOW | Config requirement |
| A7 | Only 1/8 AI loops fully closed (field mapping retrieves + uses prior signals) | HF-055 Known Issue #4 | MEDIUM | By design for now |
| A8 | RetailCDMX has zero calculation_results — calc never triggered from UI | OB-69 Known Issue #1 | HIGH | OB-70 wired button, unverified |
| A9 | Some API routes still have .single() on INSERT...select...single() | OB-69 Known Issue #2 | LOW | Safe pattern |
| A10 | Browser verification gates code-verified not browser-tested (PG-1C, 4B, 4C, 5D) | OB-69 Known Issue #3 | HIGH | Recurring pattern |

---

## B. GAPS FROM REVIEW ASSESSMENTS (Not in Known Issues)

Items I flagged during review that CC didn't list as known issues.

| # | Gap | Source | Severity | Status |
|---|-----|--------|----------|--------|
| B1 | OB-70 Mission 5 replaced Spanish → English, not domain-agnostic | OB-70 Review | MEDIUM | ICM labels remain |
| B2 | OB-70 period locale inconsistency (A5) not addressed in completion report | OB-70 Review | MEDIUM | OB-71 partially fixed |
| B3 | HF-055 committed to PR #63 instead of separate PR | HF-055 Review | LOW | Procedural |
| B4 | All 17 CLT items in OB-71 verified via "Code:" evidence, not browser | OB-71 Review | HIGH | Zero browser proof |
| B5 | OB-71 Mission 1 (Auth) and Mission 3 (Manager Coaching) — zero code changes | OB-71 Review | MEDIUM | "Already done" claims |
| B6 | FIELD_ID_MAPPINGS legacy constants still in codebase | Backlog #14 | HIGH | Deferred from OB-70 |
| B7 | Run Preview button wired but never verified producing real results in production | OB-70 CLT | CRITICAL | The pipeline is unproven |

---

## C. BACKLOG ITEMS STILL OPEN (from VIALUCE_BACKLOG_UPDATED_v2.md)

| # | Item | Priority | Status Post-OB-71 |
|---|------|----------|-------------------|
| C1 | Five Layers of Proof in consumer UI | P1 | NOT BUILT — trace stubs return empty |
| C2 | Structured dispute submission (rep files from their dashboard) | P1 | PARTIAL — list page wired, individual view in-memory, rep can't file from dashboard |
| C3 | Audit logging completeness | P2 | NOT BUILT — table exists, operations don't write to it |
| C4 | FIELD_ID_MAPPINGS removal | P1 | NOT DONE — deferred twice |
| C5 | Embedded training (CoachMarks) | P2 | NOT BUILT — post-launch |
| C6 | Org structure discovery | P2 | NOT BUILT — post-launch |
| C7 | Daily Focus Cards | P2 | NOT BUILT — post-launch |
| C8 | T-1 data pipeline (SFTP/API automated) | P2 | NOT BUILT — post-launch |
| C9 | Self-service signup + GPV wizard | P2 | PARTIAL — GPV exists but untested |
| C10 | Billing / Stripe | P3 | NOT BUILT |

---

## D. UNVERIFIED CLAIMS — THINGS "DONE" BUT NEVER BROWSER-TESTED

This is the most concerning category. These features were built and claimed PASS but have zero browser evidence.

| # | Claim | Built In | Risk Level |
|---|-------|----------|------------|
| D1 | Run Preview button fires POST and produces calculation_results | OB-70 | CRITICAL — entire pipeline depends on this |
| D2 | Auth flow works (incognito → login → dashboard → logout → login) | OB-71 | HIGH — customer-facing |
| D3 | Entity roster renders 24K entities with search/pagination | OB-70 | MEDIUM — CLT centerpiece |
| D4 | Dispute pages show real data from Supabase | OB-70 | MEDIUM |
| D5 | Assessment panel renders on Operate dashboard | OB-71 | MEDIUM |
| D6 | Manager coaching agenda renders | OB-71 | MEDIUM — "already existed" |
| D7 | Rep personal assessment renders | OB-71 | MEDIUM — "already existed" |
| D8 | Entity names show as "Name (ExternalID)" in results | OB-70 | MEDIUM |
| D9 | Lifecycle stepper advances after calculation | OB-70 | HIGH |
| D10 | Zero 406 errors on any page | OB-69 | MEDIUM — verified on one page only |

---

## E. PRIORITIZED RECOMMENDATIONS FOR OB-72

### TIER 1 — MUST DO (blocks validation/demo)

1. **Five Layers of Proof consumer UI** — This is the core OB-72 deliverable. Payout → components → rules → source data trace. Without this, "every number explained" is a claim, not a feature.

2. **Auto-invoke anomaly detection** — The utility exists but isn't wired. The admin assessment panel should automatically call `detectAnomalies()` and pass results to the AI prompt. Without this, anomaly detection is built but invisible.

3. **Dispute submission from rep dashboard** — A rep should be able to click a transaction, see the proof layers, and file a dispute if something looks wrong. This connects Five Layers of Proof → Disputes. The individual dispute view also needs to read from Supabase, not in-memory.

### TIER 2 — SHOULD DO (strengthens pre-CLT confidence)

4. **FIELD_ID_MAPPINGS removal** — Deferred from OB-70, deferred from OB-71. The Korean Test fails as long as hardcoded field name constants exist. This is an architectural integrity issue.

5. **Audit logging on critical operations** — disputes, approvals, lifecycle transitions, calculation runs. The table exists. Just instrument the write paths. Required for SOC2 narrative.

### TIER 3 — NICE TO HAVE (polish)

6. **Label domain-agnostic pass** — OB-70 replaced Spanish with English but labels like "Commission", "Total Revenue" are still hardcoded English. A domain-agnostic label system or at minimum making them configurable.

---

## F. REVISED OB-72 RECOMMENDATION — 6 MISSIONS

### Mission 1: Five Layers of Proof — Layer 5 (Outcome) + Layer 4 (Population)
Top-down: aggregate totals + per-entity breakdown visible on My Compensation / Perform.
- Click period → see total payout, component totals (Layer 5)
- See entity list with payout per entity, sorted by amount (Layer 4)
- Highlight discrepancies if reconciliation data exists

### Mission 2: Five Layers of Proof — Layer 3 (Component) + Layer 2 (Metric)
Drill-down from entity:
- Click entity → see per-component breakdown (Layer 3)
- Click component → see source metrics, attainment, tier/threshold (Layer 2)
- Data comes from calculation_results.components + metrics + attainment

### Mission 3: Anomaly Auto-Invoke + Dispute Submission from Proof View
- Wire `detectAnomalies()` into assessment API (auto-called before AI prompt)
- Add "File Dispute" button on Layer 3/4 views
- Dispute pre-populates entity, period, component from proof context
- Individual dispute detail reads from Supabase (fix A3)

### Mission 4: FIELD_ID_MAPPINGS Removal
- Audit all FIELD_ID_MAPPINGS constants
- Replace with AI semantic inference or configuration-driven lookup
- Korean Test: verify no hardcoded field names remain in pipeline logic
- This has been deferred twice — time to close it

### Mission 5: Audit Logging on Critical Paths
- Instrument write operations: dispute create/resolve, approval create/decide, lifecycle transition, calculation run
- All writes to audit_logs table with: tenant_id, action, actor (profile.id), entity_id, metadata, timestamp
- Admin can view audit trail (simple table on /govern or /investigate)

### Mission 6: Integration CLT + Build (BROWSER-VERIFIED)
- 20+ point browser CLT covering ALL unverified claims from D1-D10
- This time: actual browser evidence required, not "Code:" references
- Auth flow in incognito
- Run Preview fires, results populate
- Five Layers drill-down works
- Entity roster renders
- Assessment panels render
- Dispute flow works
- Build clean

### What's DEFERRED to post-CLT-67 / post-launch:
- CoachMarks / embedded training (P2)
- Org structure discovery (P2) 
- Daily Focus Cards (P2)
- T-1 automated ingestion (P2)
- Self-service signup (P2)
- Billing / Stripe (P3)
- Domain-agnostic label system (P2 — can use i18n framework later)
- Additional AI closed loops beyond field mapping (incremental)
