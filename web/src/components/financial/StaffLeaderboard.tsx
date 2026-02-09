'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Trophy, Medal, ArrowRight, Star } from 'lucide-react';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { useAuth } from '@/contexts/auth-context';
import { isCCAdmin } from '@/types/auth';

export interface StaffPerformance {
  id: string;
  name: string;
  role: string;
  locationName: string;
  commissionEarned: number;
  transactionCount: number;
  avgDealSize: number;
  rank: number;
}

interface StaffLeaderboardProps {
  staff?: StaffPerformance[];
  showCount?: number;
  className?: string;
}

// Default demo data
const defaultStaff: StaffPerformance[] = [
  { id: 'emp-001', name: 'Maria Rodriguez', role: 'Senior Associate', locationName: 'Downtown Flagship', commissionEarned: 18750, transactionCount: 124, avgDealSize: 2150, rank: 1 },
  { id: 'emp-002', name: 'James Wilson', role: 'Associate', locationName: 'Westside Mall', commissionEarned: 15420, transactionCount: 98, avgDealSize: 1890, rank: 2 },
  { id: 'emp-003', name: 'Sarah Chen', role: 'Senior Associate', locationName: 'Airport Terminal', commissionEarned: 14280, transactionCount: 87, avgDealSize: 2340, rank: 3 },
  { id: 'emp-004', name: 'Carlos Mendez', role: 'Associate', locationName: 'Harbor Front', commissionEarned: 12650, transactionCount: 76, avgDealSize: 1720, rank: 4 },
  { id: 'emp-005', name: 'Emily Thompson', role: 'Associate', locationName: 'Tech Park', commissionEarned: 11890, transactionCount: 72, avgDealSize: 1650, rank: 5 },
];

export function StaffLeaderboard({ staff, showCount = 5, className = '' }: StaffLeaderboardProps) {
  const { currentTenant } = useTenant();
  const { format } = useCurrency();
  const { user } = useAuth();
  const userIsCCAdmin = user && isCCAdmin(user);
  const isSpanish = userIsCCAdmin ? false : currentTenant?.locale === 'es-MX';

  const displayStaff = useMemo(() => {
    return (staff || defaultStaff).slice(0, showCount);
  }, [staff, showCount]);

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Trophy className="h-4 w-4 text-amber-500" />;
      case 2:
        return <Medal className="h-4 w-4 text-slate-400" />;
      case 3:
        return <Medal className="h-4 w-4 text-amber-700" />;
      default:
        return <span className="text-xs font-bold text-slate-400">#{rank}</span>;
    }
  };

  const getRankBadge = (rank: number) => {
    switch (rank) {
      case 1:
        return 'bg-amber-100 text-amber-700 border-amber-200';
      case 2:
        return 'bg-slate-100 text-slate-600 border-slate-200';
      case 3:
        return 'bg-amber-50 text-amber-700 border-amber-100';
      default:
        return 'bg-slate-50 text-slate-500 border-slate-100';
    }
  };

  return (
    <Card className={`border-0 shadow-lg ${className}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Star className="h-4 w-4 text-slate-500" />
            {isSpanish ? 'Líderes por Comisión' : 'Top Earners'}
          </CardTitle>
          <Link href="/configuration/personnel">
            <Button variant="ghost" size="sm" className="gap-1 text-xs">
              {isSpanish ? 'Ver todos' : 'View all'}
              <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {displayStaff.map((member) => (
            <div
              key={member.id}
              className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
            >
              {/* Rank */}
              <div className={`w-8 h-8 rounded-full flex items-center justify-center border ${getRankBadge(member.rank)}`}>
                {getRankIcon(member.rank)}
              </div>

              {/* Avatar */}
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white text-xs">
                  {member.name.split(' ').map((n) => n[0]).join('').toUpperCase()}
                </AvatarFallback>
              </Avatar>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-900 dark:text-slate-50 truncate">
                  {member.name}
                </p>
                <p className="text-xs text-slate-500 truncate">
                  {member.role} • {member.locationName}
                </p>
              </div>

              {/* Commission */}
              <div className="text-right">
                <p className="font-semibold text-slate-900 dark:text-slate-50">
                  {format(member.commissionEarned)}
                </p>
                <p className="text-xs text-slate-500">
                  {member.transactionCount} {isSpanish ? 'ventas' : 'sales'}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Summary */}
        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">
              {isSpanish ? 'Total comisiones (top 5)' : 'Total commissions (top 5)'}
            </span>
            <span className="font-semibold text-slate-900 dark:text-slate-50">
              {format(displayStaff.reduce((sum, s) => sum + s.commissionEarned, 0))}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
