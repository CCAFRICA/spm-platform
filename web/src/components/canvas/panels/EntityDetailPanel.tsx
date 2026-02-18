'use client';

/**
 * EntityDetailPanel — Right panel showing full entity details
 *
 * Identity, relationships (clickable → navigate), outcomes, rule sets.
 * DS-001 inline styles throughout.
 */

import { useState, useEffect } from 'react';
import { useTenant } from '@/contexts/tenant-context';
import { getEntityCard, type EntityCardData } from '@/lib/canvas/graph-service';
import { X, ExternalLink, GitBranch, Clock, Shield, ArrowUpRight } from 'lucide-react';

interface EntityDetailPanelProps {
  entityId: string;
  onClose: () => void;
  onNavigateToEntity?: (entityId: string) => void;
}

export function EntityDetailPanel({ entityId, onClose, onNavigateToEntity }: EntityDetailPanelProps) {
  const { currentTenant } = useTenant();
  const [cardData, setCardData] = useState<EntityCardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!currentTenant?.id || !entityId) return;

    setIsLoading(true);
    getEntityCard(currentTenant.id, entityId)
      .then(data => setCardData(data))
      .catch(() => setCardData(null))
      .finally(() => setIsLoading(false));
  }, [currentTenant?.id, entityId]);

  if (isLoading) {
    return (
      <div style={{ width: '320px', borderLeft: '1px solid rgba(39, 39, 42, 0.6)', background: '#0a0e1a', padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#71717a', fontSize: '13px' }}>Loading...</div>
      </div>
    );
  }

  if (!cardData) {
    return (
      <div style={{ width: '320px', borderLeft: '1px solid rgba(39, 39, 42, 0.6)', background: '#0a0e1a', padding: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#71717a', fontSize: '13px' }}>Entity not found</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
            <X size={16} style={{ color: '#71717a' }} />
          </button>
        </div>
      </div>
    );
  }

  const { entity, relatedEntities, outcomes, ruleSetAssignments } = cardData;

  const statusColor = entity.status === 'active'
    ? '#34d399'
    : entity.status === 'proposed'
      ? '#fbbf24'
      : '#71717a';

  const statusBg = entity.status === 'active'
    ? 'rgba(16, 185, 129, 0.15)'
    : entity.status === 'proposed'
      ? 'rgba(245, 158, 11, 0.15)'
      : 'rgba(113, 113, 122, 0.15)';

  return (
    <div style={{ width: '320px', borderLeft: '1px solid rgba(39, 39, 42, 0.6)', background: '#0a0e1a', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ position: 'sticky', top: 0, background: '#0a0e1a', borderBottom: '1px solid rgba(39, 39, 42, 0.6)', padding: '16px', zIndex: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ color: '#e2e8f0', fontSize: '15px', fontWeight: 600, margin: 0 }}>{entity.display_name}</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
              <span style={{ color: '#818cf8', fontSize: '10px', fontWeight: 500, padding: '2px 8px', border: '1px solid rgba(99, 102, 241, 0.3)', borderRadius: '4px' }}>
                {entity.entity_type}
              </span>
              <span style={{ color: statusColor, fontSize: '10px', fontWeight: 500, padding: '2px 8px', background: statusBg, borderRadius: '4px' }}>
                {entity.status}
              </span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
            <X size={16} style={{ color: '#71717a' }} />
          </button>
        </div>
      </div>

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Identity */}
        <div style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)', borderRadius: '8px', padding: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
            <ExternalLink size={12} style={{ color: '#71717a' }} />
            <span style={{ color: '#71717a', fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Identity</span>
          </div>
          {entity.external_id && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ color: '#71717a', fontSize: '12px' }}>External ID</span>
              <span style={{ color: '#e2e8f0', fontSize: '11px', fontFamily: 'monospace' }}>{entity.external_id}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ color: '#71717a', fontSize: '12px' }}>Type</span>
            <span style={{ color: '#e2e8f0', fontSize: '12px' }}>{entity.entity_type}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#71717a', fontSize: '12px' }}>Status</span>
            <span style={{ color: statusColor, fontSize: '12px' }}>{entity.status}</span>
          </div>
        </div>

        {/* Relationships — clickable to navigate */}
        <div style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)', borderRadius: '8px', padding: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
            <GitBranch size={12} style={{ color: '#71717a' }} />
            <span style={{ color: '#71717a', fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Relationships ({relatedEntities.length})
            </span>
          </div>
          {relatedEntities.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {relatedEntities.map((rel, i) => {
                const isAI = rel.relationship.source === 'ai_inferred';
                return (
                  <button
                    key={i}
                    onClick={() => rel.relatedEntity && onNavigateToEntity?.(rel.relatedEntity.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 8px',
                      borderRadius: '4px',
                      background: 'rgba(15, 23, 42, 0.5)',
                      border: '1px solid rgba(39, 39, 42, 0.3)',
                      cursor: rel.relatedEntity ? 'pointer' : 'default',
                      textAlign: 'left',
                      width: '100%',
                      transition: 'background 0.15s',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#e2e8f0', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {rel.relatedEntity?.display_name || 'Unknown'}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                        <span style={{ color: '#71717a', fontSize: '10px' }}>
                          {rel.direction === 'outgoing' ? '→' : '←'} {rel.relationship.relationship_type}
                        </span>
                        {isAI && (
                          <span style={{ color: '#fbbf24', fontSize: '9px', fontWeight: 500 }}>
                            AI {(rel.relationship.confidence * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>
                    </div>
                    {rel.relatedEntity && (
                      <ArrowUpRight size={12} style={{ color: '#52525b', flexShrink: 0 }} />
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div style={{ color: '#52525b', fontSize: '12px' }}>No relationships</div>
          )}
        </div>

        {/* Outcomes */}
        {outcomes && (
          <div style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)', borderRadius: '8px', padding: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <Clock size={12} style={{ color: '#71717a' }} />
              <span style={{ color: '#71717a', fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Latest Outcomes</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ color: '#71717a', fontSize: '12px' }}>Total Payout</span>
              <span style={{ color: '#e2e8f0', fontSize: '14px', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                ${outcomes.total_payout.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#71717a', fontSize: '12px' }}>Period</span>
              <span style={{ color: '#94a3b8', fontSize: '11px' }}>{outcomes.period_id.slice(0, 8)}</span>
            </div>
          </div>
        )}

        {/* Rule Set Assignments */}
        {ruleSetAssignments.length > 0 && (
          <div style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)', borderRadius: '8px', padding: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <Shield size={12} style={{ color: '#71717a' }} />
              <span style={{ color: '#71717a', fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Rule Set Assignments</span>
            </div>
            {ruleSetAssignments.map((a, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                <span style={{ color: '#94a3b8', fontSize: '11px', fontFamily: 'monospace' }}>{a.rule_set_id.slice(0, 8)}</span>
                {a.effective_from && (
                  <span style={{ color: '#52525b', fontSize: '11px' }}>{a.effective_from}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
