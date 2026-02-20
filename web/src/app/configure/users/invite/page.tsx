'use client';

/**
 * User Invite Page — /configure/users/invite
 *
 * Invite form + unlinked entities table for entity-to-user promotion.
 * SCHEMA_TRUTH.md: entities (profile_id nullable), profiles (auth_user_id, role)
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTenant } from '@/contexts/tenant-context';
import { RequireRole } from '@/components/auth/RequireRole';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  UserPlus, ArrowLeft, Users, Mail, Shield, Link2, Loader2, CheckCircle,
} from 'lucide-react';

interface UnlinkedEntity {
  id: string;
  display_name: string;
  external_id: string | null;
  entity_type: string;
  status: string;
}

const ROLE_OPTIONS = [
  { value: 'tenant_admin', label: 'Tenant Admin', template: 'tenant_admin' },
  { value: 'manager', label: 'Manager', template: 'manager' },
  { value: 'individual', label: 'Viewer', template: 'individual' },
];

function InvitePageInner() {
  const router = useRouter();
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.id || '';

  // Invite form state
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [roleTemplate, setRoleTemplate] = useState('individual');
  const [entityId, setEntityId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Unlinked entities
  const [unlinkedEntities, setUnlinkedEntities] = useState<UnlinkedEntity[]>([]);
  const [loadingEntities, setLoadingEntities] = useState(true);

  const fetchUnlinkedEntities = useCallback(async () => {
    if (!tenantId) return;
    setLoadingEntities(true);
    const supabase = createClient();

    const { data } = await supabase
      .from('entities')
      .select('id, display_name, external_id, entity_type, status')
      .eq('tenant_id', tenantId)
      .is('profile_id', null)
      .eq('entity_type', 'individual')
      .order('display_name');

    setUnlinkedEntities((data || []) as UnlinkedEntity[]);
    setLoadingEntities(false);
  }, [tenantId]);

  useEffect(() => {
    fetchUnlinkedEntities();
  }, [fetchUnlinkedEntities]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !displayName || !tenantId) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/platform/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          displayName,
          tenantId,
          roleTemplate,
          entityId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to invite user');
        setSubmitting(false);
        return;
      }

      setSuccess(`Invited ${email} as ${data.user?.role || roleTemplate}`);
      setEmail('');
      setDisplayName('');
      setEntityId(null);
      setRoleTemplate('individual');
      fetchUnlinkedEntities();
    } catch {
      setError('Network error — please try again');
    }

    setSubmitting(false);
  };

  const handleEntityInvite = (entity: UnlinkedEntity) => {
    setDisplayName(entity.display_name);
    setEntityId(entity.id);
    // Scroll to form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="space-y-6 p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push('/configure/users')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold text-slate-100 flex items-center gap-2">
            <UserPlus className="h-6 w-6" />
            Invite User
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Send an invitation to grant platform access
          </p>
        </div>
      </div>

      {/* Invite Form */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-base text-slate-200">New Invitation</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleInvite} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-slate-300 flex items-center gap-1">
                  <Mail className="h-3.5 w-3.5" /> Email
                </Label>
                <Input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="bg-slate-800 border-slate-700 text-slate-200"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300 flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" /> Display Name
                </Label>
                <Input
                  required
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="Full name"
                  className="bg-slate-800 border-slate-700 text-slate-200"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300 flex items-center gap-1">
                  <Shield className="h-3.5 w-3.5" /> Role
                </Label>
                <Select value={roleTemplate} onValueChange={setRoleTemplate}>
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300 flex items-center gap-1">
                  <Link2 className="h-3.5 w-3.5" /> Link to Entity (optional)
                </Label>
                <Select value={entityId || 'none'} onValueChange={v => setEntityId(v === 'none' ? null : v)}>
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                    <SelectValue placeholder="No entity link" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No entity link</SelectItem>
                    {unlinkedEntities.map(e => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.display_name} {e.external_id ? `(${e.external_id})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {error && (
              <div className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded p-3">{error}</div>
            )}
            {success && (
              <div className="text-sm text-emerald-400 bg-emerald-900/20 border border-emerald-800 rounded p-3 flex items-center gap-2">
                <CheckCircle className="h-4 w-4" /> {success}
              </div>
            )}

            <Button type="submit" disabled={submitting || !email || !displayName} className="gap-2">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              {submitting ? 'Inviting...' : 'Send Invitation'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Unlinked Entities */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-base text-slate-200">Entities Without Platform Access</CardTitle>
          <CardDescription className="text-slate-400">
            People in your data who don&apos;t have a login. Click &quot;Invite&quot; to create their account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingEntities ? (
            <div className="text-center py-6 text-slate-500">Loading entities...</div>
          ) : unlinkedEntities.length === 0 ? (
            <div className="text-center py-6 text-slate-500">
              All individuals have platform access.
            </div>
          ) : (
            <div className="rounded-md border border-slate-800 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-800 hover:bg-slate-800/50">
                    <TableHead className="text-slate-400">Name</TableHead>
                    <TableHead className="text-slate-400">External ID</TableHead>
                    <TableHead className="text-slate-400">Status</TableHead>
                    <TableHead className="text-slate-400 text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unlinkedEntities.slice(0, 50).map(entity => (
                    <TableRow key={entity.id} className="border-slate-800 hover:bg-slate-800/30">
                      <TableCell className="text-slate-200 font-medium">{entity.display_name}</TableCell>
                      <TableCell className="text-slate-400 text-sm">{entity.external_id || '—'}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="bg-slate-800 text-slate-300">
                          {entity.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEntityInvite(entity)}
                          className="text-slate-400 hover:text-slate-200"
                        >
                          <UserPlus className="h-3.5 w-3.5 mr-1" />
                          Invite
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {unlinkedEntities.length > 50 && (
                <div className="px-4 py-2 text-xs text-slate-500 border-t border-slate-800">
                  Showing 50 of {unlinkedEntities.length} unlinked entities
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function InvitePage() {
  return (
    <RequireRole roles={['vl_admin', 'admin']}>
      <InvitePageInner />
    </RequireRole>
  );
}
