'use client';

/**
 * NewRelationshipPanel — Slides in when creating a new relationship
 *
 * Shows source + target entities, relationship type selector, confirm/cancel.
 * DS-001 inline styles.
 */

import type { NewRelationshipDraft } from '../hooks/useCanvasActions';
import { ArrowRight, Link2 } from 'lucide-react';

interface NewRelationshipPanelProps {
  draft: NewRelationshipDraft;
  sourceName: string;
  targetName: string;
  onConfirm: () => void;
  onCancel: () => void;
  onUpdate: (updates: Partial<NewRelationshipDraft>) => void;
}

const RELATIONSHIP_TYPES = [
  { value: 'contains', label: 'Contains' },
  { value: 'manages', label: 'Manages' },
  { value: 'works_at', label: 'Works at' },
  { value: 'assigned_to', label: 'Assigned to' },
  { value: 'member_of', label: 'Member of' },
  { value: 'participates_in', label: 'Participates in' },
  { value: 'oversees', label: 'Oversees' },
  { value: 'assists', label: 'Assists' },
] as const;

const CARD_STYLE: React.CSSProperties = {
  background: 'rgba(24, 24, 27, 0.8)',
  border: '1px solid rgba(39, 39, 42, 0.6)',
  borderRadius: '8px',
  padding: '12px',
};

export function NewRelationshipPanel({
  draft,
  sourceName,
  targetName,
  onConfirm,
  onCancel,
  onUpdate,
}: NewRelationshipPanelProps) {
  return (
    <div style={{ width: '320px', borderLeft: '1px solid rgba(39, 39, 42, 0.6)', background: '#0a0e1a', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ position: 'sticky', top: 0, background: '#0a0e1a', borderBottom: '1px solid rgba(39, 39, 42, 0.6)', padding: '16px', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Link2 size={16} style={{ color: '#818cf8' }} />
          <h3 style={{ color: '#e2e8f0', fontSize: '14px', fontWeight: 600, margin: 0 }}>New Relationship</h3>
        </div>
      </div>

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {/* Entity pair */}
        <div style={CARD_STYLE}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#71717a', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Source</div>
              <div style={{ color: '#e2e8f0', fontSize: '13px', fontWeight: 500, marginTop: '2px' }}>{sourceName}</div>
            </div>
            <ArrowRight size={16} style={{ color: '#52525b', flexShrink: 0 }} />
            <div style={{ flex: 1, textAlign: 'right' }}>
              <div style={{ color: '#71717a', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Target</div>
              <div style={{ color: '#818cf8', fontSize: '13px', fontWeight: 500, marginTop: '2px' }}>{targetName}</div>
            </div>
          </div>
        </div>

        {/* Relationship type */}
        <div style={CARD_STYLE}>
          <div style={{ color: '#71717a', fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>Relationship Type</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {RELATIONSHIP_TYPES.map(rt => (
              <label
                key={rt.value}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#e2e8f0' }}
              >
                <input
                  type="radio"
                  name="relationshipType"
                  checked={draft.relationshipType === rt.value}
                  onChange={() => onUpdate({ relationshipType: rt.value })}
                  style={{ accentColor: '#818cf8' }}
                />
                {rt.label}
              </label>
            ))}
          </div>
        </div>

        {/* Context / notes */}
        <div style={CARD_STYLE}>
          <div style={{ color: '#71717a', fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>Notes (optional)</div>
          <textarea
            value={draft.context || ''}
            onChange={(e) => onUpdate({ context: e.target.value })}
            placeholder="Reason for this relationship..."
            rows={3}
            style={{
              width: '100%',
              padding: '8px',
              fontSize: '12px',
              color: '#e2e8f0',
              background: 'rgba(15, 23, 42, 0.5)',
              border: '1px solid rgba(39, 39, 42, 0.6)',
              borderRadius: '6px',
              outline: 'none',
              resize: 'vertical',
              fontFamily: 'inherit',
            }}
          />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              padding: '8px',
              fontSize: '13px',
              fontWeight: 500,
              color: '#a1a1aa',
              background: 'none',
              border: '1px solid rgba(63, 63, 70, 0.6)',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 1,
              padding: '8px',
              fontSize: '13px',
              fontWeight: 500,
              color: '#ffffff',
              background: 'linear-gradient(to right, #6366f1, #8b5cf6)',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
