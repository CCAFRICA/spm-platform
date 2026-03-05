# HF-088: PRODUCTION DATA CLEANUP + ÓPTICA NUCLEAR CLEAR
## Scripted Cleanup — No Manual SQL | Diagnostic → Clean → Verify

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST (MANDATORY)

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules, anti-patterns, operational requirements
2. `SCHEMA_REFERENCE.md` — actual database schema (post OB-152)

---

## CONTEXT

Two layers of data damage require cleanup before the platform can produce valid results:

### Layer 1: HF-086 Damage (Production Session — March 3)
HF-086 auto-created VL Admin tenant-scoped profiles that broke Observatory and tenant selection (Decision 90 violation). Duplicate rule_sets created from repeated import attempts (OB-151 added idempotency guard to prevent future occurrences).

### Layer 2: OB-153 Inflated Data (This Session — March 4)
OB-153 proved the vertical pipeline slice but left Óptica with inflated counts from multiple import attempts and entity construction bugs:

| Table | Current Count | Expected Count | Problem |
|---|---|---|---|
| entities | 19,578 | 719 | Entity per row instead of per unique identifier |
| committed_data | 140,510 | ~119,000 | Duplicate imports from repeated test attempts |
| rule_set_assignments | 39,156 | ~1,438 (719 × 2 rule sets) | Assignments inflated by entity inflation |
| rule_sets | 2 | 1 (or 2 if cert/non-cert split) | May include duplicates |
| periods | 7 | 3 (Jan/Feb/Mar 2024) | May include extras from source_date range |

### Why Both Must Be Cleaned Together
The pipeline cannot produce valid calculation results until the data is correct. MX$7,187,662.60 on 2,513 entities is meaningless — the ground truth is MX$1,253,832 on 719 unique employees for January 2024. The source data file contains ~119K records across 3 monthly periods for 719 employees.

---

## FOUNDATIONAL RULES (ENFORCED)

1. **No manual SQL against production** (CC Failure Pattern #32). All changes via TypeScript scripts with diagnostic/verification cycle.
2. **Engine and experience evolve together** (Foundational Rule). This cleanup enables the pipeline proof — not engine OR UI, but the full chain.
3. **Engine Contract verification query** runs before and after every change. 7 values, one row.

---

## PHASE 0: PRE-CLEANUP DIAGNOSTIC

### 0A: Capture Current State

Create and run `scripts/hf088-diagnostic.ts`:

The script must capture:

1. **VL Admin profile state** — count of platform-level (tenant_id IS NULL) and tenant-scoped profiles. Tenant-scoped profiles are HF-086 damage.
2. **Óptica Engine Contract** — all 7 values from the verification query: rule_sets, component_count, entities, periods, committed_data (total, bound, source_date), assignments.
3. **Unique entity identifiers** — count of DISTINCT external_id values in entities table. This should be 719 but is likely inflated.
4. **Import batch count** — how many import_batches exist (reveals how many import attempts occurred).
5. **LAB baseline** — 268 results, $8,498,311.77. This is a SEPARATE tenant (Caribe Financial / latin-american-bank). Must be captured to prove it's untouched after cleanup.

### 0B: Record Diagnostic Output

Run the script. Paste FULL output into `HF-088_DIAGNOSTIC_OUTPUT.md` at project root.

### Proof Gate 0:
- Diagnostic script runs without error
- Output pasted and committed
- LAB baseline confirmed: 268 results, $8,498,311.77

**Commit:** `HF-088 Phase 0: Pre-cleanup diagnostic — full state captured`

---

## PHASE 1: CLEAN VL ADMIN PROFILES (Layer 1)

### What to delete:
Every `profiles` row where `email = 'platform@vialuce.com'` AND `tenant_id IS NOT NULL`. These are HF-086 auto-created tenant-scoped profiles that break VL Admin's platform role.

### What to preserve:
The ONE platform-level VL Admin profile where `tenant_id IS NULL`. This is the legitimate platform admin profile.

Create and run `scripts/hf088-clean-profiles.ts`:

1. Query all VL Admin profiles
2. Delete any where tenant_id IS NOT NULL
3. Verify: exactly 1 profile remains with tenant_id IS NULL

### Proof Gate 1:
- 0 VL Admin tenant-scoped profiles remain
- 1 VL Admin platform-level profile exists
- Script output pasted and committed

**Commit:** `HF-088 Phase 1: Clean VL Admin tenant profiles — Decision 90 enforced`

---

## PHASE 2: NUCLEAR CLEAR ÓPTICA DOMAIN DATA (Layer 2)

Delete ALL domain data for Óptica Luminar. The tenant config (name, slug, settings, existing persona profiles for Laura/Roberto/Sofia) is preserved. Only domain data tables are cleared.

**Delete order matters — FK constraints require bottom-up deletion.**

Tables to clear (in order):
1. `calculation_results` (FK to calculation_batches, entities)
2. `calculation_batches` (FK to rule_sets, periods)
3. `entity_period_outcomes` (FK to entities, periods)
4. `disputes` (FK to entities, calculation_batches)
5. `approval_requests` (FK to calculation_batches)
6. `rule_set_assignments` (FK to rule_sets, entities)
7. `committed_data` (FK to entities, periods, import_batches)
8. `classification_signals` (FK to entities)
9. `import_batches` (FK to tenants)
10. `entities` (FK to tenants)
11. `periods` (FK to tenants)
12. `rule_sets` (FK to tenants)
13. `reference_items` (FK to reference_data)
14. `reference_data` (FK to tenants)
15. `audit_logs` (FK to tenants)

Create and run `scripts/hf088-nuclear-clear.ts`:

1. Find Óptica tenant by slug
2. For each table in order: count rows, delete in batches of 200 (Supabase URL limit — AP-G), verify 0 remaining
3. Print per-table deletion count

**CRITICAL:** All queries scoped by `tenant_id = óptica_tenant_id`. No other tenant is touched.

### Proof Gate 2:
- All 15 tables show 0 rows for Óptica tenant
- Tenant record itself still exists (name, slug, settings preserved)
- Persona profiles (Laura, Roberto, Sofia) preserved — these have tenant_id = óptica but are user profiles, not VL Admin damage. **Do NOT delete persona profiles.** Only delete domain data from the 15 tables listed above.
- LAB baseline UNCHANGED

**Commit:** `HF-088 Phase 2: Nuclear clear Óptica domain data — clean slate`

---

## PHASE 3: POST-CLEAR VERIFICATION

### 3A: LAB Regression

Run LAB baseline check. Expected: 268 results, $8,498,311.77.

If LAB has changed, STOP. Something touched the wrong tenant. Investigate before proceeding.

### 3B: Óptica Engine Contract — All Zeros

```
rule_sets: 0
entities: 0
periods: 0
committed_data: 0
rule_set_assignments: 0
```

### 3C: VL Admin Access

Confirm VL Admin can:
1. See tenant list in Observatory (Óptica should appear)
2. Enter Óptica tenant
3. Navigate to Import surface (should show no period references — OB-153 delivered this)

If VL Admin cannot see Óptica in the Observatory, the profile cleanup may have removed a needed profile. Debug from the profiles table.

### Proof Gate 3:
- LAB: 268 results, $8,498,311.77
- Óptica Engine Contract: all zeros
- VL Admin can access Óptica from Observatory

**Commit:** `HF-088 Phase 3: Post-clear verification — LAB safe, Óptica clean, VL Admin confirmed`

---

## PHASE 4: COMPLETION REPORT + PR

### 4A: Completion Report

Write `HF-088_COMPLETION_REPORT.md` at project root:
1. Phase 0 diagnostic output (full state before cleanup)
2. Phase 1 profile cleanup (count deleted, verification)
3. Phase 2 nuclear clear (per-table deletion counts)
4. Phase 3 verification (LAB baseline, Óptica zeros, VL Admin access)
5. All proof gates PASS/FAIL with evidence

### 4B: PR

```bash
cd /Users/AndrewAfrica/spm-platform && \
gh pr create --base main --head dev \
  --title "HF-088: Production Data Cleanup — VL Admin Profiles + Óptica Nuclear Clear" \
  --body "## What This HF Delivers

### Layer 1: VL Admin Profile Cleanup (HF-086 Damage)
- Deleted auto-created tenant-scoped profiles
- Decision 90 enforced: VL Admin has ONE platform-level profile only
- Observatory and tenant selection restored

### Layer 2: Óptica Nuclear Clear (OB-153 Inflated Data)
- All domain data deleted: entities (19,578), committed_data (140,510), rule_sets, periods, assignments, results, batches
- Tenant configuration preserved (name, slug, settings, persona profiles)
- Clean slate ready for single reimport

### Verification
- LAB regression: 268 results, \$8,498,311.77 (UNCHANGED)
- Óptica Engine Contract: all zeros
- VL Admin: platform profile only, tenant visibility confirmed

### Scripts (no manual SQL — Pattern #32 enforced)
- scripts/hf088-diagnostic.ts — read-only state capture
- scripts/hf088-clean-profiles.ts — VL Admin profile cleanup
- scripts/hf088-nuclear-clear.ts — Óptica data wipe

## Proof Gates: see HF-088_COMPLETION_REPORT.md"
```

### Proof Gates (ALL)

| # | Gate | Criterion |
|---|------|-----------|
| PG-0 | Diagnostic captured | Full state output committed |
| PG-1 | VL Admin profiles clean | 0 tenant-scoped, 1 platform-level |
| PG-2 | Óptica nuclear cleared | All 15 domain tables = 0 for this tenant |
| PG-3 | Persona profiles preserved | Laura, Roberto, Sofia still exist |
| PG-4 | LAB untouched | 268 results, $8,498,311.77 |
| PG-5 | VL Admin can see Óptica | Observatory tenant list includes Óptica |
| PG-6 | `npm run build` exits 0 | Clean build |
| PG-7 | PR created | URL pasted |

**Commit:** `HF-088 Complete: Production data cleanup — profiles + nuclear clear`

---

## WHAT NOT TO DO

1. **Do NOT run manual SQL against production** (Pattern #32). Scripts only.
2. **Do NOT delete the Óptica tenant record.** Preserve name, slug, settings.
3. **Do NOT delete persona profiles** (Laura Mendez, Roberto Castillo, Sofia Navarro). These are legitimate tenant users, not HF-086 damage.
4. **Do NOT touch LAB data.** Every query scoped to Óptica tenant_id only.
5. **Do NOT auto-create any profiles.** (Decision 90)
6. **Do NOT combine cleanup with reimport.** HF-088 cleans. The next OB reimports and proves the pipeline. Separate concerns with a clean gate between them.

---

## WHAT HAPPENS AFTER HF-088

Óptica is a clean slate with 0 domain data and preserved tenant config. The next action is a **single clean reimport** as a vertical slice:

1. Import plan PPTX → AI extracts 7 components → 1 rule_set created
2. Import data XLSX (~119K rows) → SCI classifies → 719 entities created → source_dates populated → assignments created
3. Verify Engine Contract: rule_sets ≥1, entities = 719, committed_data ≈ 119K, assignments = 719, source_date rows = transaction row count
4. Create periods from source_date range (Jan/Feb/Mar 2024)
5. Calculate January only → verify ~719 entity results → compare to MX$1,253,832 (±5%)

This reimport + calculation proof is the next OB after HF-088 merges.

---

*HF-088 — March 4, 2026*
*"Clean data is not a luxury. It is the prerequisite for every calculation, every proof, and every decision that follows."*
