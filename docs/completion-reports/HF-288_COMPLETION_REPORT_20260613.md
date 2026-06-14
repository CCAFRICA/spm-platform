# HF-288 — Roster Email Sourcing + PII Cleanse Scheduler — COMPLETION REPORT

**Repo:** `CCAFRICA/spm-platform` (VP) · **Date:** 2026-06-13 · **Closes:** OB-204 residuals 1 (roster email placeholder) + 2 (ip-nulling scheduler)
**Commit:** `2cbb0eec` · **Branch:** `hf-288`

---

## Phase 0 — pre-flight

- **0.1 HF-288 free** — only the directive matches.
- **0.2 roster path** — `GET /api/users` (`web/src/app/api/users/route.ts`): roster = entities with `profile_id IS NULL`, tenant-scoped.
- **0.3 classification storage** — `classification_signals.header_comprehension` carries per-column `{ semanticMeaning: string; columnRole: string; confidence }` (`web/src/lib/sci/header-comprehension.ts:70-72`). The classifier's *normalized semantic* output, language-neutral.
- **0.4 committed_data linkage** — `committed_data` has `entity_id` (FK) + `row_data` (jsonb) + `data_type`; the join is `committed_data.entity_id = entities.id`.

### ⚠ HALT-2 — the imported rosters carry no emails (evidence)
The directive's Residual-1 premise ("the email exists in `row_data`, classified email-semantic") **does not hold for the current estate**:
```
roster entities (profile_id IS NULL): 22,019
@-email VALUES across ~5,000 committed_data rows (incl. all entity-linked rows): 0
entity/person row_data keys: rol, turno, nombre, sucursal, empleado_id, location_id,
  fecha_ingreso, salario_mensual_mxn, No_Empleado, Nombre_Completo, Tipo_Coordinador, …  (NO email column)
classification_signals total: 2,027 ; with non-empty header_comprehension: 0
```
SPM rosters identify people by **employee-number** (`empleado_id`/`No_Empleado`) + name, never email. There is no email-semantic field to source because there is no email in the data.

**Disposition taken — the manual-fill interim** (HALT-2's offered option 2): ship the structural resolver (returns null today, activates when imports carry emails) + remove the dead placeholder + manual fill. Extending the classifier to recognize email patterns is the §6-out-of-scope follow-up (architect's call).

---

## Phase 1 — roster email sourcing (manual-fill interim)

**Server (`route.ts` `resolveSuggestedEmails`):** finds the field key the import classified email-semantic — by the classifier's `semanticMeaning`/`columnRole` output, **never a header-name match (Korean Test)** — then reads `committed_data.row_data[classifiedKey]` (validated `@`-shape). Short-circuits to `{}` when no email-semantic field is classified (the current estate). Returns `suggestedEmail` (nullable) per roster entity.

**UI (`UserAdminConsole.tsx`):**
- Bulk promote: uses `e.suggestedEmail`; **no `@roster.invalid` placeholder**; entity without an email → partial-failure report ("no email in import — promote individually to enter one").
- Single promote: an email field prefilled from `suggestedEmail`, else empty with a "No email in import" hint; promote disabled until an address is entered.

**1.3 verification:** on the current estate (no email data, per HALT-2 evidence), `resolveSuggestedEmails` short-circuits → `suggestedEmail = null` for all roster entities → the UI shows empty fields + the hint (the manual-fill interim). Build exit 0; `tsc` 0 errors. When an import later carries an email-classified field, the same resolver returns the real value with zero code change.

**EPG:**
- `git grep "roster.invalid" -- web/` → **0 hits** ✓ (placeholder removed).
- `git grep "'email'" -- web/src/lib/entities/ web/src/lib/auth/provision-user.ts` → one hit: `provision-user.ts:157 .ilike('email', input.email)` — the **pre-existing OB-204 duplicate-identity guard** (a `profiles.email` *column* reference), **not** the HF-288 sourcing path. The sourcing path lives in the route and matches the classifier's *semantic type*, not a header. No Korean-Test violation.

---

## Phase 2 — PII cleanse scheduler

- **Migration `019_hf288_pii_cleanse_cron.sql`** authored (CC) — `CREATE EXTENSION IF NOT EXISTS pg_cron` + `cron.schedule('ob204-pii-cleanse-90d', '0 3 * * 0', $$UPDATE platform_events SET payload = payload - 'email' - 'ip_address' - 'ip' - 'user_agent' WHERE created_at < now() - interval '90 days' AND (…)$$)`. Idempotent (cron.schedule replaces by name).
- **Architect applied pg_cron** (2026-06-13, confirmed). **No HALT-1** — pg_cron is available on the plan.
- **Verification limit:** `cron.job` is in the `cron` schema, **not introspectable via service-role PostgREST** (`hf288-cron-verify.ts` → `Invalid schema: cron`). Confirmation is Dashboard-SQL only:
  ```sql
  SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'ob204-pii-cleanse-90d';
  ```
  Architect to paste that row for the record. The committed migration + the applied pg_cron are the CC-side evidence.

---

## SHA + residuals

- **Commit:** `2cbb0eec` (branch `hf-288`).
- **OB-204 residual 1 (placeholder):** CLOSED — the `@roster.invalid` placeholder is gone; sourcing is wired structurally.
- **OB-204 residual 2 (scheduler):** CLOSED (pending Dashboard confirmation of `cron.job`) — the cleanse runs weekly via pg_cron.
- **New residual (HALT-2):** the estate has no email-semantic roster data → `suggestedEmail` is null in practice until imports carry emails or the classifier is extended (§6 OOS; architect disposition). The code is future-proof.

*HF-288 · roster emails sourced from data when present, never invented · PII cleanse automated*
