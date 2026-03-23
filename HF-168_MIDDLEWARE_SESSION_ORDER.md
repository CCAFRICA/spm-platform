# HF-168: Middleware Session Cookie Initialization Order
## Type: HF (Hotfix) — HF-167 Regression Fix
## Date: March 23, 2026

Fixes login blocked in production. HF-167 timeout guard flip treats first
authenticated request as expired because vialuce-session-start cookie
initialization happens AFTER timeout checks. Fix: initialize before check.
