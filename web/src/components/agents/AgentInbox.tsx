'use client';

/**
 * AgentInbox — Agent Intelligence Card for Persona Dashboards
 *
 * Displays agent-generated recommendations, alerts, and insights.
 * Filterable by persona. Supports dismiss, read, and action navigation.
 */

import { useState } from 'react';
import { useAgentInbox, type InboxItem } from '@/hooks/useAgentInbox';

interface AgentInboxProps {
  tenantId: string | undefined;
  persona: 'admin' | 'manager' | 'rep';
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#EF4444',
  warning: '#F59E0B',
  info: '#3B82F6',
};

const AGENT_LABELS: Record<string, string> = {
  compensation: 'Compensation Agent',
  coaching: 'Coaching Agent',
  resolution: 'Resolution Agent',
  compliance: 'Compliance Agent',
  expansion: 'Expansion Agent',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function AgentInbox({ tenantId, persona }: AgentInboxProps) {
  const { items, loading, dismiss, markRead, unreadCount } = useAgentInbox(tenantId, persona);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (loading) {
    return (
      <div style={{
        background: '#0F172A',
        border: '1px solid #1E293B',
        borderRadius: '12px',
        padding: '16px',
      }}>
        <div style={{ fontSize: '13px', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>
          Agent Intelligence
        </div>
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div className="animate-spin h-4 w-4 border-2 border-zinc-500 border-t-transparent rounded-full" style={{ margin: '0 auto' }} />
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: '#0F172A',
      border: '1px solid #1E293B',
      borderRadius: '12px',
      padding: '16px',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '12px',
      }}>
        <div style={{ fontSize: '13px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Agent Intelligence
        </div>
        {unreadCount > 0 && (
          <div style={{
            background: '#2D2F8F',
            color: 'white',
            fontSize: '11px',
            fontWeight: 600,
            padding: '2px 8px',
            borderRadius: '10px',
          }}>
            {unreadCount} new
          </div>
        )}
      </div>

      {/* Empty state */}
      {items.length === 0 && (
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <p style={{ fontSize: '13px', color: '#64748B' }}>
            No agent recommendations right now. Agents are monitoring your data.
          </p>
        </div>
      )}

      {/* Items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {items.map((item: InboxItem) => {
          const isExpanded = expandedId === item.id;
          const severityColor = SEVERITY_COLORS[item.severity] || '#3B82F6';

          return (
            <div
              key={item.id}
              onClick={() => {
                setExpandedId(isExpanded ? null : item.id);
                if (!item.read_at) markRead(item.id);
              }}
              style={{
                background: item.read_at ? '#0B1120' : 'rgba(45, 47, 143, 0.08)',
                border: `1px solid ${item.read_at ? '#1E293B' : 'rgba(45, 47, 143, 0.2)'}`,
                borderRadius: '8px',
                padding: '12px',
                cursor: 'pointer',
                transition: 'border-color 0.2s',
              }}
            >
              {/* Top row */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                {/* Severity dot */}
                <div style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: severityColor,
                  flexShrink: 0,
                  marginTop: '5px',
                }} />

                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Title */}
                  <div style={{
                    fontSize: '13px',
                    fontWeight: item.read_at ? 400 : 600,
                    color: '#F8FAFC',
                    lineHeight: '1.4',
                  }}>
                    {item.title}
                  </div>

                  {/* Agent + time */}
                  <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                    {AGENT_LABELS[item.agent_id] || item.agent_id} &middot; {timeAgo(item.created_at)}
                  </div>
                </div>

                {/* Dismiss button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    dismiss(item.id);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#475569',
                    cursor: 'pointer',
                    fontSize: '16px',
                    padding: '0 4px',
                    flexShrink: 0,
                  }}
                >
                  &times;
                </button>
              </div>

              {/* Expanded description + action */}
              {isExpanded && (
                <div style={{ marginTop: '8px', paddingLeft: '18px' }}>
                  <p style={{ fontSize: '12px', color: '#CBD5E1', lineHeight: '1.5', margin: '0 0 8px' }}>
                    {item.description}
                  </p>
                  {item.action_url && item.action_label && (
                    <a
                      href={item.action_url}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        display: 'inline-block',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#E8A838',
                        textDecoration: 'none',
                        padding: '4px 12px',
                        border: '1px solid #E8A838',
                        borderRadius: '6px',
                        transition: 'background 0.2s',
                      }}
                    >
                      {item.action_label}
                    </a>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
