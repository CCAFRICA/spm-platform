#!/usr/bin/env bash
# HF-195 Phase 4: Korean Test build-time gate
#
# Forbids quoted string literals of legacy primitive names anywhere in web/src/
# except inside primitive-registry.ts (the canonical surface). Instantiates
# Rule 27 (T5 standing rule, HF-195 Phase 5) at build time.
#
# Pattern: any of {matrix_lookup, tiered_lookup, tier_lookup, flat_percentage,
# conditional_percentage} wrapped in single, double, or backtick quotes.
#
# Comments using bare words (no quotes around legacy names) are allowed —
# historical documentation may reference what was removed without re-introducing
# string literals.
#
# Exit 0 = no violations. Exit 1 = violations found.

set -euo pipefail

cd "$(dirname "$0")/.."  # project: web/

LEGACY='matrix_lookup|tiered_lookup|tier_lookup|flat_percentage|conditional_percentage'

# Match the legacy name only when wrapped in single, double, or backtick quotes.
# Excludes primitive-registry.ts (canonical surface). Excludes node_modules + .next.
# Excludes the gate script itself.
VIOLATIONS=$(grep -rnE "['\"\`]($LEGACY)['\"\`]" src/ \
  --include="*.ts" \
  --include="*.tsx" \
  2>/dev/null \
  | grep -v "primitive-registry\.ts" \
  | grep -v "verify-korean-test\.sh" \
  || true)

if [ -n "$VIOLATIONS" ]; then
  echo "[korean-test-gate] Violation: hardcoded legacy primitive-name string literals found outside primitive-registry.ts" >&2
  echo "$VIOLATIONS" >&2
  echo "" >&2
  echo "Per HF-195 Rule 27 (T5 standing rule), prompt-layer and runtime code MUST derive componentType vocabulary from the canonical registry, not from private hardcoded literals. Refactor each violation to use a registry-derived value (PrimitiveEntry id), or remove if redundant." >&2
  exit 1
fi

echo "[korean-test-gate] PASS: zero hardcoded legacy primitive-name string literals outside registry"
