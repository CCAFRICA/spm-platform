// OB-203 Phase 2 — Atom flywheel (DS-027 R1 / DI-8). Atom-granularity read/write on the
// existing `structural_fingerprints` surface (granularity='atom'), tenant-scoped. Atoms
// accumulate recognition across imports and across PERIODS without re-derivation (DI-8):
// an atom recognized in period N resolves immediately in N+1 because identity is the
// structural hash, not the period. The store row holds ONLY structural data (atom_features
// buckets + a structural role label) — DI-10-safe by construction.

import { createClient } from '@supabase/supabase-js';
import { ATOM_ALGORITHM_VERSION, type AtomFingerprint } from './atom-fingerprint';
import { writeSignal } from '@/lib/intelligence/canonical-signal-writer';

// HF-341 R4 (Carry Everything / OB-231): the LLM's full recognition EXPRESSION carried through the
// atom cache so a CLAIMED (cached) column reconstructs the SAME recognition a fresh LLM call would —
// the entity-scope signal (`identifies`) no longer vanishes on replay (header-comprehension.ts used to
// hard-code identifies:'nothing' for cached columns, the 10/12 MIR target-misclassification root).
// Legacy atom rows lack these fields → undefined (the consumer falls back to today's behavior).
export interface AtomExpression {
  identifies?: string;        // the scope the column identifies, in the LLM's own words ("the seller")
  characterization?: string;  // what the column IS, free-form
  relationships?: string[];   // OB-231 relationships
  // HF-368: the model's BARE structural primitives, persisted so warm recall carries the model's
  // named primitive (never re-derived from prose via a word list). Additive jsonb; legacy atom
  // rows read back with these undefined → the consumer fails loud → the sheet re-imports fresh.
  scope_role?: string;
  nature_role?: string;
}

export interface KnownAtom extends AtomExpression {
  hash: string;
  role: string;             // = the LLM's data_nature; kept as the role-STABILITY key + human label
  confidence: number;       // RECOGNITION confidence (match-count Bayesian) — gates whether to claim
  roleConfidence: number;   // ROLE confidence (from comprehension) — STABLE; fed to downstream gates (D5 fix)
  matchCount: number;
}

// D5 fix: a recognized atom whose stored row predates roleConfidence claims at this stable floor
// (legacy atoms) — never the maturing recognition number, so pattern thresholds don't flip by maturation.
export const RECOGNIZED_ROLE_CONFIDENCE = 0.9;

/**
 * Pure: the upsert payload for one tenant-scoped atom row. DI-10-safe — `atom_features` carries
 * buckets/flags only; `column_roles` carries a structural role label; no file identifier, no raw
 * value, no header text in the identity (the hash already excludes the name).
 */
export function buildAtomRow(tenantId: string, atom: AtomFingerprint, role: string, roleConfidence: number, expr?: AtomExpression): Record<string, unknown> {
  return {
    tenant_id: tenantId,
    fingerprint_hash: atom.hash,
    fingerprint: atom.hash,
    granularity: 'atom',
    algorithm_version: ATOM_ALGORITHM_VERSION,
    scope: 'tenant',
    atom_features: atom.features as unknown as Record<string, unknown>,
    // HF-341 R4: store the OB-231 EXPRESSION alongside the role-stability label (additive; legacy rows
    // carry only {role,roleConfidence} and read back with identifies=undefined).
    column_roles: { role, roleConfidence, ...(expr ? { identifies: expr.identifies, characterization: expr.characterization, relationships: expr.relationships, scope_role: expr.scope_role, nature_role: expr.nature_role } : {}) },
    // structural_fingerprints.classification_result is NOT NULL; an atom row has no sheet
    // classification, so an empty object is the benign placeholder (EPG-2.4 RUN-1 fix). For
    // tenant scope the DI-10 CHECK is satisfied by scope='tenant'. Foundational/vertical atoms
    // (future) need the column nullable — tracked as a residual (drop-NOT-NULL migration).
    classification_result: {},
    source_file_sample: null,
    match_count: 1,
    confidence: 0.5,
  };
}

/**
 * The set of atom hashes KNOWN at sufficient confidence — the read-before-derive gate's input.
 * An atom with a real role at or above the confidence floor is claimed without an LLM dispatch.
 */
// OB-203 RUN-4 fix B (role-stability gating): an atom claims a role ONLY if its role is STABLE.
// `'ambiguous'` is the sentinel for an atom seen with conflicting roles across columns (e.g. an
// integer ID and an integer measure sharing structure) — it never asserts; the column routes to
// comprehension instead (hints-not-gates at the atom layer; DI-3 preserved — structure is still the
// identity, the CLAIM adds a stability requirement).
export const AMBIGUOUS_ROLE = 'ambiguous';

/** Pure role-stability resolution (testable): a conflicting role makes the atom ambiguous; once
 *  ambiguous, always ambiguous; an agreeing role is preserved. */
export function resolveAtomRole(existingRole: string | undefined | null, newRole: string): string {
  if (existingRole === AMBIGUOUS_ROLE) return AMBIGUOUS_ROLE;
  if (existingRole && existingRole !== newRole) return AMBIGUOUS_ROLE;
  return newRole;
}

// HF-370 (O1, sequence-independence): an atom whose recognition is an IDENTIFIER carries a
// sheet-CONTEXTUAL scope_role — entity (a roster/master key) vs transaction (a per-row event id) vs
// reference (a lookup key). Which one it is depends on the SHEET's composition, and it is the field
// the classifier and the entity-id resolver key on. The atom fingerprint is context-free (value
// distribution only, name excluded), so a cached identifier scope learned in one sheet must NEVER be
// inherited into another — that made a column's classification depend on IMPORT ORDER (a roster's
// entity id colliding with a lookup's reference key would pollute each other's scope). Identifier
// atoms are therefore not claimed from the warm cache: they re-comprehend so their scope is decided
// from THIS sheet's composition, every time (Decision 158, sequence-independence HARD FACT). This is
// scoped to the classification-critical field only: non-identifier atoms (measure/temporal/name/
// categorical) carry a scope that affects no outcome, so the flywheel still accelerates them; and a
// fully-known SHEET reuses its context-complete sheet-level fingerprint, so an identical re-import is
// still cheap (no atom re-analysis). Legacy atoms without a nature_role predate the v3 schema and were
// already invalidated (HF-369), so this reads the model's bare primitive, never a name/word heuristic.
function isContextualIdentifierAtom(a: KnownAtom): boolean {
  return a.nature_role === 'identifier' || a.scope_role === 'entity' || a.scope_role === 'transaction';
}

export function knownAtomHashes(known: Map<string, KnownAtom>, minConfidence = 0.5): Set<string> {
  const s = new Set<string>();
  for (const [h, a] of Array.from(known.entries())) {
    if (a.confidence < minConfidence || !a.role || a.role === 'unknown' || a.role === AMBIGUOUS_ROLE) continue;
    if (isContextualIdentifierAtom(a)) continue; // identifier scope is sheet-contextual → re-comprehend per sheet
    s.add(h);
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
    const cr = (r.column_roles as Record<string, unknown>) ?? {};
    const role = (cr.role as string) ?? 'unknown';
    const roleConfidence = typeof cr.roleConfidence === 'number' ? cr.roleConfidence : RECOGNIZED_ROLE_CONFIDENCE; // legacy fallback (D5)
    out.set(r.fingerprint_hash as string, {
      hash: r.fingerprint_hash as string,
      role,
      confidence: Number(r.confidence),
      roleConfidence,
      matchCount: r.match_count as number,
      // HF-341 R4: carry the stored EXPRESSION (legacy rows → undefined).
      identifies: typeof cr.identifies === 'string' ? cr.identifies : undefined,
      characterization: typeof cr.characterization === 'string' ? cr.characterization : undefined,
      relationships: Array.isArray(cr.relationships) ? (cr.relationships as string[]) : undefined,
      // HF-368: carry the stored BARE primitives (legacy rows → undefined → warm recall fails loud
      // at the bridge → the sheet re-imports fresh, which the model renders with the primitives).
      scope_role: typeof cr.scope_role === 'string' ? cr.scope_role : undefined,
      nature_role: typeof cr.nature_role === 'string' ? cr.nature_role : undefined,
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
  atomsWithRoles: Array<{ atom: AtomFingerprint; role: string; roleConfidence: number } & AtomExpression>,
  supabaseUrl: string,
  supabaseServiceKey: string,
): Promise<void> {
  if (atomsWithRoles.length === 0) return;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  for (const { atom, role, roleConfidence, identifies, characterization, relationships, scope_role, nature_role } of atomsWithRoles) {
    try {
      const { data: existing } = await supabase
        .from('structural_fingerprints')
        .select('id, match_count, column_roles')
        .eq('tenant_id', tenantId)
        .eq('granularity', 'atom')
        .eq('fingerprint_hash', atom.hash)
        .eq('algorithm_version', ATOM_ALGORITHM_VERSION)
        .maybeSingle();

      if (existing) {
        const newMatchCount = existing.match_count + 1;
        const newConfidence = 1 - 1 / (newMatchCount + 1);
        // B (role-stability): once ambiguous, stays ambiguous; a conflicting role makes it ambiguous.
        const cr = (existing.column_roles as Record<string, unknown>) ?? {};
        const existingRole = cr.role as string | undefined;
        const existingRoleConf = typeof cr.roleConfidence === 'number' ? cr.roleConfidence : 0;
        const resolvedRole = resolveAtomRole(existingRole, role);
        // role confidence is STABLE: on agreement keep the strongest evidence; ambiguity is irrelevant (excluded).
        const resolvedRoleConf = resolvedRole === AMBIGUOUS_ROLE ? existingRoleConf : Math.max(existingRoleConf, roleConfidence);
        if (resolvedRole === AMBIGUOUS_ROLE && existingRole !== AMBIGUOUS_ROLE) {
          console.warn(`[OB-203][atom-flywheel] role AMBIGUOUS hash=${atom.hash.slice(0, 12)} (was '${existingRole}', now '${role}') — will route to comprehension`);
        }
        // HF-341 R4: store the EXPRESSION when the role AGREES (the latest coherent recognition); on
        // AMBIGUOUS (a genuine structural-hash collision of two differently-scoped columns) keep the
        // existing expression — the atom routes to comprehension anyway, so the stale expression is
        // never claimed. This preserves the structural-collision correctness the AMBIGUOUS sentinel gives.
        const exprToStore: AtomExpression = resolvedRole === AMBIGUOUS_ROLE
          ? { identifies: cr.identifies as string | undefined, characterization: cr.characterization as string | undefined, relationships: Array.isArray(cr.relationships) ? cr.relationships : undefined, scope_role: cr.scope_role as string | undefined, nature_role: cr.nature_role as string | undefined }
          : { identifies, characterization, relationships, scope_role, nature_role };
        await supabase
          .from('structural_fingerprints')
          .update({
            match_count: newMatchCount,
            confidence: Number(newConfidence.toFixed(4)),
            column_roles: { role: resolvedRole, roleConfidence: resolvedRoleConf, ...exprToStore },
            atom_features: atom.features as unknown as Record<string, unknown>,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
          .eq('match_count', existing.match_count); // optimistic lock (mirrors sheet path)
      } else {
        await supabase.from('structural_fingerprints').insert(buildAtomRow(tenantId, atom, role, roleConfidence, { identifies, characterization, relationships, scope_role, nature_role }));
      }
    } catch (err) {
      // Finding-A follow-through: a blocked atom-learning write must NOT be silent (DI-4/DI-7 spirit).
      // Log loudly AND emit a remediation signal on the canonical surface so the flywheel cannot
      // silently dead-end (this is exactly how the EPG-2.4 RUN-1 23502 went unseen).
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[OB-203][atom-flywheel] write FAILED (non-blocking) hash=${atom.hash.slice(0, 12)} role=${role}: ${msg}`);
      try {
        await writeSignal(
          {
            tenantId,
            signalType: 'comprehension:atom_write_failed',
            structuralFingerprint: { fingerprintHash: atom.hash },
            classification: null,
            confidence: 0,
            decisionSource: 'atom_write_failed',
            scope: 'tenant',
            source: 'sci_agent',
            signalValue: { error: msg, role },
            context: { sciVersion: '2.0', phase: '2', ob: 'OB-203', di: 'DI-7' },
          },
          supabaseUrl,
          supabaseServiceKey,
        );
      } catch { /* remediation emission must never itself break the import */ }
    }
  }
}
