/**
 * OB-234 T1-C — DS-003 visualization vocabulary. One import site for all 8 Intelligence surfaces.
 * Each component implements a DS-003 decision task, consumes the persona theme (T1-D) for environment
 * accent, and carries a required reference frame (DS-003 Rule 3). recharts internals · lucide icons.
 */

// Persona theme (T1-D)
export {
  PersonaThemeProvider,
  usePersonaTheme,
  useDensityAllows,
  DensityGate,
  PersonaAmbient,
  PERSONA_THEME,
  type PersonaTheme,
  type DensityLevel,
} from './persona-theme';

// Shared tokens
export * from './ds003-tokens';

// Identification
export { HeroMetric, type HeroMetricProps, type HeroContext } from './HeroMetric';
export { GaugeMetric, type GaugeMetricProps, type GaugeThresholds } from './GaugeMetric';

// Comparison
export { HorizontalBar, type HorizontalBarProps, type BarItem } from './HorizontalBar';
export { StackedBar, type StackedBarProps, type StackSegment } from './StackedBar';

// Ranking
export { DistributionPosition, type DistributionPositionProps, type DistributionMarkers } from './DistributionPosition';
export { NeighborhoodLeaderboard, type NeighborhoodLeaderboardProps, type LeaderboardEntity } from './NeighborhoodLeaderboard';

// Monitoring
export { Sparkline, type SparklineProps } from './Sparkline';
export { SparkTrend, type SparkTrendProps, type SparkPoint } from './SparkTrend';
export { ThresholdArea, type ThresholdAreaProps, type ThresholdPoint } from './ThresholdArea';

// Selection
export { PrioritySortedList, type PrioritySortedListProps, type PriorityItem, type PriorityAction } from './PrioritySortedList';

// Planning
export { ConfigurablePipeline, type ConfigurablePipelineProps, type PipelineStage, type PipelineAction, type StageStatus } from './ConfigurablePipeline';
export { SteppedProgress, type SteppedProgressProps, type ProgressTier } from './SteppedProgress';

// Affordances + composition
export { StubAction, type StubActionProps } from './StubAction';
export { Panel, type PanelProps } from './Panel';
export { ValidityVerdict, type ValidityVerdictProps } from './ValidityVerdict';
export { IntelligenceElement, type IntelligenceElementProps, type ElementAction } from './IntelligenceElement';
