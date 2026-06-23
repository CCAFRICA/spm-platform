// OB-235 P2 proof — the structural-fingerprint matcher: match-on-similar, miss-on-dissimilar, and the
// Korean Test (name-blind). No DB. Run: npx tsx scripts/_ob235-p2-proof.ts
import { extractStructuralFeatures, fingerprintHash, similarity } from '../src/lib/learning/structural-fingerprint-matcher';

// Same VALUES, different-language KEYS — must produce the IDENTICAL fingerprint (matcher is name-blind).
const mk = (k: [string, string, string, string]) =>
  Array.from({ length: 8 }, (_, i) => ({ [k[0]]: (i + 1) * 100, [k[1]]: (i + 1) * 5, [k[2]]: `item_${i}`, [k[3]]: 'CONST' }));
const A = mk(['revenue', 'tips', 'name', 'code']);
const AKorean = mk(['수익', '팁', '이름', '코드']); // identical shape, Hangul column names

// A structurally DIFFERENT dataset (more columns, different type mix).
const B = Array.from({ length: 8 }, (_, i) => ({
  a: `s${i}`, b: `t${i}`, c: `u${i}`, d: `v${i}`, e: i % 2 === 0, f: `w${i}`, g: `x${i}`,
}));

const fa = extractStructuralFeatures(A), fak = extractStructuralFeatures(AKorean), fb = extractStructuralFeatures(B);

console.log('=== OB-235 P2: structural-fingerprint matcher ===\n');
console.log('A features:', JSON.stringify(fa));
const sameHash = fingerprintHash(fa) === fingerprintHash(fak);
console.log(`\n[Korean Test] English vs Hangul, SAME structure -> identical fingerprint: ${sameHash ? 'PASS' : 'FAIL'} (name-blind)`);
const simSame = similarity(fa, fak);
const simDiff = similarity(fa, fb);
console.log(`[match-on-similar]  sim(A, A-Hangul)   = ${simSame.toFixed(3)}  -> ${simSame >= 0.9 ? 'MATCH (PASS)' : 'FAIL'}`);
console.log(`[miss-on-dissimilar] sim(A, B-diff)    = ${simDiff.toFixed(3)}  -> ${simDiff < 0.9 ? 'MISS (PASS)' : 'FAIL'}`);
console.log(`[stable] re-extract(A) hash == hash(A): ${fingerprintHash(extractStructuralFeatures(A)) === fingerprintHash(fa) ? 'PASS' : 'FAIL'}`);
console.log(`\nfingerprint(A) = ${fingerprintHash(fa).slice(0, 24)}…  (a hash of structure; contains zero field names)`);
