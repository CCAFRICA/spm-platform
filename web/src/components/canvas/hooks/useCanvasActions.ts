/**
 * useCanvasActions — Drag-to-reassign, click-to-edit, draw-to-relate
 */

import { useState, useCallback } from 'react';
import type { Entity } from '@/lib/supabase/database.types';

export interface ReassignmentDraft {
  entity: Entity;
  fromParentId: string | null;
  toParentId: string;
  creditModel: 'full_credit' | 'split_credit' | 'no_credit';
  effectiveDate: string;
}

export interface NewRelationshipDraft {
  sourceId: string;
  targetId: string;
  relationshipType: string;
  context?: string;
}

interface UseCanvasActionsReturn {
  // Selection
  selectedEntityId: string | null;
  setSelectedEntityId: (id: string | null) => void;

  // Reassignment
  reassignmentDraft: ReassignmentDraft | null;
  startReassignment: (entity: Entity, fromParentId: string | null, toParentId: string) => void;
  cancelReassignment: () => void;
  updateReassignmentDraft: (updates: Partial<ReassignmentDraft>) => void;

  // New relationship
  newRelDraft: NewRelationshipDraft | null;
  startNewRelationship: (sourceId: string, targetId: string) => void;
  cancelNewRelationship: () => void;
  updateNewRelDraft: (updates: Partial<NewRelationshipDraft>) => void;
}

export function useCanvasActions(): UseCanvasActionsReturn {
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [reassignmentDraft, setReassignmentDraft] = useState<ReassignmentDraft | null>(null);
  const [newRelDraft, setNewRelDraft] = useState<NewRelationshipDraft | null>(null);

  const startReassignment = useCallback((
    entity: Entity,
    fromParentId: string | null,
    toParentId: string
  ) => {
    setReassignmentDraft({
      entity,
      fromParentId,
      toParentId,
      creditModel: 'full_credit',
      effectiveDate: new Date().toISOString().split('T')[0],
    });
  }, []);

  const cancelReassignment = useCallback(() => {
    setReassignmentDraft(null);
  }, []);

  const updateReassignmentDraft = useCallback((updates: Partial<ReassignmentDraft>) => {
    setReassignmentDraft(prev => prev ? { ...prev, ...updates } : null);
  }, []);

  const startNewRelationship = useCallback((sourceId: string, targetId: string) => {
    setNewRelDraft({
      sourceId,
      targetId,
      relationshipType: 'contains',
    });
  }, []);

  const cancelNewRelationship = useCallback(() => {
    setNewRelDraft(null);
  }, []);

  const updateNewRelDraft = useCallback((updates: Partial<NewRelationshipDraft>) => {
    setNewRelDraft(prev => prev ? { ...prev, ...updates } : null);
  }, []);

  return {
    selectedEntityId,
    setSelectedEntityId,
    reassignmentDraft,
    startReassignment,
    cancelReassignment,
    updateReassignmentDraft,
    newRelDraft,
    startNewRelationship,
    cancelNewRelationship,
    updateNewRelDraft,
  };
}
