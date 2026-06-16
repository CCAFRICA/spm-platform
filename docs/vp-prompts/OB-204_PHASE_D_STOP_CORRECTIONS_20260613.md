# OB-204 — PHASE D: STOP + CORRECTIONS
**Date:** 2026-06-13 · **Issued by:** Architect, couriered verbatim. IMMEDIATE.

## CORRECTION 1 — WRONG DIRECTIVE

You are running the original Phase D directive. STOP. Discard any uncommitted Phase D work. The operative directive is the REVISED Phase D with layered email routing that the architect will paste after this correction. Do not proceed until you receive it.

## CORRECTION 2 — app.vialuce.ai IS WRONG

`app.vialuce.ai` is NOT the current production URL. INF-002 (commercial domain topology) has not executed — that URL does not resolve to the platform today. Any hardcoded reference to `app.vialuce.ai` in templates, links, privacy-notice URLs, or any other code is incorrect and will produce broken links in production.

Grep immediately and report:
```
git grep -rn "app.vialuce.ai" -- 'web/'
```

The correct base URL for links in system emails is resolved at runtime from the environment — `process.env.NEXT_PUBLIC_SITE_URL` or equivalent (whatever the Vercel deployment serves as its canonical origin). Templates and dispatch code must NEVER hardcode a domain. Paste the grep results so we can assess the damage before proceeding.

After both corrections are acknowledged and the grep is pasted, the architect will paste the revised Phase D directive (layered email routing). Do not proceed until then.

---

*OB-204 · corrections before code · no broken links ship*
*vialuce.ai · Intelligence. Acceleration. Performance.*
