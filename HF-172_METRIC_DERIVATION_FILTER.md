# HF-172: Metric Derivation Filter Application + Source Pattern De-Gating
## Type: HF (Hotfix)
## Date: March 24, 2026

Applies metric_derivation filters to sum/delta operations (were only applied
to count). Removes source_pattern as row gating (provenance metadata only).
Fixes Plans 1-3 incorrect calculation results.
