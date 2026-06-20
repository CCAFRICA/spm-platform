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
import { HierarchyReviewPanel } from '@/components/users/HierarchyReviewPanel';
import { useIsVialuce } from '@/hooks/use-is-vialuce';

interface ApiUser {
  id: string; displayName: string; email: string; role: string; status: string;
  tenantId: string | null; createdAt: string; lastSignInAt: string | null;
  credentialState: 'invited' | 'active' | 'disabled';
  linkedEntity: { id: string; displayName: string; externalId: string | null } | null;
}
interface RosterEntity { id: string; displayName: string; externalId: string | null; tenantId: string | null; suggestedEmail: string | null }
interface TenantOpt { id: string; name: string }

// non-platform roles assignable from the surface (platform is assigned only by F8 on the platform surface)
const TENANT_ROLES = ['admin', 'manager', 'member', 'viewer'] as const;
const CRED_BADGE: Record<string, string> = {
  active: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  invited: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  disabled: 'bg-zinc-600/30 text-zinc-400 border-zinc-600',
};

export function UserAdminConsole({ scope }: { scope: 'tenant' | 'platform' }) {
  const isVialuce = useIsVialuce(); // OB-221: directory + roster → .card / .card.flush + .tbl, credential state → .pill, empty → .empty
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
  const [picked, setPicked] = useState<Set<string>>(new Set());   // F.1 roster multi-select
  const [bulkRole, setBulkRole] = useState('member');

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
  const sendCred = (u: ApiUser, type: string) => {
    // D.2 Layer 1 — optional per-send delivery override (blank = user/tenant/env routing).
    const alt = typeof window !== 'undefined' ? window.prompt('Deliver to an alternate email? Leave blank to use the user/tenant routing.') : null;
    return act(`/api/users/${u.id}/send-credentials`, { type, notifyEmail: alt?.trim() || undefined }, type === 'magiclink' ? 'Sign-in link sent' : 'Invite resent');
  };
  const erase = (u: ApiUser) => act(`/api/users/${u.id}/erase`, null, 'User erased');

  // F.1 — bulk promotion: iterated createUser calls through the single door (no batch bypass,
  // per-row atomicity), with a partial-failure report.
  const bulkPromote = async () => {
    const ids = Array.from(picked); if (ids.length === 0) return;
    let ok = 0; const fails: string[] = [];
    for (const id of ids) {
      const e = roster.find(r => r.id === id); if (!e) continue;
      // HF-288: invite email from the import classification; no email in the import → can't bulk-invite
      // (promote individually to enter one). No fabricated placeholder address.
      if (!e.suggestedEmail) { fails.push(`${e.displayName}: no email in import — promote individually to enter one`); continue; }
      const tenantId = (isPlatform ? selectedTenant : '') || e.tenantId || '';
      const res = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: e.suggestedEmail, displayName: e.displayName, role: bulkRole, tenantId, entityId: e.id, mode: 'invite' }) });
      if (res.ok) ok++; else { const d = await res.json().catch(() => ({})); fails.push(`${e.displayName}: ${d.error || res.status}`); }
    }
    setPicked(new Set());
    if (fails.length) { toast.error(`Promoted ${ok}/${ids.length} as ${bulkRole} · ${fails.length} failed (see console)`); console.warn('[bulk promote] failures:', fails); }
    else toast.success(`Promoted ${ok}/${ids.length} as ${bulkRole}`);
    await load();
  };
  const togglePick = (id: string) => setPicked(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const filtered = useMemo(() => users.filter(u => {
    const s = !search || u.displayName?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase());
    const r = roleFilter === 'all' || u.role === roleFilter;
    return s && r;
  }).sort((a, b) => (a.displayName || a.email).localeCompare(b.displayName || b.email)), [users, search, roleFilter]);

  // OB-221 / HF-315: under Vialuce render directory + roster as design-spec cards (.card / .card.flush + .tbl),
  // credential state as .pill, empty/loading as .empty. Shadcn primitives (Select / Dropdown / Dialog /
  // AlertDialog) and all action handlers are reused unchanged. The else-branch below is byte-identical dark.
  const CRED_PILL: Record<string, string> = { active: 'success', invited: 'open', disabled: 'neutral' };
  if (isVialuce) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: 23, fontWeight: 'var(--vl-fw-bold)' as unknown as number, letterSpacing: '-.3px', display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}><Users size={22} />{isPlatform ? 'Platform Users' : 'Users'}</h1>
            <p style={{ fontSize: 13.5, color: 'var(--vl-text-muted)', marginTop: 4 }}>{isPlatform ? 'Manage users across every tenant.' : 'Manage platform access for your workspace.'}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {isPlatform && (
              <Select value={selectedTenant || 'all'} onValueChange={v => setSelectedTenant(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-[200px]"><SelectValue placeholder="All tenants" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All tenants</SelectItem>
                  {tenants.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <InviteDialog scope={scope} tenants={tenants} selectedTenant={selectedTenant} open={inviteOpen} setOpen={setInviteOpen} onDone={load} />
          </div>
        </div>

        <div className="card flush">
          <div className="card-h pad">
            <div>
              <h3>User Directory</h3>
              <div className="csub">{filtered.length} of {users.length} users</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, padding: '14px 20px', borderBottom: '1px solid var(--vl-line-soft)' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', height: 14, width: 14, color: 'var(--vl-text-soft)' }} />
              <input placeholder="Search by name or email..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: '100%', paddingLeft: 32, paddingRight: 12, paddingTop: 7, paddingBottom: 7, fontSize: 12.5, background: 'var(--vl-bg)', border: '1px solid var(--vl-line)', borderRadius: 'var(--vl-r-sm)', color: 'var(--vl-text)', outline: 'none' }} />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="All roles" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                {(isPlatform ? ['platform', ...TENANT_ROLES] : TENANT_ROLES).map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {loading ? <div className="empty"><b>Loading users…</b></div>
            : filtered.length === 0 ? (
              <div className="empty">
                <div className="ic"><Users size={30} /></div>
                <b>{users.length === 0 ? 'No users for this scope.' : 'No users match your filters.'}</b>
              </div>
            )
            : (
            <div style={{ overflowX: 'auto' }}>
              <table className="tbl">
                <thead><tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>State</th>
                  <th>Linked entity</th>
                  <th>Last sign-in</th>
                  <th style={{ width: 40 }}></th>
                </tr></thead>
                <tbody>
                  {filtered.map(u => (
                    <tr key={u.id}>
                      <td className="name">{u.displayName || '—'}</td>
                      <td className="mut">{u.email}</td>
                      <td>
                        {u.role === 'platform' ? <span className="pill open">platform</span>
                          : <Select defaultValue={u.role} onValueChange={v => changeRole(u, v)}>
                              <SelectTrigger className="w-[120px] h-7 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>{TENANT_ROLES.map(r => <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>)}</SelectContent>
                            </Select>}
                      </td>
                      <td><span className={`pill ${CRED_PILL[u.credentialState] || 'neutral'}`}>{u.credentialState}</span></td>
                      <td className="mut">{u.linkedEntity ? `${u.linkedEntity.displayName}${u.linkedEntity.externalId ? ` (${u.linkedEntity.externalId})` : ''}` : <span style={{ color: 'var(--vl-text-soft)' }}>—</span>}</td>
                      <td className="mut">{u.lastSignInAt ? new Date(u.lastSignInAt).toLocaleDateString() : <span style={{ color: 'var(--vl-text-soft)' }}>never</span>}</td>
                      <td>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => reset(u)}>Send password reset (F4)</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => sendCred(u, 'invite_resend')}>Resend invite (F9)</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => sendCred(u, 'magiclink')}>Send sign-in link (F9)</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => toggle(u)}>{u.credentialState === 'disabled' ? 'Enable (F6)' : 'Disable (F6)'}</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem disabled={u.credentialState !== 'disabled'} className="text-rose-400 focus:text-rose-300" onClick={() => setEraseTarget(u)}>Erase (F10)</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* F7/F11 roster — entities without platform access (multi-select bulk promote) */}
        {roster.length > 0 && (
          <div className="card">
            <div className="card-h">
              <div>
                <h3>Entities without platform access</h3>
                <div className="csub">{roster.length} roster {roster.length === 1 ? 'entity' : 'entities'} not yet linked to a user — select and promote to grant access (F7/F11).</div>
              </div>
              {picked.size > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--vl-text-soft)' }}>{picked.size} selected as</span>
                  <Select value={bulkRole} onValueChange={setBulkRole}>
                    <SelectTrigger className="w-[110px] h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{TENANT_ROLES.map(r => <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>)}</SelectContent>
                  </Select>
                  <button className="btn-pri" onClick={bulkPromote}>Promote {picked.size}</button>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {roster.slice(0, 100).map(e => (
                <label key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, borderRadius: 'var(--vl-r-sm)', border: '1px solid var(--vl-line)', padding: '8px 12px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={picked.has(e.id)} onChange={() => togglePick(e.id)} style={{ accentColor: 'var(--vialuce-indigo)' }} />
                  <span style={{ fontSize: 13, color: 'var(--vl-text)', flex: 1 }}>{e.displayName}{e.externalId ? <span style={{ color: 'var(--vl-text-soft)', marginLeft: 4 }}>({e.externalId})</span> : null}</span>
                  <PromoteButton entity={e} tenantId={(isPlatform ? selectedTenant : '') || e.tenantId || ''} onDone={load} />
                </label>
              ))}
            </div>
          </div>
        )}

        {/* F.3 hierarchy review — tenant scope */}
        {!isPlatform && <HierarchyReviewPanel />}

        {/* F10 erase confirmation */}
        <AlertDialog open={!!eraseTarget} onOpenChange={o => { if (!o) setEraseTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Erase this user?</AlertDialogTitle>
              <AlertDialogDescription>
                This is irreversible. <b>Destroyed:</b> sign-in identity, name, and email (anonymized).{' '}
                <b>Retained (tombstone):</b> the uuid row and audit history, with all PII nulled — required for compliance. The user can no longer authenticate.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction className="bg-rose-600 hover:bg-rose-500" onClick={() => { if (eraseTarget) void erase(eraseTarget); setEraseTarget(null); }}>Erase permanently</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

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

      {/* F7/F11 roster — entities without platform access (multi-select bulk promote) */}
      {roster.length > 0 && (
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base text-slate-200">Entities without platform access</CardTitle>
                <CardDescription className="text-slate-400">{roster.length} roster {roster.length === 1 ? 'entity' : 'entities'} not yet linked to a user — select and promote to grant access (F7/F11).</CardDescription>
              </div>
              {picked.size > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">{picked.size} selected as</span>
                  <Select value={bulkRole} onValueChange={setBulkRole}>
                    <SelectTrigger className="w-[110px] h-7 text-xs bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
                    <SelectContent>{TENANT_ROLES.map(r => <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button size="sm" className="h-7" onClick={bulkPromote}>Promote {picked.size}</Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {roster.slice(0, 100).map(e => (
              <label key={e.id} className="flex items-center gap-3 rounded border border-slate-800 px-3 py-2 cursor-pointer hover:bg-slate-800/30">
                <input type="checkbox" checked={picked.has(e.id)} onChange={() => togglePick(e.id)} className="accent-indigo-500" />
                <span className="text-sm text-slate-300 flex-1">{e.displayName}{e.externalId ? <span className="text-slate-500 ml-1">({e.externalId})</span> : null}</span>
                <PromoteButton entity={e} tenantId={(isPlatform ? selectedTenant : '') || e.tenantId || ''} onDone={load} />
              </label>
            ))}
          </CardContent>
        </Card>
      )}

      {/* F.3 hierarchy review — tenant scope (admin own-tenant; platform reviews per tenant via /configure) */}
      {!isPlatform && <HierarchyReviewPanel />}

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
  // HF-288: prefill from the import-classified email; null → empty field + manual fill (no fake address).
  const [email, setEmail] = useState(entity.suggestedEmail ?? '');
  const promote = async () => {
    const res = await fetch('/api/users', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, displayName: entity.displayName, role, tenantId, entityId: entity.id, mode: 'invite' }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(data.error || 'Promote failed'); return; }
    toast.success(`Promoted ${entity.displayName} as ${role}`); onDone();
  };
  return (
    <div className="flex items-center gap-2">
      <Input value={email} onChange={e => setEmail(e.target.value)} placeholder={entity.suggestedEmail ? '' : 'No email in import'} className="h-7 w-[200px] text-xs bg-slate-800 border-slate-700 text-slate-200" />
      <Select value={role} onValueChange={setRole}>
        <SelectTrigger className="w-[100px] h-7 text-xs bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
        <SelectContent>{TENANT_ROLES.map(r => <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>)}</SelectContent>
      </Select>
      <Button size="sm" variant="secondary" className="h-7" onClick={promote} disabled={!tenantId || !email.trim()}>Promote</Button>
    </div>
  );
}

function InviteDialog({ scope, tenants, selectedTenant, open, setOpen, onDone }: { scope: 'tenant' | 'platform'; tenants: TenantOpt[]; selectedTenant: string; open: boolean; setOpen: (o: boolean) => void; onDone: () => void }) {
  const isPlatform = scope === 'platform';
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState(isPlatform ? 'platform' : 'member');
  const [tenantId, setTenantId] = useState(selectedTenant);
  const [notifyEmail, setNotifyEmail] = useState('');   // D.2 Layer 1 — deliver to alternate email
  useEffect(() => { setTenantId(selectedTenant); }, [selectedTenant]);

  const submit = async () => {
    const isPlatformRole = role === 'platform';
    const body = { email, displayName, role, tenantId: isPlatformRole ? null : (tenantId || null), mode: 'invite', notifyEmail: notifyEmail.trim() || undefined };
    const res = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(data.error || 'Invite failed'); return; }
    toast.success(`Invited ${email}${data.delivery === 'dry_run' ? ' (email dry-run)' : ''}`);
    setEmail(''); setDisplayName(''); setNotifyEmail(''); setOpen(false); onDone();
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
          <div><Label className="text-slate-300">Deliver to alternate email <span className="text-slate-500">(optional)</span></Label>
            <Input value={notifyEmail} onChange={e => setNotifyEmail(e.target.value)} className="bg-slate-800 border-slate-700 text-slate-200" placeholder="route the email to a colleague / QA inbox" />
            <p className="text-[11px] text-slate-500 mt-1">The account still belongs to the email above — this only changes where the link is delivered.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!email || !displayName || (!isPlatform && !tenantId) || (isPlatform && role !== 'platform' && !tenantId)}>Send invite</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
