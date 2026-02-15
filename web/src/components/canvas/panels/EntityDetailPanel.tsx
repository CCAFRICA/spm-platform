'use client';

/**
 * EntityDetailPanel — Right panel showing full entity details (Zoom Level 4)
 *
 * Identity, mini-graph, attributes, rule set assignments, timeline, actions.
 */

import { useState, useEffect } from 'react';
import { useTenant } from '@/contexts/tenant-context';
import { getEntityCard, type EntityCardData } from '@/lib/canvas/graph-service';
import { X, ExternalLink, GitBranch, Clock, Shield } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface EntityDetailPanelProps {
  entityId: string;
  onClose: () => void;
}

export function EntityDetailPanel({ entityId, onClose }: EntityDetailPanelProps) {
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
      <div className="w-80 border-l bg-card p-4 flex items-center justify-center">
        <div className="animate-pulse text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!cardData) {
    return (
      <div className="w-80 border-l bg-card p-4">
        <div className="flex justify-between items-center mb-4">
          <span className="text-sm text-muted-foreground">Entity not found</span>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  const { entity, relationships, outcomes, ruleSetAssignments } = cardData;

  const statusColor = entity.status === 'active'
    ? 'bg-emerald-500/20 text-emerald-700'
    : entity.status === 'proposed'
      ? 'bg-amber-500/20 text-amber-700'
      : 'bg-gray-500/20 text-gray-700';

  const incomingRels = relationships.filter(r => r.target_entity_id === entityId);
  const outgoingRels = relationships.filter(r => r.source_entity_id === entityId);

  return (
    <div className="w-80 border-l bg-card overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 bg-card border-b p-4 z-10">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="font-semibold text-base">{entity.display_name}</h3>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="text-[10px]">
                {entity.entity_type}
              </Badge>
              <Badge className={`text-[10px] ${statusColor}`}>
                {entity.status}
              </Badge>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Identity */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <ExternalLink className="h-3 w-3" />
              Identity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {entity.external_id && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">External ID</span>
                <span className="font-mono text-xs">{entity.external_id}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Type</span>
              <span>{entity.entity_type}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <span>{entity.status}</span>
            </div>
          </CardContent>
        </Card>

        {/* Relationships */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <GitBranch className="h-3 w-3" />
              Relationships ({relationships.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {incomingRels.length > 0 && (
              <div>
                <div className="text-[10px] text-muted-foreground mb-1">Incoming</div>
                {incomingRels.map(rel => (
                  <div key={rel.id} className="text-xs flex justify-between items-center py-0.5">
                    <span className="text-muted-foreground">{rel.relationship_type}</span>
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-[10px]">
                        {(rel.confidence * 100).toFixed(0)}%
                      </span>
                      {rel.source === 'ai_inferred' && (
                        <span className="text-amber-500 text-[9px]">AI</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {outgoingRels.length > 0 && (
              <div>
                <div className="text-[10px] text-muted-foreground mb-1">Outgoing</div>
                {outgoingRels.map(rel => (
                  <div key={rel.id} className="text-xs flex justify-between items-center py-0.5">
                    <span className="text-muted-foreground">{rel.relationship_type}</span>
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-[10px]">
                        {(rel.confidence * 100).toFixed(0)}%
                      </span>
                      {rel.source === 'ai_inferred' && (
                        <span className="text-amber-500 text-[9px]">AI</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {relationships.length === 0 && (
              <div className="text-xs text-muted-foreground">No relationships</div>
            )}
          </CardContent>
        </Card>

        {/* Outcomes */}
        {outcomes && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-3 w-3" />
                Latest Outcomes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total</span>
                <span className="font-semibold">
                  ${outcomes.total_payout.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Period</span>
                <span className="text-xs">{outcomes.period_id}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Rule Set Assignments */}
        {ruleSetAssignments.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Shield className="h-3 w-3" />
                Rule Set Assignments
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {ruleSetAssignments.map((a, i) => (
                <div key={i} className="text-xs flex justify-between">
                  <span className="font-mono truncate">{a.rule_set_id.slice(0, 8)}</span>
                  {a.effective_from && (
                    <span className="text-muted-foreground">{a.effective_from}</span>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
