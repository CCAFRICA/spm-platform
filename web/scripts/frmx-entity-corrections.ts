/**
 * HF-324 Phase 2 — Sabor (FRMX) entity corrections. Idempotent. Programmatic derivation (no
 * hardcoded ids — Korean Test).
 *
 *  O5: each server's metadata.location_id is an FRMX external_id string; rewrite it to the matching
 *      location entity UUID (so aggregateStaff/aggregateServerDetail resolve the location name).
 *  O4: brand entities are entity_type='team' + metadata.entity_role='brand'; flip to
 *      entity_type='organization' + metadata.role='brand' (so buildBrandLookup matches), and add
 *      metadata.brand_id (parent brand UUID) to each location, derived from the 'contains'
 *      entity_relationships (brand → location). Network Pulse then groups by brand.
 *
 * Run from web/:  set -a && source .env.local && set +a && npx tsx scripts/frmx-entity-corrections.ts
 */
import { createClient } from '@supabase/supabase-js';

const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const TID = 'f7093bcc-e90b-4918-9680-69da7952dd65';
type Meta = Record<string, unknown>;

async function update(table: string, id: string, patch: Record<string, unknown>): Promise<string | null> {
  const { error } = await c.from(table).update(patch).eq('id', id);
  return error ? error.message : null;
}

(async () => {
  const { data: ents, error } = await c.from('entities')
    .select('id, entity_type, external_id, display_name, metadata').eq('tenant_id', TID);
  if (error) throw error;
  const all = ents ?? [];
  const locations = all.filter(e => e.entity_type === 'location');
  const servers = all.filter(e => e.entity_type === 'individual');
  const brands = all.filter(e => e.entity_type === 'team' && (e.metadata as Meta)?.entity_role === 'brand');
  // also pick up brands already flipped to organization (idempotent re-run)
  const brandsFlipped = all.filter(e => e.entity_type === 'organization' && (e.metadata as Meta)?.role === 'brand');

  const extIdToUuid = new Map<string, string>();
  for (const l of locations) if (l.external_id) extIdToUuid.set(l.external_id as string, l.id as string);

  console.log(`Sabor entities: ${all.length} | locations=${locations.length} servers=${servers.length} brands(team/entity_role)=${brands.length} brands(flipped)=${brandsFlipped.length}`);

  const errors: string[] = [];

  // ── O5: server.metadata.location_id  ext_id → UUID ──
  let serverFixed = 0, serverAlready = 0, serverUnmapped = 0;
  for (const s of servers) {
    const meta = { ...((s.metadata as Meta) ?? {}) };
    const cur = String(meta.location_id ?? '');
    if (!cur) { serverUnmapped++; continue; }
    if (extIdToUuid.has(cur)) {
      meta.location_id = extIdToUuid.get(cur);
      const err = await update('entities', s.id as string, { metadata: meta });
      if (err) errors.push(`server ${s.id}: ${err}`); else serverFixed++;
    } else if (Array.from(extIdToUuid.values()).includes(cur)) {
      serverAlready++; // already a UUID (idempotent)
    } else {
      serverUnmapped++;
    }
  }
  console.log(`O5 servers: fixed=${serverFixed} alreadyUuid=${serverAlready} unmapped=${serverUnmapped}`);

  // ── O4 WRITE 1: flip brand entities → organization + metadata.role='brand' ──
  let brandFlipped = 0;
  for (const b of brands) {
    const meta = { ...((b.metadata as Meta) ?? {}), role: 'brand' }; // keep entity_role/format/etc
    const err = await update('entities', b.id as string, { entity_type: 'organization', metadata: meta });
    if (err) errors.push(`brand ${b.id}: ${err}`); else brandFlipped++;
  }
  const brandIds = new Set([...brands, ...brandsFlipped].map(b => b.id as string));
  console.log(`O4 brand flip: flipped=${brandFlipped} (total brand entities=${brandIds.size})`);

  // ── O4 WRITE 2: location.metadata.brand_id from 'contains' relationships (brand → location) ──
  const { data: rels } = await c.from('entity_relationships')
    .select('source_entity_id, target_entity_id, relationship_type').eq('tenant_id', TID).eq('relationship_type', 'contains');
  const locById = new Map(locations.map(l => [l.id as string, l]));
  const brandByLocation = new Map<string, string>(); // location uuid → brand uuid
  for (const r of rels ?? []) {
    const src = r.source_entity_id as string, tgt = r.target_entity_id as string;
    if (brandIds.has(src) && locById.has(tgt)) brandByLocation.set(tgt, src);
  }
  let locBranded = 0, locUnmapped = 0;
  for (const l of locations) {
    const brandId = brandByLocation.get(l.id as string);
    if (!brandId) { locUnmapped++; continue; }
    const meta = { ...((l.metadata as Meta) ?? {}), brand_id: brandId };
    const err = await update('entities', l.id as string, { metadata: meta });
    if (err) errors.push(`location ${l.id}: ${err}`); else locBranded++;
  }
  console.log(`O4 location brand_id: set=${locBranded} unmapped=${locUnmapped} (of ${locations.length})`);

  if (errors.length) { console.log(`\n!! ${errors.length} errors:`, errors.slice(0, 5)); process.exit(1); }

  // ── read-back verification ──
  const { data: after } = await c.from('entities').select('id, entity_type, external_id, metadata').eq('tenant_id', TID);
  const a = after ?? [];
  const orgsBrand = a.filter(e => e.entity_type === 'organization' && (e.metadata as Meta)?.role === 'brand');
  const locsWithBrand = a.filter(e => e.entity_type === 'location' && (e.metadata as Meta)?.brand_id);
  const serversUuidLoc = a.filter(e => e.entity_type === 'individual' && Array.from(extIdToUuid.values()).includes(String((e.metadata as Meta)?.location_id ?? '')));
  console.log('\n── read-back ──');
  console.log(`organization+role:brand = ${orgsBrand.length} (${orgsBrand.map(b => (b.metadata as Meta).format ?? b.id).slice(0,3).join(', ')})`);
  console.log(`locations with metadata.brand_id = ${locsWithBrand.length}/${locations.length}`);
  console.log(`servers with UUID location_id = ${serversUuidLoc.length}/${servers.length}`);
  console.log('\nHF-324 Phase 2 entity corrections COMPLETE.');
})();
