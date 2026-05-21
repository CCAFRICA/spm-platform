// HF-222 Phase 2.3 — distribution-derived distinguishability test, property proof.
//
// SR-35 (EPG) + SR-38 (Mathematical Review Gate): mathematical/formula phases
// require executable property tests. This script verifies the algebraic
// invariants of distinctEnoughToBind:
//   P1  — N=0 refuses
//   P2  — N=1 strictly-positive binds
//   P3  — N=1 zero refuses (substrate-floor: cardinality × intersection > 0)
//   P4  — N=2 distinct scores binds (the small-N case boundary fallback most often hits)
//   P5  — N=2 identical scores refuses (no distinction)
//   P6  — N>=3 clustered candidates refuse to bind
//   P7  — N>=3 clear outlier binds
//   P8  — invariance under uniform scaling (no developer-stated value affects decision)
//   P9  — invariance under uniform translation

import { distinctEnoughToBind } from '@/lib/intelligence/convergence-service';

function assertFn(condition: boolean, label: string): void {
  if (!condition) {
    console.error(`FAIL: ${label}`);
    process.exit(1);
  } else {
    console.log(`PASS: ${label}`);
  }
}

// Property 1: empty distribution refuses
assertFn(!distinctEnoughToBind([]), 'P1 — N=0 refuses');

// Property 2: single-candidate-with-positive-score binds
assertFn(distinctEnoughToBind([{ score: 0.5 }]), 'P2 — N=1 strictly-positive binds');

// Property 3: single-candidate-with-zero-score refuses (substrate-floor enforcement)
assertFn(!distinctEnoughToBind([{ score: 0 }]), 'P3 — N=1 zero refuses');

// Property 4: N=2 distinct scores binds (small-N case; boundary fallback common case)
assertFn(distinctEnoughToBind([{ score: 0.8 }, { score: 0.3 }]),
  'P4 — N=2 distinct scores bind');

// Property 5: N=2 identical scores refuses (no distinction)
assertFn(!distinctEnoughToBind([{ score: 0.5 }, { score: 0.5 }]),
  'P5 — N=2 identical scores refuse');

// Property 6: clustered candidates refuse to bind
const clustered = [0.51, 0.50, 0.49, 0.48, 0.47].map(s => ({ score: s }));
assertFn(!distinctEnoughToBind(clustered),
  'P6 — N=5 clustered distribution refuses');

// Property 7: clear outlier binds
const outlier = [0.95, 0.30, 0.28, 0.25, 0.22].map(s => ({ score: s }));
assertFn(distinctEnoughToBind(outlier),
  'P7 — N=5 clear outlier binds');

// Property 8: invariance under uniform scaling — no developer-stated value affects the decision
const a = [{ score: 0.8 }, { score: 0.3 }, { score: 0.25 }, { score: 0.20 }];
const aScaled = a.map(c => ({ score: c.score * 10 }));
assertFn(distinctEnoughToBind(a) === distinctEnoughToBind(aScaled),
  'P8 — invariant under linear scaling');

// Property 9: invariance under uniform translation
const aTranslated = a.map(c => ({ score: c.score + 100 }));
assertFn(distinctEnoughToBind(a) === distinctEnoughToBind(aTranslated),
  'P9 — invariant under uniform translation');

console.log('\nAll distribution-test properties hold.');
