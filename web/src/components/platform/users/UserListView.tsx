'use client';

// OB-230 Objective 2A — User List View. Searchable / filterable / paginated cross-tenant list with a
// single-glance auth-health signal, parsed last-device, and inline quick actions. Observatory --strag- styling.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { UserListItem, UserListResponse } from '@/lib/observability/api-types';
import { HEALTH_COLOR, HEALTH_LABEL, type AuthHealthStatus } from '@/lib/observability/auth-health';
import { parseUserAgent } from '@/lib/observability/ua-parser';
import { C, Dot, Initial, Panel, Spinner, relativeTime, ConfirmAction } from './ui';

const PER_PAGE = 25;

export function UserListView({ onSelect }: { onSelect: (profileId: string) => void }) {
  const [data, setData] = useState<UserListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [tenantFilter, setTenantFilter] = useState('');
  const [healthFilter, setHealthFilter] = useState<'' | AuthHealthStatus>('');
  const [page, setPage] = useState(1);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => { setDebounced(search); setPage(1); }, 300);
    return () => clearTimeout(id);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ page: String(page), perPage: String(PER_PAGE) });
      if (debounced) qs.set('q', debounced);
      if (roleFilter) qs.set('role', roleFilter);
      if (tenantFilter) qs.set('tenantId', tenantFilter);
      const res = await fetch(`/api/admin/users?${qs.toString()}`);
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `Failed (${res.status})`); }
      setData(await res.json() as UserListResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [page, debounced, roleFilter, tenantFilter]);

  useEffect(() => { load(); }, [load]);

  const quickAction = useCallback(async (item: UserListItem, action: 'force-logout' | 'ban' | 'unban') => {
    setBusyAction(`${item.profileId}:${action}`);
    try {
      await fetch(`/api/admin/users/${item.profileId}/${action}`, { method: 'POST' });
      await load();
    } finally {
      setBusyAction(null);
    }
  }, [load]);

  const roleOptions = useMemo(() => {
    const set = new Set<string>();
    (data?.users ?? []).forEach((u) => u.role && set.add(u.role));
    return Array.from(set).sort();
  }, [data]);

  const visible = useMemo(() => {
    const users = data?.users ?? [];
    return healthFilter ? users.filter((u) => u.health.status === healthFilter) : users;
  }, [data, healthFilter]);

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  const selectStyle: React.CSSProperties = {
    background: C.deep, color: C.ink2, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 13,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Controls */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search email or name…"
          style={{ ...selectStyle, flex: '1 1 240px', minWidth: 200 }}
        />
        <select value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }} style={selectStyle}>
          <option value="">All roles</option>
          {roleOptions.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={tenantFilter} onChange={(e) => { setTenantFilter(e.target.value); setPage(1); }} style={selectStyle}>
          <option value="">All tenants</option>
          {(data?.tenants ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select value={healthFilter} onChange={(e) => setHealthFilter(e.target.value as '' | AuthHealthStatus)} style={selectStyle}>
          <option value="">Any health</option>
          <option value="problem">Problem</option>
          <option value="attention">Attention</option>
          <option value="healthy">Healthy</option>
        </select>
      </div>

      {error && <Panel style={{ borderColor: C.red, color: C.red }}>{error}</Panel>}

      {loading && !data ? <Spinner label="Loading users…" /> : (
        <Panel style={{ padding: 0, overflow: 'hidden' }}>
          {/* Header row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 0.9fr 1fr 1.1fr 1.2fr 1.1fr', gap: 12, padding: '12px 16px', borderBottom: `1px solid ${C.border}`, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: C.ink4, fontWeight: 600 }}>
            <div>User</div><div>Role</div><div>Tenant</div><div>Last sign-in</div><div>Device</div><div style={{ textAlign: 'right' }}>Health / Actions</div>
          </div>
          {visible.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: C.ink4, fontSize: 13 }}>No users match these filters.</div>
          ) : visible.map((u) => {
            const device = parseUserAgent(u.lastUserAgent);
            const banned = !!u.bannedUntil && Date.parse(u.bannedUntil) > Date.now();
            return (
              <div
                key={u.profileId}
                onClick={() => onSelect(u.profileId)}
                style={{ display: 'grid', gridTemplateColumns: '1.6fr 0.9fr 1fr 1.1fr 1.2fr 1.1fr', gap: 12, padding: '12px 16px', borderBottom: `1px solid ${C.border}`, alignItems: 'center', cursor: 'pointer', borderLeft: `3px solid ${HEALTH_COLOR[u.health.status]}` }}
              >
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
                  <Initial name={u.displayName} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: C.ink0, fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.displayName || '(no name)'}</div>
                    <div style={{ color: C.ink4, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>
                  </div>
                </div>
                <div style={{ color: C.ink2, fontSize: 12 }}>{u.role}</div>
                <div style={{ color: C.ink2, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.tenantName ?? (u.tenantId ? u.tenantId.slice(0, 8) : 'Platform')}</div>
                <div style={{ color: C.ink2, fontSize: 12 }} title={u.lastSignInAt ?? 'never'}>{relativeTime(u.lastSignInAt)}</div>
                <div style={{ color: C.ink2, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={device.label}>{device.label}</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end' }} onClick={(e) => e.stopPropagation()}>
                  <span title={u.health.reasons.join(' · ')} style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
                    <Dot color={HEALTH_COLOR[u.health.status]} />
                    <span style={{ color: HEALTH_COLOR[u.health.status], fontSize: 11, fontWeight: 600 }}>{HEALTH_LABEL[u.health.status]}</span>
                  </span>
                  <ConfirmAction label="Logout" color={C.amber} busy={busyAction === `${u.profileId}:force-logout`} onConfirm={() => quickAction(u, 'force-logout')} />
                  {banned
                    ? <ConfirmAction label="Unban" color={C.green} busy={busyAction === `${u.profileId}:unban`} onConfirm={() => quickAction(u, 'unban')} />
                    : <ConfirmAction label="Ban" color={C.red} busy={busyAction === `${u.profileId}:ban`} onConfirm={() => quickAction(u, 'ban')} />}
                </div>
              </div>
            );
          })}
        </Panel>
      )}

      {/* Pagination */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: C.ink4 }}>
        <div>{total} user{total === 1 ? '' : 's'}{healthFilter ? ` · filtered to ${visible.length} on this page` : ''}</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <PageBtn disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</PageBtn>
          <span>Page {page} of {totalPages}</span>
          <PageBtn disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</PageBtn>
        </div>
      </div>
    </div>
  );
}

function PageBtn({ children, disabled, onClick }: { children: React.ReactNode; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      style={{ padding: '6px 12px', fontSize: 12, borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: disabled ? C.ink4 : C.ink2, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1 }}
    >
      {children}
    </button>
  );
}
