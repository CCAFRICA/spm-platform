'use client';

// OB-230 Objective 2 — User Operations Console. The 7th Observatory tab. A diagnostic instrument
// (not a dashboard): list → single-user deep-dive. Platform admin only (the route + APIs gate on
// platform.system_config). Observatory --strag- visual vocabulary.

import React, { useState } from 'react';
import { UserListView } from './users/UserListView';
import { UserDetailView } from './users/UserDetailView';
import { C } from './users/ui';

export function UsersTab() {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h2 style={{ color: C.ink0, fontSize: 18, fontWeight: 700, margin: 0 }}>User Operations</h2>
        <p style={{ color: C.ink4, fontSize: 13, margin: '4px 0 0' }}>
          {selected
            ? 'Single-user diagnostic deep-dive: identity, session health, event timeline, and remediation.'
            : 'Search any user across all tenants. Click a user to diagnose what they are experiencing and why.'}
        </p>
      </div>
      {selected
        ? <UserDetailView profileId={selected} onBack={() => setSelected(null)} />
        : <UserListView onSelect={setSelected} />}
    </div>
  );
}
