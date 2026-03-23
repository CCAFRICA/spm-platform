# HF-167: Session Cookie Security Hardening
## Type: HF (Hotfix)
## Date: March 23, 2026

Three linked auth vulnerabilities: @supabase/ssr 400-day cookie, missing session
cookies skip timeout checks, maxAge makes cookies persistent. Fix: remove maxAge,
override setAll, flip timeout guards.
