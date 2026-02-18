'use client';

/**
 * CoachMark — Contextual Training Tooltip
 *
 * Shows a one-time tooltip for a milestone.
 * When dismissed, marks the milestone as completed via useUserJourney.
 * Only renders when visible=true and milestone not yet completed.
 */

import React, { useRef, useEffect, useState } from 'react';

interface CoachMarkProps {
  milestone: string;
  title: string;
  description: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  children: React.ReactNode;
  visible: boolean;
  onDismiss: () => void;
}

const POSITION_STYLES: Record<string, React.CSSProperties> = {
  top: {
    bottom: '100%',
    left: '50%',
    transform: 'translateX(-50%)',
    marginBottom: '8px',
  },
  bottom: {
    top: '100%',
    left: '50%',
    transform: 'translateX(-50%)',
    marginTop: '8px',
  },
  left: {
    right: '100%',
    top: '50%',
    transform: 'translateY(-50%)',
    marginRight: '8px',
  },
  right: {
    left: '100%',
    top: '50%',
    transform: 'translateY(-50%)',
    marginLeft: '8px',
  },
};

export function CoachMark({
  milestone,
  title,
  description,
  position = 'bottom',
  children,
  visible,
  onDismiss,
}: CoachMarkProps) {
  const [show, setShow] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (visible) {
      // Slight delay for entrance animation
      const timer = setTimeout(() => setShow(true), 300);
      return () => clearTimeout(timer);
    }
    setShow(false);
  }, [visible]);

  if (!visible) {
    return <>{children}</>;
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      {children}

      {show && (
        <div
          data-milestone={milestone}
          style={{
            position: 'absolute',
            ...POSITION_STYLES[position],
            width: '280px',
            background: '#1E293B',
            border: '1px solid #E8A838',
            borderRadius: '8px',
            padding: '14px 16px',
            zIndex: 1000,
            boxShadow: '0 4px 24px rgba(0, 0, 0, 0.4)',
            opacity: show ? 1 : 0,
            transition: 'opacity 0.3s ease',
          }}
        >
          {/* Title */}
          <div style={{
            fontSize: '14px',
            fontWeight: 600,
            color: '#F8FAFC',
            marginBottom: '6px',
          }}>
            {title}
          </div>

          {/* Description */}
          <p style={{
            fontSize: '12px',
            color: '#CBD5E1',
            lineHeight: '1.5',
            margin: '0 0 12px',
          }}>
            {description}
          </p>

          {/* Dismiss button */}
          <button
            onClick={onDismiss}
            style={{
              background: 'transparent',
              border: '1px solid #E8A838',
              color: '#E8A838',
              borderRadius: '6px',
              padding: '5px 14px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 0.2s',
            }}
          >
            Got it &#10003;
          </button>

          {/* Arrow indicator */}
          <div style={{
            position: 'absolute',
            width: '8px',
            height: '8px',
            background: '#1E293B',
            border: '1px solid #E8A838',
            borderRight: 'none',
            borderBottom: 'none',
            ...(position === 'bottom' ? {
              top: '-5px',
              left: '50%',
              transform: 'translateX(-50%) rotate(45deg)',
            } : position === 'top' ? {
              bottom: '-5px',
              left: '50%',
              transform: 'translateX(-50%) rotate(225deg)',
            } : position === 'right' ? {
              left: '-5px',
              top: '50%',
              transform: 'translateY(-50%) rotate(-45deg)',
            } : {
              right: '-5px',
              top: '50%',
              transform: 'translateY(-50%) rotate(135deg)',
            }),
          }} />
        </div>
      )}
    </div>
  );
}
