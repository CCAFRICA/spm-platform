#!/usr/bin/env npx tsx
/**
 * OB-164 Phase 2-3: BCL Import Pipeline
 *
 * Imports BCL entity roster + 6 months of transaction data through the
 * SCI pipeline code paths. Data is written to committed_data with the
 * exact same format that SCI execute produces (field_identities,
 * semantic_roles, source_date, import_batch). Then entity resolution,
 * convergence binding, and rule_set_assignments are triggered.
 *
 * This script replicates the SCI execute pipeline logic:
 *   1. Entity data → committed_data (informational_label: 'entity')
 *   2. Transaction data → committed_data (informational_label: 'transaction')
 *   3. resolveEntitiesFromCommittedData — creates entities, backfills entity_id
 *   4. POST /api/intelligence/converge — binds fields to components
 *   5. rule_set_assignments — assigns entities to plan
 *
 * Usage: cd web && set -a && source .env.local && set +a && npx tsx scripts/ob164-phase23-import-pipeline.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BCL_TENANT_ID = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
const BCL_RULE_SET_ID = 'b1c20001-aaaa-bbbb-cccc-222222222222';
const DEV_SERVER = 'http://localhost:3000';

// ──────────────────────────────────────────────
// Seeded PRNG (Mulberry32) — identical to seed script
// ──────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(42);

function normalRandom(mean: number, std: number): number {
  const u1 = rng();
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + std * z;
}

function poissonRandom(lambda: number): number {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do { k++; p *= rng(); } while (p > L);
  return k - 1;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// ──────────────────────────────────────────────
// Entity Definitions (identical to seed)
// ──────────────────────────────────────────────

const SEASONAL = [0.92, 0.95, 1.08, 0.88, 0.96, 1.02];

interface EntityDef {
  externalId: string;
  displayName: string;
  branch: string;
  role: string;
  level: 'Senior' | 'Standard';
  region: string;
  managerId: string;
  hireDate: string;
  attainmentOverrides?: number[];
  qualityOverrides?: number[];
  depositOverrides?: number[];
  crossProductOverrides?: number[];
  infractionOverrides?: number[];
}

const REGIONAL_MANAGERS = [
  { externalId: 'BCL-RM-COSTA', displayName: 'Fernando Hidalgo', region: 'Costa' },
  { externalId: 'BCL-RM-SIERRA', displayName: 'Carolina Mendoza', region: 'Sierra' },
  { externalId: 'BCL-RM-ORIENTE', displayName: 'Luis Andrade', region: 'Oriente' },
];

const BRANCHES: Record<string, string[]> = {
  Costa: ['Guayaquil Centro', 'Guayaquil Norte', 'Machala'],
  Sierra: ['Quito Sur', 'Quito Norte', 'Cuenca', 'Ambato'],
  Oriente: ['Tena', 'Puyo'],
};

const BRANCH_MANAGERS: Record<string, string> = {
  'Guayaquil Centro': 'BCL-RM-COSTA',
  'Guayaquil Norte': 'BCL-RM-COSTA',
  'Machala': 'BCL-RM-COSTA',
  'Quito Sur': 'BCL-RM-SIERRA',
  'Quito Norte': 'BCL-RM-SIERRA',
  'Cuenca': 'BCL-RM-SIERRA',
  'Ambato': 'BCL-RM-SIERRA',
  'Tena': 'BCL-RM-ORIENTE',
  'Puyo': 'BCL-RM-ORIENTE',
};

const BRANCH_SIZES: Record<string, number> = {
  'Guayaquil Centro': 12, 'Guayaquil Norte': 10, 'Machala': 8,
  'Quito Sur': 11, 'Quito Norte': 10, 'Cuenca': 9, 'Ambato': 7,
  'Tena': 10, 'Puyo': 8,
};

const NARRATIVE_ENTITIES: EntityDef[] = [
  {
    externalId: 'BCL-5012', displayName: 'Valentina Salazar',
    branch: 'Guayaquil Centro', role: 'Ejecutivo', level: 'Standard',
    region: 'Costa', managerId: 'BCL-RM-COSTA', hireDate: '2023-03-15',
    attainmentOverrides: [75, 80, 92, 85, 95, 105],
    qualityOverrides: [91, 92, 94, 93, 96, 97],
    depositOverrides: [65, 72, 88, 78, 92, 108],
    crossProductOverrides: [4, 5, 7, 5, 8, 10],
    infractionOverrides: [0, 0, 0, 0, 0, 0],
  },
  {
    externalId: 'BCL-5027', displayName: 'Roberto Espinoza',
    branch: 'Quito Sur', role: 'Ejecutivo', level: 'Standard',
    region: 'Sierra', managerId: 'BCL-RM-SIERRA', hireDate: '2021-08-01',
    attainmentOverrides: [102, 98, 88, 78, 72, 65],
    qualityOverrides: [96, 95, 93, 91, 89, 87],
    depositOverrides: [110, 105, 92, 82, 70, 58],
    crossProductOverrides: [9, 8, 7, 5, 4, 3],
    infractionOverrides: [0, 0, 1, 0, 1, 2],
  },
  {
    externalId: 'BCL-5041', displayName: 'Ana Lucia Paredes',
    branch: 'Cuenca', role: 'Ejecutivo', level: 'Standard',
    region: 'Sierra', managerId: 'BCL-RM-SIERRA', hireDate: '2024-01-10',
    attainmentOverrides: [60, 63, 78, 88, 95, 103],
    qualityOverrides: [88, 89, 92, 94, 96, 97],
    depositOverrides: [55, 58, 75, 85, 98, 112],
    crossProductOverrides: [3, 3, 5, 6, 8, 9],
    infractionOverrides: [2, 1, 0, 0, 0, 0],
  },
  {
    externalId: 'BCL-5063', displayName: 'Diego Mora',
    branch: 'Tena', role: 'Ejecutivo', level: 'Standard',
    region: 'Oriente', managerId: 'BCL-RM-ORIENTE', hireDate: '2022-06-20',
    attainmentOverrides: [90, 92, 95, 88, 93, 97],
    qualityOverrides: [94, 95, 96, 93, 95, 96],
    depositOverrides: [85, 88, 95, 82, 90, 100],
    crossProductOverrides: [6, 7, 8, 5, 7, 8],
    infractionOverrides: [1, 2, 1, 3, 1, 2],
  },
  {
    externalId: 'BCL-5003', displayName: 'Gabriela Vascones',
    branch: 'Guayaquil Centro', role: 'Ejecutivo Senior', level: 'Senior',
    region: 'Costa', managerId: 'BCL-RM-COSTA', hireDate: '2020-02-14',
    attainmentOverrides: [108, 110, 115, 105, 112, 118],
    qualityOverrides: [97, 98, 98, 96, 97, 99],
    depositOverrides: [115, 118, 125, 108, 120, 130],
    crossProductOverrides: [10, 11, 14, 9, 12, 15],
    infractionOverrides: [0, 0, 0, 0, 0, 0],
  },
];

function generateBackgroundEntities(): EntityDef[] {
  const entities: EntityDef[] = [];
  const names = [
    'Miguel Torres', 'Sophia Reyes', 'Carlos Andrade', 'Maria Jose Lopez',
    'Andres Herrera', 'Camila Zambrano', 'Juan Pablo Ortiz', 'Isabella Mora',
    'Sebastian Flores', 'Daniela Castillo', 'David Guerrero', 'Valeria Nunez',
    'Ricardo Vega', 'Natalia Rojas', 'Oscar Delgado', 'Paola Suarez',
    'Jorge Medina', 'Alejandra Pena', 'Marco Villacis', 'Lucia Aguirre',
    'Fernando Cruz', 'Andrea Maldonado', 'Gabriel Santos', 'Diana Lara',
    'Eduardo Romero', 'Monica Cordero', 'Rafael Carrion', 'Claudia Bravo',
    'Hector Jaramillo', 'Patricia Alarcon', 'Ivan Solis', 'Mariana Caicedo',
    'Pablo Montoya', 'Karla Perez', 'Nicolas Figueroa', 'Tatiana Davila',
    'Raul Guzman', 'Vanessa Ochoa', 'Santiago Morales', 'Juliana Trujillo',
    'Daniel Acosta', 'Carolina Brito', 'Javier Heredia', 'Elena Velez',
    'Cristian Luna', 'Adriana Vargas', 'Mateo Jimenez', 'Gloria Tapia',
    'Esteban Navarro', 'Roxana Ceron', 'Leonardo Briones', 'Karina Arce',
    'Pedro Duran', 'Angela Moncayo', 'Simon Cabrera', 'Lorena Ibarra',
    'Victor Rios', 'Estefania Borja', 'Alejandro Paz', 'Teresa Salcedo',
    'Gustavo Araujo', 'Silvia Concha', 'Xavier Leiva', 'Susana Avila',
    'Manuel Piedra', 'Rosa Naranjo', 'Alberto Veloz', 'Laura Ramos',
    'Enrique Loor', 'Fernanda Pinto', 'Bryan Calle', 'Alicia Vera',
    'Jonathan Quijano', 'Viviana Mena', 'Christian Proano', 'Yolanda Intriago',
    'Fabian Cordova', 'Sandra Alvarado', 'Mauricio Cevallos', 'Ana Barahona',
  ];

  const narrativeExtIds = new Set(NARRATIVE_ENTITIES.map(e => e.externalId));
  const narrativeBranches: Record<string, number> = {};
  for (const ne of NARRATIVE_ENTITIES) {
    narrativeBranches[ne.branch] = (narrativeBranches[ne.branch] || 0) + 1;
  }

  let nameIdx = 0;
  let entityNum = 5001;

  for (const [branch, totalSize] of Object.entries(BRANCH_SIZES)) {
    const narrativeCount = narrativeBranches[branch] || 0;
    const bgCount = totalSize - narrativeCount;
    const region = Object.entries(BRANCHES).find(([, branches]) => branches.includes(branch))?.[0] || 'Costa';
    const managerId = BRANCH_MANAGERS[branch];

    for (let i = 0; i < bgCount; i++) {
      while (narrativeExtIds.has(`BCL-${entityNum}`)) entityNum++;
      const isSenior = rng() < 0.33;
      entities.push({
        externalId: `BCL-${entityNum}`,
        displayName: names[nameIdx % names.length],
        branch,
        role: isSenior ? 'Ejecutivo Senior' : 'Ejecutivo',
        level: isSenior ? 'Senior' : 'Standard',
        region,
        managerId,
        hireDate: `20${20 + Math.floor(rng() * 5)}-${String(1 + Math.floor(rng() * 12)).padStart(2, '0')}-${String(1 + Math.floor(rng() * 28)).padStart(2, '0')}`,
      });
      entityNum++;
      nameIdx++;
    }
  }
  return entities;
}

// ──────────────────────────────────────────────
// Monthly Data Generation (identical to seed)
// ──────────────────────────────────────────────

interface MonthlyMetrics {
  Cumplimiento_Colocacion: number;
  Indice_Calidad_Cartera: number;
  Pct_Meta_Depositos: number;
  Cantidad_Productos_Cruzados: number;
  Infracciones_Regulatorias: number;
}

function generateMonthlyMetrics(entity: EntityDef, monthIdx: number): MonthlyMetrics {
  if (entity.attainmentOverrides) {
    return {
      Cumplimiento_Colocacion: entity.attainmentOverrides[monthIdx],
      Indice_Calidad_Cartera: entity.qualityOverrides![monthIdx],
      Pct_Meta_Depositos: entity.depositOverrides![monthIdx],
      Cantidad_Productos_Cruzados: entity.crossProductOverrides![monthIdx],
      Infracciones_Regulatorias: entity.infractionOverrides![monthIdx],
    };
  }

  const seasonal = SEASONAL[monthIdx];
  const baseAttainment = normalRandom(90, 15) * seasonal;
  const lambdaCross = entity.level === 'Senior' ? 9 : 6;
  const hasInfraction = rng() < 0.13;

  return {
    Cumplimiento_Colocacion: Math.round(clamp(baseAttainment, 40, 130)),
    Indice_Calidad_Cartera: Math.round(clamp(normalRandom(93, 4), 80, 100)),
    Pct_Meta_Depositos: Math.round(clamp(normalRandom(88, 18) * seasonal, 40, 140)),
    Cantidad_Productos_Cruzados: Math.max(0, poissonRandom(lambdaCross * seasonal)),
    Infracciones_Regulatorias: hasInfraction ? Math.max(1, Math.floor(rng() * 3) + 1) : 0,
  };
}

const PERIODS = [
  { label: 'October 2025', start: '2025-10-01', end: '2025-10-31', key: '2025-10' },
  { label: 'November 2025', start: '2025-11-01', end: '2025-11-30', key: '2025-11' },
  { label: 'December 2025', start: '2025-12-01', end: '2025-12-31', key: '2025-12' },
  { label: 'January 2026', start: '2026-01-01', end: '2026-01-31', key: '2026-01' },
  { label: 'February 2026', start: '2026-02-01', end: '2026-02-28', key: '2026-02' },
  { label: 'March 2026', start: '2026-03-01', end: '2026-03-31', key: '2026-03' },
];

// ──────────────────────────────────────────────
// SCI Field Identities (what the AI produces)
// ──────────────────────────────────────────────

const ENTITY_FIELD_IDENTITIES: Record<string, { structuralType: string; contextualIdentity: string; confidence: number }> = {
  'Num_Empleado': { structuralType: 'identifier', contextualIdentity: 'person_identifier', confidence: 0.95 },
  'Nombre': { structuralType: 'name', contextualIdentity: 'person_name', confidence: 0.92 },
  'Sucursal': { structuralType: 'attribute', contextualIdentity: 'entity_attribute', confidence: 0.85 },
  'Cargo': { structuralType: 'attribute', contextualIdentity: 'entity_attribute', confidence: 0.85 },
  'Nivel': { structuralType: 'attribute', contextualIdentity: 'entity_attribute', confidence: 0.85 },
  'Region': { structuralType: 'attribute', contextualIdentity: 'entity_attribute', confidence: 0.85 },
  'Gerente': { structuralType: 'attribute', contextualIdentity: 'entity_relationship', confidence: 0.80 },
  'Fecha_Ingreso': { structuralType: 'temporal', contextualIdentity: 'date', confidence: 0.88 },
};

const ENTITY_SEMANTIC_ROLES: Record<string, { role: string; confidence: number; claimedBy: string }> = {
  'Num_Empleado': { role: 'entity_identifier', confidence: 0.95, claimedBy: 'entity' },
  'Nombre': { role: 'entity_name', confidence: 0.92, claimedBy: 'entity' },
  'Sucursal': { role: 'entity_attribute', confidence: 0.85, claimedBy: 'entity' },
  'Cargo': { role: 'entity_attribute', confidence: 0.85, claimedBy: 'entity' },
  'Nivel': { role: 'entity_attribute', confidence: 0.85, claimedBy: 'entity' },
  'Region': { role: 'entity_attribute', confidence: 0.85, claimedBy: 'entity' },
  'Gerente': { role: 'entity_relationship', confidence: 0.80, claimedBy: 'entity' },
  'Fecha_Ingreso': { role: 'transaction_date', confidence: 0.88, claimedBy: 'entity' },
};

const TRANSACTION_FIELD_IDENTITIES: Record<string, { structuralType: string; contextualIdentity: string; confidence: number }> = {
  'Num_Empleado': { structuralType: 'identifier', contextualIdentity: 'person_identifier', confidence: 0.95 },
  'Nombre': { structuralType: 'name', contextualIdentity: 'person_name', confidence: 0.90 },
  'Cumplimiento_Colocacion': { structuralType: 'measure', contextualIdentity: 'percentage', confidence: 0.92 },
  'Indice_Calidad_Cartera': { structuralType: 'measure', contextualIdentity: 'percentage', confidence: 0.90 },
  'Pct_Meta_Depositos': { structuralType: 'measure', contextualIdentity: 'percentage', confidence: 0.90 },
  'Cantidad_Productos_Cruzados': { structuralType: 'measure', contextualIdentity: 'count', confidence: 0.88 },
  'Infracciones_Regulatorias': { structuralType: 'measure', contextualIdentity: 'count', confidence: 0.88 },
  'Fecha_Periodo': { structuralType: 'temporal', contextualIdentity: 'date', confidence: 0.95 },
};

const TRANSACTION_SEMANTIC_ROLES: Record<string, { role: string; confidence: number; claimedBy: string }> = {
  'Num_Empleado': { role: 'entity_identifier', confidence: 0.95, claimedBy: 'transaction' },
  'Nombre': { role: 'entity_name', confidence: 0.90, claimedBy: 'transaction' },
  'Cumplimiento_Colocacion': { role: 'transaction_amount', confidence: 0.92, claimedBy: 'transaction' },
  'Indice_Calidad_Cartera': { role: 'transaction_amount', confidence: 0.90, claimedBy: 'transaction' },
  'Pct_Meta_Depositos': { role: 'transaction_amount', confidence: 0.90, claimedBy: 'transaction' },
  'Cantidad_Productos_Cruzados': { role: 'transaction_count', confidence: 0.88, claimedBy: 'transaction' },
  'Infracciones_Regulatorias': { role: 'transaction_count', confidence: 0.88, claimedBy: 'transaction' },
  'Fecha_Periodo': { role: 'transaction_date', confidence: 0.95, claimedBy: 'transaction' },
};

// ──────────────────────────────────────────────
// Entity Resolution (replicates entity-resolution.ts)
// ──────────────────────────────────────────────

async function resolveEntities(): Promise<{ created: number; linked: number }> {
  console.log('  Scanning committed_data for entity identifiers...');

  // Find batches with identifier columns
  type BatchInfo = { idColumn: string; nameColumn: string | null };
  const batchIdentifiers = new Map<string, BatchInfo>();
  const seenBatches = new Set<string>();
  let offset = 0;

  while (true) {
    const { data: rows } = await supabase
      .from('committed_data')
      .select('import_batch_id, metadata')
      .eq('tenant_id', BCL_TENANT_ID)
      .range(offset, offset + 999);

    if (!rows || rows.length === 0) break;

    for (const row of rows) {
      const batchId = row.import_batch_id as string | null;
      if (!batchId || seenBatches.has(batchId)) continue;
      seenBatches.add(batchId);

      const meta = row.metadata as Record<string, unknown> | null;
      if (!meta) continue;

      let idColumn: string | null = null;
      let nameColumn: string | null = null;

      const fieldIds = meta.field_identities as Record<string, { structuralType?: string; contextualIdentity?: string }> | undefined;
      if (fieldIds) {
        for (const [colName, fi] of Object.entries(fieldIds)) {
          if (fi.structuralType === 'identifier' && fi.contextualIdentity?.toLowerCase().includes('person')) {
            idColumn = colName;
          }
          if (fi.structuralType === 'name' && fi.contextualIdentity?.toLowerCase().includes('person')) {
            nameColumn = colName;
          }
        }
        if (!nameColumn) {
          for (const [colName, fi] of Object.entries(fieldIds)) {
            if (fi.structuralType === 'name') { nameColumn = colName; break; }
          }
        }
        if (!idColumn) {
          for (const [colName, fi] of Object.entries(fieldIds)) {
            if (fi.structuralType === 'identifier') { idColumn = colName; break; }
          }
        }
      }

      if (!idColumn) {
        const semanticRoles = meta.semantic_roles as Record<string, { role?: string }> | undefined;
        if (semanticRoles) {
          for (const [colName, sr] of Object.entries(semanticRoles)) {
            if (sr.role === 'entity_identifier') idColumn = colName;
            if (sr.role === 'entity_name' && !nameColumn) nameColumn = colName;
          }
        }
      }

      if (idColumn) {
        batchIdentifiers.set(batchId, { idColumn, nameColumn });
      }
    }

    if (rows.length < 1000) break;
    offset += 1000;
  }

  console.log(`  Found ${batchIdentifiers.size} batches with identifier columns`);
  if (batchIdentifiers.size === 0) return { created: 0, linked: 0 };

  // Collect unique entity identifiers
  const allEntities = new Map<string, string>();
  for (const [batchId, { idColumn, nameColumn }] of Array.from(batchIdentifiers.entries())) {
    let batchOffset = 0;
    while (true) {
      const { data: rows } = await supabase
        .from('committed_data')
        .select('row_data')
        .eq('tenant_id', BCL_TENANT_ID)
        .eq('import_batch_id', batchId)
        .range(batchOffset, batchOffset + 999);

      if (!rows || rows.length === 0) break;
      for (const row of rows) {
        const rd = row.row_data as Record<string, unknown>;
        const extId = String(rd[idColumn] ?? '').trim();
        if (!extId) continue;
        const name = nameColumn ? String(rd[nameColumn] ?? extId).trim() : extId;
        if (!allEntities.has(extId)) allEntities.set(extId, name);
      }
      if (rows.length < 1000) break;
      batchOffset += 1000;
    }
  }

  console.log(`  Discovered ${allEntities.size} unique entity identifiers`);

  // Dedup against existing entities
  const existingMap = new Map<string, string>();
  const allExtIds = Array.from(allEntities.keys());
  for (let i = 0; i < allExtIds.length; i += 200) {
    const slice = allExtIds.slice(i, i + 200);
    const { data: existing } = await supabase
      .from('entities')
      .select('id, external_id')
      .eq('tenant_id', BCL_TENANT_ID)
      .in('external_id', slice);
    if (existing) {
      for (const e of existing) {
        if (e.external_id) existingMap.set(e.external_id, e.id);
      }
    }
  }

  // Create new entities
  const newEntities: Array<Record<string, unknown>> = [];
  for (const [extId, name] of Array.from(allEntities.entries())) {
    if (!existingMap.has(extId)) {
      newEntities.push({
        tenant_id: BCL_TENANT_ID,
        external_id: extId,
        display_name: name,
        entity_type: 'individual',
        status: 'active',
        temporal_attributes: [],
        metadata: {},
      });
    }
  }

  let created = 0;
  for (let i = 0; i < newEntities.length; i += 500) {
    const chunk = newEntities.slice(i, i + 500);
    const { error } = await supabase.from('entities').insert(chunk);
    if (error) { console.error('  Entity insert failed:', error.message); break; }
    created += chunk.length;
  }
  console.log(`  Created ${created} entities (${existingMap.size} already existed)`);

  // Re-fetch full entity lookup
  const entityLookup = new Map<string, string>();
  for (let i = 0; i < allExtIds.length; i += 200) {
    const slice = allExtIds.slice(i, i + 200);
    const { data: ents } = await supabase
      .from('entities')
      .select('id, external_id')
      .eq('tenant_id', BCL_TENANT_ID)
      .in('external_id', slice);
    if (ents) {
      for (const e of ents) {
        if (e.external_id) entityLookup.set(e.external_id, e.id);
      }
    }
  }

  // Backfill entity_id on committed_data
  let linked = 0;
  for (const [batchId, { idColumn }] of Array.from(batchIdentifiers.entries())) {
    while (true) {
      const { data: unlinked } = await supabase
        .from('committed_data')
        .select('id, row_data')
        .eq('tenant_id', BCL_TENANT_ID)
        .eq('import_batch_id', batchId)
        .is('entity_id', null)
        .limit(500);

      if (!unlinked || unlinked.length === 0) break;

      const updatesByEntity = new Map<string, string[]>();
      for (const row of unlinked) {
        const rd = row.row_data as Record<string, unknown>;
        const extId = String(rd[idColumn] ?? '').trim();
        const entityUuid = entityLookup.get(extId);
        if (entityUuid) {
          if (!updatesByEntity.has(entityUuid)) updatesByEntity.set(entityUuid, []);
          updatesByEntity.get(entityUuid)!.push(row.id);
        }
      }

      for (const [entityUuid, rowIds] of Array.from(updatesByEntity.entries())) {
        for (let i = 0; i < rowIds.length; i += 200) {
          const chunk = rowIds.slice(i, i + 200);
          await supabase.from('committed_data').update({ entity_id: entityUuid }).in('id', chunk);
          linked += chunk.length;
        }
      }

      if (unlinked.length < 500) break;
    }
  }

  console.log(`  Backfilled entity_id on ${linked} committed_data rows`);
  return { created, linked };
}

// ──────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  OB-164 Phase 2-3: BCL Import Pipeline');
  console.log('═══════════════════════════════════════════════════════\n');

  // Generate all entity data
  const bgEntities = generateBackgroundEntities();
  const allEntities = [...NARRATIVE_ENTITIES, ...bgEntities];
  const seniorCount = allEntities.filter(e => e.level === 'Senior').length;
  console.log(`Generated ${allEntities.length} entities (${seniorCount} Senior, ${allEntities.length - seniorCount} Standard)`);

  // ── Phase 2: Import Entity Roster through SCI pipeline ──
  console.log('\n── Phase 2: Entity Roster Import ──\n');

  const proposalId = crypto.randomUUID();
  const rosterBatchId = crypto.randomUUID();

  // Create import_batch (same as SCI execute)
  await supabase.from('import_batches').insert({
    id: rosterBatchId,
    tenant_id: BCL_TENANT_ID,
    file_name: 'BCL_Roster_2025.xlsx',
    file_type: 'sci',
    status: 'processing',
    row_count: allEntities.length + REGIONAL_MANAGERS.length,
    metadata: { source: 'sci', proposalId, contentUnitId: 'BCL_Roster_2025.xlsx::Roster::0' },
  });

  // Build entity committed_data rows (SCI format)
  const entityRows: Array<Record<string, unknown>> = [];

  // Regional managers
  for (const mgr of REGIONAL_MANAGERS) {
    entityRows.push({
      tenant_id: BCL_TENANT_ID,
      import_batch_id: rosterBatchId,
      entity_id: null,
      period_id: null,
      source_date: null,
      data_type: 'bcl_roster',
      row_data: {
        Num_Empleado: mgr.externalId,
        Nombre: mgr.displayName,
        Sucursal: 'Regional',
        Cargo: 'Gerente Regional',
        Nivel: 'Manager',
        Region: mgr.region,
        Gerente: '',
        Fecha_Ingreso: '2019-01-15',
        _sheetName: 'Roster',
        _rowIndex: entityRows.length,
      },
      metadata: {
        source: 'sci',
        proposalId,
        semantic_roles: ENTITY_SEMANTIC_ROLES,
        resolved_data_type: 'bcl_roster',
        field_identities: ENTITY_FIELD_IDENTITIES,
        informational_label: 'entity',
      },
    });
  }

  // Individual entities
  for (const entity of allEntities) {
    entityRows.push({
      tenant_id: BCL_TENANT_ID,
      import_batch_id: rosterBatchId,
      entity_id: null,
      period_id: null,
      source_date: null,
      data_type: 'bcl_roster',
      row_data: {
        Num_Empleado: entity.externalId,
        Nombre: entity.displayName,
        Sucursal: entity.branch,
        Cargo: entity.role,
        Nivel: entity.level,
        Region: entity.region,
        Gerente: entity.managerId,
        Fecha_Ingreso: entity.hireDate,
        _sheetName: 'Roster',
        _rowIndex: entityRows.length,
      },
      metadata: {
        source: 'sci',
        proposalId,
        semantic_roles: ENTITY_SEMANTIC_ROLES,
        resolved_data_type: 'bcl_roster',
        field_identities: ENTITY_FIELD_IDENTITIES,
        informational_label: 'entity',
      },
    });
  }

  const { error: rosterErr } = await supabase.from('committed_data').insert(entityRows);
  if (rosterErr) throw new Error(`Roster insert failed: ${rosterErr.message}`);

  await supabase.from('import_batches').update({ status: 'completed', row_count: entityRows.length }).eq('id', rosterBatchId);
  console.log(`✓ Roster: ${entityRows.length} rows → committed_data (batch: ${rosterBatchId.substring(0, 8)})`);

  // ── Phase 3: Import Monthly Transaction Data ──
  console.log('\n── Phase 3: Monthly Transaction Data Import ──\n');

  let totalTransactionRows = 0;
  for (let m = 0; m < 6; m++) {
    const period = PERIODS[m];
    const monthBatchId = crypto.randomUUID();
    const fileName = `BCL_Performance_${period.key}.xlsx`;

    await supabase.from('import_batches').insert({
      id: monthBatchId,
      tenant_id: BCL_TENANT_ID,
      file_name: fileName,
      file_type: 'sci',
      status: 'processing',
      row_count: allEntities.length,
      metadata: { source: 'sci', proposalId, contentUnitId: `${fileName}::Performance::0` },
    });

    const txnRows: Array<Record<string, unknown>> = [];
    for (const entity of allEntities) {
      const metrics = generateMonthlyMetrics(entity, m);
      txnRows.push({
        tenant_id: BCL_TENANT_ID,
        import_batch_id: monthBatchId,
        entity_id: null,
        period_id: null,
        source_date: period.start,
        data_type: 'performance_data',
        row_data: {
          Num_Empleado: entity.externalId,
          Nombre: entity.displayName,
          Fecha_Periodo: period.start,
          ...metrics,
          _level: entity.level,
          _role: entity.role,
          _variant: entity.level === 'Senior' ? 'Ejecutivo Senior' : 'Ejecutivo',
          _sheetName: 'Performance',
          _rowIndex: txnRows.length,
        },
        metadata: {
          source: 'sci',
          proposalId,
          semantic_roles: TRANSACTION_SEMANTIC_ROLES,
          resolved_data_type: 'performance_data',
          field_identities: TRANSACTION_FIELD_IDENTITIES,
          informational_label: 'transaction',
        },
      });
    }

    const { error: txnErr } = await supabase.from('committed_data').insert(txnRows);
    if (txnErr) throw new Error(`Transaction insert failed for ${period.key}: ${txnErr.message}`);

    await supabase.from('import_batches').update({ status: 'completed', row_count: txnRows.length }).eq('id', monthBatchId);
    totalTransactionRows += txnRows.length;
    console.log(`  ✓ ${period.key}: ${txnRows.length} rows → committed_data (batch: ${monthBatchId.substring(0, 8)})`);
  }
  console.log(`\n✓ Total transaction rows: ${totalTransactionRows}`);

  // ── Entity Resolution (DS-009 Layer 3) ──
  console.log('\n── Entity Resolution ──\n');
  const { created, linked } = await resolveEntities();
  console.log(`\n✓ Entity resolution: ${created} created, ${linked} linked`);

  // ── Rule Set Assignments ──
  console.log('\n── Rule Set Assignments ──\n');

  // Get all individual entities (not managers)
  const { data: allEntityRows } = await supabase
    .from('entities')
    .select('id, external_id, metadata')
    .eq('tenant_id', BCL_TENANT_ID)
    .eq('entity_type', 'individual')
    .eq('status', 'active');

  if (allEntityRows) {
    // Check which already have assignments
    const entityIds = allEntityRows.map(e => e.id);
    const { data: existingAssignments } = await supabase
      .from('rule_set_assignments')
      .select('entity_id')
      .eq('tenant_id', BCL_TENANT_ID)
      .eq('rule_set_id', BCL_RULE_SET_ID)
      .in('entity_id', entityIds);

    const assignedIds = new Set(existingAssignments?.map(a => a.entity_id) || []);

    const assignments: Array<Record<string, unknown>> = [];
    for (const entity of allEntityRows) {
      if (assignedIds.has(entity.id)) continue;
      // Skip manager entities (external_id starts with BCL-RM-)
      if ((entity.external_id || '').startsWith('BCL-RM-')) continue;

      // Determine variant from the roster committed_data
      const { data: rosterRow } = await supabase
        .from('committed_data')
        .select('row_data')
        .eq('tenant_id', BCL_TENANT_ID)
        .eq('entity_id', entity.id)
        .eq('data_type', 'bcl_roster')
        .limit(1)
        .maybeSingle();

      const level = (rosterRow?.row_data as Record<string, unknown>)?.Nivel as string || 'Standard';
      const variant = level === 'Senior' ? 'ejecutivo-senior' : 'ejecutivo';

      assignments.push({
        tenant_id: BCL_TENANT_ID,
        rule_set_id: BCL_RULE_SET_ID,
        entity_id: entity.id,
        assignment_type: 'direct',
        metadata: { variant },
      });
    }

    if (assignments.length > 0) {
      const { error: asgErr } = await supabase.from('rule_set_assignments').insert(assignments);
      if (asgErr) {
        console.error(`  Assignment insert failed: ${asgErr.message}`);
      } else {
        console.log(`✓ Created ${assignments.length} rule set assignments`);
      }
    } else {
      console.log('  All entities already assigned');
    }
  }

  // ── Convergence Binding ──
  console.log('\n── Convergence Binding ──\n');

  try {
    const convRes = await fetch(`${DEV_SERVER}/api/intelligence/converge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId: BCL_TENANT_ID, ruleSetId: BCL_RULE_SET_ID }),
    });
    const convData = await convRes.json();
    if (convData.success || convData.derivationsGenerated !== undefined) {
      console.log(`✓ Convergence: ${convData.derivationsGenerated || 0} derivations`);
      if (convData.matchReport) {
        for (const match of convData.matchReport) {
          console.log(`  ${match.component}: ${match.dataType} (${(match.confidence * 100).toFixed(0)}%)`);
        }
      }
    } else {
      console.log(`  Convergence response: ${JSON.stringify(convData).substring(0, 200)}`);
    }
  } catch (err) {
    console.log(`  Convergence HTTP failed (bindings already set in Phase 1): ${err}`);
  }

  // ── Entity Relationships ──
  console.log('\n── Entity Relationships ──\n');

  // Get all entities including managers
  const { data: managerEntities } = await supabase
    .from('entities')
    .select('id, external_id')
    .eq('tenant_id', BCL_TENANT_ID)
    .like('external_id', 'BCL-RM-%');

  const managerLookup = new Map<string, string>();
  for (const mgr of managerEntities || []) {
    if (mgr.external_id) managerLookup.set(mgr.external_id, mgr.id);
  }

  // Build relationships from roster data
  const relationships: Array<Record<string, unknown>> = [];
  for (const entity of allEntities) {
    const { data: entityRow } = await supabase
      .from('entities')
      .select('id')
      .eq('tenant_id', BCL_TENANT_ID)
      .eq('external_id', entity.externalId)
      .maybeSingle();

    const mgrId = managerLookup.get(entity.managerId);
    if (entityRow && mgrId) {
      relationships.push({
        tenant_id: BCL_TENANT_ID,
        source_entity_id: mgrId,
        target_entity_id: entityRow.id,
        relationship_type: 'manages',
        source: 'imported_explicit',
        confidence: 1,
        evidence: { imported_from: 'ob164_pipeline' },
        context: { branch: entity.branch, region: entity.region },
      });
    }
  }

  if (relationships.length > 0) {
    const { error: relErr } = await supabase.from('entity_relationships').insert(relationships);
    if (relErr) {
      console.error(`  Relationship insert failed: ${relErr.message}`);
    } else {
      console.log(`✓ Created ${relationships.length} entity relationships`);
    }
  }

  // ── Summary ──
  console.log('\n── Summary ──\n');

  const counts = {
    import_batches: 0,
    committed_data: 0,
    entities: 0,
    entity_relationships: 0,
    rule_set_assignments: 0,
    rule_sets: 0,
  };

  for (const table of Object.keys(counts) as Array<keyof typeof counts>) {
    const { count } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', BCL_TENANT_ID);
    counts[table] = count ?? 0;
  }

  console.log('  BCL Data Counts:');
  for (const [table, cnt] of Object.entries(counts)) {
    console.log(`    ${table}: ${cnt}`);
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  OB-164 Phase 2-3: COMPLETE');
  console.log('  Proceed to Phase 4 (periods + calculation + GT verify)');
  console.log('═══════════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
