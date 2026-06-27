/**
 * Magic-byte MIME detection — Korean Test / Invariant 3 (DS-031).
 *
 * Type detection is by CONTENT STRUCTURE, never by filename or extension.
 * Renaming `.txt` -> `.xlsx` MUST NOT change the detected type or any routing
 * decision. This module reads only the leading bytes of the object; it never
 * inspects the supplied filename. (AP-25: no extension/filename gating.)
 */

const startsWith = (b: Uint8Array, sig: number[], offset = 0): boolean =>
  sig.every((v, i) => b[offset + i] === v);

/** Heuristic: is the sampled buffer plausibly UTF-8/ASCII text (no NULs, mostly printable)? */
function isProbablyText(sample: Uint8Array): boolean {
  if (sample.length === 0) return false;
  let printable = 0;
  for (let i = 0; i < sample.length; i++) {
    const c = sample[i];
    if (c === 0x00) return false; // NUL ⇒ binary
    // tab, LF, CR, or printable ASCII / high-bit (UTF-8 continuation)
    if (c === 0x09 || c === 0x0a || c === 0x0d || (c >= 0x20 && c <= 0x7e) || c >= 0x80) {
      printable++;
    }
  }
  return printable / sample.length > 0.9;
}

/** Among text payloads, distinguish delimiter-separated tables from prose. */
function looksLikeDelimited(sample: Uint8Array): boolean {
  const text = new TextDecoder('utf-8', { fatal: false }).decode(sample);
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0).slice(0, 5);
  if (lines.length < 1) return false;
  const delims = [',', '\t', ';', '|'];
  return delims.some((d) => lines.every((l) => l.includes(d)));
}

/**
 * Detect a MIME type from raw content bytes alone.
 * Returns a structural label; callers store this as `mime_detected`.
 */
export function detectMimeFromBytes(buf: Uint8Array): string {
  if (buf.length === 0) return 'application/octet-stream';

  // PDF: "%PDF"
  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46])) return 'application/pdf';

  // ZIP container — OOXML (.xlsx/.docx/.pptx) and .zip all begin PK\x03\x04
  // (PK\x05\x06 empty archive, PK\x07\x08 spanned).
  if (buf[0] === 0x50 && buf[1] === 0x4b && (buf[2] === 0x03 || buf[2] === 0x05 || buf[2] === 0x07)) {
    return 'application/zip';
  }

  // OLE2 Compound File (legacy .xls/.doc/.ppt): D0 CF 11 E0 A1 B1 1A E1
  if (startsWith(buf, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    return 'application/x-ole-storage';
  }

  // GZIP: 1F 8B
  if (startsWith(buf, [0x1f, 0x8b])) return 'application/gzip';

  // Text family — skip a UTF-8 BOM if present, then sniff.
  const textStart = startsWith(buf, [0xef, 0xbb, 0xbf]) ? 3 : 0;
  const sample = buf.subarray(textStart, Math.min(buf.length, textStart + 8192));
  if (isProbablyText(sample)) {
    return looksLikeDelimited(sample) ? 'text/csv' : 'text/plain';
  }

  return 'application/octet-stream';
}
