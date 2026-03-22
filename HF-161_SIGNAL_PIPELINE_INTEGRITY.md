# HF-161: SIGNAL PIPELINE INTEGRITY + KOREAN TEST CLEANUP
## Type: HF (Hotfix)
## Date: 2026-03-22
## Source: AUD-001 SCI Pipeline Integrity Audit
## Findings: F-AUD-001, F-AUD-002, F-AUD-003, F-AUD-004, F-AUD-005

Fixes signal persistence TypeError: fetch failed on every server-side AI call.
Root cause: getClient() in signal-persistence.ts used dynamic imports inside fire-and-forget chains.
Fix: Adopt writeClassificationSignal pattern — accept Supabase URL + service key as arguments.
Also: Remove hardcoded eligibleRoles arrays (Korean Test violations).
