'use client';

/**
 * OB-204 C — User administration console (the surface over the single door).
 * Mounted by /configure/users (scope=tenant) and /admin/users (scope=platform).
 *
 * C.3 THIN-CLIENT RULE: every action calls a Phase A route; this component holds ZERO
 * authorization logic. The list read goes through GET /api/users (server-side service-role +
 * tenant scoping — CLT166-F10 fix), never client RLS. Roles/capabilities are decided server-side.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { Users, Search, UserPlus, MoreHorizontal } from 'lucide-react';

interface ApiUser {
  id: string; displayName: string; email: string; role: string; status: string;
  tenantId: string | null; createdAt: string; lastSignInAt: string | null;
  credentialState: 'invited' | 'active' | 'disabled';
  linkedEntity: { id: string; displayName: string; externalId: string | null } | null;
}
interface RosterEntity { id: string; displayName: string; externalId: string | null; tenantId: string | null }
interface TenantOpt { id: string; name: string }

// non-platform roles assignable from the surface (platform is assigned only by F8 on the platform surface)
const TENANT_ROLES = ['admin', 'manager', 'member', 'viewer'] as const;
const CRED_BADGE: Record<string, string> = {
  active: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  invited: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  disabled: 'bg-zinc-600/30 text-zinc-400 border-zinc-600',
};

export function UserAdminConsole({ scope }: { scope: 'tenant' | 'platform' }) {
  const isPlatform = scope === 'platform';
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [roster, setRoster] = useState<RosterEntity[]>([]);
  const [tenants, setTenants] = useState<TenantOpt[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<string>('');   // platform tenant selector
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [eraseTarget, setEraseTarget] = useState<ApiUser | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = isPlatform && selectedTenant ? `?tenantId=${encodeURIComponent(selectedTenant)}` : '';
      const res = await fetch(`/api/users${qs}`);
      if (!res.ok) { const e = await res.json().catch(() => ({})); toast.error(e.error || 'Failed to load users'); return; }
      const data = await res.json();
      setUsers(data.users ?? []); setRoster(data.roster ?? []); setTenants(data.tenants ?? []);
    } finally { setLoading(false); }
  }, [isPlatform, selectedTenant]);
  useEffect(() => { void load(); }, [load]);

  // thin-client action helper — POSTs a Phase A route, toasts the result, reloads
  const act = async (path: string, body: unknown, ok: string) => {
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(data.error || `Action failed (${res.status})`); return false; }
    toast.success(ok + (data.tempPassword ? ` — temp password: ${data.tempPassword}` : (data.delivery === 'dry_run' ? ' (email dry-run: RESEND key not set)' : '')));
    await load(); return true;
  };

  const changeRole = (u: ApiUser, newRole: string) => act(`/api/users/${u.id}/role`, { newRole }, `Role changed to ${newRole}`);
  const reset = (u: ApiUser) => act(`/api/users/${u.id}/reset`, null, 'Password reset link sent');
  const toggle = (u: ApiUser) => u.credentialState === 'disabled' ? act(`/api/users/${u.id}/enable`, null, 'User enabled') : act(`/api/users/${u.id}/disable`, null, 'User disabled');
  const sendCred = (u: ApiUser, type: string) => act(`/api/users/${u.id}/send-credentials`, { type }, type === 'magiclink' ? 'Sign-in link sent' : 'Invite resent');
  const erase = (u: ApiUser) => act(`/api/users/${u.id}/erase`, null, 'User erased');

  const filtered = useMemo(() => users.filter(u => {
    const s = !search || u.displayName?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase());
    const r = roleFilter === 'all' || u.role === roleFilter;
    return s && r;
  }).sort((a, b) => (a.displayName || a.email).localeCompare(b.displayName || b.email)), [users, search, roleFilter]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100 flex items-center gap-2"><Users className="h-6 w-6" />{isPlatform ? 'Platform Users' : 'Users'}</h1>
          <p className="text-sm text-slate-400 mt-1">{isPlatform ? 'Manage users across every tenant.' : 'Manage platform access for your workspace.'}</p>
        </div>
        <div className="flex items-center gap-3">
          {isPlatform && (
            <Select value={selectedTenant || 'all'} onValueChange={v => setSelectedTenant(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-[200px] bg-slate-800 border-slate-700 text-slate-200"><SelectValue placeholder="All tenants" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tenants</SelectItem>
                {tenants.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <InviteDialog scope={scope} tenants={tenants} selectedTenant={selectedTenant} open={inviteOpen} setOpen={setInviteOpen} onDone={load} />
        </div>
      </div>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-slate-200">User Directory</CardTitle>
          <CardDescription className="text-slate-400">{filtered.length} of {users.length} users</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input placeholder="Search by name or email..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 bg-slate-800 border-slate-700 text-slate-200" />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-[160px] bg-slate-800 border-slate-700 text-slate-200"><SelectValue placeholder="All roles" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                {(isPlatform ? ['platform', ...TENANT_ROLES] : TENANT_ROLES).map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {loading ? <div className="text-center py-8 text-slate-400">Loading users…</div>
            : filtered.length === 0 ? <div className="text-center py-8 text-slate-400">{users.length === 0 ? 'No users for this scope.' : 'No users match your filters.'}</div>
            : (
            <div className="rounded-md border border-slate-800 overflow-hidden">
              <Table>
                <TableHeader><TableRow className="border-slate-800">
                  <TableHead className="text-slate-400">Name</TableHead>
                  <TableHead className="text-slate-400">Email</TableHead>
                  <TableHead className="text-slate-400">Role</TableHead>
                  <TableHead className="text-slate-400">State</TableHead>
                  <TableHead className="text-slate-400">Linked entity</TableHead>
                  <TableHead className="text-slate-400">Last sign-in</TableHead>
                  <TableHead className="text-slate-400 w-10"></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {filtered.map(u => (
                    <TableRow key={u.id} className="border-slate-800 hover:bg-slate-800/30">
                      <TableCell className="text-slate-200 font-medium">{u.displayName || '—'}</TableCell>
                      <TableCell className="text-slate-400 text-sm">{u.email}</TableCell>
                      <TableCell>
                        {u.role === 'platform' ? <Badge variant="secondary" className="bg-purple-500/15 text-purple-300 border-purple-500/30">platform</Badge>
                          : <Select defaultValue={u.role} onValueChange={v => changeRole(u, v)}>
                              <SelectTrigger className="w-[120px] h-7 text-xs bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
                              <SelectContent>{TENANT_ROLES.map(r => <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>)}</SelectContent>
                            </Select>}
                      </TableCell>
                      <TableCell><Badge variant="outline" className={CRED_BADGE[u.credentialState]}>{u.credentialState}</Badge></TableCell>
                      <TableCell className="text-slate-400 text-sm">{u.linkedEntity ? `${u.linkedEntity.displayName}${u.linkedEntity.externalId ? ` (${u.linkedEntity.externalId})` : ''}` : <span className="text-slate-600">—</span>}</TableCell>
                      <TableCell className="text-slate-400 text-sm">{u.lastSignInAt ? new Date(u.lastSignInAt).toLocaleDateString() : <span className="text-slate-600">never</span>}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-slate-900 border-slate-800 text-slate-200">
                            <DropdownMenuItem onClick={() => reset(u)}>Send password reset (F4)</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => sendCred(u, 'invite_resend')}>Resend invite (F9)</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => sendCred(u, 'magiclink')}>Send sign-in link (F9)</DropdownMenuItem>
                            <DropdownMenuSeparator className="bg-slate-800" />
                            <DropdownMenuItem onClick={() => toggle(u)}>{u.credentialState === 'disabled' ? 'Enable (F6)' : 'Disable (F6)'}</DropdownMenuItem>
                            <DropdownMenuSeparator className="bg-slate-800" />
                            <DropdownMenuItem disabled={u.credentialState !== 'disabled'} className="text-rose-400 focus:text-rose-300" onClick={() => setEraseTarget(u)}>Erase (F10)</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* F7 roster — entities without platform access */}
      {roster.length > 0 && (
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-slate-200">Entities without platform access</CardTitle>
            <CardDescription className="text-slate-400">{roster.length} roster {roster.length === 1 ? 'entity' : 'entities'} not yet linked to a user — promote to grant access (F7).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {roster.slice(0, 50).map(e => (
              <div key={e.id} className="flex items-center justify-between rounded border border-slate-800 px-3 py-2">
                <span className="text-sm text-slate-300">{e.displayName}{e.externalId ? <span className="text-slate-500 ml-1">({e.externalId})</span> : null}</span>
                <PromoteButton entity={e} tenantId={(isPlatform ? selectedTenant : '') || e.tenantId || ''} onDone={load} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* F10 erase confirmation — names destroyed vs retained */}
      <AlertDialog open={!!eraseTarget} onOpenChange={o => { if (!o) setEraseTarget(null); }}>
        <AlertDialogContent className="bg-slate-900 border-slate-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-100">Erase this user?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              This is irreversible. <b className="text-slate-200">Destroyed:</b> sign-in identity, name, and email (anonymized).{' '}
              <b className="text-slate-200">Retained (tombstone):</b> the uuid row and audit history, with all PII nulled — required for compliance. The user can no longer authenticate.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 border-slate-700 text-slate-200">Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 hover:bg-rose-500" onClick={() => { if (eraseTarget) void erase(eraseTarget); setEraseTarget(null); }}>Erase permanently</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PromoteButton({ entity, tenantId, onDone }: { entity: RosterEntity; tenantId: string; onDone: () => void }) {
  const [role, setRole] = useState('member');
  const promote = async () => {
    const res = await fetch('/api/users', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `${entity.externalId || entity.id}@roster.invalid`, displayName: entity.displayName, role, tenantId, entityId: entity.id, mode: 'invite' }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(data.error || 'Promote failed'); return; }
    toast.success(`Promoted ${entity.displayName} as ${role}`); onDone();
  };
  return (
    <div className="flex items-center gap-2">
      <Select value={role} onValueChange={setRole}>
        <SelectTrigger className="w-[110px] h-7 text-xs bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
        <SelectContent>{TENANT_ROLES.map(r => <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>)}</SelectContent>
      </Select>
      <Button size="sm" variant="secondary" className="h-7" onClick={promote} disabled={!tenantId}>Promote</Button>
    </div>
  );
}

function InviteDialog({ scope, tenants, selectedTenant, open, setOpen, onDone }: { scope: 'tenant' | 'platform'; tenants: TenantOpt[]; selectedTenant: string; open: boolean; setOpen: (o: boolean) => void; onDone: () => void }) {
  const isPlatform = scope === 'platform';
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState(isPlatform ? 'platform' : 'member');
  const [tenantId, setTenantId] = useState(selectedTenant);
  useEffect(() => { setTenantId(selectedTenant); }, [selectedTenant]);

  const submit = async () => {
    const isPlatformRole = role === 'platform';
    const body = { email, displayName, role, tenantId: isPlatformRole ? null : (tenantId || null), mode: 'invite' };
    const res = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(data.error || 'Invite failed'); return; }
    toast.success(`Invited ${email}${data.delivery === 'dry_run' ? ' (email dry-run)' : ''}`);
    setEmail(''); setDisplayName(''); setOpen(false); onDone();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button className="gap-2"><UserPlus className="h-4 w-4" />{isPlatform ? 'Invite platform user' : 'Invite user'}</Button></DialogTrigger>
      <DialogContent className="bg-slate-900 border-slate-800">
        <DialogHeader><DialogTitle className="text-slate-100">{isPlatform ? 'Invite platform user (F8)' : 'Invite user (F1)'}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div><Label className="text-slate-300">Email</Label><Input value={email} onChange={e => setEmail(e.target.value)} className="bg-slate-800 border-slate-700 text-slate-200" placeholder="name@company.com" /></div>
          <div><Label className="text-slate-300">Display name</Label><Input value={displayName} onChange={e => setDisplayName(e.target.value)} className="bg-slate-800 border-slate-700 text-slate-200" /></div>
          <div><Label className="text-slate-300">Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200"><SelectValue /></SelectTrigger>
              <SelectContent>
                {isPlatform && <SelectItem value="platform">platform</SelectItem>}
                {TENANT_ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {isPlatform && role !== 'platform' && (
            <div><Label className="text-slate-300">Tenant</Label>
              <Select value={tenantId} onValueChange={setTenantId}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200"><SelectValue placeholder="Select tenant" /></SelectTrigger>
                <SelectContent>{tenants.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!email || !displayName || (!isPlatform && !tenantId) || (isPlatform && role !== 'platform' && !tenantId)}>Send invite</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
