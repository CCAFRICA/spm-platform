'use client';

/**
 * Import History — DS-005 ingestion audit trail.
 *
 * Shows all ingestion events for the current tenant with:
 * - Status chain visualization (immutable event progression)
 * - File details (name, size, hash, storage path)
 * - Filtering by status
 * - Timestamp display
 */

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  FileText, CheckCircle, XCircle, AlertTriangle, Clock,
  Hash, HardDrive, Shield, ChevronDown, ChevronRight,
  RefreshCw, Filter,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useTenant } from '@/contexts/tenant-context';
import { cn } from '@/lib/utils';
import { formatFileSize } from '@/lib/ingestion/file-validator';
import { pageVariants } from '@/lib/animations';

// ── Types ──

interface IngestionEvent {
  id: string;
  tenant_id: string;
  status: string;
  file_name: string | null;
  file_size_bytes: number | null;
  file_type: string | null;
  file_hash_sha256: string | null;
  storage_path: string | null;
  uploaded_by_email: string | null;
  uploaded_at: string | null;
  created_at: string;
  record_count: number | null;
  supersedes_event_id: string | null;
  classification_result: unknown | null;
  validation_result: unknown | null;
}

const STATUS_CONFIG: Record<string, { color: string; icon: typeof CheckCircle; label: string }> = {
  received:    { color: 'bg-sky-900/30 text-sky-400 border-sky-800', icon: Clock, label: 'Received' },
  classified:  { color: 'bg-violet-900/30 text-violet-400 border-violet-800', icon: Filter, label: 'Classified' },
  mapped:      { color: 'bg-blue-900/30 text-blue-400 border-blue-800', icon: FileText, label: 'Mapped' },
  validated:   { color: 'bg-emerald-900/30 text-emerald-400 border-emerald-800', icon: Shield, label: 'Validated' },
  committed:   { color: 'bg-emerald-900/30 text-emerald-400 border-emerald-800', icon: CheckCircle, label: 'Committed' },
  quarantined: { color: 'bg-amber-900/30 text-amber-400 border-amber-800', icon: AlertTriangle, label: 'Quarantined' },
  rejected:    { color: 'bg-red-900/30 text-red-400 border-red-800', icon: XCircle, label: 'Rejected' },
};

// ── Component ──

export default function ImportHistoryPage() {
  const { currentTenant } = useTenant();
  const [events, setEvents] = useState<IngestionEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    if (!currentTenant?.id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/ingest/event?tenant_id=${currentTenant.id}&limit=100`);
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
      }
    } catch {
      console.error('[ImportHistory] Failed to fetch events');
    } finally {
      setLoading(false);
    }
  }, [currentTenant?.id]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Group events by file (using supersedes_event_id chain)
  const latestEvents = events.filter(e => {
    // An event is "latest" if no other event supersedes it
    return !events.some(other => other.supersedes_event_id === e.id);
  });

  const filtered = statusFilter
    ? latestEvents.filter(e => e.status === statusFilter)
    : latestEvents;

  // Get the audit chain for an event
  const getChain = (eventId: string): IngestionEvent[] => {
    const chain: IngestionEvent[] = [];
    let current = events.find(e => e.id === eventId);
    while (current) {
      chain.push(current);
      current = current.supersedes_event_id
        ? events.find(e => e.id === current!.supersedes_event_id)
        : undefined;
    }
    return chain;
  };

  // Status counts
  const statusCounts = latestEvents.reduce((acc, e) => {
    acc[e.status] = (acc[e.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      className="p-6"
    >
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">Import History</h1>
            <p className="text-sm text-zinc-500 mt-1">
              Immutable audit trail of all file ingestion events
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchEvents}
            disabled={loading}
            className="gap-2"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            Refresh
          </Button>
        </div>

        {/* Status filter pills */}
        <div className="flex flex-wrap gap-2 mb-4">
          <Button
            variant={statusFilter === null ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter(null)}
            className="text-xs h-7"
          >
            All ({latestEvents.length})
          </Button>
          {Object.entries(statusCounts).map(([status, count]) => {
            const cfg = STATUS_CONFIG[status];
            return (
              <Button
                key={status}
                variant={statusFilter === status ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter(statusFilter === status ? null : status)}
                className="text-xs h-7 gap-1"
              >
                {cfg?.label || status} ({count})
              </Button>
            );
          })}
        </div>

        {/* Events list */}
        {loading && events.length === 0 ? (
          <Card className="border-zinc-800 bg-zinc-900/50">
            <CardContent className="p-8 text-center">
              <RefreshCw className="h-8 w-8 text-zinc-600 animate-spin mx-auto mb-3" />
              <p className="text-zinc-500">Loading ingestion events...</p>
            </CardContent>
          </Card>
        ) : filtered.length === 0 ? (
          <Card className="border-zinc-800 bg-zinc-900/50">
            <CardContent className="p-8 text-center">
              <FileText className="h-8 w-8 text-zinc-600 mx-auto mb-3" />
              <p className="text-zinc-400 font-medium">No import events found</p>
              <p className="text-zinc-600 text-sm mt-1">
                Upload files via the Import page to see events here
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map(event => {
              const cfg = STATUS_CONFIG[event.status] || STATUS_CONFIG.received;
              const StatusIcon = cfg.icon;
              const isExpanded = expandedId === event.id;
              const chain = isExpanded ? getChain(event.id) : [];

              return (
                <Card
                  key={event.id}
                  className="border-zinc-800 bg-zinc-900/50 overflow-hidden"
                >
                  <div
                    className="p-4 cursor-pointer hover:bg-zinc-800/30 transition-colors"
                    onClick={() => setExpandedId(isExpanded ? null : event.id)}
                  >
                    <div className="flex items-center gap-3">
                      <StatusIcon className={cn('h-5 w-5', cfg.color.split(' ')[1])} />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-zinc-200 text-sm truncate">
                            {event.file_name || 'Unknown file'}
                          </span>
                          <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', cfg.color)}>
                            {cfg.label}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500">
                          {event.file_size_bytes && (
                            <span className="flex items-center gap-1">
                              <HardDrive className="h-3 w-3" />
                              {formatFileSize(event.file_size_bytes)}
                            </span>
                          )}
                          {event.uploaded_by_email && (
                            <span>{event.uploaded_by_email}</span>
                          )}
                          <span>
                            {new Date(event.uploaded_at || event.created_at).toLocaleString()}
                          </span>
                          {event.record_count != null && (
                            <span>{event.record_count} records</span>
                          )}
                        </div>
                      </div>

                      {event.file_hash_sha256 && (
                        <span className="hidden md:flex items-center gap-1 text-[10px] text-zinc-600 font-mono">
                          <Hash className="h-3 w-3" />
                          {event.file_hash_sha256.slice(0, 12)}...
                        </span>
                      )}

                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-zinc-500" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-zinc-500" />
                      )}
                    </div>
                  </div>

                  {/* Expanded: audit chain */}
                  {isExpanded && chain.length > 0 && (
                    <div className="border-t border-zinc-800 px-4 py-3 bg-zinc-950/50">
                      <p className="text-xs text-zinc-500 mb-2 font-medium">Audit Chain</p>
                      <div className="space-y-1.5">
                        {chain.map((ce, idx) => {
                          const ceCfg = STATUS_CONFIG[ce.status] || STATUS_CONFIG.received;
                          const CeIcon = ceCfg.icon;
                          return (
                            <div key={ce.id} className="flex items-center gap-2 text-xs">
                              <div className={cn(
                                'w-1.5 h-1.5 rounded-full',
                                idx === 0 ? 'bg-sky-400' : 'bg-zinc-700'
                              )} />
                              <CeIcon className={cn('h-3 w-3', ceCfg.color.split(' ')[1])} />
                              <span className={cn('font-medium', ceCfg.color.split(' ')[1])}>
                                {ceCfg.label}
                              </span>
                              <span className="text-zinc-600 font-mono">{ce.id.slice(0, 8)}</span>
                              <span className="text-zinc-600">
                                {new Date(ce.created_at).toLocaleString()}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      {/* File details */}
                      {event.storage_path && (
                        <div className="mt-3 pt-2 border-t border-zinc-800">
                          <p className="text-[10px] text-zinc-600 font-mono truncate">
                            Storage: {event.storage_path}
                          </p>
                          {event.file_hash_sha256 && (
                            <p className="text-[10px] text-zinc-600 font-mono truncate">
                              SHA-256: {event.file_hash_sha256}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}
