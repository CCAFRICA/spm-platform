// HF-359 (Part A) — the ONE byte-boundary rule, shared by the streamed (streamSheetWindows) and windowed
// (openSheetWindow reader) commit paths so there is a single boundary, not two. A pulse accumulates rows
// and flushes BEFORE a row would push its serialized CSV over the byte budget (so every pulse ≤ budget),
// or at the MAX_PULSE_ROWS safety cap. A single row larger than the whole budget is flushed ALONE (a row is
// never split) — that case is surfaced by the caller.
//
// Σ(pulse row counts) = total rows, exactly (Decision 158): planPulses partitions [0, rowCount) — every
// row enters exactly one pulse, none dropped or duplicated.

/** Flush the current pulse BEFORE adding the next row? (Never flushes an empty buffer.) */
export function shouldFlushBeforeAdd(
  bufLen: number,
  accBytes: number,
  nextRowBytes: number,
  byteBudget: number,
  maxRows: number,
): boolean {
  if (bufLen === 0) return false;                              // a single oversized row goes alone
  if (maxRows > 0 && bufLen >= maxRows) return true;           // safety cap on rows/pulse
  if (byteBudget > 0 && accBytes + nextRowBytes > byteBudget) return true; // the byte budget — the boundary
  return false;
}

export interface PulseSpan {
  startRow: number;  // file-global index of the pulse's first row
  rowCount: number;  // rows in the pulse
  bytes: number;     // Σ serialized CSV bytes of the pulse's rows (estimate)
}

/**
 * PURE pulse planner: partition [0, rowCount) into byte-budgeted pulses. `rowBytesAt(i)` = the serialized
 * CSV byte size of row i. Each pulse's bytes ≤ byteBudget (except a lone oversized row) and rowCount ≤
 * maxRows. Σ(pulse rowCounts) = rowCount exactly. Used by the windowed path and the PG-A proofs.
 */
export function planPulses(
  rowCount: number,
  rowBytesAt: (i: number) => number,
  byteBudget: number,
  maxRows: number,
): PulseSpan[] {
  const pulses: PulseSpan[] = [];
  let start = 0;
  let acc = 0;
  let n = 0;
  for (let i = 0; i < rowCount; i++) {
    const b = rowBytesAt(i);
    if (shouldFlushBeforeAdd(n, acc, b, byteBudget, maxRows)) {
      pulses.push({ startRow: start, rowCount: n, bytes: acc });
      start = i;
      acc = 0;
      n = 0;
    }
    acc += b;
    n += 1;
  }
  if (n > 0) pulses.push({ startRow: start, rowCount: n, bytes: acc });
  return pulses;
}
