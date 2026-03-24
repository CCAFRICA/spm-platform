# HF-170: Pass rowCount to SCI Identifier Classification Call Sites
## Type: HF (Hotfix) — HF-169 Completion
## Date: March 24, 2026

HF-169 added cardinality logic but callers don't pass rowCount. Parameter
defaults to undefined, uniquenessRatio always 0, cardinality check never fires.
Fix: pass profile.structure.rowCount at both call sites.
