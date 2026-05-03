/**
 * HF-196 Phase 1F — Server-side SHA-256 file content hash.
 *
 * Isolated to its own module so `node:crypto` is not pulled into client bundles
 * via the broader supersession surface (state-reader.ts → fetchSupersededBatchIds
 * is imported into client-rendered surfaces and must not transitively require
 * Node-only modules).
 *
 * Equivalent to OB-50 client-side spec (`crypto.subtle.digest('SHA-256', ...)`)
 * — bytes are bytes; produces same hex digest server-side.
 *
 * Korean Test (T1-E910): pure cryptographic primitive over bytes; no domain literals.
 */

import { createHash } from 'node:crypto';

export function computeFileHashSha256(buffer: Buffer | ArrayBuffer | Uint8Array): string {
  const buf = Buffer.isBuffer(buffer)
    ? buffer
    : buffer instanceof Uint8Array
      ? Buffer.from(buffer)
      : Buffer.from(buffer);
  return createHash('sha256').update(buf).digest('hex');
}
