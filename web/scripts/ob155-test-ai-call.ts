/**
 * OB-155: Test if Anthropic API works from inside Next.js context
 * Simulates what the SCI execute route does
 */
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

async function run() {
  console.log('Testing Anthropic API from Node.js...');
  console.log(`API key present: ${ANTHROPIC_API_KEY.length > 0} (${ANTHROPIC_API_KEY.substring(0, 10)}...)`);

  try {
    const startTime = Date.now();
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'Say "hello" in one word.' }],
      }),
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`Response: ${response.status} (${elapsed}s)`);

    if (response.ok) {
      const data = await response.json();
      console.log(`Content: ${data.content?.[0]?.text}`);
      console.log('RESULT: Anthropic API works from Node.js');
    } else {
      const err = await response.text();
      console.log(`Error: ${err.substring(0, 200)}`);
      console.log('RESULT: Anthropic API reachable but returned error');
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`Fetch error: ${msg}`);
    console.log('RESULT: Anthropic API fetch FAILED');
  }
}

run().catch(console.error);
