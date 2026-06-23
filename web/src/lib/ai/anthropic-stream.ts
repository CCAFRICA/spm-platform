// OB-233 — shared Anthropic streaming text call. In this environment a long (non-streaming) generation
// idles the socket out mid-response (UND_ERR_SOCKET, "other side closed", bytesRead: 0). Streaming keeps
// the connection active for the whole generation. Returns the accumulated assistant text; the caller
// parses it (tolerantly, since a stream can still end early). Retries with backoff. temperature defaults
// to 0 (C5). KOREAN TEST: this helper carries no field names or domain strings — only transport.

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

/* eslint-disable @typescript-eslint/no-explicit-any */

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
  const retries = opts.retries ?? 4;
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
      return text;
    } catch (e) {
      lastErr = e;
      const cause = (e as { cause?: { code?: string; message?: string } })?.cause;
      console.warn(`[OB-233] anthropic stream${opts.label ? ` (${opts.label})` : ''} attempt ${attempt + 1} failed: ${e instanceof Error ? e.message : e}${cause ? ` (cause: ${cause.code ?? cause.message})` : ''}`);
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  const cause = (lastErr as { cause?: { code?: string; message?: string } })?.cause;
  throw new Error(`Anthropic stream failed after retries: ${lastErr instanceof Error ? lastErr.message : lastErr}${cause ? ` (cause: ${cause.code ?? cause.message})` : ''}`);
}

/** Strip code fences + whitespace from an LLM text response. */
export function stripFences(t: string): string {
  return t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
}
