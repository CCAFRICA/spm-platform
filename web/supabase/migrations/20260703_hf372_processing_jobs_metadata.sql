-- HF-372 Phase D — processing_jobs.metadata (jsonb): the phase carrier for the truthful job-state
-- machine. metadata.phase records the REAL step (classifying / interpreting_plan / committing /
-- loading / finalizing / completed / failed / cancelled) and metadata.proposal_id links the
-- session's jobs to the commit's proposal so finalize-import (which receives only the proposalId)
-- can mark them finalized on every dispatch path (client fire / execute-bulk waitUntil /
-- finalize-sweep cron).
--
-- ARCHITECT (SR-44): apply BEFORE deploying the HF-372 code. The status writers degrade gracefully
-- pre-migration (status advances still land; phase writes warn), but the import screen's phase
-- display and the fleet tab's queue read this column directly.

ALTER TABLE processing_jobs
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- The finalize path looks jobs up by the stamped proposal id.
CREATE INDEX IF NOT EXISTS idx_processing_jobs_proposal
  ON processing_jobs ((metadata->>'proposal_id'))
  WHERE metadata->>'proposal_id' IS NOT NULL;
