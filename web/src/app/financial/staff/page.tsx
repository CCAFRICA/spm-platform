'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Users,
  ArrowLeft,
  DollarSign,
  TrendingUp,
  Award,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { FinancialService } from '@/lib/financial/financial-service';
import { EntityService } from '@/lib/financial/entity-service';
import type { StaffPerformance, StaffMember } from '@/lib/financial/types';

interface EnrichedStaffPerformance extends StaffPerformance {
  staffInfo?: StaffMember;
}

export default function StaffPage() {
  const [tenantId] = useState('restaurantmx');
  const [loading, setLoading] = useState(true);
  const [staffPerformance, setStaffPerformance] = useState<EnrichedStaffPerformance[]>([]);
  const [selectedPeriod] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  useEffect(() => {
    const loadStaff = () => {
      const financialService = new FinancialService(tenantId);
      const entityService = new EntityService(tenantId);

      const performance = financialService.getAllStaffPerformance(selectedPeriod);

      // Enrich with staff info
      const enriched: EnrichedStaffPerformance[] = performance.map((p) => {
        const staffInfo = entityService.getStaffMember(String(p.staffId));
        return { ...p, staffInfo: staffInfo || undefined };
      });

      setStaffPerformance(enriched);
      setLoading(false);
    };

    loadStaff();
  }, [tenantId, selectedPeriod]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Calculate totals
  const totalRevenue = staffPerformance.reduce((sum, p) => sum + p.totalRevenue, 0);
  const totalTips = staffPerformance.reduce((sum, p) => sum + p.totalTips, 0);
  const avgRevenue = staffPerformance.length > 0 ? totalRevenue / staffPerformance.length : 0;

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
          <h1 className="text-3xl font-bold text-gray-900">Staff Leaderboard</h1>
          <p className="text-gray-600 mt-1">
            {staffPerformance.length} staff members | Period: {selectedPeriod}
          </p>
        </div>

        {staffPerformance.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">No Staff Data</h2>
            <p className="text-gray-600 mb-6">
              Import cheque data to see staff performance.
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
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center gap-3 mb-2">
                  <Users className="w-5 h-5 text-blue-600" />
                  <span className="text-sm text-gray-600">Staff Members</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{staffPerformance.length}</p>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center gap-3 mb-2">
                  <DollarSign className="w-5 h-5 text-green-600" />
                  <span className="text-sm text-gray-600">Total Revenue</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">${totalRevenue.toLocaleString()}</p>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center gap-3 mb-2">
                  <TrendingUp className="w-5 h-5 text-purple-600" />
                  <span className="text-sm text-gray-600">Avg Revenue/Staff</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">${avgRevenue.toFixed(0)}</p>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center gap-3 mb-2">
                  <Award className="w-5 h-5 text-yellow-600" />
                  <span className="text-sm text-gray-600">Total Tips</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">${totalTips.toFixed(0)}</p>
              </div>
            </div>

            {/* Leaderboard */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Performance Rankings</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Rank
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Server
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Location
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Revenue
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Avg Check
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Cheques
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Tips
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Tip Rate
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {staffPerformance.map((staff) => {
                      const isAboveAvg = staff.totalRevenue > avgRevenue;
                      return (
                        <tr key={staff.staffId} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                              staff.revenueRank === 1 ? 'bg-yellow-100 text-yellow-700' :
                              staff.revenueRank === 2 ? 'bg-gray-200 text-gray-700' :
                              staff.revenueRank === 3 ? 'bg-orange-100 text-orange-700' :
                              'bg-gray-100 text-gray-600'
                            }`}>
                              {staff.revenueRank}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className="flex-shrink-0 h-10 w-10 bg-gray-200 rounded-full flex items-center justify-center">
                                <Users className="w-5 h-5 text-gray-500" />
                              </div>
                              <div className="ml-4">
                                <div className="text-sm font-medium text-gray-900">
                                  {staff.staffName || `Server #${staff.staffId}`}
                                </div>
                                <div className="text-sm text-gray-500">
                                  ID: {staff.staffId}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {staff.locationId}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <div className="flex items-center justify-end gap-1">
                              <span className="text-sm font-medium text-gray-900">
                                ${staff.totalRevenue.toLocaleString()}
                              </span>
                              {isAboveAvg ? (
                                <ArrowUpRight className="w-4 h-4 text-green-500" />
                              ) : (
                                <ArrowDownRight className="w-4 h-4 text-red-500" />
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                            ${staff.avgCheck.toFixed(2)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-500">
                            {staff.chequeCount}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                            ${staff.totalTips.toFixed(0)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <span className={`text-sm font-medium ${
                              staff.tipRate > 0.12 ? 'text-green-600' :
                              staff.tipRate > 0.08 ? 'text-gray-900' :
                              'text-red-600'
                            }`}>
                              {(staff.tipRate * 100).toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
