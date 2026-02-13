/**
 * AI Column Mapper
 *
 * HF-021 Phase 2: AI-powered column classification for reconciliation.
 * Uses AIService.classifySheet() to map uploaded file columns to:
 *   - employee_id
 *   - employee_name
 *   - total_amount
 *   - component:{componentId} (per plan component)
 *
 * DESIGN PRINCIPLES:
 * - ALL AI calls through AIService (Rule 6)
 * - ALL AI responses captured as training signals (Rule 7)
 * - No hardcoded column names (Korean Test)
 * - Graceful degradation: if AI fails, show error + manual UI
 */

import { getAIService } from '@/lib/ai/ai-service';
import { getTrainingSignalService } from '@/lib/ai/training-signal-service';
import { getPlans } from '@/lib/compensation/plan-storage';
import type { ParsedFile } from './smart-file-parser';

// ============================================
// TYPES
// ============================================

export interface ColumnMapping {
  sourceColumn: string;     // Column header from the uploaded file
  mappedTo: string;         // Target: 'employee_id' | 'employee_name' | 'total_amount' | 'component:{id}'
  mappedToLabel: string;    // Human-readable label for the mapping
  confidence: number;       // 0-1 confidence score
  reasoning: string;        // Why this mapping was chosen
  isUserOverride: boolean;  // Whether user changed the AI suggestion
}

export interface MappingResult {
  mappings: ColumnMapping[];
  signalId?: string;        // Training signal ID for feedback loop
  aiAvailable: boolean;     // Whether AI was successfully used
  error?: string;           // Error message if AI failed
}

/** Target fields the AI can map to */
export interface MappingTarget {
  id: string;               // e.g., 'employee_id', 'component:comp-optical'
  label: string;            // e.g., 'Employee ID', 'Optical Sales'
  category: 'identifier' | 'amount' | 'component';
}

// ============================================
// PUBLIC API
// ============================================

/**
 * Run AI-powered column mapping on a parsed file.
 * Returns mappings with confidence scores.
 * Falls back gracefully if AI is unavailable.
 */
export async function mapColumns(
  parsed: ParsedFile,
  tenantId: string,
  userId: string,
): Promise<MappingResult> {
  // Build plan context for AI
  const targets = buildMappingTargets(tenantId);
  const targetFieldNames = targets.map(t => `${t.id} (${t.label})`);
  const sampleRows = parsed.rows.slice(0, 5);

  // Build plan context description for AI
  const planContext = buildPlanContext(tenantId);

  try {
    const aiService = getAIService();

    // Use classifySheet for column mapping with plan context
    const response = await aiService.classifySheet(
      parsed.activeSheet || parsed.fileName,
      parsed.headers,
      sampleRows,
      {
        targetFields: targetFieldNames,
        planComponents: planContext.components,
        description: 'Reconciliation benchmark file for compensation comparison',
      },
      { tenantId, userId },
    );

    // Transform AI response to our mapping format
    const mappings = transformAIResponse(
      response.result.suggestedMappings || [],
      parsed.headers,
      targets,
    );

    return {
      mappings,
      signalId: response.signalId,
      aiAvailable: true,
    };
  } catch (error) {
    console.warn('[AIColumnMapper] AI mapping failed, falling back to manual:', error);

    return {
      mappings: [],
      aiAvailable: false,
      error: error instanceof Error ? error.message : 'AI service unavailable',
    };
  }
}

/**
 * Record user feedback on AI mapping (accepted, corrected, rejected)
 */
export function recordMappingFeedback(
  signalId: string,
  action: 'accepted' | 'corrected' | 'rejected',
  correction?: Record<string, string>,
  tenantId?: string,
): void {
  try {
    const signalService = getTrainingSignalService(tenantId);
    signalService.recordUserAction(
      signalId,
      action,
      correction ? { correctedMappings: correction } : undefined,
      tenantId,
    );
  } catch (error) {
    console.warn('[AIColumnMapper] Failed to record feedback:', error);
  }
}

// ============================================
// HELPERS
// ============================================

/**
 * Build the list of valid mapping targets from active plans
 */
export function buildMappingTargets(tenantId: string): MappingTarget[] {
  const targets: MappingTarget[] = [
    { id: 'employee_id', label: 'Employee ID', category: 'identifier' },
    { id: 'employee_name', label: 'Employee Name', category: 'identifier' },
    { id: 'total_amount', label: 'Total Incentive Amount', category: 'amount' },
  ];

  // Add plan component targets
  const plans = getPlans(tenantId);
  const activePlans = plans.filter(p => p.status === 'active');

  for (const plan of activePlans) {
    if (plan.configuration.type === 'additive_lookup') {
      for (const variant of plan.configuration.variants) {
        for (const component of variant.components) {
          if (component.enabled) {
            const targetId = `component:${component.id}`;
            // Avoid duplicates (same component ID across variants)
            if (!targets.some(t => t.id === targetId)) {
              targets.push({
                id: targetId,
                label: component.name,
                category: 'component',
              });
            }
          }
        }
      }
    }
  }

  return targets;
}

/**
 * Build plan context description for AI
 */
function buildPlanContext(tenantId: string): {
  components: Array<{ id: string; name: string; type: string }>;
} {
  const components: Array<{ id: string; name: string; type: string }> = [];

  const plans = getPlans(tenantId);
  const activePlans = plans.filter(p => p.status === 'active');

  for (const plan of activePlans) {
    if (plan.configuration.type === 'additive_lookup') {
      for (const variant of plan.configuration.variants) {
        for (const component of variant.components) {
          if (component.enabled) {
            if (!components.some(c => c.id === component.id)) {
              components.push({
                id: component.id,
                name: component.name,
                type: component.componentType,
              });
            }
          }
        }
      }
    }
  }

  return { components };
}

/**
 * Transform AI suggestedMappings response into our ColumnMapping format
 */
function transformAIResponse(
  suggestedMappings: Array<{
    sourceColumn: string;
    targetField: string;
    confidence: number;
  }>,
  allHeaders: string[],
  targets: MappingTarget[],
): ColumnMapping[] {
  const mappings: ColumnMapping[] = [];

  for (const suggestion of suggestedMappings) {
    // Find the matching target
    const target = targets.find(t =>
      t.id === suggestion.targetField ||
      t.label.toLowerCase() === suggestion.targetField.toLowerCase() ||
      suggestion.targetField.toLowerCase().includes(t.id.toLowerCase())
    );

    if (target) {
      mappings.push({
        sourceColumn: suggestion.sourceColumn,
        mappedTo: target.id,
        mappedToLabel: target.label,
        confidence: suggestion.confidence,
        reasoning: `AI classified "${suggestion.sourceColumn}" as ${target.label}`,
        isUserOverride: false,
      });
    }
  }

  // For any unmapped headers, add them as unmapped
  for (const header of allHeaders) {
    if (!mappings.some(m => m.sourceColumn === header)) {
      mappings.push({
        sourceColumn: header,
        mappedTo: 'unmapped',
        mappedToLabel: 'Not mapped',
        confidence: 0,
        reasoning: 'No AI mapping suggested for this column',
        isUserOverride: false,
      });
    }
  }

  return mappings;
}

/**
 * Extract the employee ID field from mappings
 */
export function getEmployeeIdMapping(mappings: ColumnMapping[]): string | null {
  const mapping = mappings.find(m => m.mappedTo === 'employee_id');
  return mapping?.sourceColumn ?? null;
}

/**
 * Extract the total amount field from mappings
 */
export function getTotalAmountMapping(mappings: ColumnMapping[]): string | null {
  const mapping = mappings.find(m => m.mappedTo === 'total_amount');
  return mapping?.sourceColumn ?? null;
}

/**
 * Extract component field mappings (component:{id} -> sourceColumn)
 */
export function getComponentMappings(mappings: ColumnMapping[]): Array<{
  sourceColumn: string;
  componentId: string;
  componentName: string;
}> {
  return mappings
    .filter(m => m.mappedTo.startsWith('component:'))
    .map(m => ({
      sourceColumn: m.sourceColumn,
      componentId: m.mappedTo.replace('component:', ''),
      componentName: m.mappedToLabel,
    }));
}
