#!/usr/bin/env bash
# HF-303: detect bare numeric thresholds in foundational calc/convergence code.
# Decision 110 / OB-IGF-25 rule #5: developers never assign authority values; thresholds emerge from data.
# Permitted: integer counts, array indices [0]/[1], tier numbers, 0/1 structural floors,
#   and any number on a line carrying an explicit `// RATIFIED:` justification comment.
# Flags: bare floats like 0.4 / 0.5 / 0.7 / 0.85 used as comparison thresholds.
set -euo pipefail
TARGETS="web/src/lib/intelligence/convergence-service.ts web/src/app/api/calculation/run/route.ts"
# float literals used in comparisons, excluding lines marked RATIFIED:
HITS=$(grep -nE '[<>]=?\s*0?\.[0-9]+|0?\.[0-9]+\s*[<>]=?' $TARGETS | grep -vE 'RATIFIED:' || true)
if [ -n "$HITS" ]; then
  echo "NO-DEV-NUMBERS GATE: bare numeric thresholds found (add // RATIFIED: <reason> or remove):"
  echo "$HITS"
  exit 1
fi
echo "NO-DEV-NUMBERS GATE: clean."
