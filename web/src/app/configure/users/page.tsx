'use client';

/**
 * User Management — /configure/users
 *
 * Admin table for managing platform users: view, edit roles, invite.
 * SCHEMA_TRUTH.md: profiles (id, tenant_id, auth_user_id, display_name, email, role, capabilities, created_at, updated_at)
 * Entity linkage: entities.profile_id → profiles.id
 */

import { useState, useEffect, useCallback } from 'react';
import { useTenant } from '@/contexts/tenant-context';
import { RequireRole } from '@/components/auth/RequireRole';
import { loadUsersPageData, type UserRow, type LinkedEntity } from '@/lib/data/page-loaders';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Users, Search, UserPlus, Shield, ChevronDown,
} from 'lucide-react';

const ROLE_LABELS: Record<string, string> = {
  vl_admin: 'Platform Admin',
  admin: 'Admin',
  tenant_admin: 'Tenant Admin',
  manager: 'Manager',
  viewer: 'Viewer',
  sales_rep: 'Sales Rep',
};

const ROLE_COLORS: Record<string, string> = {
  vl_admin: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  admin: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  tenant_admin: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  manager: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  viewer: 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300',
  sales_rep: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
};

function UsersPageInner() {
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.id || '';

  const [users, setUsers] = useState<UserRow[]>([]);
  const [entities, setEntities] = useState<LinkedEntity[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUsers = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const data = await loadUsersPageData(tenantId);
      setUsers(data.users);
      setEntities(data.entities);
    } catch (err) {
      console.warn('[Users] Load failed:', err);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleRoleChange = async (profileId: string, newRole: string) => {
    try {
      const response = await fetch('/api/users/update-role', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId, newRole }),
      });

      if (!response.ok) {
        const err = await response.json();
        alert(`Failed to update role: ${err.error}`);
        return;
      }

      // Update local state
      setUsers(prev => prev.map(u =>
        u.id === profileId ? { ...u, role: newRole } : u
      ));
      setEditingRole(null);
    } catch {
      alert('Failed to update role');
    }
  };

  const getLinkedEntity = (profileId: string) =>
    entities.find(e => e.profile_id === profileId);

  const filteredUsers = users.filter(u => {
    const matchesSearch = !search ||
      u.display_name?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const roleCounts = users.reduce((acc, u) => {
    acc[u.role] = (acc[u.role] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100 flex items-center gap-2">
            <Users className="h-6 w-6" />
            Users
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Manage platform access and permissions
          </p>
        </div>
        <Button
          onClick={() => window.location.href = '/configure/users/invite'}
          className="gap-2"
        >
          <UserPlus className="h-4 w-4" />
          Invite User
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-slate-100">{users.length}</p>
            <p className="text-xs text-slate-400">Total Users</p>
          </CardContent>
        </Card>
        {Object.entries(roleCounts).sort().map(([role, count]) => (
          <Card key={role} className="bg-slate-900 border-slate-800">
            <CardContent className="p-4">
              <p className="text-2xl font-bold text-slate-100">{count}</p>
              <p className="text-xs text-slate-400">{ROLE_LABELS[role] || role}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-slate-200">User Directory</CardTitle>
          <CardDescription className="text-slate-400">
            {filteredUsers.length} of {users.length} users
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search by name or email..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 bg-slate-800 border-slate-700 text-slate-200"
              />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-[180px] bg-slate-800 border-slate-700 text-slate-200">
                <SelectValue placeholder="All Roles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="vl_admin">Platform Admin</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="tenant_admin">Tenant Admin</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
                <SelectItem value="sales_rep">Sales Rep</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          {loading ? (
            <div className="text-center py-8 text-slate-400">Loading users...</div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              {users.length === 0 ? 'No users found for this tenant.' : 'No users match your filters.'}
            </div>
          ) : (
            <div className="rounded-md border border-slate-800 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-800 hover:bg-slate-800/50">
                    <TableHead className="text-slate-400">Name</TableHead>
                    <TableHead className="text-slate-400">Email</TableHead>
                    <TableHead className="text-slate-400">Role</TableHead>
                    <TableHead className="text-slate-400">Linked Entity</TableHead>
                    <TableHead className="text-slate-400">Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((u) => {
                    const linked = getLinkedEntity(u.id);
                    return (
                      <TableRow key={u.id} className="border-slate-800 hover:bg-slate-800/30">
                        <TableCell className="text-slate-200 font-medium">
                          {u.display_name || '—'}
                        </TableCell>
                        <TableCell className="text-slate-400 text-sm">
                          {u.email}
                        </TableCell>
                        <TableCell>
                          {editingRole === u.id ? (
                            <Select
                              defaultValue={u.role}
                              onValueChange={(val) => {
                                handleRoleChange(u.id, val);
                              }}
                            >
                              <SelectTrigger className="w-[150px] h-7 text-xs bg-slate-800 border-slate-700">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="vl_admin">Platform Admin</SelectItem>
                                <SelectItem value="admin">Admin</SelectItem>
                                <SelectItem value="tenant_admin">Tenant Admin</SelectItem>
                                <SelectItem value="manager">Manager</SelectItem>
                                <SelectItem value="viewer">Viewer</SelectItem>
                                <SelectItem value="sales_rep">Sales Rep</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <button
                              onClick={() => setEditingRole(u.id)}
                              className="group flex items-center gap-1"
                            >
                              <Badge variant="secondary" className={ROLE_COLORS[u.role] || ''}>
                                <Shield className="h-3 w-3 mr-1" />
                                {ROLE_LABELS[u.role] || u.role}
                              </Badge>
                              <ChevronDown className="h-3 w-3 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </button>
                          )}
                        </TableCell>
                        <TableCell className="text-slate-400 text-sm">
                          {linked ? (
                            <span className="text-slate-300">
                              {linked.display_name}
                              {linked.external_id && (
                                <span className="text-slate-400 ml-1">({linked.external_id})</span>
                              )}
                            </span>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-slate-400 text-sm">
                          {new Date(u.created_at).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function UsersPage() {
  return (
    <RequireRole roles={['vl_admin', 'admin']}>
      <UsersPageInner />
    </RequireRole>
  );
}
