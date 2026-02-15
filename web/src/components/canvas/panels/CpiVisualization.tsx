'use client';

/**
 * CpiVisualization — Shows how AI discovered relationships
 *
 * For each AI-proposed relationship, shows the evidence:
 * - Which proximity dimension triggered the inference
 * - The specific data values that matched
 * - The confidence score calculation breakdown
 */

import type { EntityRelationship } from '@/lib/supabase/database.types';
import { Brain, Link2, FileSpreadsheet, Hash, Users, Table2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface CpiVisualizationProps {
  relationships: EntityRelationship[];
}

const PROXIMITY_DIMENSIONS = [
  { key: 'shared_attribute', label: 'Shared Attribute', icon: Link2, description: 'Entities share a field value' },
  { key: 'transactional', label: 'Transactional Co-occurrence', icon: FileSpreadsheet, description: 'Appear in same transaction records' },
  { key: 'sequential', label: 'Sequential Reference', icon: Hash, description: 'One entity\'s output is another\'s input' },
  { key: 'naming', label: 'Naming Convention', icon: Hash, description: 'IDs follow a pattern suggesting hierarchy' },
  { key: 'structural', label: 'Structural Position', icon: Users, description: 'Entity appears in a manager column or header row' },
  { key: 'cross_sheet', label: 'Cross-Sheet Reference', icon: Table2, description: 'Entity ID in one sheet referenced in another' },
];

export function CpiVisualization({ relationships }: CpiVisualizationProps) {
  const aiRelationships = relationships.filter(r => r.source === 'ai_inferred');

  if (aiRelationships.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground text-center">
        <Brain className="h-8 w-8 mx-auto mb-2 opacity-40" />
        <p>No AI-inferred relationships</p>
        <p className="text-xs mt-1">All relationships were human-created or imported</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-4 pt-4">
        <Brain className="h-4 w-4 text-violet-500" />
        <span className="text-sm font-medium">AI Discovery Evidence</span>
      </div>

      <div className="px-4 space-y-2">
        {aiRelationships.map(rel => {
          const evidence = (rel.evidence || {}) as Record<string, unknown>;
          const dimensions = (evidence.dimensions || []) as string[];

          return (
            <Card key={rel.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs flex items-center justify-between">
                  <span className="text-muted-foreground">
                    {rel.relationship_type}
                  </span>
                  <span className="font-mono text-[10px]">
                    {(rel.confidence * 100).toFixed(0)}% confidence
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {dimensions.length > 0 ? (
                  dimensions.map(dim => {
                    const info = PROXIMITY_DIMENSIONS.find(d => d.key === dim);
                    const Icon = info?.icon || Link2;
                    return (
                      <div key={dim} className="flex items-start gap-2 text-xs">
                        <Icon className="h-3 w-3 mt-0.5 text-violet-500 shrink-0" />
                        <div>
                          <span className="font-medium">{info?.label || dim}</span>
                          <p className="text-muted-foreground text-[10px]">
                            {info?.description || 'Proximity dimension'}
                          </p>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-xs text-muted-foreground">
                    Evidence details not available
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
