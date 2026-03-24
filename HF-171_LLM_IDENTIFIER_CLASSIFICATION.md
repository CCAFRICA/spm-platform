# HF-171: Use LLM SemanticMeaning for Identifier Classification
## Type: HF (Hotfix) — Intelligence Utilization
## Date: March 24, 2026

HC LLM returns semanticMeaning distinguishing person vs transaction identifiers.
assignSemanticRole only reads columnRole (lossy bucket). Fix: add identifiesWhat
to HC prompt, pass through to classification. LLM-Primary, cardinality fallback.
