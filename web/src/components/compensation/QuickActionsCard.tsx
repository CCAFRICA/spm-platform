'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Calculator,
  Download,
} from 'lucide-react';
import Link from 'next/link';

export function QuickActionsCard() {
  const actions = [
    {
      label: 'View My Plan',
      description: 'See how your incentives are calculated',
      icon: Calculator,
      href: '/performance/plans',
      color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30',
    },
    {
      label: 'Download Statement',
      description: 'Export your earnings report',
      icon: Download,
      href: '#',
      color: 'bg-green-100 text-green-600 dark:bg-green-900/30',
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Quick Actions</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.label}
              href={action.href}
              className="flex flex-col items-center gap-2 p-4 rounded-lg border hover:bg-muted/50 transition-colors text-center group"
            >
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${action.color}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <div className="font-medium text-sm">{action.label}</div>
                <div className="text-xs text-muted-foreground">{action.description}</div>
              </div>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
