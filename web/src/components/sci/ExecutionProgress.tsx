'use client';

// SCI ExecutionProgress — Step-by-step processing view
// OB-139 Phase 1 — Replaces upload dropzone during execution.
// Zero domain vocabulary. Korean Test applies.

import { Check, XCircle, Loader2, RefreshCw, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AgentType, ContentUnitResult } from '@/lib/sci/sci-types';
import type { ImportFileFailure } from '@/lib/sci/import-failure';
import { useLocale } from '@/contexts/locale-context';
import { useIsVialuce } from '@/hooks/use-is-vialuce';

const CLASSIFICATION_LABELS: Record<AgentType, string> = {
  plan: 'Plan Rules',
  entity: 'Team Roster',
  target: 'Perf. Targets',
  transaction: 'Transaction Data',
  reference: 'Reference Data',
};

export type ItemStatus = 'pending' | 'active' | 'done' | 'failed';

export interface ProgressItem {
  contentUnitId: string;
  tabName: string;
  classification: AgentType;
  status: ItemStatus;
  rowsProcessed?: number;
  error?: string;
  /**
   * HF-248 Phase 3: per-component outcomes for plan-classified items.
   * Rendered under the item row when the plan import was per-component
   * orchestrated. Each entry reports one plan component's validation
   * outcome so the user knows exactly which parts succeeded and which
   * failed (and why).
   */
  componentOutcomes?: Array<{
    id: string;
    name: string;
    status: 'success' | 'failed';
    errClass?: string;
    errMessage?: string;
    violations?: string;
    skippedFromPrior?: boolean;
  }>;
  partialSuccess?: boolean;
  /**
   * HF-295 Part 2: structured, user-understandable failure for a file that stalled or
   * whose interpretation failed. When present, the row renders an explained failure
   * (stage · reason · expected · recommendation · blocks) via i18n — never a raw dump,
   * never an indefinite spinner.
   */
  failure?: ImportFileFailure;
}

interface ExecutionProgressProps {
  items: ProgressItem[];
  isComplete: boolean;
  hasErrors: boolean;
  onRetryFailed?: () => void;
  onContinue?: () => void;
  /** HF-087: Elapsed seconds for the currently processing item */
  elapsedSeconds?: number;
  /** HF-087: Whether retry is in progress (disables button) */
  isRetrying?: boolean;
}

export function ExecutionProgress({
  items,
  isComplete,
  hasErrors,
  onRetryFailed,
  onContinue,
  elapsedSeconds = 0,
  isRetrying = false,
}: ExecutionProgressProps) {
  const isVialuce = useIsVialuce(); // HF-315: SCI import progress → design-spec .card + per-item .tbl + .pill status
  const { t } = useLocale();
  const doneCount = items.filter(i => i.status === 'done').length;
  const failedCount = items.filter(i => i.status === 'failed').length;
  const hasActive = items.some(i => i.status === 'active');
  const totalCount = items.length;
  const totalRows = items
    .filter(i => i.status === 'done')
    .reduce((sum, i) => sum + (i.rowsProcessed || 0), 0);

  const progressPct = totalCount > 0
    ? Math.round(((doneCount + failedCount) / totalCount) * 100)
    : 0;

  const allDone = isComplete && !hasErrors;

  // HF-315: under Vialuce the import flow renders the design-spec vocabulary — a white .card for the
  // header + progress bar, a .card.flush list for per-item rows (DM Mono counts, .pill status), an
  // .insight-style amber error card for retry/continue. Behavior, handlers, key props and every i18n
  // string (t(...)) are reused unchanged. The else-branch below is byte-identical (Dark/Bliss intact).
  if (isVialuce) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Header + progress bar */}
        <div className="card" style={{ marginTop: 0 }}>
          <h2 style={{ fontSize: '15px', fontWeight: 'var(--vl-fw-med)' as unknown as number, color: 'var(--vl-text)', margin: '0 0 4px' }}>
            {allDone ? 'Import complete' : 'Importing'}
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--vl-text-muted)', margin: '0 0 16px' }}>
            {allDone
              ? `${doneCount} content unit${doneCount !== 1 ? 's' : ''} processed successfully.`
              : `Processing ${totalCount} content unit${totalCount !== 1 ? 's' : ''}...`}
          </p>

          {/* Progress bar */}
          <div style={{ height: '6px', background: 'var(--vl-line-soft)', borderRadius: 'var(--vl-r-pill)', overflow: 'hidden', marginBottom: '8px' }}>
            <div
              style={{
                height: '100%',
                borderRadius: 'var(--vl-r-pill)',
                transition: 'all .5s ease-out',
                background: hasErrors && isComplete ? 'var(--vialuce-gold)' : 'var(--vialuce-indigo)',
                width: `${Math.max(progressPct, 2)}%`,
              }}
            />
          </div>

          {/* Progress label */}
          <p style={{ fontFamily: 'var(--vl-font-mono)', fontSize: '11px', color: 'var(--vl-text-soft)', margin: 0 }}>
            {doneCount} of {totalCount}
            {totalRows > 0 && (
              <span> &middot; {totalRows.toLocaleString()} rows committed</span>
            )}
          </p>

          {/* HF-087: Elapsed time + reassurance for long operations */}
          {!allDone && hasActive && elapsedSeconds > 5 && (
            <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <p style={{ fontFamily: 'var(--vl-font-mono)', fontSize: '11px', color: 'var(--vialuce-indigo)', margin: 0 }}>
                Processing... {elapsedSeconds}s elapsed
              </p>
              {elapsedSeconds > 15 && (
                <p style={{ fontSize: '11px', color: 'var(--vl-text-soft)', margin: 0 }}>
                  Plan interpretation may take up to 2 minutes. Please do not close this page.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Per-item list */}
        <div className="card flush" style={{ marginTop: 0 }}>
          {items.map((item, idx) => (
            <div
              key={item.contentUnitId}
              style={{
                borderTop: idx > 0 ? '1px solid var(--vl-line-soft)' : undefined,
                background: item.status === 'done' ? 'var(--vl-success-50)' :
                            item.status === 'failed' ? 'var(--vl-danger-50)' :
                            undefined,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 20px' }}>
                {/* Status icon */}
                <div style={{ width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {item.status === 'pending' && (
                    <div style={{ width: '14px', height: '14px', borderRadius: '50%', border: '2px solid var(--vl-line)' }} />
                  )}
                  {item.status === 'active' && (
                    <Loader2 className="animate-spin" style={{ width: '18px', height: '18px', color: 'var(--vialuce-indigo)' }} />
                  )}
                  {item.status === 'done' && (
                    <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: 'var(--vl-success-50)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Check style={{ width: '12px', height: '12px', color: 'var(--vl-success)' }} />
                    </div>
                  )}
                  {item.status === 'failed' && (
                    <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: 'var(--vl-danger-50)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <XCircle style={{ width: '12px', height: '12px', color: 'var(--vl-danger)' }} />
                    </div>
                  )}
                </div>

                {/* Content — OB-175: show source file alongside tab name */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{
                    fontSize: '13px',
                    color: item.status === 'pending' ? 'var(--vl-text-soft)' :
                           item.status === 'active' ? 'var(--vl-text)' :
                           item.status === 'done' ? 'var(--vl-text-muted)' :
                           'var(--vl-danger)',
                  }}>
                    {item.tabName}
                    {(() => {
                      const parts = item.contentUnitId.split('::');
                      const sf = parts.length >= 2 ? parts[0].replace(/^\d+_\d+_[a-f0-9]{8}_/, '') : null;
                      return sf && sf !== item.tabName ? (
                        <span style={{ color: 'var(--vl-text-soft)', fontSize: '11px', marginLeft: '6px' }}>{sf}</span>
                      ) : null;
                    })()}
                  </span>
                </div>

                {/* Classification */}
                <span style={{ fontSize: '11px', color: 'var(--vl-text-soft)', flexShrink: 0 }}>
                  {CLASSIFICATION_LABELS[item.classification]}
                  {item.partialSuccess && (
                    <span style={{ marginLeft: '6px', color: 'var(--vialuce-gold)' }}>partial</span>
                  )}
                </span>

                {/* Row count / status */}
                <span style={{
                  fontFamily: 'var(--vl-font-mono)',
                  fontSize: '11px',
                  width: '112px',
                  textAlign: 'right',
                  flexShrink: 0,
                  color: item.status === 'done' ? 'var(--vl-text-soft)' :
                         item.status === 'active' ? 'var(--vialuce-indigo)' :
                         item.status === 'failed' ? 'var(--vl-danger)' :
                         'var(--vl-text-soft)',
                }}>
                  {item.status === 'done' && item.rowsProcessed
                    ? `${item.rowsProcessed.toLocaleString()} rows`
                    : item.status === 'active'
                      ? 'processing...'
                      : item.status === 'failed'
                        ? (item.failure ? t(`sci.import.stage.${item.failure.stageKey}`) : (item.error || 'Failed'))
                        : ''}
                </span>
              </div>

              {/* HF-295 Part 2: explained per-file failure. */}
              {item.status === 'failed' && item.failure && (
                <div style={{ padding: '0 20px 14px 48px', display: 'flex', flexDirection: 'column', gap: '6px', borderLeft: '2px solid var(--vl-danger-50)', marginLeft: '20px' }}>
                  <p style={{ fontSize: '13px', color: 'var(--vl-text)', margin: 0 }}>{t(item.failure.reasonKey)}</p>
                  <p style={{ fontSize: '11px', color: 'var(--vl-text-muted)', margin: 0 }}>{t(item.failure.expectedKey)}</p>
                  <p style={{ fontSize: '11px', color: 'var(--vialuce-gold)', margin: 0 }}>
                    <span style={{ fontWeight: 'var(--vl-fw-med)' as unknown as number }}>{t('sci.import.failure.recommendationLabel')}:</span>{' '}
                    {t(item.failure.recommendationKey)}
                  </p>
                  <p style={{ fontSize: '11px', color: 'var(--vl-text-soft)', margin: 0 }}>
                    {t(item.failure.blocksKey, { successCount: doneCount, totalCount })}
                  </p>
                  {item.failure.technicalDetail && (
                    <details style={{ fontSize: '11px', color: 'var(--vl-text-soft)' }}>
                      <summary style={{ cursor: 'pointer' }}>
                        {t('sci.import.failure.technicalLabel')}
                      </summary>
                      <code style={{ display: 'block', marginTop: '4px', whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: 'var(--vl-text-soft)', fontSize: '11px', fontFamily: 'var(--vl-font-mono)' }}>
                        {item.failure.technicalDetail}
                      </code>
                    </details>
                  )}
                </div>
              )}

              {/* HF-248 Phase 3: per-component outcome rows for plan imports. */}
              {item.componentOutcomes && item.componentOutcomes.length > 0 && (
                <div style={{ padding: '0 20px 12px 48px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {item.componentOutcomes.map(co => (
                    <div key={co.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px' }}>
                      <span style={{ width: '12px', display: 'inline-flex', justifyContent: 'center' }}>
                        {co.status === 'success' ? (
                          <Check style={{ width: '12px', height: '12px', color: 'var(--vl-success)' }} />
                        ) : (
                          <XCircle style={{ width: '12px', height: '12px', color: 'var(--vl-danger)' }} />
                        )}
                      </span>
                      <span style={{
                        flex: 1,
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        color: co.status === 'success' ? 'var(--vl-text-muted)' : 'var(--vl-danger)',
                      }}>
                        {co.name}
                        {co.skippedFromPrior && (
                          <span style={{ marginLeft: '6px', color: 'var(--vl-text-soft)' }}>(reused from prior import)</span>
                        )}
                      </span>
                      {co.status === 'failed' && co.errClass && (
                        <span style={{ color: 'var(--vl-text-soft)', flexShrink: 0 }}>{co.errClass}</span>
                      )}
                      {co.status === 'failed' && co.violations && (
                        <span style={{ color: 'var(--vl-text-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '280px', flexShrink: 0 }} title={co.violations}>
                          {co.violations.slice(0, 60)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Error actions */}
        {isComplete && hasErrors && (
          <div className="card" style={{ marginTop: 0, borderColor: 'var(--vialuce-gold)' }}>
            <p style={{ fontSize: '13px', color: 'var(--vl-text)', margin: '0 0 4px' }}>
              {doneCount} of {totalCount} processed successfully.
            </p>
            {items.filter(i => i.status === 'failed').map(item => (
              <p key={item.contentUnitId} style={{ fontSize: '11px', color: 'var(--vl-danger)', marginTop: '4px', marginBottom: 0 }}>
                {item.tabName} &mdash; {item.failure ? t(item.failure.reasonKey) : (item.error || 'Processing failed')}
              </p>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '16px' }}>
              {onRetryFailed && (
                <Button
                  onClick={onRetryFailed}
                  size="sm"
                  disabled={isRetrying}
                  style={{ background: 'var(--vialuce-gold)', color: '#3a2606' }}
                  className="disabled:opacity-50"
                >
                  <RefreshCw className={cn('w-3.5 h-3.5', isRetrying && 'animate-spin')} />
                  {isRetrying ? 'Retrying...' : 'Retry failed'}
                </Button>
              )}
              {onContinue && doneCount > 0 && (
                <Button
                  onClick={onContinue}
                  variant="ghost"
                  size="sm"
                  style={{ color: 'var(--vl-text-muted)' }}
                >
                  Continue
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header + progress bar */}
      <div className="rounded-xl bg-zinc-900/80 border border-zinc-800 p-6">
        <h2 className="text-base font-medium text-zinc-100 mb-1">
          {allDone ? 'Import complete' : 'Importing'}
        </h2>
        <p className="text-sm text-zinc-500 mb-4">
          {allDone
            ? `${doneCount} content unit${doneCount !== 1 ? 's' : ''} processed successfully.`
            : `Processing ${totalCount} content unit${totalCount !== 1 ? 's' : ''}...`}
        </p>

        {/* Progress bar */}
        <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden mb-2">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500 ease-out',
              hasErrors && isComplete ? 'bg-amber-500' : 'bg-indigo-500'
            )}
            style={{ width: `${Math.max(progressPct, 2)}%` }}
          />
        </div>

        {/* Progress label */}
        <p className="text-xs text-zinc-500 tabular-nums">
          {doneCount} of {totalCount}
          {totalRows > 0 && (
            <span> &middot; {totalRows.toLocaleString()} rows committed</span>
          )}
        </p>

        {/* HF-087: Elapsed time + reassurance for long operations */}
        {!allDone && hasActive && elapsedSeconds > 5 && (
          <div className="mt-3 space-y-1">
            <p className="text-xs text-indigo-400 tabular-nums">
              Processing... {elapsedSeconds}s elapsed
            </p>
            {elapsedSeconds > 15 && (
              <p className="text-xs text-zinc-600">
                Plan interpretation may take up to 2 minutes. Please do not close this page.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Per-item list */}
      <div className="rounded-xl bg-zinc-900/80 border border-zinc-800 divide-y divide-zinc-800/50">
        {items.map(item => (
          <div
            key={item.contentUnitId}
            className={cn(
              item.status === 'done' && 'bg-emerald-500/[0.03]',
              item.status === 'failed' && 'bg-red-500/[0.03]',
            )}
          >
            <div className="flex items-center gap-3 px-5 py-3">
              {/* Status icon */}
              <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                {item.status === 'pending' && (
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-zinc-700" />
                )}
                {item.status === 'active' && (
                  <Loader2 className="w-4.5 h-4.5 text-indigo-400 animate-spin" />
                )}
                {item.status === 'done' && (
                  <div className="w-4.5 h-4.5 rounded-full bg-emerald-500/20 flex items-center justify-center">
                    <Check className="w-3 h-3 text-emerald-400" />
                  </div>
                )}
                {item.status === 'failed' && (
                  <div className="w-4.5 h-4.5 rounded-full bg-red-500/20 flex items-center justify-center">
                    <XCircle className="w-3 h-3 text-red-400" />
                  </div>
                )}
              </div>

              {/* Content — OB-175: show source file alongside tab name */}
              <div className="flex-1 min-w-0">
                <span className={cn(
                  'text-sm',
                  item.status === 'pending' ? 'text-zinc-600' :
                  item.status === 'active' ? 'text-zinc-200' :
                  item.status === 'done' ? 'text-zinc-300' :
                  'text-red-400'
                )}>
                  {item.tabName}
                  {(() => {
                    const parts = item.contentUnitId.split('::');
                    const sf = parts.length >= 2 ? parts[0].replace(/^\d+_\d+_[a-f0-9]{8}_/, '') : null;
                    return sf && sf !== item.tabName ? (
                      <span className="text-zinc-500 text-xs ml-1.5">{sf}</span>
                    ) : null;
                  })()}
                </span>
              </div>

              {/* Classification */}
              <span className="text-xs text-zinc-600 flex-shrink-0">
                {CLASSIFICATION_LABELS[item.classification]}
                {item.partialSuccess && (
                  <span className="ml-1.5 text-amber-400">partial</span>
                )}
              </span>

              {/* Row count / status */}
              <span className={cn(
                'text-xs tabular-nums w-28 text-right flex-shrink-0',
                item.status === 'done' ? 'text-zinc-500' :
                item.status === 'active' ? 'text-indigo-400' :
                item.status === 'failed' ? 'text-red-400' :
                'text-zinc-700'
              )}>
                {item.status === 'done' && item.rowsProcessed
                  ? `${item.rowsProcessed.toLocaleString()} rows`
                  : item.status === 'active'
                    ? 'processing...'
                    : item.status === 'failed'
                      ? (item.failure ? t(`sci.import.stage.${item.failure.stageKey}`) : (item.error || 'Failed'))
                      : ''}
              </span>
            </div>

            {/* HF-295 Part 2: explained per-file failure. Renders when a file stalled or its
                interpretation failed — distinct terminal state, user-understandable, never a
                spinner. Strings via i18n (es-MX for the MIR persona). */}
            {item.status === 'failed' && item.failure && (
              <div className="px-5 pb-3.5 pl-12 space-y-1.5 border-l-2 border-red-500/30 ml-5">
                <p className="text-sm text-zinc-200">{t(item.failure.reasonKey)}</p>
                <p className="text-xs text-zinc-500">{t(item.failure.expectedKey)}</p>
                <p className="text-xs text-amber-300/90">
                  <span className="text-amber-400 font-medium">{t('sci.import.failure.recommendationLabel')}:</span>{' '}
                  {t(item.failure.recommendationKey)}
                </p>
                <p className="text-xs text-zinc-600">
                  {t(item.failure.blocksKey, { successCount: doneCount, totalCount })}
                </p>
                {item.failure.technicalDetail && (
                  <details className="text-xs text-zinc-700">
                    <summary className="cursor-pointer hover:text-zinc-500">
                      {t('sci.import.failure.technicalLabel')}
                    </summary>
                    <code className="block mt-1 whitespace-pre-wrap break-all text-zinc-600 text-[11px]">
                      {item.failure.technicalDetail}
                    </code>
                  </details>
                )}
              </div>
            )}

            {/* HF-248 Phase 3: per-component outcome rows for plan imports.
                Renders only when componentOutcomes is populated (plan
                classification, post-orchestration). Existing single-item
                rows for non-plan classifications are unaffected. */}
            {item.componentOutcomes && item.componentOutcomes.length > 0 && (
              <div className="px-5 pb-3 pl-12 space-y-1">
                {item.componentOutcomes.map(co => (
                  <div key={co.id} className="flex items-center gap-2 text-xs">
                    <span className="w-3 inline-flex justify-center">
                      {co.status === 'success' ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <XCircle className="w-3 h-3 text-red-400" />
                      )}
                    </span>
                    <span className={cn(
                      'flex-1 min-w-0 truncate',
                      co.status === 'success' ? 'text-zinc-400' : 'text-red-400',
                    )}>
                      {co.name}
                      {co.skippedFromPrior && (
                        <span className="ml-1.5 text-zinc-600">(reused from prior import)</span>
                      )}
                    </span>
                    {co.status === 'failed' && co.errClass && (
                      <span className="text-zinc-600 flex-shrink-0">{co.errClass}</span>
                    )}
                    {co.status === 'failed' && co.violations && (
                      <span className="text-zinc-700 truncate max-w-[280px] flex-shrink-0" title={co.violations}>
                        {co.violations.slice(0, 60)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Error actions */}
      {isComplete && hasErrors && (
        <div className="rounded-xl bg-zinc-900/80 border border-amber-500/20 p-5">
          <p className="text-sm text-zinc-300 mb-1">
            {doneCount} of {totalCount} processed successfully.
          </p>
          {items.filter(i => i.status === 'failed').map(item => (
            <p key={item.contentUnitId} className="text-xs text-red-400 mt-1">
              {item.tabName} &mdash; {item.failure ? t(item.failure.reasonKey) : (item.error || 'Processing failed')}
            </p>
          ))}
          <div className="flex items-center gap-3 mt-4">
            {onRetryFailed && (
              <Button
                onClick={onRetryFailed}
                size="sm"
                disabled={isRetrying}
                className="bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-50"
              >
                <RefreshCw className={cn('w-3.5 h-3.5', isRetrying && 'animate-spin')} />
                {isRetrying ? 'Retrying...' : 'Retry failed'}
              </Button>
            )}
            {onContinue && doneCount > 0 && (
              <Button
                onClick={onContinue}
                variant="ghost"
                size="sm"
                className="text-zinc-400 hover:text-zinc-200"
              >
                Continue
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// HELPER: Convert SCIExecution internal state → ProgressItem[]
// ============================================================

export function toProgressItems(
  units: Array<{
    contentUnitId: string;
    tabName: string;
    classification: AgentType;
    status: 'pending' | 'processing' | 'complete' | 'error';
    result?: ContentUnitResult;
    error?: string;
    failure?: ImportFileFailure;
  }>
): ProgressItem[] {
  return units.map(u => ({
    contentUnitId: u.contentUnitId,
    tabName: u.tabName,
    classification: u.classification,
    status: u.status === 'processing' ? 'active' :
            u.status === 'complete' ? 'done' :
            u.status === 'error' ? 'failed' :
            'pending',
    rowsProcessed: u.result?.rowsProcessed,
    error: u.error,
    // HF-295 Part 2: forward the structured failure payload to the render layer.
    failure: u.failure,
    // HF-248 Phase 3: forward per-component outcomes when the plan
    // orchestrator populated them. Falls through to undefined for
    // non-plan classifications.
    componentOutcomes: u.result?.componentOutcomes,
    partialSuccess: u.result?.partialSuccess,
  }));
}
