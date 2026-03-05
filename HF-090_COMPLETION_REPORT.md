# HF-090: Audit-Grade created_by — auth.uid() Direct Attribution
## Completion Report — 2026-03-05

### Architecture Decision
**Option C chosen:** Drop FK constraints, store auth.uid() as plain UUID.
- Maximum immutability (auth.uid() from verified JWT)
- Minimum complexity (zero profile lookup queries on write paths)
- Strongest audit trail (JWT-verified identity, cannot be spoofed or borrowed)

Options A (fix profile query) and B (FK to auth.users) rejected.

---

### Commits
| Phase | Hash | Description |
|-------|------|-------------|
| 1 | `c07f2e6` | Migration 020 — drop FK constraints on audit attribution columns |
| 2 | `b16f12b` | Delete resolveProfileId, replace with auth.uid() in 9 files |
| 3 | `21ff789` | Update SCHEMA_REFERENCE.md — 7 columns across 6 tables |

### Files Deleted
- `web/src/lib/auth/resolve-profile.ts` — entire resolveProfileId function (99 lines)

### Files Modified
| File | Change |
|------|--------|
| `api/import/sci/execute/route.ts` | Remove resolveProfileId, use authUser.id |
| `api/import/sci/execute-bulk/route.ts` | Remove resolveProfileId, use authUser.id |
| `api/import/commit/route.ts` | Remove resolveProfileId, use userId directly |
| `api/plan/import/route.ts` | Remove resolveProfileId, use user.id |
| `api/reconciliation/save/route.ts` | Remove resolveProfileId, use userId directly |
| `api/disputes/route.ts` | filed_by: user.id (was profile.id) |
| `api/disputes/[id]/route.ts` | resolved_by: user.id (was profile.id) |
| `api/ingest/event/route.ts` | uploaded_by: user.id (was profile.id) |
| `SCHEMA_REFERENCE.md` | 7 columns updated to "auth user ID — no FK" |

### Database Changes (Migration 020)
FK constraints to drop (execute in Supabase SQL Editor):
- `rule_sets_created_by_fkey`
- `rule_sets_approved_by_fkey`
- `calculation_batches_created_by_fkey`
- `import_batches_uploaded_by_fkey`
- `disputes_filed_by_fkey`
- `disputes_resolved_by_fkey`
- `approval_requests_requested_by_fkey`
- `approval_requests_decided_by_fkey`
- `audit_logs_profile_id_fkey`
- `reconciliation_sessions_created_by_fkey` (if exists)

**PRESERVED:** `entities.profile_id` FK → profiles.id (entity-to-user link)

---

### Proof Gates
| # | Gate | Status | Evidence |
|---|------|--------|----------|
| PG-1 | FK constraints identified | PASS | Migration 020 lists all constraints |
| PG-2 | Migration prepared | PASS | `020_hf090_drop_audit_fk_constraints.sql` committed |
| PG-3 | Migration verification query included | PASS | SQL in migration file |
| PG-4 | resolveProfileId deleted | PASS | `grep resolveProfileId` returns zero hits |
| PG-5 | All routes use auth.uid() | PASS | 8 route files updated |
| PG-6 | Zero profile-based attribution | PASS | `grep resolve-profile` returns zero hits |
| PG-7 | npm run build exits 0 | PASS | Clean build, all routes compile |
| PG-8 | SCHEMA_REFERENCE.md updated | PASS | 7 columns updated |
| PG-9 | entities.profile_id FK preserved | PASS | Line 67: `uuid FK -> profiles.id (nullable)` |
| PG-10 | Clean build | PASS | `npm run build` exits 0 |
| PG-11 | localhost responds | PENDING | Requires `npm run dev` |
| PG-12 | Plan import no 500 | PENDING | Requires migration execution + browser test |
| PG-13 | created_by matches auth.users.id | PENDING | Requires migration execution + import test |
| PG-14 | PR created | PASS | See PR URL below |

### Remaining Work
1. **Execute migration 020** in Supabase SQL Editor (PG-2 → PG-3)
2. **Browser test** on localhost: import plan into Meridian tenant (PG-11 → PG-13)
3. **Production verification** after PR merge + Vercel deploy
