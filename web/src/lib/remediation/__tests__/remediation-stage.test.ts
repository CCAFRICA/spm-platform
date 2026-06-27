/**
 * OB-249 — the Remediation Stage orchestrator. Runner: node --test --import tsx.
 *
 * Proves:
 *   • computeRemediationExclusions protects the calc join key + identifier/measure/temporal
 *     columns by NATURE (a low-cardinality transaction FK is NOT normalizable) — the substrate
 *     blocker fix — while keeping text-attribute columns eligible.
 *   • runRemediationConstruct NEVER throws (degrade-not-fail) and stamps stageRan (P8).
 *   • the framework is AGENT-OPAQUE (I8): a 2nd agent with a totally different proposal shape
 *     runs through the unchanged stage.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  computeRemediationExclusions,
  dataColumns,
  runRemediationConstruct,
} from '../remediation-stage';
import { createNormalizer } from '../agents/normalizer';
import type { RemediationAgent, RemediationInput, RemediationRecall, RemediationConstructResult } from '../remediation-types';
import type { Json } from '@/lib/supabase/database.types';

function recallOf(byAgent: Record<string, Json[]>): RemediationRecall {
  return { priorSignals: async (name: string) => byAgent[name] ?? [] };
}

test('computeRemediationExclusions protects the join key + id/measure/temporal by NATURE', () => {
  const cols = ['DNI_Vendedor', 'Nombre', 'Importe', 'Fecha', 'Categoria', '_rowIndex'];
  const semanticRoles = {
    DNI_Vendedor: { role: 'entity_identifier' },
    Nombre: { role: 'category_code' },        // an ATTRIBUTE role that contains "code" — must stay eligible
    Importe: { role: 'transaction_amount' },
    Fecha: { role: 'transaction_date' },
    Categoria: { role: 'descriptive_label' },
  };
  const fieldIdentities = {
    DNI_Vendedor: { structuralType: 'identifier', contextualIdentity: 'person_identifier' },
    Nombre: { structuralType: 'name', contextualIdentity: 'person_name' },
    Importe: { structuralType: 'measure', contextualIdentity: 'currency_amount' },
    Fecha: { structuralType: 'temporal', contextualIdentity: 'date' },
    Categoria: { structuralType: 'attribute', contextualIdentity: 'category' },
  };
  const excluded = computeRemediationExclusions(cols, semanticRoles, fieldIdentities, 'DNI_Vendedor');
  // protected: the entity key, all identifiers, measures, dates, and synthetic bookkeeping
  assert.ok(excluded.has('DNI_Vendedor'));
  assert.ok(excluded.has('Importe'));
  assert.ok(excluded.has('Fecha'));
  assert.ok(excluded.has('_rowIndex'));
  // eligible: text attributes — including a role that contains "code" (the Casa Diaz Nombre case)
  assert.ok(!excluded.has('Nombre'), 'category_code role must NOT be excluded as an identifier');
  assert.ok(!excluded.has('Categoria'));
});

test('dataColumns drops synthetic bookkeeping keys', () => {
  const cols = dataColumns([{ a: 1, b: 2, _sheetName: 'X', _rowIndex: 0 }]);
  assert.deepEqual(cols.sort(), ['a', 'b']);
});

test('runRemediationConstruct applies the Normalizer proposal read from signals + stamps stageRan (P8)', async () => {
  const rows = [
    ...Array(4).fill({ ciudad: 'Madrid' }),
    ...Array(2).fill({ ciudad: 'madrid ' }), // structural variant
    ...Array(3).fill({ ciudad: 'Barcelona' }),
  ];
  // a prior normalization signal grouping the Madrid variants (as readPriorNormalizationSignals returns it)
  const signal: Json = {
    agent: 'normalizer', key: 'ciudad', expresser: 'structural-only',
    proposal: { column: 'ciudad', fingerprint: 'fp', expresser: 'structural-only', groups: [{ variants: ['Madrid', 'madrid '], basis: 'structural' }] },
  } as unknown as Json;

  const input: RemediationInput = {
    tenantId: 't', rows, columns: ['ciudad'], allowedColumns: ['ciudad'], recall: recallOf({ normalizer: [signal] }),
  };
  const { correctedRows, changes, report } = await runRemediationConstruct(input, { agents: [createNormalizer()] });

  assert.equal(report.stageRan, true);                 // P8: the stage ran (always true)
  assert.ok(report.agentsRun.includes('normalizer'));
  assert.equal(correctedRows.filter((r) => r.ciudad === 'Madrid').length, 6); // 4 + 2 collapsed
  assert.equal(changes.length, 2);                     // the two 'madrid ' rows
});

test('runRemediationConstruct degrades-not-throws when an agent throws', async () => {
  const exploding: RemediationAgent<{ x: number }> = {
    name: 'exploder',
    identify: () => [],
    propose: async () => ({ x: 1 }),
    toSignals: () => [{ key: 'k', value: {} as Json }],
    fromSignals: () => ({ x: 1 }),     // non-null so construct is attempted
    construct: () => { throw new Error('boom'); },
  };
  const input: RemediationInput = {
    tenantId: 't', rows: [{ a: 'x' }], columns: ['a'], allowedColumns: ['a'], recall: recallOf({ exploder: [{} as Json] }),
  };
  const { correctedRows, report } = await runRemediationConstruct(input, { agents: [exploding] });
  assert.deepEqual(correctedRows, [{ a: 'x' }]);       // identity — the import is never sunk
  assert.ok(report.degradedAgents.includes('exploder'));
  assert.equal(report.stageRan, true);
});

test('I8 (agent-opaque): a 2nd agent with a DIFFERENT proposal shape runs through the unchanged stage', async () => {
  // A fixture-only agent (NOT shipped in the registry — that would be scope mutation). Its proposal
  // shape { cols: string[] } is nothing like the Normalizer's. The stage routes it purely through
  // the interface methods, never inspecting the shape — proving the framework is agent-agnostic.
  const upperAgent: RemediationAgent<{ cols: string[] }> = {
    name: 'uppercaser',
    identify: (input) => input.allowedColumns,
    propose: async (targets) => ({ cols: targets }),
    toSignals: (p) => [{ key: 'cols', value: { cols: p.cols } as unknown as Json }],
    fromSignals: (payloads) => {
      const first = (payloads[0] ?? {}) as { cols?: unknown };
      return Array.isArray(first.cols) ? { cols: first.cols as string[] } : null;
    },
    construct: (proposal, input): RemediationConstructResult => {
      const correctedRows = input.rows.map((r) => ({ ...r }));
      const changes = [];
      for (const col of proposal.cols) {
        for (let i = 0; i < correctedRows.length; i++) {
          const v = correctedRows[i][col];
          if (typeof v === 'string' && v !== v.toUpperCase()) {
            changes.push({ rowIndex: i, column: col, original: v, canonical: v.toUpperCase(), basis: 'structural', agent: 'uppercaser' });
            correctedRows[i][col] = v.toUpperCase();
          }
        }
      }
      return { correctedRows, changes };
    },
  };
  const signal: Json = { cols: ['name'] } as unknown as Json;
  const input: RemediationInput = {
    tenantId: 't', rows: [{ name: 'ana' }, { name: 'LUIS' }], columns: ['name'], allowedColumns: ['name'], recall: recallOf({ uppercaser: [signal] }),
  };
  const { correctedRows, changes } = await runRemediationConstruct(input, { agents: [upperAgent] });
  assert.deepEqual(correctedRows.map((r) => r.name), ['ANA', 'LUIS']);
  assert.equal(changes.length, 1);
});
