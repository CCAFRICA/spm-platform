/**
 * HF-294 Phase 0.4 — read-only probe of model strings against the live Anthropic API.
 * Confirms the candidate replacement returns 200, the dead string returns 404, and the
 * candidate works with the REAL adapter request shape (temperature + system + json ask).
 * Does NOT print the API key.
 *   npx tsx --env-file=.env.local scripts/hf294_probe_model.ts
 */
const URL = 'https://api.anthropic.com/v1/messages';
const KEY = process.env.ANTHROPIC_API_KEY || '';
const VERSION = '2023-06-01';

async function call(label: string, body: unknown) {
  const t = Date.now();
  try {
    const res = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': KEY, 'anthropic-version': VERSION },
      body: JSON.stringify(body),
    });
    const ms = Date.now() - t;
    const json = await res.json().catch(() => ({}));
    const model = (json as { model?: string }).model;
    const errType = (json as { error?: { type?: string } }).error?.type;
    const hasText = !!(json as { content?: Array<{ text?: string }> }).content?.[0]?.text;
    console.log(`[${label}] HTTP ${res.status}${model ? ` model=${model}` : ''}${errType ? ` error=${errType}` : ''} hasText=${hasText} (${ms}ms)`);
    return res.status;
  } catch (e) {
    console.log(`[${label}] FETCH ERROR ${e instanceof Error ? e.message : String(e)}`);
    return 0;
  }
}

async function main() {
  console.log(`API key present: ${KEY.length > 0}`);
  // (a) candidate, minimal shape
  await call('candidate-minimal claude-sonnet-4-6', { model: 'claude-sonnet-4-6', max_tokens: 8, messages: [{ role: 'user', content: 'ping' }] });
  // (b) dead string — expect 404 not_found (the defect)
  await call('dead-string claude-sonnet-4-20250514', { model: 'claude-sonnet-4-20250514', max_tokens: 8, messages: [{ role: 'user', content: 'ping' }] });
  // (c) candidate with the REAL adapter request shape (temperature + system + json ask)
  await call('candidate-adapter-shape claude-sonnet-4-6', {
    model: 'claude-sonnet-4-6',
    max_tokens: 256,
    temperature: 0.1,
    system: 'You classify spreadsheet columns. Respond ONLY with JSON: {"classification":"...","confidence":0-1}.',
    messages: [{ role: 'user', content: 'Sheet "Cuotas" columns: cliente, monto_cuota, fecha_pago, saldo. Classify and give confidence.' }],
  });
}
main();
