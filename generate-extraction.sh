#!/bin/bash
# AUD-001: Generate complete code extraction document
# This script reads every file in the SCI pipeline and outputs formatted markdown

OUTPUT="AUD-001_CODE_EXTRACTION.md"
cd /Users/AndrewAfrica/spm-platform

# Helper function to extract a file
extract_file() {
  local section_num="$1"
  local file_num="$2"
  local filepath="$3"
  local basename=$(basename "$filepath")
  local lines=$(wc -l < "$filepath" 2>/dev/null || echo "0")
  local git_info=$(git log -1 --format="%ai | %s" -- "$filepath" 2>/dev/null || echo "N/A")

  echo "### ${section_num}.${file_num}: ${basename}"
  echo "- **Path:** ${filepath}"
  echo "- **Lines:** ${lines}"
  echo "- **Last commit:** ${git_info}"
  echo ""

  # Determine language for syntax highlighting
  local ext="${filepath##*.}"
  local lang="typescript"
  if [ "$ext" = "tsx" ]; then
    lang="tsx"
  fi

  echo '```'"${lang}"
  cat "$filepath"
  echo ""
  echo '```'
  echo ""
  echo "---"
  echo ""
}

# Start document
cat <<'HEADER'
# AUD-001: COMPLETE CODE EXTRACTION
## Generated: 2026-03-22
## Purpose: Independent audit of SCI pipeline integrity

---

## TABLE OF CONTENTS

### Section 1: SCI Core
### Section 2: AI / Anthropic Layer
### Section 3: Signal / Persistence / Flywheel
### Section 4: Import API Routes
### Section 5: Import UI Components
### Section 6: Convergence / Entity Resolution
### Section 7: Calculation Engine
### Section 8: Auth / Session / Cookie
### Section 9: Supabase Client / Config
### Section 10: Type Definitions
### Section 11: API Route Manifest
### Section 12: Additional Dependencies

---

HEADER

# ============================================================
# SECTION 1: SCI CORE
# ============================================================
echo "## SECTION 1: SCI CORE"
echo ""

SECTION1_FILES=(
  "web/src/app/api/import/sci/analyze-document/route.ts"
  "web/src/app/api/import/sci/analyze/route.ts"
  "web/src/app/api/import/sci/execute-bulk/route.ts"
  "web/src/app/api/import/sci/execute/route.ts"
  "web/src/app/api/import/sci/process-job/route.ts"
  "web/src/app/api/import/sci/trace/route.ts"
  "web/src/components/sci/ExecutionProgress.tsx"
  "web/src/components/sci/ImportProgress.tsx"
  "web/src/components/sci/ImportReadyState.tsx"
  "web/src/components/sci/SCIExecution.tsx"
  "web/src/components/sci/SCIProposal.tsx"
  "web/src/components/sci/SCIUpload.tsx"
  "web/src/lib/sci/agents.ts"
  "web/src/lib/sci/classification-signal-service.ts"
  "web/src/lib/sci/content-profile.ts"
  "web/src/lib/sci/contextual-reliability.ts"
  "web/src/lib/sci/entity-resolution.ts"
  "web/src/lib/sci/fingerprint-flywheel.ts"
  "web/src/lib/sci/hc-pattern-classifier.ts"
  "web/src/lib/sci/header-comprehension.ts"
  "web/src/lib/sci/negotiation.ts"
  "web/src/lib/sci/promoted-patterns.ts"
  "web/src/lib/sci/proposal-intelligence.ts"
  "web/src/lib/sci/resolver.ts"
  "web/src/lib/sci/sci-signal-types.ts"
  "web/src/lib/sci/sci-types.ts"
  "web/src/lib/sci/seed-priors.ts"
  "web/src/lib/sci/signal-capture-service.ts"
  "web/src/lib/sci/signatures.ts"
  "web/src/lib/sci/source-date-extraction.ts"
  "web/src/lib/sci/structural-fingerprint.ts"
  "web/src/lib/sci/synaptic-ingestion-state.ts"
  "web/src/lib/sci/tenant-context.ts"
  "web/src/lib/sci/weight-evolution.ts"
)

i=1
for f in "${SECTION1_FILES[@]}"; do
  if [ -f "$f" ]; then
    extract_file 1 $i "$f"
    ((i++))
  fi
done

# ============================================================
# SECTION 2: AI / ANTHROPIC LAYER
# ============================================================
echo "## SECTION 2: AI / ANTHROPIC LAYER"
echo ""

SECTION2_FILES=(
  "web/src/app/api/ai/assessment/route.ts"
  "web/src/app/api/ai/calibration/route.ts"
  "web/src/app/api/ai/classify-fields-second-pass/route.ts"
  "web/src/app/api/ai/classify-file/route.ts"
  "web/src/app/api/ai/metrics/route.ts"
  "web/src/lib/ai/ai-service.ts"
  "web/src/lib/ai/file-classifier.ts"
  "web/src/lib/ai/index.ts"
  "web/src/lib/ai/providers/anthropic-adapter.ts"
  "web/src/lib/ai/signal-persistence.ts"
  "web/src/lib/ai/training-signal-service.ts"
  "web/src/lib/ai/types.ts"
  "web/src/lib/compensation/ai-plan-interpreter.ts"
  "web/src/lib/compensation/plan-interpreter.ts"
  "web/src/lib/domain/domain-dispatcher.ts"
  "web/src/lib/domain/domain-registry.ts"
  "web/src/lib/domain/domain-viability.ts"
  "web/src/lib/domain/domains/franchise.ts"
  "web/src/lib/domain/domains/icm.ts"
  "web/src/lib/domain/domains/rebate.ts"
  "web/src/lib/domain/negotiation-protocol.ts"
  "web/src/lib/forensics/ai-forensics.ts"
  "web/src/lib/intelligence/ai-metrics-service.ts"
  "web/src/lib/reconciliation/ai-column-mapper.ts"
  "web/src/lib/training/milestones.ts"
)

i=1
for f in "${SECTION2_FILES[@]}"; do
  if [ -f "$f" ]; then
    extract_file 2 $i "$f"
    ((i++))
  fi
done

# ============================================================
# SECTION 3: SIGNAL / PERSISTENCE / FLYWHEEL
# (Files not already in Section 1 or 2)
# ============================================================
echo "## SECTION 3: SIGNAL / PERSISTENCE / FLYWHEEL"
echo ""
echo "*Note: Files already extracted in Section 1 (SCI) or Section 2 (AI) are cross-referenced, not duplicated.*"
echo ""

SECTION3_FILES=(
  "web/src/lib/calculation/flywheel-pipeline.ts"
  "web/src/lib/ingestion/classification-service.ts"
  "web/src/lib/intelligence/classification-signal-service.ts"
  "web/src/lib/navigation/navigation-signals.ts"
  "web/src/lib/normalization/flywheel-verification.ts"
  "web/src/lib/signals/briefing-signals.ts"
  "web/src/lib/signals/stream-signals.ts"
)

echo "**Cross-references (already extracted):**"
echo "- web/src/lib/ai/signal-persistence.ts → Section 2"
echo "- web/src/lib/ai/training-signal-service.ts → Section 2"
echo "- web/src/lib/sci/classification-signal-service.ts → Section 1"
echo "- web/src/lib/sci/fingerprint-flywheel.ts → Section 1"
echo "- web/src/lib/sci/sci-signal-types.ts → Section 1"
echo "- web/src/lib/sci/signal-capture-service.ts → Section 1"
echo ""

i=1
for f in "${SECTION3_FILES[@]}"; do
  if [ -f "$f" ]; then
    extract_file 3 $i "$f"
    ((i++))
  fi
done

# ============================================================
# SECTION 4: IMPORT API ROUTES
# (Files not already in Section 1)
# ============================================================
echo "## SECTION 4: IMPORT API ROUTES"
echo ""
echo "*Note: SCI import routes already in Section 1.*"
echo ""

SECTION4_FILES=(
  "web/src/app/api/import/commit/route.ts"
  "web/src/app/api/import/prepare/route.ts"
  "web/src/app/api/interpret-import/route.ts"
  "web/src/app/api/plan/import/route.ts"
)

i=1
for f in "${SECTION4_FILES[@]}"; do
  if [ -f "$f" ]; then
    extract_file 4 $i "$f"
    ((i++))
  fi
done

# ============================================================
# SECTION 5: IMPORT UI COMPONENTS
# (Files not already in Section 1)
# ============================================================
echo "## SECTION 5: IMPORT UI COMPONENTS"
echo ""
echo "*Note: SCI UI components already in Section 1.*"
echo ""

SECTION5_FILES=(
  "web/src/app/admin/launch/plan-import/page.tsx"
  "web/src/app/data/import/enhanced/page.tsx"
  "web/src/app/data/import/page.tsx"
  "web/src/app/data/imports/page.tsx"
  "web/src/app/operate/import/enhanced/page.tsx"
  "web/src/app/operate/import/history/page.tsx"
  "web/src/app/operate/import/page.tsx"
  "web/src/app/operate/import/quarantine/page.tsx"
  "web/src/components/forensics/ComparisonUpload.tsx"
  "web/src/components/import/file-upload.tsx"
  "web/src/components/import/import-history.tsx"
  "web/src/components/import/import-summary-dashboard.tsx"
  "web/src/components/ingestion/UploadZone.tsx"
)

i=1
for f in "${SECTION5_FILES[@]}"; do
  if [ -f "$f" ]; then
    extract_file 5 $i "$f"
    ((i++))
  fi
done

# ============================================================
# SECTION 6: CONVERGENCE / ENTITY RESOLUTION
# ============================================================
echo "## SECTION 6: CONVERGENCE / ENTITY RESOLUTION"
echo ""

SECTION6_FILES=(
  "web/src/lib/intelligence/convergence-service.ts"
  "web/src/lib/sci/entity-resolution.ts"
  "web/src/lib/user-import/identity-resolution.ts"
)

echo "*Note: web/src/lib/sci/entity-resolution.ts already in Section 1.*"
echo ""

i=1
for f in "${SECTION6_FILES[@]}"; do
  # Skip entity-resolution.ts since it's already in Section 1
  if [ "$f" = "web/src/lib/sci/entity-resolution.ts" ]; then
    echo "### 6.${i}: entity-resolution.ts"
    echo "- **Cross-reference:** See Section 1"
    echo ""
    ((i++))
    continue
  fi
  if [ -f "$f" ]; then
    extract_file 6 $i "$f"
    ((i++))
  fi
done

# ============================================================
# SECTION 7: CALCULATION ENGINE
# ============================================================
echo "## SECTION 7: CALCULATION ENGINE"
echo ""

SECTION7_FILES=(
  "web/src/app/api/calculation/density/route.ts"
  "web/src/app/api/calculation/run/route.ts"
  "web/src/lib/calculation/anomaly-detector.ts"
  "web/src/lib/calculation/calculation-lifecycle-service.ts"
  "web/src/lib/calculation/decimal-precision.ts"
  "web/src/lib/calculation/engine.ts"
  "web/src/lib/calculation/index.ts"
  "web/src/lib/calculation/intent-executor.ts"
  "web/src/lib/calculation/intent-resolver.ts"
  "web/src/lib/calculation/intent-transformer.ts"
  "web/src/lib/calculation/intent-types.ts"
  "web/src/lib/calculation/intent-validator.ts"
  "web/src/lib/calculation/lifecycle-utils.ts"
  "web/src/lib/calculation/pattern-signature.ts"
  "web/src/lib/calculation/results-formatter.ts"
  "web/src/lib/calculation/run-calculation.ts"
  "web/src/lib/calculation/synaptic-density.ts"
  "web/src/lib/calculation/synaptic-surface.ts"
  "web/src/lib/calculation/synaptic-types.ts"
  "web/src/lib/canvas/layout-engine.ts"
  "web/src/lib/compensation/calculation-engine.ts"
  "web/src/lib/data-architecture/validation-engine.ts"
  "web/src/lib/intelligence/insight-engine.ts"
  "web/src/lib/intelligence/next-action-engine.ts"
  "web/src/lib/intelligence/trajectory-engine.ts"
  "web/src/lib/normalization/normalization-engine.ts"
  "web/src/lib/reconciliation/adaptive-comparison-engine.ts"
  "web/src/lib/reconciliation/comparison-depth-engine.ts"
  "web/src/lib/reconciliation/comparison-engine.ts"
  "web/src/lib/reconciliation/engine.ts"
  "web/src/lib/reconciliation/report-engine.ts"
  "web/src/lib/shadow-payroll/engine.ts"
  "web/src/lib/supabase/calculation-service.ts"
  "web/src/lib/tenant/provisioning-engine.ts"
  "web/src/lib/approval-routing/impact-calculator.ts"
  "web/src/types/calculation-engine.ts"
)

echo "*Note: web/src/lib/calculation/flywheel-pipeline.ts already in Section 3.*"
echo ""

i=1
for f in "${SECTION7_FILES[@]}"; do
  if [ -f "$f" ]; then
    extract_file 7 $i "$f"
    ((i++))
  fi
done

# ============================================================
# SECTION 8: AUTH / SESSION / COOKIE
# ============================================================
echo "## SECTION 8: AUTH / SESSION / COOKIE"
echo ""

SECTION8_FILES=(
  "web/src/components/layout/auth-shell.tsx"
  "web/src/components/session/SessionExpiryWarning.tsx"
  "web/src/contexts/auth-context.tsx"
  "web/src/contexts/session-context.tsx"
  "web/src/lib/auth/auth-logger.ts"
  "web/src/lib/auth/server-auth.ts"
  "web/src/middleware.ts"
  "web/src/types/auth.ts"
)

echo "*Note: auth-service.ts and cookie-config.ts will be in Section 9 (Supabase).*"
echo ""

i=1
for f in "${SECTION8_FILES[@]}"; do
  if [ -f "$f" ]; then
    extract_file 8 $i "$f"
    ((i++))
  fi
done

# ============================================================
# SECTION 9: SUPABASE CLIENT / CONFIG
# ============================================================
echo "## SECTION 9: SUPABASE CLIENT / CONFIG"
echo ""

SECTION9_FILES=(
  "web/src/lib/supabase/auth-service.ts"
  "web/src/lib/supabase/client.ts"
  "web/src/lib/supabase/cookie-config.ts"
  "web/src/lib/supabase/data-service.ts"
  "web/src/lib/supabase/database.types.ts"
  "web/src/lib/supabase/entity-service.ts"
  "web/src/lib/supabase/rule-set-service.ts"
  "web/src/lib/supabase/server.ts"
)

echo "*Note: calculation-service.ts already in Section 7.*"
echo ""

i=1
for f in "${SECTION9_FILES[@]}"; do
  if [ -f "$f" ]; then
    extract_file 9 $i "$f"
    ((i++))
  fi
done

# ============================================================
# SECTION 10: TYPE DEFINITIONS
# ============================================================
echo "## SECTION 10: TYPE DEFINITIONS"
echo ""

SECTION10_FILES=(
  "web/src/lib/calculation/intent-types.ts"
)

echo "*Note: intent-types.ts already in Section 7. Cross-reference only.*"
echo ""
echo "### 10.1: intent-types.ts"
echo "- **Cross-reference:** See Section 7"
echo ""

# ============================================================
# SECTION 11: API ROUTE MANIFEST
# ============================================================
echo "## SECTION 11: API ROUTE MANIFEST"
echo ""
echo "Complete list of all API routes in the application:"
echo ""
echo '```'
find web/src/app/api -name "route.ts" | sort
echo '```'
echo ""

# ============================================================
# SECTION 12: PHASE 1 DISCOVERY OUTPUT
# ============================================================
echo "## SECTION 12: PHASE 1 DISCOVERY OUTPUT"
echo ""
echo "Raw output from the Phase 1 file discovery diagnostic:"
echo ""
