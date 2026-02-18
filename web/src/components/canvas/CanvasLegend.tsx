'use client';

/**
 * CanvasLegend — Relationship type legend, confidence scale
 * DS-001 inline styles.
 */

const LINE_STYLE: React.CSSProperties = {
  width: '24px',
  height: 0,
  borderTop: '2px solid',
  flexShrink: 0,
};

const DOT_STYLE: React.CSSProperties = {
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  flexShrink: 0,
};

export function CanvasLegend() {
  return (
    <div style={{
      position: 'absolute',
      bottom: '12px',
      left: '12px',
      zIndex: 10,
      background: 'rgba(15, 23, 42, 0.9)',
      border: '1px solid rgba(99, 102, 241, 0.2)',
      borderRadius: '8px',
      backdropFilter: 'blur(8px)',
      padding: '10px 14px',
    }}>
      <div style={{ color: '#94A3B8', fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>Legend</div>

      {/* Edge types */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ ...LINE_STYLE, borderColor: '#6366f1' }} />
          <span style={{ color: '#94a3b8', fontSize: '13px' }}>Confirmed</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ ...LINE_STYLE, borderColor: '#f59e0b', borderTopStyle: 'dashed' }} />
          <span style={{ color: '#94a3b8', fontSize: '13px' }}>AI Proposed</span>
        </div>
      </div>

      {/* Status */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ ...DOT_STYLE, background: '#34d399' }} />
          <span style={{ color: '#94a3b8', fontSize: '13px' }}>Active</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ ...DOT_STYLE, background: '#fbbf24' }} />
          <span style={{ color: '#94a3b8', fontSize: '13px' }}>Proposed</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ ...DOT_STYLE, background: '#71717a' }} />
          <span style={{ color: '#94a3b8', fontSize: '13px' }}>Suspended</span>
        </div>
      </div>
    </div>
  );
}
