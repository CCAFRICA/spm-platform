'use client';

/**
 * ImpactPreviewPanel — Slides in when drag-to-reassign initiated
 *
 * Shows source entity, target entity (by name), impact preview,
 * credit model selector, effective date. DS-001 inline styles.
 */

import type { ReassignmentDraft } from '../hooks/useCanvasActions';
import { ArrowRight, Calendar, AlertTriangle } from 'lucide-react';

interface ImpactPreviewPanelProps {
  draft: ReassignmentDraft;
  targetName: string;
  onConfirm: () => void;
  onCancel: () => void;
  onUpdate: (updates: Partial<ReassignmentDraft>) => void;
}

const CREDIT_MODELS = [
  { value: 'full_credit' as const, label: 'Full credit to new parent' },
  { value: 'split_credit' as const, label: 'Split credit (both parents)' },
  { value: 'no_credit' as const, label: 'No credit transfer' },
];

const CARD_STYLE: React.CSSProperties = {
  background: 'rgba(24, 24, 27, 0.8)',
  border: '1px solid rgba(39, 39, 42, 0.6)',
  borderRadius: '8px',
  padding: '12px',
};

export function ImpactPreviewPanel({
  draft,
  targetName,
  onConfirm,
  onCancel,
  onUpdate,
}: ImpactPreviewPanelProps) {
  return (
    <div style={{ width: '320px', borderLeft: '1px solid rgba(39, 39, 42, 0.6)', background: '#0a0e1a', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ position: 'sticky', top: 0, background: '#0a0e1a', borderBottom: '1px solid rgba(39, 39, 42, 0.6)', padding: '16px', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertTriangle size={16} style={{ color: '#fbbf24' }} />
          <h3 style={{ color: '#e2e8f0', fontSize: '14px', fontWeight: 600, margin: 0 }}>Reassignment Preview</h3>
        </div>
      </div>

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {/* Move details */}
        <div style={CARD_STYLE}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#71717a', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Moving</div>
              <div style={{ color: '#e2e8f0', fontSize: '13px', fontWeight: 500, marginTop: '2px' }}>{draft.entity.display_name}</div>
            </div>
            <ArrowRight size={16} style={{ color: '#52525b', flexShrink: 0 }} />
            <div style={{ flex: 1, textAlign: 'right' }}>
              <div style={{ color: '#71717a', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>To</div>
              <div style={{ color: '#818cf8', fontSize: '13px', fontWeight: 500, marginTop: '2px' }}>{targetName}</div>
            </div>
          </div>
        </div>

        {/* Impact */}
        <div style={CARD_STYLE}>
          <div style={{ color: '#71717a', fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>Impact</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ color: '#94a3b8', fontSize: '12px' }}>• Change reporting structure</div>
            <div style={{ color: '#94a3b8', fontSize: '12px' }}>• Update entity_relationships</div>
            <div style={{ color: '#94a3b8', fontSize: '12px' }}>• Rule set assignments reviewed</div>
          </div>
        </div>

        {/* Credit model */}
        <div style={CARD_STYLE}>
          <div style={{ color: '#71717a', fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>Credit Model</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {CREDIT_MODELS.map(model => (
              <label
                key={model.value}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#e2e8f0' }}
              >
                <input
                  type="radio"
                  name="creditModel"
                  checked={draft.creditModel === model.value}
                  onChange={() => onUpdate({ creditModel: model.value })}
                  style={{ accentColor: '#818cf8' }}
                />
                {model.label}
              </label>
            ))}
          </div>
        </div>

        {/* Effective date */}
        <div style={CARD_STYLE}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
            <Calendar size={12} style={{ color: '#71717a' }} />
            <span style={{ color: '#71717a', fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Effective Date</span>
          </div>
          <input
            type="date"
            value={draft.effectiveDate}
            onChange={(e) => onUpdate({ effectiveDate: e.target.value })}
            style={{
              width: '100%',
              padding: '8px',
              fontSize: '13px',
              color: '#e2e8f0',
              background: 'rgba(15, 23, 42, 0.5)',
              border: '1px solid rgba(39, 39, 42, 0.6)',
              borderRadius: '6px',
              outline: 'none',
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
            Confirm Move
          </button>
        </div>
      </div>
    </div>
  );
}
