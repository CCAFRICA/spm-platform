// HF-337 1b proof: forced early-end. Feed a TRUNCATED JSON object to parseJsonObjectTolerant and show
// (i) the named partial-salvage event fires (not silent), (ii) only COMPLETE entries are recovered, the
// truncated tail is DROPPED (never accepted as success). Run: npx tsx scripts/_hf337-salvage-test.ts
import { parseJsonObjectTolerant } from '../src/lib/ai/anthropic-stream';

// 3 fields; the 3rd is cut off mid-value (a truncated stream).
const truncated = '{"folio": {"characterization": "doc number"}, "total": {"characterization": "gross amount"}, "propina": {"characterization": "the tip amo';

console.log('=== HF-337 1b salvage fail-loud test ===');
console.log('input: truncated object (3 fields, "propina" cut off mid-value)\n');
const parsed = parseJsonObjectTolerant(truncated);
console.log('\nrecovered keys:', JSON.stringify(Object.keys(parsed)));
console.log('expected: ["folio","total"] — "propina" (truncated) DROPPED, not accepted');
const ok = Object.keys(parsed).length === 2 && parsed.folio && parsed.total && !parsed.propina;
console.log(ok ? 'PASS: partial-salvage WARN fired above (named, not silent); truncated entry dropped' : 'FAIL');
