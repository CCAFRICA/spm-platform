/**
 * AI Service Module
 *
 * Provider-agnostic AI infrastructure layer.
 * Import from here for all AI functionality.
 *
 * Usage:
 *   import { getAIService, AI_CONFIDENCE } from '@/lib/ai';
 *   const aiService = getAIService();
 *   const result = await aiService.classifyFile(fileName, content);
 */

// Core service
export { AIService, getAIService, resetAIService } from './ai-service';

// Training signals
export {
  TrainingSignalService,
  getTrainingSignalService,
  resetTrainingSignalService,
} from './training-signal-service';

// Types
export type {
  // Provider types
  AIProvider,
  AIServiceConfig,

  // Request/Response
  AIRequest,
  AIResponse,
  AITaskType,

  // Task-specific types
  FileClassificationInput,
  FileClassificationResult,
  SheetClassificationInput,
  SheetClassificationResult,
  FieldMappingInput,
  FieldMappingResult,
  PlanInterpretationInput,
  PlanInterpretationResult,
  AnomalyDetectionInput,
  AnomalyDetectionResult,

  // Training
  TrainingSignal,

  // Adapter interface (for implementing new providers)
  AIProviderAdapter,
} from './types';

// Constants (values, not types)
export { AI_CONFIDENCE } from './types';

// File classifier utility
export {
  classifyFile,
  recordClassificationFeedback,
} from './file-classifier';
export type {
  FileClassification,
  ClassificationResult,
} from './file-classifier';
