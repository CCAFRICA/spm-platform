// HF-360 (Part A/B) — the hand-off load contract: the durable job + pulse manifest + cursor that let the
// serverless function STAGE all pulse CSVs and EXIT, while a database-side pg_cron worker performs the
// per-pulse FDW loads OFF the serverless clock (the load-bearing fix for the held-window ceiling kill).
//
// ONE source of truth for the job shape, shared by the function (enqueue), the worker (drain — mirrored in
// the SQL migration), Part B (rollback/resume/audit), and Part C (truthful surface). No parallel job concept.

export const PULSE_LOAD_JOBS_TABLE = 'pulse_load_jobs';

/**
 * One staged pulse, in commit order. The function builds the CSV (remediation already applied — Decision
 * 158) and uploads it; the worker loads `csvPath` into committed_data under `batchId` via
 * bulk_commit_from_storage and verifies the row count == expectedRows. The manifest is FROZEN at stage time
 * — Resume replays it verbatim (byte-identical to an uninterrupted run; the byte-budget + batch structure
 * are not recomputed).
 */
export interface PulseManifestEntry {
  /** ordinal in commit order (0-based) — the cursor indexes this. */
  index: number;
  /** the pulse's own import_batch (each pulse is its own batch — rollback deletes by these). */
  batchId: string;
  /** the staged CSV object key in the ingestion-raw bucket (the worker loads this). */
  csvPath: string;
  /** rows in this pulse — the worker's HALT-DATA-LOSS check (loaded count must equal this). */
  expectedRows: number;
  /** serialized CSV byte size (audit / progress). */
  bytes: number;
  /** the content unit this pulse belongs to (telemetry + UI grouping). */
  unitId: string;
  /** the source sheet name (telemetry + UI). */
  sheetName: string;
  // HF-373 Phase E (D6) -- per-part status (parallel-ready): the worker stamps each entry as it
  // drains ('loaded' | 'failed', + loadedAt/rowsLoaded/error); staging writes 'staged'. Parts are
  // independently claimable by construction even while today's drain stays sequential. ADDITIVE
  // jsonb -- a pre-HF-373 manifest (no status) loads identically via the cursor.
  status?: 'staged' | 'loaded' | 'failed';
  loadedAt?: string;
  rowsLoaded?: number;
  error?: string;
  /** compressed object size when the part was gzip-staged (bytes stays the uncompressed CSV size). */
  bytesCompressed?: number;
}

/**
 * The job lifecycle. enqueued → loading → complete | failed; failed → loading (resume) | rolled_back;
 * complete → rolled_back. Every transition is recorded (PG-B4). `loading` carries a heartbeat (updated_at)
 * so the worker can reclaim a job whose tick died mid-load.
 */
export type PulseLoadStatus = 'enqueued' | 'loading' | 'complete' | 'failed' | 'rolled_back';

/** A pulse-load job row (mirrors the pulse_load_jobs table; the SQL worker reads the same columns). */
export interface PulseLoadJob {
  id: string;
  tenant_id: string;
  /** the import session (= execute-bulk proposalId's session) so the UI + Part B can find the job. */
  session_id: string;
  unit_id: string;
  file_name: string;
  status: PulseLoadStatus;
  /** the frozen ordered pulse manifest. */
  manifest: PulseManifestEntry[];
  /** index of the NEXT pulse to load (0..total_pulses). cursor == total_pulses ⇒ all loaded. */
  cursor: number;
  total_pulses: number;
  total_rows: number;
  /** Σ expectedRows for pulses [0, cursor) actually loaded + verified. */
  rows_loaded: number;
  error_detail: string | null;
  /** append-only transition log: { at, from, to, detail }. */
  audit: PulseLoadTransition[];
  created_at: string;
  updated_at: string;
}

export interface PulseLoadTransition {
  at: string;
  from: PulseLoadStatus | null;
  to: PulseLoadStatus | string; // string allows 'pulse:N landed' progress notes
  detail?: string;
}

/** The exact committed-vs-uncommitted snapshot a job's (manifest, cursor) yields (PG-B1). */
export interface PulseLoadSnapshot {
  loadedPulses: PulseManifestEntry[];   // manifest[0, cursor)
  pendingPulses: PulseManifestEntry[];  // manifest[cursor, total)
  rowsLoaded: number;                   // Σ loaded
  rowsTotal: number;                    // Σ all
  pulsesLoaded: number;
  pulsesTotal: number;
  status: PulseLoadStatus;
}

/** Pure: the precise committed-vs-uncommitted partition for a job (the 58-vs-24 case made exact). */
export function snapshotPulseLoad(job: Pick<PulseLoadJob, 'manifest' | 'cursor' | 'status' | 'total_rows'>): PulseLoadSnapshot {
  const loaded = job.manifest.slice(0, job.cursor);
  const pending = job.manifest.slice(job.cursor);
  return {
    loadedPulses: loaded,
    pendingPulses: pending,
    rowsLoaded: loaded.reduce((s, p) => s + p.expectedRows, 0),
    rowsTotal: job.total_rows,
    pulsesLoaded: loaded.length,
    pulsesTotal: job.manifest.length,
    status: job.status,
  };
}
