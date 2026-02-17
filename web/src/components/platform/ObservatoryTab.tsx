'use client';

import { Loader2 } from 'lucide-react';

export function ObservatoryTab() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
    </div>
  );
}
