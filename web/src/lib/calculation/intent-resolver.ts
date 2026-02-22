/**
 * Intent Resolver — Chooses between AI-produced and transformer-produced intents
 *
 * Priority:
 * 1. If PlanComponent has a valid calculationIntent (AI-produced) → use it
 * 2. Otherwise → fall back to the transformer (OB-76 deterministic bridge)
 *
 * All intents are validated before use.
 */

import type { PlanComponent } from '../../types/compensation-plan';
import type { ComponentIntent } from './intent-types';
import { transformComponent } from './intent-transformer';
import { validateIntent } from './intent-validator';

export interface ResolvedIntent {
  intent: ComponentIntent;
  source: 'ai' | 'transformer';
  validationErrors?: string[];
}

/**
 * Resolve the best available intent for a component.
 * Tries AI-produced intent first, falls back to transformer.
 */
export function resolveIntent(
  component: PlanComponent,
  componentIndex: number
): ResolvedIntent | null {
  // 1. Try AI-produced intent
  if (component.calculationIntent) {
    const validation = validateIntent(component.calculationIntent);
    if (validation.valid) {
      // Build a ComponentIntent wrapper around the AI-produced operation
      const aiIntent: ComponentIntent = {
        componentIndex,
        label: component.name,
        confidence: 0.9, // AI confidence (less than 1.0 = deterministic)
        dataSource: {
          sheetClassification: component.id,
          entityScope: component.measurementLevel === 'individual' ? 'entity' : 'group',
          requiredMetrics: extractMetricFields(component.calculationIntent),
          groupLinkField: component.measurementLevel !== 'individual' ? 'storeId' : undefined,
        },
        intent: component.calculationIntent as ComponentIntent['intent'],
        modifiers: [],
        metadata: {
          domainLabel: component.name,
          planReference: component.id,
          aiConfidence: 0.9,
          interpretationNotes: 'AI-native intent production (OB-77)',
        },
      };
      return { intent: aiIntent, source: 'ai' };
    } else {
      // AI intent invalid — fall back to transformer
      console.warn(
        `[IntentResolver] AI intent for "${component.name}" invalid, falling back to transformer:`,
        validation.errors
      );
      const txIntent = transformComponent(component, componentIndex);
      if (txIntent) {
        return {
          intent: txIntent,
          source: 'transformer',
          validationErrors: validation.errors,
        };
      }
    }
  }

  // 2. No AI intent — use transformer
  const txIntent = transformComponent(component, componentIndex);
  if (txIntent) {
    return { intent: txIntent, source: 'transformer' };
  }

  return null;
}

/**
 * Resolve intents for all components in a variant.
 */
export function resolveVariantIntents(
  components: PlanComponent[]
): { intents: ResolvedIntent[]; aiCount: number; transformerCount: number } {
  const intents: ResolvedIntent[] = [];
  let aiCount = 0;
  let transformerCount = 0;

  for (let i = 0; i < components.length; i++) {
    const resolved = resolveIntent(components[i], i);
    if (resolved) {
      intents.push(resolved);
      if (resolved.source === 'ai') aiCount++;
      else transformerCount++;
    }
  }

  return { intents, aiCount, transformerCount };
}

/**
 * Extract metric field names from an intent operation (for dataSource.requiredMetrics).
 */
function extractMetricFields(op: Record<string, unknown>): string[] {
  const fields: string[] = [];
  const json = JSON.stringify(op);

  // Find all "field":"value" patterns in metric sources
  const matches = json.matchAll(/"field"\s*:\s*"([^"]+)"/g);
  for (const match of matches) {
    if (!fields.includes(match[1])) {
      fields.push(match[1]);
    }
  }

  return fields;
}
