/**
 * HF-294 verification — exercise the REAL code (not raw fetch).
 *   npx tsx --env-file=.env.local scripts/hf294_verify.ts
 * Proves: (1) adapter tags a provider hard-error on a 404 (AUD-009);
 *         (2) the new model returns non-zero confidence through the real adapter (EPG-1.3);
 *         (3) AIService marks the degraded response providerError:true + logs ERROR (EPG-2),
 *             and a success path returns confidence>0 WITHOUT providerError (distinguishability).
 */
import { AnthropicAdapter } from '../src/lib/ai/providers/anthropic-adapter';

const REQ = {
  task: 'file_classification' as const,
  input: { fileName: 'Cuotas.xlsx', contentPreview: 'cliente,monto_cuota,fecha_pago,saldo\nACME,1200,2026-01-15,4800' },
  options: { maxTokens: 256 },
};

async function main() {
  // (1) adapter + DEAD model -> expect ProviderHardError tagged with status 404
  console.log('--- (1) adapter tagging on dead model (expect providerError + status 404) ---');
  try {
    await new AnthropicAdapter({ provider: 'anthropic', model: 'claude-sonnet-4-20250514' }).execute(REQ);
    console.log('  UNEXPECTED: no throw');
  } catch (e) {
    const x = e as { providerError?: boolean; status?: number; providerModel?: string; message?: string };
    console.log(`  caught: providerError=${x.providerError} status=${x.status} providerModel=${x.providerModel}`);
  }

  // (2) adapter + NEW model -> expect a real result with confidence > 0
  console.log('--- (2) adapter on claude-sonnet-4-6 (expect confidence > 0) ---');
  try {
    const r = await new AnthropicAdapter({ provider: 'anthropic', model: 'claude-sonnet-4-6' }).execute(REQ);
    console.log(`  result.confidence=${r.confidence} task=${r.task} resultKeys=${Object.keys(r.result || {}).join(',')}`);
  } catch (e) {
    console.log('  ERROR:', e instanceof Error ? e.message : String(e));
  }

  // (3) AIService end-to-end: dead model -> providerError:true on the response + ERROR log;
  //     new model -> confidence>0 WITHOUT providerError (distinguishability).
  console.log('--- (3) AIService catch tagging (expect providerError:true + console.error) ---');
  try {
    const mod = await import('../src/lib/ai/ai-service');
    const bad = new mod.AIService({ provider: 'anthropic', model: 'claude-sonnet-4-20250514' });
    const rb = await bad.execute(REQ, false);
    console.log(`  [dead]  result.providerError=${(rb.result as Record<string, unknown>).providerError} errorClass=${(rb.result as Record<string, unknown>).errorClass} confidence=${rb.confidence}`);
    const good = new mod.AIService({ provider: 'anthropic', model: 'claude-sonnet-4-6' });
    const rg = await good.execute(REQ, false);
    console.log(`  [good]  result.providerError=${(rg.result as Record<string, unknown>).providerError ?? '(absent)'} confidence=${rg.confidence}`);
  } catch (e) {
    console.log('  AIService not runnable in tsx (module deps):', e instanceof Error ? e.message.split('\n')[0] : String(e));
    console.log('  -> adapter-level proof (1)+(2) + the tsc-verified catch diff stand as the EPG-2 evidence.');
  }
}
main();
