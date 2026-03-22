DIAG-013: Plan Converter — Why AI Assessment Intelligence Does Not Reach rule_set.components

Date: March 22, 2026
Type: DIAG (READ-ONLY — NO CODE CHANGES)
Severity: P0 — Third occurrence of the same failure

CONTEXT

The AI plan assessment correctly identifies Plan 1 as "a linear formula combining percentage-based variable commission and guaranteed base draw, differentiated by rep level, calculated bi-weekly with no cap and 100% clawback." But convertComponent produces calcType="tiered_lookup" with 0 tiers.

OB-182 claimed to fix this with transformFromMetadata. The browser proves it did not work. This is the THIRD time this failure has been reported. This diagnostic exists to find out WHY.

CC MUST paste COMPLETE function bodies. Not signatures. Not summaries. Not "this function does X." The actual code, every line.

READ FIRST: CC_STANDING_ARCHITECTURE_RULES.md

MISSION 1: THE AI INTERPRETATION OUTPUT

When the AI interprets a plan PDF, what data structure does it produce?

1A: Find the AI plan interpretation API call. This is the call to Anthropic/OpenAI that reads the PDF text and produces the plan structure. Paste:
- The file path and function name
- The system prompt sent to the AI
- The response schema (what JSON structure does the AI return?)

1B: For CRP Plan 1 (Capital Equipment), query the database:

SELECT id, name, components, metadata
FROM rule_sets 
WHERE tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7'
ORDER BY created_at DESC
LIMIT 1;

Paste the COMPLETE components JSONB and metadata JSONB. This shows what convertComponent actually produced.

1C: Also query the processing_jobs for the latest CRP plan import:

SELECT id, file_name, classification_result, proposal
FROM processing_jobs
WHERE tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7'
ORDER BY created_at DESC
LIMIT 1;

Paste the COMPLETE classification_result and proposal JSONB. This shows what the AI assessment produced BEFORE conversion.

MISSION 2: THE CONVERSION PIPELINE

Trace the COMPLETE path from AI interpretation to rule_set.components:

2A: Where does the AI interpretation result get stored after the AI call?
- Is it in processing_jobs.classification_result?
- Is it in a temporary variable?
- Is it passed directly to convertComponent?
- Paste the code that receives the AI response and passes it to the converter.

2B: Paste the COMPLETE convertComponent function. Every line. File path and line numbers.

2C: Paste the COMPLETE interpretationToPlanConfig function. Every line. File path and line numbers.

2D: Paste the COMPLETE transformFromMetadata function (added in OB-182). Every line. File path and line numbers.

2E: WHERE IS transformFromMetadata CALLED? 
- Is it called from convertComponent?
- Is it called from interpretationToPlanConfig?
- Is it called from somewhere else?
- Is it called AT ALL?
- Grep:
  grep -rn "transformFromMetadata" web/src/ --include="*.ts" --include="*.tsx"
  Paste the COMPLETE output.

2F: The log says calcMethod.type="tiered_lookup". WHERE does calcMethod.type get set?
- The AI assessment says "linear formula" but calcMethod.type is "tiered_lookup"
- Something between the AI response and convertComponent is mapping "linear formula" to "tiered_lookup"
- Find that mapping. Paste it.

MISSION 3: THE GAP

Based on Missions 1 and 2, answer:

3A: Does the AI interpretation response contain the word "linear" or "linear_function" or "slope" or "y = mx + b" anywhere in its output?

3B: If YES — where does that information get lost between the AI response and convertComponent?

3C: If NO — the AI interpretation prompt needs to be updated to produce linear_function/piecewise_linear calculation types instead of always defaulting to tiered_lookup.

3D: Is the problem in the AI PROMPT (it doesn't ask for new primitive types) or in the CONVERTER (it receives the right info but discards it)?

MISSION 4: THE CALCMETHOD.TYPE VOCABULARY

4A: What values can calcMethod.type take? Find the type definition or enum. Paste it.

4B: Is "linear_function" in that vocabulary? Is "piecewise_linear"?

4C: If they're NOT in the vocabulary, the AI will never produce them because the prompt constrains the response to known types. The fix is to add them to the AI prompt and the type definition.

OUTPUT

Save as DIAG-013_PLAN_CONVERTER_AUDIT.md in PROJECT ROOT.
Commit: "DIAG-013: Plan converter audit"

gh pr create --base main --head dev --title "DIAG-013: Plan Converter Audit — Why AI Assessment Doesn't Reach Components" --body "Read-only diagnostic. The AI assessment correctly identifies linear formulas, accelerator curves, cross-plan gates. The converter produces tiered_lookup with 0 tiers. This has failed 3 times. This diagnostic traces the complete data flow from AI response to rule_set.components to find the exact point of failure."
