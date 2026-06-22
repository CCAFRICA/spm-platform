/**
 * OB-228 — Renderer dispatch (the Korean-Test core, D154 / AUD-009 / HF-195 Rule 27).
 *
 * A dispatch MAP keyed by componentType, resolved with `?? GenericComponentRenderer`.
 * The fallback is MANDATORY and is the Korean-Test proof: an unknown componentType
 * renders its config legibly (GenericComponentRenderer), never errors, never disappears.
 * Adding a bespoke renderer is a map entry, NOT a switch arm that can drop a case.
 *
 * NOTE (Phase-1 premise correction): the platform's real componentType is `prime_dag`
 * (the prime-DAG engine; the legacy lookup-type names are forbidden by the HF-195
 * build gate). So the bespoke renderer is PrimeDagRenderer, which itself dispatches on
 * the analyzer's STRUCTURAL SHAPE to band/tier, conditional, rate, and matrix visuals.
 * Any other / future / Korean componentType falls to GenericComponentRenderer.
 */
import type { RendererProps } from './shared';
import { PrimeDagRenderer } from './PrimeDagRenderer';
import { GenericComponentRenderer } from './GenericComponentRenderer';

type Renderer = (props: RendererProps) => React.ReactNode;

export const RENDERERS: Record<string, Renderer> = {
  prime_dag: PrimeDagRenderer,
};

/** Resolve a renderer for a componentType — generic fallback for ANY unknown type. */
export function resolveRenderer(componentType: string): Renderer {
  return RENDERERS[componentType] ?? GenericComponentRenderer;
}

export { PrimeDagRenderer, GenericComponentRenderer };
export { TierRenderer } from './TierRenderer';
export { RateRenderer } from './RateRenderer';
export { ConditionalRenderer } from './ConditionalRenderer';
export { MatrixRenderer } from './MatrixRenderer';
export type { RendererProps };
