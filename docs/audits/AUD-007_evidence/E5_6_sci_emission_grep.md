# E5.6 — `SCI emission` / `SCI signal` / sciEmission references

**Command:** `grep -rln "SCI emission\|SCI signal\|sci_emission\|sciEmission\|SCI write\|SCI persist" web/src/ docs/`

**Files matched (verbatim):**

```
/Users/AndrewAfrica/spm-platform/web/src/app/api/platform/observatory/route.ts
/Users/AndrewAfrica/spm-platform/web/src/lib/sci/signal-capture-service.ts
/Users/AndrewAfrica/spm-platform/web/src/lib/data/platform-queries.ts
/Users/AndrewAfrica/spm-platform/docs/vp-prompts/OB-197_SIGNAL_SURFACE_REBUILD.md
/Users/AndrewAfrica/spm-platform/docs/audits/AUD-006_Signal_Write_Pipeline_Audit.md
/Users/AndrewAfrica/spm-platform/docs/audits/AUD_004_Remediation_Design_Document_v3_20260427.md
/Users/AndrewAfrica/spm-platform/docs/audits/AUD-006_Signal_Write_Pipeline_Audit_Directive.md
/Users/AndrewAfrica/spm-platform/docs/audits/AUD-007_OB-199_SCI_Structural_Preservation_Audit_DIRECTIVE.md
/Users/AndrewAfrica/spm-platform/docs/audits/AUD-007_evidence/E3_5b_hf092_schema_correction.md
/Users/AndrewAfrica/spm-platform/docs/audits/AUD-007_evidence/E5_5b_signal_capture_service.md
/Users/AndrewAfrica/spm-platform/docs/audits/AUD-007_evidence/E5_1_DS-021_full.md
/Users/AndrewAfrica/spm-platform/docs/audits/AUD-007_evidence/E5_2a_DS-022_Canonical_Signal_Write_Surface_v2_full.md
/Users/AndrewAfrica/spm-platform/docs/audit-evidence/phase4/cluster_a_evidence.md
/Users/AndrewAfrica/spm-platform/docs/CC-artifacts/OB-199_phase0_architecture_decision_record.md
/Users/AndrewAfrica/spm-platform/docs/CC-artifacts/OB-199_phase4_deletion_intent_verification.md
/Users/AndrewAfrica/spm-platform/docs/design-specifications/DS-022_Canonical_Signal_Write_Surface_v2.md
/Users/AndrewAfrica/spm-platform/docs/design-specifications/DS-021_Substrate_Architecture_Biological_Lineage_v1_0_LOCKED_20260430.md
```

Total: **17 files** referencing SCI emission vocabulary. CC does not enumerate which contain the term in code vs documentation; the architect reads.

Notable categories (CC observation; no classification of relevance):
- Source code: 3 files (`api/platform/observatory/route.ts`, `lib/sci/signal-capture-service.ts`, `lib/data/platform-queries.ts`)
- Substrate / design specs: 2 files (DS-021, DS-022 v2 — both surfaced verbatim in E5.1 and E5.2a respectively)
- Audit reports: 4 files (AUD-006 main report + directive, AUD_004 v3 remediation doc, AUD-007 directive — this is the audit currently in execution)
- AUD-007 evidence files surfaced in this very audit: 4 files (recursive self-references)
- OB-199 CC artifacts: 2 files (Phase 0 ADR, Phase 4 deletion-intent verification)
- Audit evidence from prior audits: 1 file (phase4/cluster_a_evidence.md)
- VP prompts: 1 file (OB-197 signal surface rebuild)
