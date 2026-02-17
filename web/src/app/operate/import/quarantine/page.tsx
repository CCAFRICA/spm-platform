'use client';

/**
 * Quarantine Resolution UI — DS-005 quarantine management.
 *
 * Shows quarantined files with validation failures and provides
 * three resolution actions:
 * 1. Override & Commit — force-accept despite validation issues
 * 2. Reject & Delete — reject the file permanently
 * 3. Re-upload — return to upload flow
 *
 * Every action generates an audit trail via immutable event progression.
 */

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle, CheckCircle, XCircle, RefreshCw,
  Shield, ChevronDown, ChevronRight,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useTenant } from '@/contexts/tenant-context';
import { cn } from '@/lib/utils';
import { formatFileSize } from '@/lib/ingestion/file-validator';
import { progressEventStatus } from '@/lib/ingestion/upload-service';
import { pageVariants } from '@/lib/animations';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

// ── Types ──

interface QuarantinedEvent {
  id: string;
  file_name: string | null;
  file_size_bytes: number | null;
  file_type: string | null;
  uploaded_by_email: string | null;
  uploaded_at: string | null;
  created_at: string;
  validation_result: ValidationResult | null;
  status: string;
}

interface ValidationResult {
  checks?: Array<{
    id: string;
    name: string;
    result: string;
    message: string;
    severity: string;
    details?: string[];
  }>;
  overallResult?: string;
  criticalFailures?: number;
  warnings?: number;
}

// ── Component ──

export default function QuarantinePage() {
  const { currentTenant } = useTenant();
  const router = useRouter();
  const [events, setEvents] = useState<QuarantinedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);

  const fetchQuarantined = useCallback(async () => {
    if (!currentTenant?.id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/ingest/event?tenant_id=${currentTenant.id}&limit=100`);
      if (res.ok) {
        const data = await res.json();
        const quarantined = (data.events || []).filter(
          (e: QuarantinedEvent) => e.status === 'quarantined'
        );
        setEvents(quarantined);
      }
    } catch {
      console.error('[Quarantine] Failed to fetch events');
    } finally {
      setLoading(false);
    }
  }, [currentTenant?.id]);

  useEffect(() => {
    fetchQuarantined();
  }, [fetchQuarantined]);

  // Override & Commit — force the quarantined file to 'committed'
  const handleOverride = async (eventId: string) => {
    setProcessing(eventId);
    try {
      await progressEventStatus(eventId, 'committed');
      toast.success('File committed', { description: 'Override applied — file accepted.' });
      setEvents(prev => prev.filter(e => e.id !== eventId));
    } catch (err) {
      toast.error('Failed to override', { description: String(err) });
    } finally {
      setProcessing(null);
    }
  };

  // Reject & Delete — mark as 'rejected'
  const handleReject = async (eventId: string) => {
    setProcessing(eventId);
    try {
      await progressEventStatus(eventId, 'rejected');
      toast.success('File rejected', { description: 'File has been permanently rejected.' });
      setEvents(prev => prev.filter(e => e.id !== eventId));
    } catch (err) {
      toast.error('Failed to reject', { description: String(err) });
    } finally {
      setProcessing(null);
    }
  };

  // Re-upload — redirect to import page
  const handleReupload = () => {
    router.push('/operate/import');
  };

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      className="p-6"
    >
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
              <AlertTriangle className="h-6 w-6 text-amber-400" />
              Quarantine
            </h1>
            <p className="text-sm text-zinc-500 mt-1">
              Files that failed structural validation — resolve each one
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchQuarantined}
            disabled={loading}
            className="gap-2"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            Refresh
          </Button>
        </div>

        {/* Empty state */}
        {!loading && events.length === 0 && (
          <Card className="border-zinc-800 bg-zinc-900/50">
            <CardContent className="p-8 text-center">
              <Shield className="h-10 w-10 text-emerald-400 mx-auto mb-3" />
              <p className="text-zinc-300 font-medium">No quarantined files</p>
              <p className="text-zinc-600 text-sm mt-1">All imports passed validation</p>
            </CardContent>
          </Card>
        )}

        {/* Loading */}
        {loading && events.length === 0 && (
          <Card className="border-zinc-800 bg-zinc-900/50">
            <CardContent className="p-8 text-center">
              <RefreshCw className="h-8 w-8 text-zinc-600 animate-spin mx-auto mb-3" />
              <p className="text-zinc-500">Loading quarantined files...</p>
            </CardContent>
          </Card>
        )}

        {/* Quarantined files */}
        <div className="space-y-3">
          {events.map(event => {
            const isExpanded = expandedId === event.id;
            const isProcessing = processing === event.id;
            const vr = event.validation_result;
            const criticals = vr?.criticalFailures ?? 0;
            const warns = vr?.warnings ?? 0;

            return (
              <Card key={event.id} className="border-zinc-800 bg-zinc-900/50 overflow-hidden">
                <div
                  className="p-4 cursor-pointer hover:bg-zinc-800/30 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : event.id)}
                >
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="h-5 w-5 text-amber-400" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-zinc-200 text-sm truncate">
                          {event.file_name || 'Unknown file'}
                        </span>
                        <Badge variant="outline" className="text-[10px] bg-amber-900/30 text-amber-400 border-amber-800">
                          Quarantined
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500">
                        {event.file_size_bytes && (
                          <span>{formatFileSize(event.file_size_bytes)}</span>
                        )}
                        {criticals > 0 && (
                          <span className="text-red-400">{criticals} critical</span>
                        )}
                        {warns > 0 && (
                          <span className="text-amber-400">{warns} warnings</span>
                        )}
                        <span>
                          {new Date(event.uploaded_at || event.created_at).toLocaleString()}
                        </span>
                      </div>
                    </div>
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-zinc-500" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-zinc-500" />
                    )}
                  </div>
                </div>

                {/* Expanded: validation details + actions */}
                {isExpanded && (
                  <div className="border-t border-zinc-800 p-4 bg-zinc-950/50">
                    {/* Validation checks */}
                    {vr?.checks && vr.checks.length > 0 ? (
                      <div className="space-y-2 mb-4">
                        <p className="text-xs text-zinc-500 font-medium mb-2">Validation Results</p>
                        {vr.checks.map((check, idx) => (
                          <div key={idx} className="flex items-start gap-2 text-xs">
                            {check.result === 'pass' ? (
                              <CheckCircle className="h-3.5 w-3.5 text-emerald-400 mt-0.5" />
                            ) : check.result === 'fail' ? (
                              <XCircle className="h-3.5 w-3.5 text-red-400 mt-0.5" />
                            ) : (
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-400 mt-0.5" />
                            )}
                            <div>
                              <span className={cn(
                                'font-medium',
                                check.result === 'pass' && 'text-emerald-400',
                                check.result === 'fail' && 'text-red-400',
                                check.result === 'warn' && 'text-amber-400',
                              )}>
                                {check.name}
                              </span>
                              <span className="text-zinc-500 ml-2">{check.message}</span>
                              {check.details && check.details.length > 0 && (
                                <div className="text-zinc-600 mt-0.5 pl-2">
                                  {check.details.slice(0, 5).map((d, di) => (
                                    <div key={di}>- {d}</div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-zinc-600 mb-4">No detailed validation data available</p>
                    )}

                    {/* Action buttons */}
                    <div className="flex items-center gap-3 pt-3 border-t border-zinc-800">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isProcessing}
                        onClick={(e) => { e.stopPropagation(); handleOverride(event.id); }}
                        className="gap-1.5 text-emerald-400 border-emerald-800 hover:bg-emerald-900/20"
                      >
                        <CheckCircle className="h-3.5 w-3.5" />
                        Override & Commit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isProcessing}
                        onClick={(e) => { e.stopPropagation(); handleReject(event.id); }}
                        className="gap-1.5 text-red-400 border-red-800 hover:bg-red-900/20"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Reject & Delete
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isProcessing}
                        onClick={(e) => { e.stopPropagation(); handleReupload(); }}
                        className="gap-1.5"
                      >
                        <ArrowRight className="h-3.5 w-3.5" />
                        Re-upload
                      </Button>
                      {isProcessing && (
                        <RefreshCw className="h-4 w-4 text-zinc-500 animate-spin" />
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
