'use client';

/**
 * ImpactPreviewPanel — Slides in when drag-to-reassign initiated
 *
 * Shows source, target, impact preview, credit model selector, effective date.
 */

import type { ReassignmentDraft } from '../hooks/useCanvasActions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight, Calendar, AlertCircle } from 'lucide-react';

interface ImpactPreviewPanelProps {
  draft: ReassignmentDraft;
  onConfirm: () => void;
  onCancel: () => void;
  onUpdate: (updates: Partial<ReassignmentDraft>) => void;
}

const CREDIT_MODELS = [
  { value: 'full_credit' as const, label: 'Full credit to new parent' },
  { value: 'split_credit' as const, label: 'Split credit (both parents)' },
  { value: 'no_credit' as const, label: 'No credit transfer' },
];

export function ImpactPreviewPanel({
  draft,
  onConfirm,
  onCancel,
  onUpdate,
}: ImpactPreviewPanelProps) {
  return (
    <div className="w-80 border-l bg-card overflow-y-auto">
      <div className="sticky top-0 bg-card border-b p-4 z-10">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-amber-500" />
          Reassignment Preview
        </h3>
      </div>

      <div className="p-4 space-y-4">
        {/* Move details */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm">
              <div className="flex-1">
                <div className="text-xs text-muted-foreground">Moving</div>
                <div className="font-medium truncate">{draft.entity.display_name}</div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1 text-right">
                <div className="text-xs text-muted-foreground">To</div>
                <div className="font-medium truncate">{draft.toParentId.slice(0, 8)}...</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Impact */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Impact</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-1">
            <p>This will change reporting structure.</p>
            <p>Rule set assignments will be reviewed.</p>
          </CardContent>
        </Card>

        {/* Credit model */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Credit Model</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {CREDIT_MODELS.map(model => (
              <label
                key={model.value}
                className="flex items-center gap-2 text-xs cursor-pointer"
              >
                <input
                  type="radio"
                  name="creditModel"
                  checked={draft.creditModel === model.value}
                  onChange={() => onUpdate({ creditModel: model.value })}
                  className="text-primary"
                />
                {model.label}
              </label>
            ))}
          </CardContent>
        </Card>

        {/* Effective date */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Calendar className="h-3 w-3" />
              Effective Date
            </CardTitle>
          </CardHeader>
          <CardContent>
            <input
              type="date"
              value={draft.effectiveDate}
              onChange={(e) => onUpdate({ effectiveDate: e.target.value })}
              className="w-full text-sm border rounded px-2 py-1 bg-background"
            />
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel} className="flex-1" size="sm">
            Cancel
          </Button>
          <Button onClick={onConfirm} className="flex-1" size="sm">
            Confirm
          </Button>
        </div>
      </div>
    </div>
  );
}
