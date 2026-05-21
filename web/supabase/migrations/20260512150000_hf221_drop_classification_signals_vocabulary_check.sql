-- HF-221 R1 — Drop classification_signals_signal_type_vocabulary_chk
--
-- Schema-level CHECK constraint enumerating namespace prefixes operated as
-- registry on the canonical Learn-role signal surface, contradicting:
--   IGF-G7 (Single Canonical Signal Surface)
--   Decision 64 v2 (three-level signal architecture, emergent intelligence)
--   AP-26 spirit (signal vocabulary registry prohibition — application
--                  layer scope extended to schema layer by HF-221)
--
-- Structurally correct pattern operative on igf.health_signals:
-- signal_type TEXT NOT NULL, no CHECK enumeration on signal_type.
--
-- Application layer determines signal_type semantics. Schema accepts any
-- text per NOT NULL.

ALTER TABLE classification_signals
DROP CONSTRAINT classification_signals_signal_type_vocabulary_chk;
