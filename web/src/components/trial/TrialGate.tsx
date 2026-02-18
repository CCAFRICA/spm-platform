'use client';

/**
 * TrialGate — Blurs content and shows upgrade prompt when trial gate is active.
 *
 * Wraps any content that requires a paid subscription.
 * Shows the content blurred with an overlay upgrade card.
 */

import React from 'react';

interface TrialGateProps {
  message: string;
  allowed: boolean;
  children: React.ReactNode;
}

export function TrialGate({ message, allowed, children }: TrialGateProps) {
  if (allowed) return <>{children}</>;

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ filter: 'blur(2px)', opacity: 0.5, pointerEvents: 'none' }}>
        {children}
      </div>
      <div style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.7)',
        borderRadius: '8px',
        zIndex: 10,
      }}>
        <div style={{
          background: '#0F172A',
          border: '1px solid #E8A838',
          borderRadius: '12px',
          padding: '24px 32px',
          maxWidth: '400px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '16px', color: '#F8FAFC', marginBottom: '8px', fontWeight: 600 }}>
            Upgrade Required
          </div>
          <div style={{ fontSize: '14px', color: '#CBD5E1', marginBottom: '16px' }}>
            {message}
          </div>
          <button
            onClick={() => window.location.href = '/upgrade'}
            style={{
              background: '#2D2F8F',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 24px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            View Plans
          </button>
        </div>
      </div>
    </div>
  );
}
