'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  MapPin,
  ArrowLeft,
  DollarSign,
  TrendingUp,
  Users,
  Clock,
  ChevronRight,
} from 'lucide-react';
import { EntityService } from '@/lib/financial/entity-service';
import { FinancialService } from '@/lib/financial/financial-service';
import type { FranchiseLocation, PeriodSummary } from '@/lib/financial/types';

interface LocationWithMetrics extends FranchiseLocation {
  metrics?: PeriodSummary;
}

export default function LocationsPage() {
  const [tenantId] = useState('restaurantmx');
  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState<LocationWithMetrics[]>([]);
  const [selectedPeriod] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  useEffect(() => {
    const loadLocations = () => {
      const entityService = new EntityService(tenantId);
      const financialService = new FinancialService(tenantId);

      const locs = entityService.getLocations();

      // Enrich with metrics
      const enriched: LocationWithMetrics[] = locs.map((loc) => {
        const metrics = financialService.getLocationSummary(loc.id, selectedPeriod);
        return { ...loc, metrics };
      });

      // Sort by revenue (descending)
      enriched.sort((a, b) => (b.metrics?.totalRevenue || 0) - (a.metrics?.totalRevenue || 0));

      setLocations(enriched);
      setLoading(false);
    };

    loadLocations();
  }, [tenantId, selectedPeriod]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

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
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Locations</h1>
              <p className="text-gray-600 mt-1">
                {locations.length} locations | Period: {selectedPeriod}
              </p>
            </div>
          </div>
        </div>

        {locations.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <MapPin className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">No Locations Found</h2>
            <p className="text-gray-600 mb-6">
              Import cheque data to discover locations automatically.
            </p>
            <Link
              href="/financial/import"
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Import Data
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {locations.map((location, index) => (
              <div
                key={location.id}
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:border-blue-300 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-100 text-blue-600 font-bold">
                      {index + 1}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        {location.name || location.id}
                      </h3>
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <MapPin className="w-4 h-4" />
                        <span>{location.id}</span>
                        {location.discoveredAt && (
                          <span className="text-gray-400">
                            | Discovered {new Date(location.discoveredAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </div>

                {location.metrics && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-100">
                    <div className="flex items-center gap-3">
                      <DollarSign className="w-5 h-5 text-green-600" />
                      <div>
                        <p className="text-xs text-gray-500">Revenue</p>
                        <p className="font-semibold text-gray-900">
                          ${location.metrics.totalRevenue.toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <TrendingUp className="w-5 h-5 text-blue-600" />
                      <div>
                        <p className="text-xs text-gray-500">Avg Check</p>
                        <p className="font-semibold text-gray-900">
                          ${location.metrics.avgCheck.toFixed(2)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Clock className="w-5 h-5 text-purple-600" />
                      <div>
                        <p className="text-xs text-gray-500">Cheques</p>
                        <p className="font-semibold text-gray-900">
                          {location.metrics.chequeCount.toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Users className="w-5 h-5 text-orange-600" />
                      <div>
                        <p className="text-xs text-gray-500">Guests</p>
                        <p className="font-semibold text-gray-900">
                          {location.metrics.guestCount.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
