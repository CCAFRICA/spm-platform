'use client';

/**
 * useAgentInbox — Hook for fetching and managing agent inbox items
 *
 * Fetches from /api/platform/agent-inbox filtered by persona.
 * Provides dismiss and markRead methods.
 */

import { useState, useEffect, useCallback } from 'react';

export interface InboxItem {
  id: string;
  tenant_id: string;
  agent_id: string;
  type: string;
  title: string;
  description: string;
  severity: string;
  action_url: string | null;
  action_label: string | null;
  metadata: Record<string, unknown>;
  persona: string;
  expires_at: string | null;
  read_at: string | null;
  dismissed_at: string | null;
  acted_at: string | null;
  created_at: string;
}

export function useAgentInbox(tenantId: string | undefined, persona: string) {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchItems = useCallback(async () => {
    if (!tenantId) {
      setItems([]);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(
        `/api/platform/agent-inbox?tenantId=${tenantId}&persona=${persona}`,
      );
      if (!res.ok) {
        setItems([]);
        setLoading(false);
        return;
      }
      const data = await res.json();
      setItems(data.items || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, persona]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const dismiss = useCallback(async (itemId: string) => {
    if (!tenantId) return;
    try {
      await fetch('/api/platform/agent-inbox', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: itemId, action: 'dismiss' }),
      });
      setItems(prev => prev.filter(i => i.id !== itemId));
    } catch (err) {
      console.error('Failed to dismiss inbox item:', err);
    }
  }, [tenantId]);

  const markRead = useCallback(async (itemId: string) => {
    if (!tenantId) return;
    try {
      await fetch('/api/platform/agent-inbox', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: itemId, action: 'read' }),
      });
      setItems(prev =>
        prev.map(i => (i.id === itemId ? { ...i, read_at: new Date().toISOString() } : i)),
      );
    } catch (err) {
      console.error('Failed to mark inbox item as read:', err);
    }
  }, [tenantId]);

  const unreadCount = items.filter(i => !i.read_at).length;

  return { items, loading, dismiss, markRead, unreadCount };
}
