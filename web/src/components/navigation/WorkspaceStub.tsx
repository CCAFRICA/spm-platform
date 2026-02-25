'use client';

/**
 * WorkspaceStub — Redirects unimplemented workspace routes to workspace root.
 *
 * Instead of showing a "Coming Soon" placeholder, redirect to the
 * workspace landing page. No placeholder pages in navigation.
 */

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { WorkspaceId } from '@/types/navigation';

interface WorkspaceStubProps {
  workspace: WorkspaceId;
}

// OB-97: 4 workspace model
const WORKSPACE_ROOTS: Record<string, string> = {
  perform: '/perform',
  operate: '/operate',
  configure: '/configure',
  financial: '/financial',
};

export function WorkspaceStub({ workspace }: WorkspaceStubProps) {
  const router = useRouter();
  const pathname = usePathname();
  const root = WORKSPACE_ROOTS[workspace] || '/';

  useEffect(() => {
    // Only redirect if we're on a sub-route, not the root itself
    if (pathname !== root) {
      router.replace(root);
    }
  }, [pathname, root, router]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div style={{ color: '#71717a', fontSize: '13px' }}>Redirecting...</div>
    </div>
  );
}
