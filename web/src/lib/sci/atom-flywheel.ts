// OB-203 Phase 2 — Atom flywheel (DS-027 R1 / DI-8). Atom-granularity read/write on the
// existing `structural_fingerprints` surface (granularity='atom'), tenant-scoped. Atoms
// accumulate recognition across imports and across PERIODS without re-derivation (DI-8):
// an atom recognized in period N resolves immediately in N+1 because identity is the
// structural hash, not the period. The store row holds ONLY structural data (atom_features
// buckets + a structural role label) — DI-10-safe by construction.

import { createClient } from '@supabase/supabase-js';
import { ATOM_ALGORITHM_VERSION, type AtomFingerprint } from './atom-fingerprint';

export interface KnownAtom {
  hash: string;
  role: string;        // accumulated structural role label
  confidence: number;
  matchCount: number;
}

/**
 * Pure: the upsert payload for one tenant-scoped atom row. DI-10-safe — `atom_features` carries
 * buckets/flags only; `column_roles` carries a structural role label; no file identifier, no raw
 * value, no header text in the identity (the hash already excludes the name).
 */
export function buildAtomRow(tenantId: string, atom: AtomFingerprint, role: string): Record<string, unknown> {
  return {
    tenant_id: tenantId,
    fingerprint_hash: atom.hash,
    fingerprint: atom.hash,
    granularity: 'atom',
    algorithm_version: ATOM_ALGORITHM_VERSION,
    scope: 'tenant',
    atom_features: atom.features as unknown as Record<string, unknown>,
    column_roles: { role },
    classification_result: null,
    source_file_sample: null,
    match_count: 1,
    confidence: 0.5,
  };
}

/**
 * The set of atom hashes KNOWN at sufficient confidence — the read-before-derive gate's input.
 * An atom with a real role at or above the confidence floor is claimed without an LLM dispatch.
 */
export function knownAtomHashes(known: Map<string, KnownAtom>, minConfidence = 0.5): Set<string> {
  const s = new Set<string>();
  for (const [h, a] of Array.from(known.entries())) {
    if (a.confidence >= minConfidence && a.role && a.role !== 'unknown') s.add(h);
  }
  return s;
}

/** Read Path — known atoms for this tenant at the current algorithm version. */
export async function lookupAtoms(
  tenantId: string,
  atomHashes: string[],
  supabaseUrl: string,
  supabaseServiceKey: string,
): Promise<Map<string, KnownAtom>> {
  const out = new Map<string, KnownAtom>();
  if (atomHashes.length === 0) return out;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { data, error } = await supabase
    .from('structural_fingerprints')
    .select('fingerprint_hash, column_roles, confidence, match_count')
    .eq('tenant_id', tenantId)
    .eq('granularity', 'atom')
    .eq('algorithm_version', ATOM_ALGORITHM_VERSION)
    .in('fingerprint_hash', Array.from(new Set(atomHashes)));
  if (error) {
    console.warn(`[OB-203][atom-flywheel] lookup failed (non-blocking): ${error.message}`);
    return out;
  }
  for (const r of (data || [])) {
    const role = ((r.column_roles as Record<string, unknown>)?.role as string) ?? 'unknown';
    out.set(r.fingerprint_hash as string, {
      hash: r.fingerprint_hash as string,
      role,
      confidence: Number(r.confidence),
      matchCount: r.match_count as number,
    });
  }
  return out;
}

/**
 * Write Path — accumulate atom recognition. Per atom: insert (match_count=1, conf=0.5) or
 * increment (Bayesian conf = 1 - 1/(n+1)) on the (tenant, atom-hash, granularity) key, mirroring
 * the sheet flywheel. Fire-and-forget per atom (loud log, never throws). The comprehension-success
 * gate (Phase 2 step 7) decides WHETHER to call this; the write itself is unconditional once called.
 */
export async function writeAtoms(
  tenantId: string,
  atomsWithRoles: Array<{ atom: AtomFingerprint; role: string }>,
  supabaseUrl: string,
  supabaseServiceKey: string,
): Promise<void> {
  if (atomsWithRoles.length === 0) return;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  for (const { atom, role } of atomsWithRoles) {
    try {
      const { data: existing } = await supabase
        .from('structural_fingerprints')
        .select('id, match_count')
        .eq('tenant_id', tenantId)
        .eq('granularity', 'atom')
        .eq('fingerprint_hash', atom.hash)
        .eq('algorithm_version', ATOM_ALGORITHM_VERSION)
        .maybeSingle();

      if (existing) {
        const newMatchCount = existing.match_count + 1;
        const newConfidence = 1 - 1 / (newMatchCount + 1);
        await supabase
          .from('structural_fingerprints')
          .update({
            match_count: newMatchCount,
            confidence: Number(newConfidence.toFixed(4)),
            column_roles: { role },
            atom_features: atom.features as unknown as Record<string, unknown>,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
          .eq('match_count', existing.match_count); // optimistic lock (mirrors sheet path)
      } else {
        await supabase.from('structural_fingerprints').insert(buildAtomRow(tenantId, atom, role));
      }
    } catch (err) {
      console.error(`[OB-203][atom-flywheel] write failed (non-blocking) hash=${atom.hash.slice(0, 12)}:`, err instanceof Error ? err.message : String(err));
    }
  }
}
