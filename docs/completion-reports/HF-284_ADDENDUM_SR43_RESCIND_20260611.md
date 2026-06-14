# HF-284 Addendum — SR-43 Close Rescinded

**Date:** 2026-06-11 (committed under OB-204 Phase 0) · **References:** PR #477 (HF-284)

HF-284's SR-43 close is **rescinded**: it claimed a user-facing login outcome that the recorded evidence does not support. The middleware-layer verification HF-284 produced **stands** — five `bookkeeping_reset → login.success` event pairs demonstrate the session/auth path reaches `login.success` — but `login.success` fires *before* the profile fetch and is therefore **not user-outcome evidence** (a profile-shape defect, e.g. object-shaped `capabilities`, fails the consumer after `login.success` has already fired). The user-facing login outcome (the rendered post-login screen) lands as **OB-204 acceptance gate A1** (architect-channel browser pass, post-Phase-B).

This statement is CC's SR-43-rescind acknowledgment of record.
