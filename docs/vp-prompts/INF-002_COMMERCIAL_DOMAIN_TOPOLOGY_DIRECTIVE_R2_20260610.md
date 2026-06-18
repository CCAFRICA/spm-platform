# INF-002: Commercial Domain Topology — R2
## Marketing Site at Apex, Platform at app.vialuce.ai

**Date:** 2026-06-10 (R2) · supersedes R1 of same date
**Category:** INF (Infrastructure)
**Decisions locked:** Lovable export → new repo + new Vercel project; platform subdomain **app.vialuce.ai**; execution **immediate**.
**Subsumes open item:** *Site URL dashboard fix* (prod) — performed once here, against the final topology.
**Drafting SOP:** `INF_Structured_Compliant_Drafting_Reference_20260513.md` — the file IS the prompt. INF runbook form per INF-001 precedent.

### R1 → R2 CHANGE LOG
| # | Change |
|---|---|
| 1 | Click-level platform steps added to every section (Lovable, GitHub, Vercel, Cloudflare, Supabase). Zero scope change. |
| 2 | Lovable flow verified against current docs; two binding caveats added: never rename/move the connected repo (breaks sync permanently); sync is main-branch-only. |

---

## 0 — TARGET TOPOLOGY

| Host | Serves | Source |
|---|---|---|
| `vialuce.ai` | **Marketing site** (Lovable bliss export) | New repo → new Vercel project |
| `app.vialuce.ai` | **Platform production** | VP Vercel project, `main` |
| `dev.vialuce.ai` | Platform dev | VP Vercel project, `dev` (per INF-001) |
| `governance.vialuce.ai` | VG | Unchanged, untouched |

## 0.1 — PRECONDITIONS (30 seconds)

- [ ] Auth/session arc closed (HF-284 merged + browser-verified) — confirmed in record
- [ ] No tester mid-session who would be disrupted by a one-time re-login (cookies are host-scoped; the move logs everyone out once)
- [ ] Lovable plan includes GitHub sync (paid-tier feature — if the connect option is absent in §A, this is why)

## 1 — INVARIANTS

1. **Account/credential/DNS actions are architect-only** (`[YOU]`). CC touches repos and config files only.
2. **No auth weakening.** The Site URL / redirect-list change is a relocation, not a loosening.
3. **Marketing repo is not VP.** VP standing rules govern VP; the same evidence discipline applies to any CC work in the marketing repo.
4. **`governance.vialuce.ai` and (if existing) `dev.vialuce.ai` are out of blast radius.** No step edits their DNS records or Vercel assignments.
5. **Never rename or move the Lovable-connected repo after §A** — it permanently breaks Lovable↔GitHub sync. Choose the final name before connecting.

---

## SECTION A — EXPORT THE LOVABLE SITE TO A REPO  `[YOU]`

> Decide the repo's **final** name and owner now (Invariant 5). Recommendation: `vialuce-marketing`, under whichever GitHub owner you want it to live beside permanently (`CCAFRICA` next to `spm-platform`, or the `vialuce` org next to `vialuce-governance`). Record the choice.

**Lovable — connect the account (once per workspace):**
1. Go to `lovable.dev`, sign in, open the **vialuce-redo-bliss** project.
2. Click the **GitHub icon** in the top navigation bar.
3. Click **Connect GitHub** → a GitHub OAuth window opens → sign in and **Authorize**.

**Lovable — install the GitHub App on the target owner:**
4. Click **Connect Project**.
5. If your target org/account is not listed: click **Add Organizations** (label may read **Manage Organizations**) → select the owner → choose repository access (**All repositories**, or **Only select repositories** and you'll add the new repo when prompted) → **Install & Authorize**.
6. You should be redirected back to the Lovable project page. If not, navigate back to the project manually.

**Lovable — create the repo:**
7. Click **Connect Project** again → choose the target owner → click **Transfer anyway** to confirm.
8. Lovable creates the new GitHub repository, pushes the full project as the initial commit, and activates **two-way sync on `main`**. (Edits made in Lovable commit to GitHub; commits pushed to `main` sync back to Lovable. Other branches do not sync.)

**GitHub — confirm the export:**
9. Go to `github.com/<owner>/<repo>`. Confirm it contains a Vite + React project: `package.json`, `index.html`, `vite.config.*`, `src/`, `tailwind.config.*`.

### A.1 — Backend-dependency review (the one real risk in the export)

The bliss site includes interactive elements (KAEL-7 chat assistant, signup). Lovable apps sometimes carry Lovable-cloud or Supabase calls that won't function as a plain static export.

**[TERMINAL]** (local)
```bash
git clone https://github.com/<owner>/<repo>.git vialuce-marketing
cd vialuce-marketing
grep -rn "supabase\|lovable\|fetch(\|axios" src/ --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' | head -40
```

**[VERIFY]**
- [ ] Repo exists with full Vite project; final name locked
- [ ] Backend-call inventory reviewed: static/none → proceed. **Any Lovable-cloud or external-API dependency → HALT-A1** — disposition each call (stub, remove, or rewire) before §B. CTAs that should reach the platform are rewired in §G, not here.

---

## SECTION B — NEW VERCEL PROJECT FOR THE MARKETING SITE  `[YOU]`

1. Go to `vercel.com/dashboard`. Check the **scope switcher** (top-left) — select the same team that owns the VP project.
2. Click **Add New…** → **Project**.
3. Under **Import Git Repository**, find the new repo. If it isn't listed: click the GitHub-permissions link (reads **Adjust GitHub App Permissions** or similar) → grant Vercel access to the new repo → return.
4. Click **Import** next to the repo.
5. Configure: **Framework Preset** should auto-detect **Vite**. Leave Build Command (`npm run build`) and Output Directory (`dist`) at the detected defaults. **Add no environment variables** (unless §A.1 dispositioned a legitimate need — add those deliberately).
6. Click **Deploy**. Wait for the build.
7. Open the assigned `https://<project>.vercel.app` URL.

**[VERIFY]**
- [ ] Bliss site renders fully at the `.vercel.app` URL (Spanish-first landing, nav, pricing table)
- [ ] Browser devtools console: no errors on load

---

## SECTION C — PLATFORM GAINS app.vialuce.ai (BEFORE APEX MOVES)  `[YOU]`

Order matters: the platform must be reachable and authenticating at its new host **before** the apex is taken away from it.

**Vercel — add the domain to VP:**
1. Vercel dashboard → open the **VP (spm-platform) project** → **Settings** → **Domains**.
2. Click **Add** → enter `app.vialuce.ai` → leave the environment assignment at **Production** (`main`) → confirm.
3. The domain row will show **Invalid Configuration** with the DNS record Vercel requires — typically `CNAME → cname.vercel-dns.com`. Note the exact target shown.

**Cloudflare — create the DNS record:**
4. Go to `dash.cloudflare.com` → select the **vialuce.ai** zone → **DNS** → **Records**.
5. Before adding: look at the existing record for `governance` (and `dev` if INF-001 ran) and note its **Proxy status** (orange cloud = Proxied, grey = DNS only).
6. Click **Add record**: Type **CNAME**, Name **app**, Target = the exact value from step 3, TTL **Auto**, Proxy status **matching the working pattern from step 5**. (Vercel's general guidance prefers DNS-only for Vercel-pointing CNAMEs; if your existing Vercel-pointing records are Proxied and working, mirror them.)
7. **Save**.
8. Return to the Vercel Domains panel; within minutes the `app.vialuce.ai` row should flip to **Valid Configuration** (use its **Refresh** button).

**[VERIFY]**
- [ ] `https://app.vialuce.ai` serves the platform (same deployment as current `vialuce.ai`)
- [ ] Login page renders at the new host (login itself may misbehave until §D — expected)

---

## SECTION D — PROD SUPABASE AUTH CONFIG → NEW HOST  `[YOU]`

This step **subsumes the pending Site URL dashboard fix.** Done once, against the final topology.

1. Go to `supabase.com/dashboard` → open the **prod** project (the one VP production points at — verify by project ref, not by name).
2. Left nav: **Authentication** → **URL Configuration**.
3. **Site URL** field → replace with `https://app.vialuce.ai` → **Save**.
4. **Redirect URLs** → **Add URL** → `https://app.vialuce.ai/**`. Confirm `http://localhost:3000/**` is present. **Leave** any existing `https://vialuce.ai/**` entry for now (transition window) — prune it in §H after §F's redirects are verified.
5. Left nav: **Authentication** → **Email Templates** (label may read **Emails**). Open each template (Confirm signup, Magic Link, Reset Password, MFA if present): templates using `{{ .SiteURL }}` need nothing; any **hardcoded** `vialuce.ai` URL → edit to `app.vialuce.ai` → Save.

**[VERIFY]**
- [ ] Full login at `https://app.vialuce.ai` succeeds end-to-end (password + MFA if enrolled)
- [ ] Trigger a password-reset email to a test account: the link points at `app.vialuce.ai`

**HALT-D1:** Login at `app.vialuce.ai` fails after this section → stop. Re-check Site URL + Redirect URLs. **Do not proceed to §E while auth at the new host is broken** — cutting the apex over at that moment leaves no working platform URL at all.

---

## SECTION E — APEX CUTOVER  `[YOU]`

**Vercel — release the apex from VP:**
1. **VP project** → **Settings** → **Domains** → find the `vialuce.ai` row → open its menu (⋯ / **Edit**) → **Remove** → confirm. Repeat for `www.vialuce.ai` if present.

**Vercel — claim the apex for marketing:**
2. **Marketing project** → **Settings** → **Domains** → **Add** → `vialuce.ai` → confirm. (Within the same team Vercel may instead prompt that the domain belongs to another project and offer to **move** it — that path is equivalent; either way it ends assigned to the marketing project.)
3. **Add** → `www.vialuce.ai` → when prompted, choose **Redirect to vialuce.ai**.
4. **Cloudflare:** the existing apex record(s) already point at Vercel infrastructure, and Vercel routes by hostname-to-project assignment — so typically **no DNS change is needed**. Authority is the marketing project's Domains panel: if it shows **Valid Configuration**, done; if it displays required records differing from what exists, apply **exactly** what the panel shows in Cloudflare (DNS → Records → edit the apex record).

**[VERIFY]**
- [ ] `https://vialuce.ai` serves the **marketing site**
- [ ] `https://app.vialuce.ai` still serves the **platform**
- [ ] `https://governance.vialuce.ai` unaffected

**HALT-E1:** Any platform surface still resolves at apex, or any marketing page at `app.` → stop and re-check both projects' Domains panels before touching anything else.

---

## SECTION F — APEX PLATFORM-ROUTE REDIRECTS  `[YOU]` or `[CC]`

Tester bookmarks and transition-window auth links point at apex platform paths. The **marketing repo** carries the redirects.

1. Get the authoritative platform route list — **[TERMINAL]** in the VP repo:
```bash
ls web/src/app
```
2. In the **marketing repo**, create `vercel.json` at repo root (extend the list with any top-level segment from step 1 a tester could have bookmarked; marketing routes — `/`, `/plataforma`, `/recursos`, pricing — must NOT appear):

```json
{
  "redirects": [
    { "source": "/login", "destination": "https://app.vialuce.ai/login", "permanent": true },
    { "source": "/auth/:path*", "destination": "https://app.vialuce.ai/auth/:path*", "permanent": true },
    { "source": "/dashboard/:path*", "destination": "https://app.vialuce.ai/dashboard/:path*", "permanent": true },
    { "source": "/operate/:path*", "destination": "https://app.vialuce.ai/operate/:path*", "permanent": true },
    { "source": "/stream/:path*", "destination": "https://app.vialuce.ai/stream/:path*", "permanent": true },
    { "source": "/perform/:path*", "destination": "https://app.vialuce.ai/perform/:path*", "permanent": true }
  ]
}
```
3. Commit to `main` → push → Vercel auto-redeploys the marketing project. (Pushing to `main` also syncs the file back into Lovable — expected, harmless.)
4. **[TERMINAL]** verify:
```bash
curl -sI https://vialuce.ai/login | head -5
```

**[VERIFY]**
- [ ] `https://vialuce.ai/login` returns 308 with `location: https://app.vialuce.ai/login`
- [ ] Marketing pages still render (no over-broad redirect)

---

## SECTION G — MARKETING → PLATFORM LINK  `[YOU]` or `[CC]`

Two equivalent edit paths — pick one:
- **Via Lovable:** prompt the change in the Lovable editor ("point the 'Iniciar sesión' nav button and all launch-platform CTAs to https://app.vialuce.ai/login"); it commits to GitHub and redeploys.
- **Via repo:** edit the nav/CTA components directly in the marketing repo, commit to `main`; it syncs back to Lovable and Vercel redeploys.

Wire: sign-in CTA → `https://app.vialuce.ai/login`. Signup CTAs → the platform's actual entry surface, or a contact/demo-request anchor if self-service signup isn't live. **Do not** leave any CTA wired to a dead Lovable handler (§A.1's inventory says which exist).

**[VERIFY]**
- [ ] Sign-in CTA lands on the platform login at `app.vialuce.ai`
- [ ] No CTA on the marketing site 404s or fires a dead handler

---

## SECTION H — CLOSURE SWEEP  `[YOU]` + `[CC]`

**[YOU]** Full pass: apex → marketing renders; CTA → platform login → authenticate (one-time re-login expected); MFA flow if enrolled; `governance.vialuce.ai` up; if dev substrate exists, `dev.vialuce.ai` up and pointing at dev. Then prune the apex entry from Supabase Redirect URLs (§D step 4's transition entry): Authentication → URL Configuration → remove `https://vialuce.ai/**` → Save → confirm login still works.

**[CC]** Update build-ops topology documentation: apex = marketing project + repo name, `app.` = platform prod, redirect inventory, Site-URL state. Commit; push; PR per standing rules.

**Cross-directive reference updates (mechanical):**
- INF-001 (if not yet executed): its separation-proof prod URL reads `app.vialuce.ai`
- OB-202: CLT-202 verification URLs are `dev.vialuce.ai` → promotion → `app.vialuce.ai`; no code change (relative paths)
- Resend sending domain: **unaffected** — web DNS records moved, not MX/SPF/DKIM

**[VERIFY]**
- [ ] All §H checks pass; apex redirect-list entry pruned; open item *Site URL dashboard fix* marked closed-by-INF-002

---

## HALT CONDITIONS

- **HALT-A1:** Lovable export carries backend calls (Lovable cloud, Supabase, external APIs) — disposition each before §B.
- **HALT-D1:** Login at `app.vialuce.ai` fails post-§D — fix before §E; never cut the apex while auth at the new host is broken.
- **HALT-E1:** Post-cutover, any platform surface at apex or marketing page at `app.` — stop, re-check domain assignments.

---

*INF-002 R2 · Commercial Domain Topology · 2026-06-10*
*vialuce.ai · Intelligence. Acceleration. Performance.*
*Drafted to INF_Structured_Compliant_Drafting_Reference_20260513.md — the file IS the prompt.*
