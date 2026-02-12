"use client";

/**
 * OB-29 Phase 9: Goals Page
 *
 * Goals management is not yet implemented in the platform.
 * This page shows an empty state with guidance instead of mock data.
 */

import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Target,
} from "lucide-react";

export default function GoalsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Goals Tracking
          </h1>
          <p className="mt-2 text-slate-600 dark:text-slate-400">
            Monitor individual and team goal progress
          </p>
        </div>

        {/* OB-29: Empty State - Goals module not yet implemented */}
        <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30">
          <CardContent className="py-12">
            <div className="text-center">
              <Target className="h-16 w-16 text-blue-500 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-blue-900 dark:text-blue-100 mb-2">
                Goals Module Coming Soon
              </h3>
              <p className="text-blue-700 dark:text-blue-300 max-w-lg mx-auto">
                Goal tracking and management will be available in a future release.
                For now, goals are managed through compensation plan configurations.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
