/**
 * Shared paged reader (OB-257 review FIX 10).
 *
 * PostgREST silently truncates un-ranged selects at 1000 rows — every serving-layer reader that
 * can exceed one page MUST page explicitly. ONE definition here; call sites keep their own query
 * builders (including the `.order('id', { ascending: true })` that makes page boundaries
 * duplicate-free) and hand this helper only the range-parameterized query.
 */

const DEFAULT_PAGE_SIZE = 1000;

/** A range-parameterized query: the call site's builder with `.range(from, to)` applied last. */
export type PageQuery = (
  from: number,
  to: number,
) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

/**
 * Streaming variant: each page is handed to onPage then discarded — the helper retains nothing
 * (bounded memory; the DIAG-078 OOM class must not recur on whole-tenant scans).
 */
export async function pagedScan<T>(
  build: PageQuery,
  onPage: (rows: T[]) => void,
  pageSize: number = DEFAULT_PAGE_SIZE,
): Promise<void> {
  let offset = 0;
  for (;;) {
    const { data, error } = await build(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    if (rows.length === 0) break;
    onPage(rows);
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
}

/** Collecting variant: the full row set (grain-bounded call sites only, never raw volume). */
export async function pagedRows<T>(build: PageQuery, pageSize: number = DEFAULT_PAGE_SIZE): Promise<T[]> {
  const out: T[] = [];
  await pagedScan<T>(build, (rows) => out.push(...rows), pageSize);
  return out;
}
