'use client';

/**
 * Staff Performance Page
 *
 * Full sortable table showing all staff members with:
 * - Performance index combining revenue, checks, tips
 * - Ranking with movement indicators
 * - Location assignment
 * - Trend sparklines
 *
 * Uses seed data when no real data exists.
 */

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ArrowUp,
  ArrowDown,
  Minus,
  Users,
  DollarSign,
  TrendingUp,
  Award,
  ChevronUp,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import Link from 'next/link';
import { useCurrency } from '@/contexts/tenant-context';
import { LineChart, Line, ResponsiveContainer } from 'recharts';

// Types
interface StaffData {
  id: string;
  name: string;
  role: string;
  locationId: string;
  locationName: string;
  revenue: number;
  checks: number;
  avgCheck: number;
  tips: number;
  tipRate: number;
  performanceIndex: number;
  rank: number;
  prevRank: number;
  weeklyTrend: number[];
}

type SortField = 'rank' | 'name' | 'revenue' | 'checks' | 'avgCheck' | 'tips' | 'tipRate' | 'performanceIndex';

// Seed data generator
function generateSeedStaff(): StaffData[] {
  const staff: StaffData[] = [
    {
      id: 'S001',
      name: 'Maria Garcia',
      role: 'Server',
      locationId: 'LOC001',
      locationName: 'Polanco',
      revenue: 48500,
      checks: 412,
      avgCheck: 117.72,
      tips: 7275,
      tipRate: 15.0,
      performanceIndex: 94,
      rank: 1,
      prevRank: 2,
      weeklyTrend: [42, 45, 48, 51],
    },
    {
      id: 'S002',
      name: 'Carlos Mendez',
      role: 'Server',
      locationId: 'LOC002',
      locationName: 'Condesa',
      revenue: 45200,
      checks: 398,
      avgCheck: 113.57,
      tips: 6780,
      tipRate: 15.0,
      performanceIndex: 91,
      rank: 2,
      prevRank: 1,
      weeklyTrend: [46, 44, 42, 44],
    },
    {
      id: 'S003',
      name: 'Ana Rodriguez',
      role: 'Server',
      locationId: 'LOC001',
      locationName: 'Polanco',
      revenue: 42800,
      checks: 385,
      avgCheck: 111.17,
      tips: 6420,
      tipRate: 15.0,
      performanceIndex: 88,
      rank: 3,
      prevRank: 3,
      weeklyTrend: [40, 41, 43, 43],
    },
    {
      id: 'S004',
      name: 'Luis Hernandez',
      role: 'Bartender',
      locationId: 'LOC003',
      locationName: 'Roma Norte',
      revenue: 38900,
      checks: 520,
      avgCheck: 74.81,
      tips: 5835,
      tipRate: 15.0,
      performanceIndex: 85,
      rank: 4,
      prevRank: 6,
      weeklyTrend: [32, 36, 38, 42],
    },
    {
      id: 'S005',
      name: 'Sofia Martinez',
      role: 'Server',
      locationId: 'LOC002',
      locationName: 'Condesa',
      revenue: 36500,
      checks: 342,
      avgCheck: 106.73,
      tips: 5475,
      tipRate: 15.0,
      performanceIndex: 82,
      rank: 5,
      prevRank: 4,
      weeklyTrend: [38, 36, 35, 36],
    },
    {
      id: 'S006',
      name: 'Diego Torres',
      role: 'Server',
      locationId: 'LOC004',
      locationName: 'Santa Fe',
      revenue: 34200,
      checks: 315,
      avgCheck: 108.57,
      tips: 5130,
      tipRate: 15.0,
      performanceIndex: 79,
      rank: 6,
      prevRank: 5,
      weeklyTrend: [36, 35, 33, 34],
    },
    {
      id: 'S007',
      name: 'Isabella Ruiz',
      role: 'Bartender',
      locationId: 'LOC001',
      locationName: 'Polanco',
      revenue: 31800,
      checks: 425,
      avgCheck: 74.82,
      tips: 4770,
      tipRate: 15.0,
      performanceIndex: 76,
      rank: 7,
      prevRank: 8,
      weeklyTrend: [28, 30, 32, 34],
    },
    {
      id: 'S008',
      name: 'Miguel Sanchez',
      role: 'Server',
      locationId: 'LOC005',
      locationName: 'Coyoacán',
      revenue: 29500,
      checks: 298,
      avgCheck: 98.99,
      tips: 4425,
      tipRate: 15.0,
      performanceIndex: 73,
      rank: 8,
      prevRank: 7,
      weeklyTrend: [30, 29, 28, 29],
    },
  ];

  return staff;
}

export default function StaffPerformancePage() {
  const [sortField, setSortField] = useState<SortField>('rank');
  const [sortAsc, setSortAsc] = useState(true);
  const [locationFilter, setLocationFilter] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  // Seed data
  const staffData = useMemo(() => generateSeedStaff(), []);

  // Get unique locations and roles for filters
  const locations = useMemo(() => {
    const unique = Array.from(new Set(staffData.map(s => s.locationName)));
    return unique.sort();
  }, [staffData]);

  const roles = useMemo(() => {
    const unique = Array.from(new Set(staffData.map(s => s.role)));
    return unique.sort();
  }, [staffData]);

  // Filter and sort
  const filteredStaff = useMemo(() => {
    let filtered = [...staffData];

    if (locationFilter !== 'all') {
      filtered = filtered.filter(s => s.locationName === locationFilter);
    }
    if (roleFilter !== 'all') {
      filtered = filtered.filter(s => s.role === roleFilter);
    }

    filtered.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortAsc
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });

    return filtered;
  }, [staffData, locationFilter, roleFilter, sortField, sortAsc]);

  // Summary stats
  const stats = useMemo(() => {
    const totalRevenue = staffData.reduce((sum, s) => sum + s.revenue, 0);
    const totalTips = staffData.reduce((sum, s) => sum + s.tips, 0);
    const avgPerformance = staffData.reduce((sum, s) => sum + s.performanceIndex, 0) / staffData.length;
    return { totalRevenue, totalTips, avgPerformance, count: staffData.length };
  }, [staffData]);

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(field === 'rank' || field === 'name');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (field !== sortField) return null;
    return sortAsc ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />;
  };

  const RankChange = ({ current, prev }: { current: number; prev: number }) => {
    const diff = prev - current;
    if (diff > 0) {
      return <ArrowUp className="w-4 h-4 text-green-600" />;
    } else if (diff < 0) {
      return <ArrowDown className="w-4 h-4 text-red-600" />;
    }
    return <Minus className="w-4 h-4 text-zinc-500" />;
  };

  const { format } = useCurrency();

  return (
    <div className="p-6 space-y-6">
      {/* Breadcrumbs */}
      <nav className="flex items-center text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">Home</Link>
        <ChevronRight className="h-4 w-4 mx-1" />
        <Link href="/financial" className="hover:text-foreground">Financial</Link>
        <ChevronRight className="h-4 w-4 mx-1" />
        <span className="text-foreground font-medium">Staff</span>
      </nav>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Staff Performance</h1>
        <p className="text-zinc-400">Individual performance rankings and trends</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-zinc-400">Active Staff</p>
                <p className="text-2xl font-bold">{stats.count}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <DollarSign className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-zinc-400">Total Revenue</p>
                <p className="text-2xl font-bold">{format(stats.totalRevenue)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Award className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-zinc-400">Total Tips</p>
                <p className="text-2xl font-bold">{format(stats.totalTips)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg">
                <TrendingUp className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-zinc-400">Avg Performance</p>
                <p className="text-2xl font-bold">{stats.avgPerformance.toFixed(0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle>Staff Rankings</CardTitle>
            <div className="flex gap-3">
              <Select value={locationFilter} onValueChange={setLocationFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Location" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Locations</SelectItem>
                  {locations.map(loc => (
                    <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  {roles.map(role => (
                    <SelectItem key={role} value={role}>{role}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead
                  className="cursor-pointer hover:bg-zinc-800/50 w-20"
                  onClick={() => handleSort('rank')}
                >
                  <div className="flex items-center gap-1">
                    Rank <SortIcon field="rank" />
                  </div>
                </TableHead>
                <TableHead
                  className="cursor-pointer hover:bg-zinc-800/50"
                  onClick={() => handleSort('name')}
                >
                  <div className="flex items-center gap-1">
                    Name <SortIcon field="name" />
                  </div>
                </TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Role</TableHead>
                <TableHead
                  className="cursor-pointer hover:bg-zinc-800/50 text-right"
                  onClick={() => handleSort('revenue')}
                >
                  <div className="flex items-center justify-end gap-1">
                    Revenue <SortIcon field="revenue" />
                  </div>
                </TableHead>
                <TableHead
                  className="cursor-pointer hover:bg-zinc-800/50 text-right"
                  onClick={() => handleSort('checks')}
                >
                  <div className="flex items-center justify-end gap-1">
                    Checks <SortIcon field="checks" />
                  </div>
                </TableHead>
                <TableHead
                  className="cursor-pointer hover:bg-zinc-800/50 text-right"
                  onClick={() => handleSort('avgCheck')}
                >
                  <div className="flex items-center justify-end gap-1">
                    Avg Check <SortIcon field="avgCheck" />
                  </div>
                </TableHead>
                <TableHead className="text-center w-24">Trend</TableHead>
                <TableHead
                  className="cursor-pointer hover:bg-zinc-800/50 text-right"
                  onClick={() => handleSort('tipRate')}
                >
                  <div className="flex items-center justify-end gap-1">
                    Tip % <SortIcon field="tipRate" />
                  </div>
                </TableHead>
                <TableHead
                  className="cursor-pointer hover:bg-zinc-800/50 text-right"
                  onClick={() => handleSort('performanceIndex')}
                >
                  <div className="flex items-center justify-end gap-1">
                    Index <SortIcon field="performanceIndex" />
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredStaff.map((staff) => {
                const trendData = staff.weeklyTrend.map((v, i) => ({ week: i, value: v }));
                const trendUp = staff.weeklyTrend[3] > staff.weeklyTrend[0];

                return (
                  <TableRow key={staff.id}>
                    {/* Rank */}
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm ${
                          staff.rank === 1 ? 'bg-yellow-100 text-yellow-700' :
                          staff.rank === 2 ? 'bg-zinc-700 text-zinc-300' :
                          staff.rank === 3 ? 'bg-orange-100 text-orange-700' :
                          'bg-zinc-800 text-zinc-400'
                        }`}>
                          {staff.rank}
                        </div>
                        <RankChange current={staff.rank} prev={staff.prevRank} />
                      </div>
                    </TableCell>

                    {/* Name */}
                    <TableCell>
                      <div className="font-medium text-zinc-100">{staff.name}</div>
                      <div className="text-xs text-zinc-500">{staff.id}</div>
                    </TableCell>

                    {/* Location */}
                    <TableCell>
                      <Badge variant="outline">{staff.locationName}</Badge>
                    </TableCell>

                    {/* Role */}
                    <TableCell className="text-zinc-400">{staff.role}</TableCell>

                    {/* Revenue */}
                    <TableCell className="text-right font-medium">
                      {format(staff.revenue)}
                    </TableCell>

                    {/* Checks */}
                    <TableCell className="text-right text-zinc-400">
                      {staff.checks}
                    </TableCell>

                    {/* Avg Check */}
                    <TableCell className="text-right text-zinc-400">
                      {format(staff.avgCheck)}
                    </TableCell>

                    {/* Trend Sparkline */}
                    <TableCell>
                      <div className="h-8 w-20">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={trendData}>
                            <Line
                              type="monotone"
                              dataKey="value"
                              stroke={trendUp ? '#22c55e' : '#ef4444'}
                              strokeWidth={2}
                              dot={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </TableCell>

                    {/* Tip Rate */}
                    <TableCell className="text-right">
                      <span className={staff.tipRate >= 15 ? 'text-green-600' : 'text-zinc-400'}>
                        {staff.tipRate.toFixed(1)}%
                      </span>
                    </TableCell>

                    {/* Performance Index */}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 bg-zinc-700 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${
                              staff.performanceIndex >= 90 ? 'bg-green-500' :
                              staff.performanceIndex >= 75 ? 'bg-blue-500' :
                              'bg-amber-500'
                            }`}
                            style={{ width: `${staff.performanceIndex}%` }}
                          />
                        </div>
                        <span className="font-medium w-8">{staff.performanceIndex}</span>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
