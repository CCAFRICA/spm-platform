'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  BarChart3,
  ArrowLeft,
  TrendingUp,
  DollarSign,
  Users,
  Clock,
} from 'lucide-react';
import { FinancialService } from '@/lib/financial/financial-service';
import type { PeriodSummary, LocationRanking } from '@/lib/financial/types';

export default function PerformancePage() {
  const [tenantId] = useState('restaurantmx');
  const [loading, setLoading] = useState(true);
  const [networkSummary, setNetworkSummary] = useState<PeriodSummary | null>(null);
  const [revenueRankings, setRevenueRankings] = useState<LocationRanking[]>([]);
  const [avgCheckRankings, setAvgCheckRankings] = useState<LocationRanking[]>([]);
  const [selectedPeriod] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  useEffect(() => {
    const loadPerformance = () => {
      const financialService = new FinancialService(tenantId);

      // Get network summary
      const summary = financialService.getNetworkSummary(selectedPeriod);
      setNetworkSummary(summary);

      // Get rankings
      const revRankings = financialService.getLocationRankings('revenue', selectedPeriod);
      setRevenueRankings(revRankings);

      const avgRankings = financialService.getLocationRankings('avgCheck', selectedPeriod);
      setAvgCheckRankings(avgRankings);

      setLoading(false);
    };

    loadPerformance();
  }, [tenantId, selectedPeriod]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const metrics = networkSummary ? [
    {
      label: 'Total Revenue',
      value: `$${networkSummary.totalRevenue.toLocaleString()}`,
      icon: DollarSign,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
    },
    {
      label: 'Average Check',
      value: `$${networkSummary.avgCheck.toFixed(2)}`,
      icon: TrendingUp,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
    },
    {
      label: 'Total Cheques',
      value: networkSummary.chequeCount.toLocaleString(),
      icon: Clock,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
    },
    {
      label: 'Total Guests',
      value: networkSummary.guestCount.toLocaleString(),
      icon: Users,
      color: 'text-orange-600',
      bgColor: 'bg-orange-100',
    },
  ] : [];

  const ratios = networkSummary ? [
    {
      label: 'Food:Bev Ratio',
      value: `${networkSummary.foodBevRatio.toFixed(2)}:1`,
    },
    {
      label: 'Tip Rate',
      value: `${(networkSummary.tipRate * 100).toFixed(1)}%`,
    },
    {
      label: 'Discount Rate',
      value: `${(networkSummary.discountRate * 100).toFixed(1)}%`,
    },
    {
      label: 'Cancellation Rate',
      value: `${(networkSummary.cancellationRate * 100).toFixed(1)}%`,
    },
  ] : [];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/financial"
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Network Performance</h1>
          <p className="text-gray-600 mt-1">Period: {selectedPeriod}</p>
        </div>

        {!networkSummary || networkSummary.chequeCount === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <BarChart3 className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">No Data for This Period</h2>
            <p className="text-gray-600 mb-6">
              Import cheque data to see performance metrics.
            </p>
            <Link
              href="/financial/import"
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Import Data
            </Link>
          </div>
        ) : (
          <>
            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              {metrics.map((metric) => (
                <div
                  key={metric.label}
                  className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className={`p-3 rounded-lg ${metric.bgColor}`}>
                      <metric.icon className={`w-6 h-6 ${metric.color}`} />
                    </div>
                  </div>
                  <p className="text-sm text-gray-600">{metric.label}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{metric.value}</p>
                </div>
              ))}
            </div>

            {/* Ratios */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Key Ratios</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {ratios.map((ratio) => (
                  <div key={ratio.label} className="text-center p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-600 mb-1">{ratio.label}</p>
                    <p className="text-xl font-bold text-gray-900">{ratio.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Rankings */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Revenue Rankings */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Revenue Rankings</h2>
                <div className="space-y-3">
                  {revenueRankings.slice(0, 5).map((ranking) => (
                    <div
                      key={ranking.locationId}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                          ranking.rank === 1 ? 'bg-yellow-100 text-yellow-700' :
                          ranking.rank === 2 ? 'bg-gray-200 text-gray-700' :
                          ranking.rank === 3 ? 'bg-orange-100 text-orange-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {ranking.rank}
                        </div>
                        <span className="font-medium text-gray-900">
                          {ranking.locationName || ranking.locationId}
                        </span>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-gray-900">
                          ${ranking.value.toLocaleString()}
                        </p>
                        <p className="text-xs text-gray-500">
                          {ranking.percentile}th percentile
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Avg Check Rankings */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Avg Check Rankings</h2>
                <div className="space-y-3">
                  {avgCheckRankings.slice(0, 5).map((ranking) => (
                    <div
                      key={ranking.locationId}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                          ranking.rank === 1 ? 'bg-yellow-100 text-yellow-700' :
                          ranking.rank === 2 ? 'bg-gray-200 text-gray-700' :
                          ranking.rank === 3 ? 'bg-orange-100 text-orange-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {ranking.rank}
                        </div>
                        <span className="font-medium text-gray-900">
                          {ranking.locationName || ranking.locationId}
                        </span>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-gray-900">
                          ${ranking.value.toFixed(2)}
                        </p>
                        <p className="text-xs text-gray-500">
                          Avg: ${ranking.networkAvg.toFixed(2)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
