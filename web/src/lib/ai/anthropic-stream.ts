// OB-233 — shared Anthropic streaming text call. In this environment a long (non-streaming) generation
// idles the socket out mid-response (UND_ERR_SOCKET, "other side closed", bytesRead: 0). Streaming keeps
// the connection active for the whole generation. Returns the accumulated assistant text; the caller
// parses it (tolerantly, since a stream can still end early). Retries with backoff. temperature defaults
// to 0 (C5). KOREAN TEST: this helper carries no field names or domain strings — only transport.

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

/* eslint-disable @typescript-eslint/no-explicit-any */

// OB-235 P3 instrumentation — a single TOTAL Anthropic-call counter. ALL comprehension-path call types
// flow through here (the comprehension call, the HF-337 coverage-retry, AND recognizeLabelsAndMethods),
// so a warm fingerprint hit must drive this to 0 INCLUDING the label/method call. Counting only the
// comprehension call would be a prohibited measurement-narrowing. Counts one per successful (billed)
// return, tagged by opts.label.
let _anthropicCalls = 0;
const _anthropicCallsByLabel: Record<string, number> = {};
export function resetAnthropicCallCount(): void { _anthropicCalls = 0; for (const k in _anthropicCallsByLabel) delete _anthropicCallsByLabel[k]; }
export function getAnthropicCallCount(): number { return _anthropicCalls; }
export function getAnthropicCallCountsByLabel(): Record<string, number> { return { ..._anthropicCallsByLabel }; }

export async function streamAnthropicText(opts: {
  model: string;
  system: string;
  user: string;
  maxTokens: number;
  temperature?: number;
  label?: string;
  retries?: number;
}): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  const body = JSON.stringify({
    model: opts.model,
    max_tokens: opts.maxTokens,
    temperature: opts.temperature ?? 0,
    stream: true,
    system: opts.system,
    messages: [{ role: 'user', content: opts.user }],
  });
  const retries = opts.retries ?? 6;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < retries; attempt++) {
    let text = '';
    try {
      const res = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body,
      });
      if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
      if (!res.body) throw new Error('Anthropic stream: no response body');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          let ev: any;
          try { ev = JSON.parse(payload); } catch { continue; } // skip keep-alive / non-JSON lines
          if (ev?.type === 'content_block_delta' && ev.delta?.type === 'text_delta') text += ev.delta.text as string;
          else if (ev?.type === 'error') throw new Error(`Anthropic stream error: ${ev.error?.message ?? 'unknown'}`);
        }
      }
      _anthropicCalls += 1; // OB-235 P3: count every billed call (incl. coverage-retry + label/method)
      if (opts.label) _anthropicCallsByLabel[opts.label] = (_anthropicCallsByLabel[opts.label] ?? 0) + 1;
      return text;
    } catch (e) {
      lastErr = e;
      const cause = (e as { cause?: { code?: string; message?: string } })?.cause;
      console.warn(`[OB-233] anthropic stream${opts.label ? ` (${opts.label})` : ''} attempt ${attempt + 1} failed: ${e instanceof Error ? e.message : e}${cause ? ` (cause: ${cause.code ?? cause.message})` : ''}`);
      // Exponential backoff (capped) — patient enough for transient API overload (HTTP 529 "Overloaded").
      await new Promise((r) => setTimeout(r, Math.min(30000, 1500 * Math.pow(2, attempt))));
    }
  }
  const cause = (lastErr as { cause?: { code?: string; message?: string } })?.cause;
  throw new Error(`Anthropic stream failed after retries: ${lastErr instanceof Error ? lastErr.message : lastErr}${cause ? ` (cause: ${cause.code ?? cause.message})` : ''}`);
}

/** Strip code fences + whitespace from an LLM text response. */
export function stripFences(t: string): string {
  return t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
}

/**
 * Tolerant top-level JSON-object parse: first try the whole object; if the response was truncated (the
 * generation hit max_tokens mid-object), salvage every COMPLETE top-level `"key": <value>` pair and drop
 * the incomplete tail. Returns {} if nothing salvageable. Used for batched per-field LLM maps where a
 * dropped trailing field is acceptable (the caller falls back for missing keys).
 */
export function parseJsonObjectTolerant(cleaned: string): Record<string, any> {
  const start = cleaned.indexOf('{');
  if (start < 0) return {};
  const body = cleaned.slice(start);
  try { const p = JSON.parse(body); if (p && typeof p === 'object') return p as Record<string, any>; } catch { /* salvage below */ }
  // C2 (HF-337 1b): the whole-object parse failed (truncated stream) — salvage is NOT silent. Log the
  // named event; the caller (comprehension) checks coverage + retries, never persists partial as success.
  console.warn('[HF-337] anthropic.partial_salvage (object): whole JSON.parse failed; salvaging complete top-level entries from a truncated response');
  const out: Record<string, any> = {};
  const n = body.length;
  let i = 1; // past the opening brace
  const isWs = (c: string) => c === ' ' || c === '\n' || c === '\r' || c === '\t';
  while (i < n) {
    while (i < n && (isWs(body[i]) || body[i] === ',')) i++;
    if (i >= n || body[i] === '}') break;
    if (body[i] !== '"') break; // malformed key
    const keyStart = i; i++;
    let esc = false;
    while (i < n) { const c = body[i]; if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') { i++; break; } i++; }
    const keyRaw = body.slice(keyStart, i);
    while (i < n && isWs(body[i])) i++;
    if (body[i] !== ':') break; i++;
    while (i < n && isWs(body[i])) i++;
    if (i >= n) break;
    const valStart = i;
    const ch = body[i];
    if (ch === '{' || ch === '[') {
      const open = ch; const close = open === '{' ? '}' : ']';
      let depth = 0, inStr = false, e2 = false, closed = false;
      while (i < n) {
        const c = body[i];
        if (inStr) { if (e2) e2 = false; else if (c === '\\') e2 = true; else if (c === '"') inStr = false; }
        else { if (c === '"') inStr = true; else if (c === open) depth++; else if (c === close) { depth--; if (depth === 0) { i++; closed = true; break; } } }
        i++;
      }
      if (!closed) break; // truncated nested value -> stop
    } else {
      const inStr = ch === '"'; let e3 = false, done = false; if (inStr) i++;
      while (i < n) { const c = body[i]; if (inStr) { if (e3) e3 = false; else if (c === '\\') e3 = true; else if (c === '"') { i++; done = true; break; } } else { if (c === ',' || c === '}') { done = true; break; } } i++; }
      if (inStr && !done) break; // truncated scalar string
    }
    try { Object.assign(out, JSON.parse(`{${keyRaw}:${body.slice(valStart, i)}}`)); } catch { break; }
  }
  return out;
}
