'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  TrendingUp,
  DollarSign,
  Users,
  MapPin,
  Upload,
  BarChart3,
  Clock,
  Percent,
} from 'lucide-react';
import { getFinancialService } from '@/lib/financial/financial-service';
import { ChequeImportService } from '@/lib/financial/cheque-import-service';

export default function FinancialDashboard() {
  const [loading, setLoading] = useState(true);
  const [tenantId] = useState('restaurantmx');
  const [dashboard, setDashboard] = useState<{
    totalRevenue: number;
    avgCheck: number;
    totalCheques: number;
    totalGuests: number;
    foodBevRatio: number;
    tipRate: number;
    discountRate: number;
    cancellationRate: number;
    locationCount: number;
    staffCount: number;
  } | null>(null);
  const [hasData, setHasData] = useState(false);

  useEffect(() => {
    const loadDashboard = () => {
      const importService = new ChequeImportService(tenantId);
      const cheques = importService.getAllCheques();

      if (cheques.length === 0) {
        setHasData(false);
        setLoading(false);
        return;
      }

      setHasData(true);
      const financialService = getFinancialService(tenantId);
      const summary = financialService.getDashboardSummary();
      setDashboard(summary);
      setLoading(false);
    };

    loadDashboard();
  }, [tenantId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!hasData) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Financial Intelligence</h1>
          <p className="text-gray-600 mb-8">Restaurant franchise performance analytics</p>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <Upload className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">No Data Yet</h2>
            <p className="text-gray-600 mb-6">
              Import your POS cheque data to see financial analytics.
            </p>
            <Link
              href="/financial/import"
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Upload className="w-5 h-5" />
              Import Cheque Data
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const metrics = [
    {
      label: 'Total Revenue',
      value: `$${dashboard?.totalRevenue.toLocaleString()} MXN`,
      icon: DollarSign,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
    },
    {
      label: 'Average Check',
      value: `$${dashboard?.avgCheck.toFixed(2)} MXN`,
      icon: TrendingUp,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
    },
    {
      label: 'Total Cheques',
      value: dashboard?.totalCheques.toLocaleString() || '0',
      icon: Clock,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
    },
    {
      label: 'Total Guests',
      value: dashboard?.totalGuests.toLocaleString() || '0',
      icon: Users,
      color: 'text-orange-600',
      bgColor: 'bg-orange-100',
    },
  ];

  const ratios = [
    {
      label: 'Food:Beverage Ratio',
      value: `${dashboard?.foodBevRatio.toFixed(2)}:1`,
      description: 'Food sales vs beverage sales',
    },
    {
      label: 'Tip Rate',
      value: `${((dashboard?.tipRate || 0) * 100).toFixed(1)}%`,
      description: 'Tips as % of subtotal',
    },
    {
      label: 'Discount Rate',
      value: `${((dashboard?.discountRate || 0) * 100).toFixed(1)}%`,
      description: 'Discounts as % of subtotal',
    },
    {
      label: 'Cancellation Rate',
      value: `${((dashboard?.cancellationRate || 0) * 100).toFixed(1)}%`,
      description: 'Cancelled orders',
    },
  ];

  const quickLinks = [
    { href: '/financial/import', label: 'Import Data', icon: Upload },
    { href: '/financial/locations', label: 'Locations', icon: MapPin, count: dashboard?.locationCount },
    { href: '/financial/performance', label: 'Performance', icon: BarChart3 },
    { href: '/financial/staff', label: 'Staff', icon: Users, count: dashboard?.staffCount },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Financial Intelligence</h1>
          <p className="text-gray-600 mt-1">Restaurant franchise performance analytics</p>
        </div>

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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {ratios.map((ratio) => (
              <div key={ratio.label} className="border border-gray-100 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Percent className="w-4 h-4 text-gray-400" />
                  <span className="text-sm font-medium text-gray-600">{ratio.label}</span>
                </div>
                <p className="text-xl font-bold text-gray-900">{ratio.value}</p>
                <p className="text-xs text-gray-500 mt-1">{ratio.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {quickLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:border-blue-300 hover:shadow-md transition-all group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <link.icon className="w-5 h-5 text-gray-400 group-hover:text-blue-600" />
                  <span className="font-medium text-gray-900">{link.label}</span>
                </div>
                {link.count !== undefined && (
                  <span className="bg-gray-100 text-gray-600 px-2.5 py-0.5 rounded-full text-sm">
                    {link.count}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
