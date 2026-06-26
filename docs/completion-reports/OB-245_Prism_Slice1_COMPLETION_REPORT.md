# OB-245 — Prism Slice 1: The Acquisition Membrane + The Luminous Spine — Completion Report

**Branch:** `ob-245-prism-slice1` (off `main` HEAD `9cda286b`, isolated git worktree — OB-246's working tree untouched)
**Mode:** ULTRACODE. Implements DS-031 §11 Slice 1 (scan-gate Q1-A + file-lifecycle Q2-A).
**Date:** 2026-06-26

---

## CRF + PCD

**CRF**
- [x] Seed: OB-245 / Cite DS-031 §11-Slice1 + live schema + igf substrate / Class: OB vertical slice / Mode: ULTRACODE.
- [x] OB number re-confirmed against the live branch/registry: no `ob-245*` branch existed (clear, no collision).
- [x] Architecture Decision Gate cleared before implementation (ADR below; premise corrections recorded).
- [x] Anti-Pattern Registry checked: no parallel intake path (AP-17 — one membrane path, legacy intake untouched); no extension/filename gating (Korean Test/AP-25 — magic-byte only); no registry-style validation (state machine is a control-plane lifecycle asserted by the directive, DB columns are plain `text`); no persistence-time narrowing (Carry Everything — security gates promotion, never persistence).
- [x] CC paste block: none.

**PCD**
- [x] Built the full slice (data + scan + experience + confirmation) — scope NOT narrowed.
- [x] Authored + committed the migration; **architect applies via SQL Editor (HALT-A)**; CC verifies via tsx.
- [x] Stood up a **real** scan provider (ClamAV) — did NOT ship a stub. **HALT-B avoided.**
- [x] Created the PR; **architect merges (HALT-D).**

---

## 1. What shipped (user-accessible)

A tenant user with `data.import` can open **Submit** (`/data/submit`), drop a file of any format, watch it land in quarantine, clear (or fail) the ClamAV scan gate on the **luminous StatusSpine**, and be confirmed of safe arrival — each confirmation derived from recorded `file_objects.state` + the `file.*` audit row. **In Progress** (`/data/in-progress`) shows the live membrane for all files the user may see.

### Files
- **Migration:** `web/supabase/migrations/20260626_ob245_prism_membrane.sql` — `file_objects` + indexes + RLS, `ingest-quarantine` bucket + storage RLS.
- **lib/prism/**: `types.ts` (lifecycle state machine), `mime-detect.ts` (magic-byte), `scan-provider.ts` (ClamAV: clamd | clamscan | api), `scan-worker.ts` (the gate), `storage.ts` (signed-URL + promote), `file-objects.ts` (row helpers), `audit.ts` (file.* audit), `actor.ts` (session→actor).
- **api/prism/**: `prepare`, `commit`, `scan/[id]`, `files`.
- **components/prism/**: `prism-status.ts`, `QualityRing.tsx`, `StatusSpine.tsx`, `useFileObjects.ts`, `SubmitDropzone.tsx`.
- **app/data/**: `submit/page.tsx`, `in-progress/page.tsx`.
- **nav:** 2 routes added to `lib/navigation/workspace-config.ts` (`platform-core › data-integration`).
- **scripts:** `ob245_scan_korean_proof.ts` (ran, PASS), `ob245_verify.ts` (post-migration e2e).

---

## 2. Architecture Decision Gate — decisions + premise corrections

The directive owns the WHAT; CC owns the HOW. Three premises in the directive were **factually corrected against the live schema** (surfaced here, not silently followed):

1. **Scan host (HALT-B → AVOIDED).** No Supabase Edge Functions / CLI exist in the repo and no managed-AV key is provisioned. CC stood up the **named engine (ClamAV 1.5.2)** locally: engine installed, `freshclam` fetched defs (main 3.28M sigs + daily 355K), `clamd` daemon listening on `127.0.0.1:3310`. EICAR detection proven (below). The `ScanProvider` interface keeps the host swappable (clamd host / managed ClamAV API / container) via env — no code change to re-point for production.
2. **Intake "re-point the signed-URL flow" — premise wrong.** No signed-URL flow ever targeted `ingestion-raw`: the only `createSignedUploadUrl` targets the `imports` bucket; `ingestion-raw` is fed by **direct client `.upload()`** in two legacy spots (`upload-service.ts:84`, `operate/import/page.tsx:215`), both **out of scope (§6)**. Faithful realization: a **new** Prism signed-URL `prepare → PUT → commit` into `ingest-quarantine`. This is **one** membrane path; legacy intake is untouched → **AP-17 honored** (the membrane is the new front door; coexistence with the explicitly-out-of-scope legacy import is sanctioned by §6).
3. **`auth.tenant_id()` does not exist; `--vl-info/--vl-warning/--canvas/--luce` are fictional.** Tenant scope uses the inline `profiles` subquery; `public.is_platform()` is the platform predicate; owner isolation stores `owner_id = auth.uid()`; DB capabilities are legacy literals. State colors come from the centralized `SEMANTIC` map (consumed by name); chrome uses shadcn classes (`bg-card`/`border-border`/`text-foreground`/`text-muted-foreground`) — theme-commensurate across Vialuce/Dark/Bliss, no hardcoded palette (HF-327).

Other decisions: **trigger** = the commit route fires `scanFileObject` server-side (one path) + a webhook/retry route (`/api/prism/scan/[id]`); the physical guarantee is that the gated promotion is the only writer to `ingestion-raw`, regardless of trigger. **No Realtime** in this stack → the spine **polls** `/api/prism/files`. **Gate fails closed**: infected/error/exception → `infected_held`, bytes retained, never promoted.

---

## 3. Invariants → mechanism

| # | Invariant | Mechanism |
|---|---|---|
| 1 | Scan-before-promote is physical | Bytes land in `ingest-quarantine`; `scan-worker.ts` is the **only** writer to `ingestion-raw`, gated on a recorded `clean` verdict. |
| 2 | Carry Everything | Infected/error → `infected_held`; **no delete** anywhere in the slice; quarantine bytes retained + fingerprinted + audited. |
| 3 | Korean Test | `mime_detected` + all routing derive from **magic bytes** (`mime-detect.ts`); filename/extension never consulted. Proven below. |
| 4 | No parallel path (AP-17) | One Prism intake path; legacy intake untouched; no second scan/promote pipeline. |
| 5 | RLS tenant + owner isolation | `file_objects` SELECT = owner (`owner_id=auth.uid()`) ∪ tenant admin/finance ∪ platform; no client write policy; storage owner-folder scoped. |
| 6 | Compliance is architecture | Physical bucket boundary + append-only `file.*` chain (`audit_logs`, `resource_type='file_object'`) + RLS are structural. |
| 7 | Verified confirmation (§6A) | Every confirmation/spine/chip is a render of `file_objects.state` + the `file.*` event (`prism-status.ts` is the single source); never optimistic. |
| 8 | Theme-commensurate | shadcn semantic classes + `SEMANTIC` state map by name; no fictional tokens, no hardcoded dark palette. |
| 9 | No auth-layer change (OB-246) | Gated via existing `hasCapability`/`RequireCapability`/`data.import` + the nav model; **zero** edits to auth-context/scope/session/middleware/permissions. |

---

## 4. Proof gates

### PROVEN now (DB-independent) — pasted evidence

**Gate 5 (Korean Test) + scanner correctness** — `npx tsx scripts/ob245_scan_korean_proof.ts`:
```
=== Korean Test: detection follows CONTENT, never extension ===
PASS  CSV bytes "named" data.xlsx → text/csv  — text/csv
PASS  ZIP/OOXML bytes "named" report.txt → application/zip  — application/zip
PASS  PDF bytes "named" sheet.csv → application/pdf  — application/pdf
PASS  EICAR bytes → text/plain (content-typed, not by .com)  — text/plain

=== ScanProvider against the real ClamAV engine ===
provider: clamav-clamd (PRISM_SCAN_PROVIDER=clamd(default))
PASS  EICAR → infected  — infected / Eicar-Test-Signature / ClamAV 1.5.2/28043/Thu Jun 25 23:24:31 2026
PASS  clean CSV → clean  — clean / ClamAV 1.5.2/28043/Thu Jun 25 23:24:31 2026

✅ ALL PROOFS PASS
```

**clamd liveness** (the live scan host): `clamdscan --stream` → `Eicar-Test-Signature FOUND` in 0.004s; clean → `OK`; raw TCP `INSTREAM` ping → `PONG` on 127.0.0.1:3310.

**Build + typecheck:** `tsc --noEmit` → **0 errors** (whole project); `npm run build` → success; `/data/submit`, `/data/in-progress`, `/api/prism/{prepare,commit,scan,files}` all built.

### PENDING HALT-A (architect applies migration) — ready to run

Gates 1 (EICAR held), 2 (clean promotes), 3 (trigger fires), 4 (carry-everything), 7 (verified confirmation) are exercised by `npx tsx --env-file=.env.local scripts/ob245_verify.ts` (drives EICAR + clean + a CSV renamed `.xlsx` through the real table/bucket/ClamAV and asserts recorded state + `file.*` audit + storage listings). It fails fast until the migration is applied. CC runs it (or the architect does) immediately after apply.

### Gate 6 (RLS) — architect-verified (HALT-C) — SQL Editor block

RLS requires real per-user JWTs; verify in the SQL Editor (or in-browser as two users). Policy mirrors the proven tenant+owner pattern (migrations 001/021). Example:
```sql
-- as platform: sees all
set local role authenticated;
set local request.jwt.claims = '{"sub":"<platform_auth_uid>"}';
select count(*) from public.file_objects;          -- all rows
-- as a member: sees only own
set local request.jwt.claims = '{"sub":"<member_auth_uid>"}';
select count(*) from public.file_objects;          -- only owner_id = that uid
```

### Gate 8 (theme + flow) — ready for architect browser verification (HALT-C)

Dev verified to boot (`next dev`); full upload→spine→confirmed loop is architect-verified in-browser after the migration. **What to check:** (a) `/data/submit` renders via theme tokens in Vialuce/Dark/Bliss; (b) drop a clean CSV → spine advances received→scanning→clean→promoted, message "Cleared and ready for the platform"; (c) drop the EICAR test file → spine ends red "Held for review", file absent from `ingestion-raw`; (d) the "Condition · soon" seam renders inert.

---

## 4.5 Adversarial review (second IRA) + fixes applied

A 5-dimension adversarial review ran against the committed code (gate integrity, RLS isolation, Invariant 9/AP-17, correctness/clamd protocol, theme/Korean). **All invariants confirmed HOLD**: scan-before-promote is physical and fail-closed; the gated promotion is the only NEW writer to `ingestion-raw`; tenant+owner RLS does not leak; no new/parallel auth path; the clamd `INSTREAM` protocol is correct; no fictional tokens / no hardcoded palette; no extension-based routing. Findings were fixed:

| Sev | Finding | Fix |
|---|---|---|
| HIGH | Clean legacy-OLE/unknown files fail to promote (ingestion-raw allowlist excludes `x-ole-storage`/`octet-stream`) | `toPromotableContentType` maps OLE2 → `application/vnd.ms-excel` (clean legacy Office now promotes); common types pass through; truly-unknown binaries hold safely at `clean` (documented — out-of-scope bucket not modified) |
| MED | File stuck at `clean` after a transient promote failure was unrecoverable | promote-retry path: re-invoking `scanFileObject` on a `clean`-without-`clean_path` row re-attempts only the promotion |
| MED | Fire-and-forget scan unreliable on serverless | Documented: the production trigger is the `POST /api/prism/scan/[id]` webhook (set `PRISM_SCAN_WEBHOOK_SECRET`); local `next dev` runs it inline. Fail-closed-safe regardless. |
| LOW | Non-atomic `scanning` claim could let a racing webhook stomp `promoted`→`clean` | `claimForScanning` compare-and-swap (`UPDATE … WHERE state IN (received,quarantined)`); zero rows → skip |
| LOW | RLS admin branch used non-existent `finance` role | now `('admin','tenant_admin')` (the canonical alias of `admin`) |
| LOW | Inline `['platform','vl_admin']` in scan route | now `resolveRole(actor.role) === 'platform'` |
| LOW | `commit` did not reject `..` path segments; `stateSummary` had no open-text fallback | both added |

Re-verified post-fix: `tsc --noEmit` 0 errors; `npm run build` exit 0; standalone proof still PASS.

## 5. SR-39 compliance

| Standard | Mechanism |
|---|---|
| SOC 2 CC6 (logical access) | `file_objects` + storage RLS (tenant + owner); service-role writes only; append-only `file.*` audit chain in `audit_logs`. |
| OWASP | Signed upload URL (bytes never transit a function); server-authoritative `content_sha256`; scan gate before any clean-boundary landing; no extension trust. |
| NIST SP 800-63B | Actor resolved from the authenticated session (`auth.getUser` → profiles), never from the request body; owner-path authorization on commit. |
| DS-014 | Surfaces + API gated on the existing `data.import` capability via `hasCapability`/`RequireCapability`. |
| Decision 123 | The physical quarantine bucket, the RLS, and the append-only audit chain are structural — not policy overlays. |

---

## 6. HALT status
- **HALT-A (migration apply):** ACTIVE — architect applies `20260626_ob245_prism_membrane.sql` via SQL Editor, then CC/architect runs `ob245_verify.ts`.
- **HALT-B (scan provider):** RESOLVED — real ClamAV stood up; no stub. (For production, point `PRISM_SCAN_PROVIDER`/`PRISM_CLAMD_HOST` or `PRISM_SCAN_API_URL` at a deployed clamd / managed ClamAV API — no code change.)
- **HALT-C (browser verification):** ACTIVE — architect verifies theme + flow in-browser (steps above).
- **HALT-D (PR merge):** ACTIVE — architect merges.
- **HALT-E (scope narrowing):** none — all §3 elements shipped.

## 7. §6A residuals
- Two new scope-sensitive surfaces (`/data/submit`, `/data/in-progress`) to **enroll in OB-246's persona model (set 35 → 37)** — flagged in `workspace-config.ts`. Merge order is architect-directed.
- Known constraint (documented, not a defect): the pre-existing `ingestion-raw` MIME allowlist governs which **clean** types can land. With `toPromotableContentType`, all realistic data formats land (csv, xlsx/zip, pdf, txt, gzip, and legacy OLE `.xls/.doc` → `vnd.ms-excel`). A genuinely-unknown clean binary (`octet-stream`) scans clean but is **held at `clean`** (recorded `promote_error`, never falsely `promoted`) and is recoverable via promote-retry. `ingestion-raw` is out of scope (§6), so its allowlist was not modified.
- Production trigger: the commit route fires the scan inline (reliable in `next dev`); on serverless, wire a Supabase storage object-create webhook (or cron) to `POST /api/prism/scan/[id]` with `PRISM_SCAN_WEBHOOK_SECRET`. The physical guarantee (gated promotion only) holds regardless of trigger; a file that is never scanned simply stays in quarantine (fail-closed).
- `import_batch_id` laid down (set on promotion only) for the Slice 2 Import hand-off; `content_sha256` laid down for Slice 2 recognition — no schema change needed next slice.
