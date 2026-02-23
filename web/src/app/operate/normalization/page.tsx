'use client';

/**
 * Normalization Review Page
 *
 * Wires articulos data to the normalization engine and provides a review UI.
 * 3-tier display: Auto (green), Suggest (yellow), Manual (red).
 * Accept/reject actions feed the ML Flywheel (dictionary learns).
 */

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  CheckCircle,
  AlertTriangle,
  HelpCircle,
  RefreshCw,
  Download,
  Search,
  Check,
  X,
  BookOpen,
  Zap,
} from 'lucide-react';
import { useTenant } from '@/contexts/tenant-context';
import {
  classifyBatch,
  acceptSuggestion,
  rejectSuggestion,
  getDictionaryStats,
  type NormalizationEntry,
  type NormalizationResult,
} from '@/lib/normalization/normalization-engine';
import { seedNormalizationDictionary, getExpectedSeedCount } from '@/lib/normalization/dictionary-seeder';
import { generateWeekData, storeWeekData, loadWeekData } from '@/lib/demo/frmx-data-generator';
import { parseArticulosFile, extractRawDescriptions } from '@/lib/financial/articulos-parser';

type ReviewTab = 'all' | 'auto' | 'suggest' | 'manual';

export default function NormalizationReviewPage() {
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.id;

  const [result, setResult] = useState<NormalizationResult | null>(null);
  const [entries, setEntries] = useState<NormalizationEntry[]>([]);
  const [activeTab, setActiveTab] = useState<ReviewTab>('all');
  const [loading, setLoading] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState<6 | 7>(6);
  const [dictStats, setDictStats] = useState<ReturnType<typeof getDictionaryStats> | null>(null);
  const [seedCount, setSeedCount] = useState(0);

  // Load dictionary stats on mount
  useEffect(() => {
    if (!tenantId) return;
    setDictStats(getDictionaryStats(tenantId));
  }, [tenantId]);

  // Seed dictionary
  const handleSeedDictionary = useCallback(() => {
    if (!tenantId) return;
    const count = seedNormalizationDictionary(tenantId);
    setSeedCount(count);
    setDictStats(getDictionaryStats(tenantId));
  }, [tenantId]);

  // Generate and classify week data
  const handleClassifyWeek = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      // Check if week data exists, generate if not
      let weekData = loadWeekData(selectedWeek);
      if (!weekData.articulosTSV) {
        const generated = generateWeekData(selectedWeek);
        storeWeekData(selectedWeek, generated);
        weekData = {
          chequesTSV: generated.chequesTSV,
          articulosTSV: generated.articulosTSV,
          stats: generated.stats,
        };
      }

      if (!weekData.articulosTSV) {
        console.error('No articulos data available');
        setLoading(false);
        return;
      }

      // Parse articulos to extract raw descriptions
      const parsed = parseArticulosFile(weekData.articulosTSV, `week${selectedWeek}-articulos.tsv`);
      const rawDescriptions = extractRawDescriptions(parsed.articulos);

      // Run through normalization engine
      const classificationResult = await classifyBatch(tenantId, rawDescriptions);
      setResult(classificationResult);
      setEntries(classificationResult.entries);
    } catch (err) {
      console.error('Classification failed:', err);
    }
    setLoading(false);
  }, [tenantId, selectedWeek]);

  // Accept a suggestion
  const handleAccept = useCallback((entry: NormalizationEntry) => {
    if (!tenantId) return;
    const updated = acceptSuggestion(tenantId, entry, 'admin');
    setEntries(prev => prev.map(e => e.id === entry.id ? updated : e));
    setDictStats(getDictionaryStats(tenantId));
  }, [tenantId]);

  // Reject a suggestion
  const handleReject = useCallback((entry: NormalizationEntry) => {
    const updated = rejectSuggestion(entry, 'admin');
    setEntries(prev => prev.map(e => e.id === entry.id ? updated : e));
  }, []);

  // Filter entries by tab
  const filteredEntries = entries.filter(e => {
    if (activeTab === 'all') return true;
    return e.tier === activeTab;
  });

  const stats = result?.stats;
  const expectedSeeds = getExpectedSeedCount();

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Product Normalization</h1>
        <p className="text-zinc-400 mt-1">
          Classify and standardize messy product descriptions from POS data
        </p>
      </div>

      {/* Dictionary Status + Controls */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              Dictionary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dictStats?.totalEntries || 0}</div>
            <p className="text-xs text-zinc-400">
              entries, {dictStats?.totalHits || 0} total hits
            </p>
            {dictStats && dictStats.totalEntries === 0 && (
              <Button
                size="sm"
                className="mt-2"
                onClick={handleSeedDictionary}
              >
                <Zap className="h-3 w-3 mr-1" />
                Seed Dictionary (~{expectedSeeds} entries)
              </Button>
            )}
            {seedCount > 0 && (
              <p className="text-xs text-green-600 mt-1">
                Seeded {seedCount} entries
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Search className="h-4 w-4" />
              Classify Week
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <select
                value={selectedWeek}
                onChange={(e) => setSelectedWeek(Number(e.target.value) as 6 | 7)}
                className="border rounded px-2 py-1 text-sm"
              >
                <option value={6}>Week 6 (Dec 30 - Jan 5)</option>
                <option value={7}>Week 7 (Jan 6 - Jan 12)</option>
              </select>
              <Button
                size="sm"
                onClick={handleClassifyWeek}
                disabled={loading}
              >
                {loading ? (
                  <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <Download className="h-3 w-3 mr-1" />
                )}
                {loading ? 'Classifying...' : 'Classify'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Classification Stats</CardTitle>
          </CardHeader>
          <CardContent>
            {stats ? (
              <div className="flex gap-3 text-sm">
                <span className="text-green-600 font-medium">
                  {stats.autoClassified} auto
                </span>
                <span className="text-yellow-600 font-medium">
                  {stats.suggested} suggest
                </span>
                <span className="text-red-600 font-medium">
                  {stats.manual} manual
                </span>
              </div>
            ) : (
              <p className="text-sm text-zinc-400">No classification run yet</p>
            )}
            {stats && stats.total > 0 && (
              <p className="text-xs text-zinc-400 mt-1">
                {Math.round((stats.autoClassified / stats.total) * 100)}% auto-resolved
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tier Tabs */}
      {entries.length > 0 && (
        <>
          <div className="flex gap-2">
            {(['all', 'auto', 'suggest', 'manual'] as ReviewTab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? 'bg-zinc-700 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                }`}
              >
                {tab === 'all' ? 'All' : tab === 'auto' ? 'Auto' : tab === 'suggest' ? 'Suggest' : 'Manual'}
                <span className="ml-1 text-xs opacity-70">
                  ({entries.filter(e => tab === 'all' || e.tier === tab).length})
                </span>
              </button>
            ))}
          </div>

          {/* Results Table */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-700 bg-zinc-800/50">
                      <th className="text-left p-3 font-medium">Tier</th>
                      <th className="text-left p-3 font-medium">Raw Value</th>
                      <th className="text-left p-3 font-medium">Normalized</th>
                      <th className="text-left p-3 font-medium">Category</th>
                      <th className="text-left p-3 font-medium">Confidence</th>
                      <th className="text-left p-3 font-medium">Source</th>
                      <th className="text-left p-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEntries.map((entry) => (
                      <tr
                        key={entry.id}
                        className={`border-b border-zinc-700/50 hover:bg-zinc-800/50 ${
                          entry.reviewed ? 'opacity-60' : ''
                        }`}
                      >
                        <td className="p-3">
                          <TierBadge tier={entry.tier} />
                        </td>
                        <td className="p-3 font-mono text-xs max-w-[200px] truncate">
                          {entry.rawValue}
                        </td>
                        <td className="p-3">{entry.normalizedValue}</td>
                        <td className="p-3">
                          <Badge variant="outline" className="text-xs">
                            {entry.category}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <ConfidenceBar confidence={entry.confidence} />
                        </td>
                        <td className="p-3 text-xs text-zinc-400">{entry.source}</td>
                        <td className="p-3">
                          {!entry.reviewed && entry.tier !== 'auto' && (
                            <div className="flex gap-1">
                              <button
                                onClick={() => handleAccept(entry)}
                                className="p-1 rounded hover:bg-green-900/30 text-green-400"
                                title="Accept and learn"
                              >
                                <Check className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleReject(entry)}
                                className="p-1 rounded hover:bg-red-900/30 text-red-400"
                                title="Reject"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          )}
                          {entry.reviewed && (
                            <span className="text-xs text-zinc-400">Reviewed</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredEntries.length === 0 && (
                <div className="text-center py-8 text-zinc-400">
                  No entries in this tier
                </div>
              )}
            </CardContent>
          </Card>

          {/* Dictionary Top Categories */}
          {dictStats && dictStats.topCategories.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Dictionary Coverage by Category</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {dictStats.topCategories.map(cat => (
                    <Badge key={cat.category} variant="secondary">
                      {cat.category}: {cat.count}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Empty State */}
      {entries.length === 0 && !loading && (
        <Card>
          <CardContent className="text-center py-12">
            <Search className="h-12 w-12 mx-auto text-zinc-400 mb-4" />
            <h3 className="text-lg font-medium text-zinc-400">No Classification Results</h3>
            <p className="text-sm text-zinc-400 mt-2">
              {dictStats?.totalEntries === 0
                ? 'Start by seeding the dictionary, then classify a week of data.'
                : 'Select a week and click Classify to run product normalization.'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

function TierBadge({ tier }: { tier: string }) {
  switch (tier) {
    case 'auto':
      return (
        <Badge className="bg-green-900/30 text-green-400 border-green-800/50">
          <CheckCircle className="h-3 w-3 mr-1" />
          Auto
        </Badge>
      );
    case 'suggest':
      return (
        <Badge className="bg-yellow-900/30 text-yellow-400 border-yellow-800/50">
          <AlertTriangle className="h-3 w-3 mr-1" />
          Suggest
        </Badge>
      );
    case 'manual':
      return (
        <Badge className="bg-red-900/30 text-red-400 border-red-800/50">
          <HelpCircle className="h-3 w-3 mr-1" />
          Manual
        </Badge>
      );
    default:
      return <Badge variant="outline">{tier}</Badge>;
  }
}

function ConfidenceBar({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const color = pct >= 90 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-zinc-700 rounded-full">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-zinc-400">{pct}%</span>
    </div>
  );
}
