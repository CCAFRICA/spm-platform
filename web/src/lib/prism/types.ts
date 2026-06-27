/**
 * Prism — Acquisition Membrane shared types (OB-245 Slice 1, DS-031 §11).
 *
 * These are the membrane's CONTROL-PLANE state machine and audit vocabulary —
 * a closed lifecycle asserted by the directive (§3.1/§3.2/§3.3), NOT an
 * open data-interpretation taxonomy. The NO-REGISTRY standing rule governs
 * data-classification vocabularies (column roles, data natures, signal kinds);
 * it does not apply to a fixed file-lifecycle state machine, whose states are
 * the literal contract here. The DB `state`/`scan_verdict` columns are plain
 * `text` (open at the storage layer); these unions are the app-side authority.
 */

/** The physical lifecycle of a file moving through the membrane. */
export const FILE_OBJECT_STATES = [
  'received', // row created, bytes in quarantine, not yet scanned
  'quarantined', // confirmed isolated in ingest-quarantine, awaiting scan
  'scanning', // scan in progress
  'clean', // scan returned clean; promotion imminent
  'promoted', // bytes copied to ingestion-raw; cleared for the platform
  'infected_held', // infected/error verdict; bytes RETAINED in quarantine (Carry Everything)
] as const;
export type FileObjectState = (typeof FILE_OBJECT_STATES)[number];

/** Security verdict from the ScanProvider. */
export const SCAN_VERDICTS = ['clean', 'infected', 'error'] as const;
export type ScanVerdict = (typeof SCAN_VERDICTS)[number];

/**
 * Append-only audit actions for this slice (DS-031 §3.2).
 * file.recognized / released / purged are Slices 2–3 and are NOT emitted here.
 */
export const FILE_AUDIT_ACTIONS = [
  'file.received',
  'file.quarantined',
  'file.scan_started',
  'file.scan_passed',
  'file.scan_failed',
  'file.promoted',
  'file.held',
] as const;
export type FileAuditAction = (typeof FILE_AUDIT_ACTIONS)[number];

/** Result of a single content scan. */
export interface ScanResult {
  verdict: ScanVerdict;
  engineVersion: string;
  detail?: string;
}

/** A row of the file_objects lifecycle table. Mirrors the migration schema. */
export interface FileObject {
  id: string;
  tenant_id: string;
  owner_id: string;
  content_sha256: string;
  original_filename: string;
  mime_detected: string | null;
  byte_size: number | null;
  state: FileObjectState;
  scan_verdict: ScanVerdict | null;
  scan_engine_version: string | null;
  scanned_at: string | null;
  promoted_at: string | null;
  quarantine_path: string | null;
  clean_path: string | null;
  classification: string | null;
  retention: string | null;
  import_batch_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

/** Storage buckets that bound the membrane. */
export const QUARANTINE_BUCKET = 'ingest-quarantine';
export const CLEAN_BUCKET = 'ingestion-raw';

/**
 * Terminal/transitional states the spine treats as "done advancing".
 * promoted = success terminus; infected_held = held terminus.
 */
export function isTerminalState(state: FileObjectState): boolean {
  return state === 'promoted' || state === 'infected_held';
}
