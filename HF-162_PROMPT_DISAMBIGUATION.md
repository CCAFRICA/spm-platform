# HF-162: PROMPT DISAMBIGUATION + KOREAN TEST CLEANUP + TEMPERATURE CONTROL
## Type: HF (Hotfix)
## Date: 2026-03-22
## Source: AUD-002 Prompt Disambiguation Analysis

Fixes non-deterministic plan type classification. Same plan document produced
piecewise_linear on first import and conditional_gate on second import.
Root cause: prompt ambiguity between piecewise_linear and conditional_percentage.
