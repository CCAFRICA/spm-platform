/**
 * DS-006 v2 — SCIProposal Design Target
 * ========================================
 * This is the APPROVED prototype. Production code must match this structure exactly.
 * Data comes from SCI analyze API: SCIProposal.contentUnits[]
 *
 * Layout: vertical stack of ContentUnitCards with summary bar + footer
 */

// ============================================================
// SUMMARY BAR (top of proposal)
// ============================================================
function SummaryBar({ contentUnits, confirmedCount }) {
  const confident = contentUnits.filter(u => u.confidence >= 0.75).length;
  const needsReview = contentUnits.filter(u => u.confidence < 0.6 || u.warnings?.length > 0).length;
  const totalRows = contentUnits.reduce((sum, u) => sum + (u.rowCount || 0), 0);

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg mb-4">
      <div className="flex items-center gap-4 text-sm text-slate-600">
        <span className="font-medium text-green-700">{confident} confident</span>
        <span className="text-slate-300">|</span>
        {needsReview > 0 && (
          <span className="font-medium text-amber-600">{needsReview} need review</span>
        )}
        <span className="text-slate-300">|</span>
        <span>{totalRows.toLocaleString()} total rows</span>
      </div>
      <span className="text-sm text-slate-500">
        {confirmedCount} of {contentUnits.length} confirmed
      </span>
    </div>
  );
}

// ============================================================
// VERDICT BADGE — classification type indicator
// ============================================================
function VerdictBadge({ classification }) {
  const styles = {
    entity:      'bg-blue-100 text-blue-800',
    transaction: 'bg-emerald-100 text-emerald-800',
    target:      'bg-purple-100 text-purple-800',
    plan:        'bg-amber-100 text-amber-800',
    uncertain:   'bg-red-100 text-red-800',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${styles[classification] || styles.uncertain}`}>
      {classification}
    </span>
  );
}

// ============================================================
// CONFIDENCE BAR — visual confidence indicator
// ============================================================
function ConfidenceBar({ confidence }) {
  const pct = Math.round(confidence * 100);
  const color = pct >= 75 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-2 bg-slate-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-500 w-8">{pct}%</span>
    </div>
  );
}

// ============================================================
// CONTENT UNIT CARD — collapsed + expanded states
// ============================================================
function ContentUnitCard({ unit, isConfirmed, onToggleConfirm, isExpanded, onToggleExpand }) {
  const hasCloseScores = unit.allScores?.some(s =>
    s.agent !== unit.classification && s.confidence > unit.confidence - 0.15
  );
  const isSplit = unit.claimType === 'PARTIAL';
  const needsReview = unit.confidence < 0.6 || unit.warnings?.length > 0;

  return (
    <div className={`border rounded-lg mb-2 transition-colors ${
      needsReview ? 'border-amber-300 bg-amber-50/30' :
      isConfirmed ? 'border-green-300 bg-green-50/30' :
      'border-slate-200'
    }`}>
      {/* ---- COLLAPSED ROW (always visible) ---- */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer"
        onClick={onToggleExpand}
      >
        {/* Checkbox */}
        <input
          type="checkbox"
          checked={isConfirmed}
          onChange={(e) => { e.stopPropagation(); onToggleConfirm(); }}
          className="h-4 w-4 rounded border-slate-300"
        />

        {/* Tab name (customer vocabulary) */}
        <span className="font-medium text-slate-900 min-w-[160px]">
          {unit.tabName}
        </span>

        {/* Verdict badge */}
        <VerdictBadge classification={unit.classification} />

        {/* Verdict text (natural language) */}
        <span className="text-sm text-slate-600 flex-1 truncate">
          {unit.verdictSummary || unit.reasoning}
        </span>

        {/* Row count */}
        <span className="text-xs text-slate-400 whitespace-nowrap">
          {(unit.rowCount || 0).toLocaleString()} rows
        </span>

        {/* Confidence bar */}
        <ConfidenceBar confidence={unit.confidence} />

        {/* Expand chevron */}
        <svg
          className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* ---- EXPANDED SECTION (on click) ---- */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-1 border-t border-slate-100 space-y-4">

          {/* Content profile headline */}
          <p className="text-sm text-slate-500">
            {(unit.rowCount || 0).toLocaleString()} rows x{' '}
            {unit.fieldBindings?.length || 0} columns —{' '}
            {unit.fieldBindings?.slice(0, 3).map(b => b.sourceField).join(', ')}...
          </p>

          {/* SECTION: What I observe */}
          <div>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              What I observe
            </h4>
            <ul className="space-y-1">
              {(unit.observations || []).map((obs, i) => (
                <li key={i} className="text-sm text-slate-700 flex items-start gap-2">
                  <span className="text-slate-400 mt-0.5">{'>'}</span>
                  {obs}
                </li>
              ))}
              {/* Field bindings as observations */}
              {(unit.fieldBindings || []).slice(0, 5).map((b, i) => (
                <li key={`fb-${i}`} className="text-sm text-slate-600 flex items-start gap-2">
                  <span className="text-blue-400 mt-0.5">{'>'}</span>
                  <code className="text-xs bg-slate-100 px-1 rounded">{b.sourceField}</code>
                  <span className="text-slate-400">{'->'}</span>
                  <span>{b.displayLabel || b.semanticRole}</span>
                  <span className="text-xs text-slate-400">({Math.round(b.confidence * 100)}%)</span>
                </li>
              ))}
            </ul>
          </div>

          {/* SECTION: Why I chose this classification */}
          <div>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Why I chose this classification
            </h4>
            <p className="text-sm text-slate-700">
              {unit.verdictSummary || unit.reasoning || 'Not available'}
            </p>
          </div>

          {/* SECTION: What would change my mind */}
          <div>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              What would change my mind
            </h4>
            <ul className="space-y-1">
              {(unit.whatChangesMyMind || []).map((w, i) => (
                <li key={i} className="text-sm text-slate-600">{w}</li>
              ))}
              {(!unit.whatChangesMyMind || unit.whatChangesMyMind.length === 0) && (
                <li className="text-sm text-slate-400 italic">Not available</li>
              )}
            </ul>
          </div>

          {/* CLOSE SCORES WARNING (amber box when alt within 15%) */}
          {hasCloseScores && (
            <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
              <p className="text-sm text-amber-800 font-medium">Close classification scores</p>
              <div className="mt-1 space-y-1">
                {unit.allScores
                  .filter(s => s.agent !== unit.classification)
                  .sort((a, b) => b.confidence - a.confidence)
                  .slice(0, 2)
                  .map((s, i) => (
                    <p key={i} className="text-xs text-amber-700">
                      {s.agent}: {Math.round(s.confidence * 100)}% — {s.reasoning}
                    </p>
                  ))}
              </div>
            </div>
          )}

          {/* SPLIT INFO (violet box when sheet is being split) */}
          {isSplit && (
            <div className="bg-violet-50 border border-violet-200 rounded-md p-3">
              <p className="text-sm text-violet-800 font-medium">
                This sheet has been split
              </p>
              <p className="text-xs text-violet-600 mt-1">
                Fields owned by this classification:{' '}
                {(unit.ownedFields || []).join(', ') || 'all'}
              </p>
              {unit.sharedFields?.length > 0 && (
                <p className="text-xs text-violet-600">
                  Shared join keys: {unit.sharedFields.join(', ')}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// FOOTER — bulk confirm + import button
// ============================================================
function ProposalFooter({ contentUnits, confirmedIds, onConfirmAll, onImport }) {
  const allConfirmed = confirmedIds.size === contentUnits.length;
  const totalRows = contentUnits.reduce((sum, u) => sum + (u.rowCount || 0), 0);

  return (
    <div className="flex items-center justify-between px-4 py-3 mt-4 border-t border-slate-200">
      <button
        onClick={onConfirmAll}
        className="text-sm text-slate-600 hover:text-slate-900 underline"
      >
        Confirm all
      </button>
      <button
        onClick={onImport}
        disabled={!allConfirmed}
        className={`px-6 py-2 rounded-lg font-medium text-sm transition-colors ${
          allConfirmed
            ? 'bg-blue-600 text-white hover:bg-blue-700'
            : 'bg-slate-200 text-slate-400 cursor-not-allowed'
        }`}
      >
        Import {totalRows.toLocaleString()} rows
      </button>
    </div>
  );
}

// ============================================================
// MAIN: SCIProposalView — the full DS-006 v2 layout
// ============================================================
export default function SCIProposalView({ proposal, fileName, onConfirmAll, onCancel }) {
  // State: which units are confirmed, which are expanded
  const [confirmedIds, setConfirmedIds] = useState(new Set());
  const [expandedIds, setExpandedIds] = useState(() => {
    // Auto-expand needs-review items
    const autoExpand = new Set();
    proposal.contentUnits.forEach(u => {
      if (u.confidence < 0.6 || u.warnings?.length > 0) {
        autoExpand.add(u.contentUnitId);
      }
    });
    return autoExpand;
  });

  const toggleConfirm = (id) => {
    setConfirmedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleExpand = (id) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const confirmAll = () => {
    setConfirmedIds(new Set(proposal.contentUnits.map(u => u.contentUnitId)));
  };

  const handleImport = () => {
    const confirmed = proposal.contentUnits.filter(u => confirmedIds.has(u.contentUnitId));
    onConfirmAll(confirmed);
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* File header */}
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-900">{fileName}</h2>
        <p className="text-sm text-slate-500">
          {proposal.contentUnits.length} content units detected
        </p>
      </div>

      {/* Summary bar */}
      <SummaryBar
        contentUnits={proposal.contentUnits}
        confirmedCount={confirmedIds.size}
      />

      {/* Content unit cards */}
      <div className="space-y-0">
        {proposal.contentUnits.map(unit => (
          <ContentUnitCard
            key={unit.contentUnitId}
            unit={unit}
            isConfirmed={confirmedIds.has(unit.contentUnitId)}
            onToggleConfirm={() => toggleConfirm(unit.contentUnitId)}
            isExpanded={expandedIds.has(unit.contentUnitId)}
            onToggleExpand={() => toggleExpand(unit.contentUnitId)}
          />
        ))}
      </div>

      {/* Footer */}
      <ProposalFooter
        contentUnits={proposal.contentUnits}
        confirmedIds={confirmedIds}
        onConfirmAll={confirmAll}
        onImport={handleImport}
      />
    </div>
  );
}
