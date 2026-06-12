/**
 * OB-203 Phase 5 — dev-only comprehension fault-injection gate. Runner: node --test --import tsx.
 * Hard-gated: inert without OB203_FAULT_SHEET; never active in production builds.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ob203FaultInjected } from '../header-comprehension';

function withEnv(env: Record<string, string | undefined>, fn: () => void) {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(env)) { saved[k] = process.env[k]; if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; }
  try { fn(); } finally { for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } }
}

test('inert when OB203_FAULT_SHEET is unset', () => {
  withEnv({ NODE_ENV: 'development', OB203_FAULT_SHEET: undefined }, () => {
    assert.equal(ob203FaultInjected('Wimoxi'), false);
  });
});

test('fires only for the named sheet', () => {
  withEnv({ NODE_ENV: 'development', OB203_FAULT_SHEET: 'Wimoxi' }, () => {
    assert.equal(ob203FaultInjected('Wimoxi'), true);
    assert.equal(ob203FaultInjected('Tuluza'), false);
  });
});

test('NEVER active in a production build, even when the env var is set', () => {
  withEnv({ NODE_ENV: 'production', OB203_FAULT_SHEET: 'Wimoxi' }, () => {
    assert.equal(ob203FaultInjected('Wimoxi'), false);
  });
});
