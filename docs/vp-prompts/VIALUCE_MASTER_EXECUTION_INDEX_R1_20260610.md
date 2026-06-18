# VIALUCE MASTER EXECUTION INDEX — R1
## Dev Environment · Release Framework · Commercial Topology · Repo Home

**Date:** 2026-06-10
**Purpose:** The single sequencing authority for the four-artifact effort: INF-003 (repo home migration, embedded here), INF-001 R3 (dev/prod substrate separation, B3), OB-202 (release visibility & relaunch), INF-002 R2 (commercial domain topology) — plus the locked versioning scheme that binds them.
**Drafting SOP:** `INF_Structured_Compliant_Drafting_Reference_20260513.md`. This index REFERENCES the three existing directives (no duplication — their files remain THE prompts) and EMBEDS only what has no home elsewhere: the Stage-0 runbook and the versioning-scheme lock.

---

# PART I — LOCKED DECISIONS REGISTRY (this arc)

| # | Decision | State |
|---|---|---|
| L1 | Dev schema: **clone prod structure**; data: **fresh import** through SCI; migration-replay off critical path | LOCKED |
| L2 | Platform production host: **app.vialuce.ai**; apex `vialuce.ai` = marketing site | LOCKED |
| L3 | Marketing site: **Lovable export → repo → own Vercel project** | LOCKED |
| L4 | **Production GitHub home = `vialuce` org.** `CCAFRICA/spm-platform` ceases to be production | LOCKED |
| L5 | Migration method: **GitHub Transfer** (history, PRs, redirects preserved) | LOCKED |
| L6 | Migration timing: **Stage 0 — before everything** | LOCKED |
| L7 | Marketing repo **born in `vialuce` org at first Lovable connection** (Lovable no-move constraint) | LOCKED |
| L8 | Versioning: **watermark scheme** `{gen}.{OB}.{HF}` — Part III | LOCKED |
| L9 | Generation gates are **exit-criteria-bound**, never declared by fiat | LOCKED |
| L10 | Generation-gate criteria: **reconciled synthesis** (Part III §3) — adopted per architect deferral, ratified at this document's commit | ADOPTED |
| L11 | Skew Protection enabled (INF-001 §C.4); additive-first migrations standing rule (OB-202 Phase 4) | LOCKED |
| L12 | Dev email = Supabase default sender; no Resend credentials in dev | LOCKED |

**Repo names:** `vialuce/spm-platform` (transferred, name kept — renaming adds risk, gains nothing) and `vialuce/marketing` (born there). Veto before Stage 0 if you prefer different names; after Stage 0/INF-002 §A they are fixed (Lovable constraint; transfer-redirect hygiene).

---

# PART II — STAGE 0: REPO HOME MIGRATION (INF-003, embedded)  `[YOU]` + `[CC]`

No separate file exists for this; this section IS the runbook. Estimated 30–45 minutes.

## 0.A — Preconditions  `[YOU]`
1. You hold **owner** (or repo-transfer-permitted) rights on the `vialuce` GitHub org, and admin on `CCAFRICA/spm-platform`.
2. CC has **no in-flight uncommitted/unpushed work**. Send CC: `Commit and push all current work. Then HOLD — repo transfer in progress. No git operations until released.`
3. Note: open PRs, issues, full history, releases, and webhooks transfer intact. Old `CCAFRICA/...` URLs auto-redirect for git operations and browser links.

## 0.B — GitHub Transfer  `[YOU]`
1. Go to `github.com/CCAFRICA/spm-platform` → **Settings** (repo settings, not account).
2. Scroll to **Danger Zone** → **Transfer ownership** → click **Transfer**.
3. **New owner:** type `vialuce`. Keep repository name `spm-platform`.
4. Type the confirmation string GitHub demands → confirm. (If the org restricts incoming transfers, an org owner accepts it from the org's pending-transfers notice.)
5. Confirm `github.com/vialuce/spm-platform` loads with full history and the open-PR list intact.

## 0.C — Vercel re-link  `[YOU]`
GitHub transfer breaks the Vercel↔repo link; the Vercel GitHub App must see the new owner.
1. Vercel dashboard → team **Settings** → **Git** (or any project's Git settings) — if the `vialuce` org is not connected: **Adjust GitHub App Permissions** → in the GitHub popup, install/grant the Vercel app on the **vialuce** org with access to `spm-platform`.
2. Open the **VP project** → **Settings** → **Git** → **Connected Git Repository** → **Disconnect** → **Connect Git Repository** → select `vialuce/spm-platform`.
3. Confirm Production Branch remains `main`.
4. Domains, environment variables, and deployments are project-level — they survive the re-link untouched.

## 0.D — Trigger and verify a deploy  `[YOU]` `[TERMINAL]`
```bash
git remote set-url origin git@github.com:vialuce/spm-platform.git   # or the https form
git remote -v
git checkout dev
git commit --allow-empty -m "INF-003: verify pipeline post-transfer (vialuce/spm-platform)"
git push origin dev
```
Confirm a Preview deployment builds in Vercel from that push. Then the same empty-commit test is NOT needed on `main` — the next real merge proves it.

## 0.E — CC environment + standing docs  `[CC]` (release CC from hold with this block)
```
Repo transferred: CCAFRICA/spm-platform → vialuce/spm-platform. Execute:
1. git remote set-url origin git@github.com:vialuce/spm-platform.git ; verify with git remote -v and git fetch.
2. gh repo set-default vialuce/spm-platform ; verify with gh repo view.
3. Update ACTIVE references to CCAFRICA/spm-platform in CC_STANDING_ARCHITECTURE_RULES.md and build-ops documentation to vialuce/spm-platform. Historical completion reports are NOT touched — they are forensic record; GitHub redirects their links.
4. Commit "INF-003: repo home references → vialuce/spm-platform", push, PR per standing rules, report evidence (pasted git remote -v, gh repo view, grep of remaining active-doc references = none).
```

## 0.F — Gate  `[VERIFY]`
- [ ] `vialuce/spm-platform` live; PR history intact
- [ ] Vercel builds from the new home (0.D preview deployed)
- [ ] CC evidence: remote, gh default, active-doc references updated
- [ ] **HALT-0:** Vercel cannot see the repo → GitHub App permissions on the org (0.C.1) — fix before anything else; nothing downstream works without the pipeline

---

# PART III — VERSIONING SCHEME (LOCKED; supersedes Decision 60 §format)

This section is the source text for **Versioning Framework R2**. Decision 60's traceability chain (work-item → release → CLT → PR → tag) survives unchanged; only the *format and minting mechanics* are superseded — because the Feb format required a manual minting act, and the record shows zero tags were ever cut. The fix is structural: the number mints itself.

## 1 — Format
```
{generation}.{OB}.{HF}        e.g.  a1.203.284
```
- **generation** — `a1, a2, …` pre-production; bare `1, 2, …` from first production release. The ONLY criteria-gated component (§3). Letter `a` = pre-production; alpha/beta vocabulary is retired.
- **OB** — highest OB number merged to `main` at release time.
- **HF** — highest HF number merged to `main` at release time.

## 2 — Derivation rule (mechanical, never from memory)
At release time, on `main`: OB = max NNN across `docs/vp-prompts/OB-*` whose completion report exists in `docs/completion-reports/` with a merge SHA; HF likewise. CC computes; the completion report pastes the derivation evidence. Both components are globally monotonic and never reset. An HF-only release moves only the third component — natural patch semantics, unmanaged.

## 3 — Generation gates (criteria-bound; the L10 synthesis)
Two frameworks exist and gate **different milestones** — the mature resolution is nesting, not choosing:

- **Test-user entry** = milestone **within a1**, gated by **User-Ready Exit Criteria R1 (Tiers A–D) — all PASS**. No generation bump: letting testers in doesn't change what the product is.
- **a1 → a2** = the reconciled superset: **User-Ready Tiers A–D PASS** *plus* the **surviving product-completeness items** from the Feb Alpha Exit list (multi-file import, financial-module actionability, demo walkthrough clean, page-load, zero console errors). Items the INF-002 topology relocated to the marketing site (landing-page accuracy, value-prop pages) are **retired from the platform gate** — they graded a surface the platform no longer owns.
- **→ `1` (production)** = the Beta-Exit/GA criteria as recorded (3+ real customers full-lifecycle, SOC2, self-service import, dispute workflow, multi-period, clawbacks) — to be refreshed as **Production Gate Criteria** when a2 closes; far enough out that refreshing now would be speculation.

A follow-on artifact, **GENERATION_GATE_CRITERIA_R1**, enumerates the reconciled a1→a2 checklist as a scoreable document (Stage-5 item). Until it exists, this section governs.

## 4 — Minting procedure (amends Rule 32)
1. CC computes the watermark (§2) → bumps `web/release.json` → commit on the release branch.
2. Merge to `main`.
3. Tag: `git tag -a <version> -m "<version>: <one-line scope>"` → push tag.
4. Release notes per Decision 60 template (unchanged), listing OB/HF/CLT/PR.
The baked client identity (OB-202) and the tag can never diverge — same source, same commit.

## 5 — First minted release
The first tag ever cut will be the release that ships this arc — computed at that day's merged state (illustratively `a1.203.284`; the real numbers derive on the day). alpha.1.0–4.0 remain *documentary* designations of the February–March batches: real as history, never tagged, not back-filled.

---

# PART IV — EXECUTION SEQUENCE

```
Stage 0   INF-003 repo transfer (Part II — embedded)            [gate: pipeline builds from vialuce org]
Stage 1   INF-001 R3 §A–§H  dev environment + skew protection   [gates: §B.4 parity diff · §E separation proof]
Stage 2   INF-002 R2 §A–§H  marketing site + domain topology    [gates: §D auth at app. · §E cutover · HALT-D1/E1]
Stage 3   OB-202 dispatch   release identity + relaunch banner  [gate: §5 proof-gate evidence review]
Stage 4   First minted release: merge → tag a1.{OB}.{HF} → CLT-202 banner verification dev→prod
Stage 5   Closure: B3 ✅ in exit criteria · sequence B4 (RLS re-audit) · GENERATION_GATE_CRITERIA_R1 · Mission Control update
```

**Ordering logic and parallelism:**
- **Stage 0 strictly first** (L6) — every later PR, Vercel link, and CC push lands in the final home.
- **Stages 1 and 2 are independent** of each other and both `[YOU]`-heavy. Run them in either order or interleaved across sessions; neither blocks the other. (Stage 2 was dispositioned "immediate" — it may precede Stage 1 entirely.)
- **Stage 3 build** can start any time after Stage 0 (env-agnostic code); its **deploy-verification** wants Stage 1 done (banner proven on `dev.vialuce.ai` first) and its CLT URLs assume Stage 2's hosts.
- **Stage 4 is the convergence event**: the OB-202 merge is simultaneously the first promotion through the new dev→prod path, the first watermark-minted tag, and the banner's production debut. One observable event closes three threads.
- **Stage 5** includes the BCL fresh-import reconciliation in dev (INF-001 §H, $312,033) if not already executed within Stage 1 — B3 does not close without it.

**Standing watch carried from the critical-path doc:** capture-side defects surfaced anywhere in this arc → DIAG-030 context; do not expand any stage's scope. OB-203 (import pipeline) and the CRP Plan 2/4 work proceed on their own track — this index does not sequence them, except that their PRs after Stage 0 land in `vialuce/spm-platform` automatically.

---

# PART V — AMENDMENT APPENDIX (line edits to existing artifacts; apply before dispatching each)

**INF-001 R3 → R4** (apply at Stage-1 start):
1. Header + §B.3/§F repo references: `CCAFRICA/spm-platform` → `vialuce/spm-platform`.
2. §E separation-proof prod URL: `vialuce.ai` → `app.vialuce.ai` **if Stage 2 has executed**; otherwise leave and read apex.

**OB-202 → R2** (apply before dispatch):
1. `## Target:` header → `a1.{OB}.{HF} — computed at Phase 1 per MASTER Part III §2`.
2. §0 tag-state paragraph → replaced by: *"No tags exist (verified 2026-06-10). First mint follows Part III §4 of the Master Index."*
3. §3.1.1 `release.json` → `{ "generation": "a1", "release": "<computed>" }`, CC computes the watermark at Phase 1 and pastes the derivation.
4. §3.4 Rule [N] (Release Identity Bump) → text replaced by Part III §4 (compute, not bump-by-hand).
5. Repo references → `vialuce/spm-platform`.

**INF-002 R2 → R3** (apply at Stage-2 start):
1. §A repo owner: locked to **`vialuce`** org; recommended name `marketing` (final per L7 — decide before §A step 7).
2. Repo references in §F/§G examples → `vialuce/marketing`.

I apply any or all of these on instruction — each is a five-minute str_replace pass producing the next revision with a change log.

---

# PART VI — CLOSURE CRITERIA & RESIDUALS

**This arc closes when:** Stage 0–4 gates all pass · B3 marked ✅ with date in `VIALUCE_USER_READY_EXIT_CRITERIA_R1.md` · first tag exists on `main` and the banner displayed it in production · topology + versioning documented in build-ops.

**Residuals (named, not started):** B4 RLS re-audit (successor gate — test users do NOT enter before it passes) · GENERATION_GATE_CRITERIA_R1 (scoreable a1→a2 checklist per Part III §3) · Versioning Framework R2 formal doc (cut from Part III) · CI test gap (a visible release number on an untested build is now a visible unproven claim — priority rises) · orphan-account pass · footer/About release display · migration-replay integrity test · Production Gate Criteria refresh (at a2).

---

*MASTER EXECUTION INDEX R1 · 2026-06-10 · supersedes no document; sequences four*
*vialuce.ai · Intelligence. Acceleration. Performance.*
