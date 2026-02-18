"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function PerformancePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="container mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Performance
          </h1>
          <p className="mt-2 text-slate-600 dark:text-slate-400">
            Track your performance and goal achievement
          </p>
        </div>
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle>Performance Metrics</CardTitle>
            <CardDescription>Your performance breakdown and trends</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-slate-500">Select a category from the sidebar to view performance data.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
