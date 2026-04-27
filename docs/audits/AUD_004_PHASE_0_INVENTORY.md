# AUD-004 Phase 0: Vocabulary and Shape Inventory

**Authored:** 2026-04-27
**Branch:** aud-004-phase-0 (off origin/main at 6bc005e65ec263f6b2c234c3501af4d80032f51d)
**Scope:** READ-ONLY inspection. No code changes, no DB modifications.
**Deliverable:** Pasted evidence corpus. No interpretation. No findings.
**Predecessor:** DIAG-024_FINDINGS.md, AUD-002_SIGNAL_SURFACE_INTEGRITY_v2.md
**Governing:** Decision 64 v2, Decision 151, Decision 153 (LOCKED, not yet on main),
              AP-25 (Korean Test as gate), AUD-002 v2 audit pattern.

---

## Phase 0 — Initialization

### Step 0.0 — Substrate Verification

```
$ git fetch origin
$ git rev-parse origin/main
6bc005e65ec263f6b2c234c3501af4d80032f51d

$ git log -1 origin/main --pretty=format:'%H %s%n%aD'
6bc005e65ec263f6b2c234c3501af4d80032f51d Merge pull request #344 from CCAFRICA/diag-024-importer-engine-alignment
Mon, 27 Apr 2026 05:37:41 -0700
```

**SHA divergence note:** The DIAG-024 anchor recorded in the directive is `6504b7cfeac23e8410643c5f0b3a844f59597e67` (the squashed commit on the diag-024 feature branch). `origin/main` HEAD is `6bc005e65ec263f6b2c234c3501af4d80032f51d`, the merge commit that brought PR #344 onto `main`. Tree contents are identical to the merged DIAG-024 commit. Per directive instruction ("If HEAD differs: Paste the new SHA and the `git log` entry. Do not halt. Report and continue."), recorded and continuing.

### Step 0.1 — Branch Creation

```
$ git checkout main
Already on 'main'
Your branch is up to date with 'origin/main'.

$ git pull origin main
From https://github.com/CCAFRICA/spm-platform
 * branch              main       -> FETCH_HEAD
Already up to date.

$ git checkout -b aud-004-phase-0
Switched to a new branch 'aud-004-phase-0'

$ git rev-parse HEAD
6bc005e65ec263f6b2c234c3501af4d80032f51d

$ git branch --show-current
aud-004-phase-0
```

### Step 0.2 — Report File Scaffold

This file (`docs/audits/AUD_004_PHASE_0_INVENTORY.md`) is the scaffold. Subsequent phases append below.

---
