'use client';

/**
 * Demo Control Center Page
 *
 * Central hub for demo reset, validation, tours, and rehearsal.
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  RotateCcw,
  Shield,
  BookOpen,
  Sparkles,
  Play,
  Clock,
  CheckCircle,
} from 'lucide-react';
import { DemoResetPanel } from '@/components/demo/DemoResetPanel';
import { ValidationPanel } from '@/components/demo/ValidationPanel';
import { ScriptRehearsalPanel } from '@/components/demo/ScriptRehearsalPanel';
import { GuidedTourOverlay } from '@/components/demo/GuidedTourOverlay';
import {
  getDemoState,
  getAvailableTours,
  startTour,
  getDemoScripts,
  getSnapshots,
} from '@/lib/demo/demo-service';
import type { GuidedTour, DemoState } from '@/types/demo';
import { TOUR_CATEGORIES } from '@/types/demo';
import { useLocale } from '@/contexts/locale-context';
import { useAuth } from '@/contexts/auth-context';
import { isVLAdmin } from '@/types/auth';
import { useTenant } from '@/contexts/tenant-context';

export default function DemoControlCenterPage() {
  const { locale } = useLocale();
  const { currentTenant } = useTenant();
  const { user } = useAuth();
  const userIsVLAdmin = user && isVLAdmin(user);
  const isSpanish = userIsVLAdmin ? false : (locale === 'es-MX' || currentTenant?.locale === 'es-MX');

  const [activeTab, setActiveTab] = useState('reset');
  const [demoState, setDemoState] = useState<DemoState | null>(null);
  const [activeTour, setActiveTour] = useState<GuidedTour | null>(null);
  const [tours, setTours] = useState<GuidedTour[]>([]);
  const [snapshotCount, setSnapshotCount] = useState(0);
  const [scriptCount, setScriptCount] = useState(0);

  useEffect(() => {
    setDemoState(getDemoState());
    setTours(getAvailableTours());
    setSnapshotCount(getSnapshots().length);
    setScriptCount(getDemoScripts().length);
  }, []);

  const handleStartTour = (tourId: string) => {
    const tour = tours.find((t) => t.id === tourId);
    if (tour && startTour(tourId)) {
      setActiveTour(tour);
    }
  };

  const handleTourComplete = () => {
    setActiveTour(null);
    setDemoState(getDemoState());
  };

  const handleTourExit = () => {
    setActiveTour(null);
  };

  const handleReset = () => {
    setDemoState(getDemoState());
    setSnapshotCount(getSnapshots().length);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return isSpanish ? 'Nunca' : 'Never';
    return new Date(dateStr).toLocaleString(locale, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" />
          {isSpanish ? 'Centro de Control Demo' : 'Demo Control Center'}
        </h1>
        <p className="text-muted-foreground">
          {isSpanish
            ? 'Gestione datos demo, snapshots, validación y scripts de presentación'
            : 'Manage demo data, snapshots, validation, and presentation scripts'}
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <RotateCcw className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  {isSpanish ? 'Último Reinicio' : 'Last Reset'}
                </p>
                <p className="font-medium">
                  {formatDate(demoState?.lastReset || null)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <Shield className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  {isSpanish ? 'Snapshots' : 'Snapshots'}
                </p>
                <p className="font-medium">{snapshotCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100">
                <BookOpen className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  {isSpanish ? 'Scripts' : 'Scripts'}
                </p>
                <p className="font-medium">{scriptCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100">
                <Sparkles className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  {isSpanish ? 'Tours' : 'Tours'}
                </p>
                <p className="font-medium">{tours.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="reset">
            <RotateCcw className="h-4 w-4 mr-2" />
            {isSpanish ? 'Reinicio & Snapshots' : 'Reset & Snapshots'}
          </TabsTrigger>
          <TabsTrigger value="validation">
            <Shield className="h-4 w-4 mr-2" />
            {isSpanish ? 'Validación' : 'Validation'}
          </TabsTrigger>
          <TabsTrigger value="tours">
            <Sparkles className="h-4 w-4 mr-2" />
            {isSpanish ? 'Tours Guiados' : 'Guided Tours'}
          </TabsTrigger>
          <TabsTrigger value="scripts">
            <BookOpen className="h-4 w-4 mr-2" />
            {isSpanish ? 'Scripts & Ensayo' : 'Scripts & Rehearsal'}
          </TabsTrigger>
        </TabsList>

        {/* Reset & Snapshots Tab */}
        <TabsContent value="reset">
          <DemoResetPanel onReset={handleReset} onSnapshotRestore={handleReset} />
        </TabsContent>

        {/* Validation Tab */}
        <TabsContent value="validation">
          <ValidationPanel />
        </TabsContent>

        {/* Guided Tours Tab */}
        <TabsContent value="tours" className="space-y-6">
          {Object.entries(TOUR_CATEGORIES).map(([category, config]) => {
            const categoryTours = tours.filter((t) => t.category === category);
            if (categoryTours.length === 0) return null;

            return (
              <Card key={category}>
                <CardHeader>
                  <CardTitle className="text-base">
                    {isSpanish ? config.nameEs : config.name}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {categoryTours.map((tour) => (
                      <div
                        key={tour.id}
                        className="p-4 border rounded-lg hover:border-primary/50 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium">
                              {isSpanish ? tour.nameEs : tour.name}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {isSpanish ? tour.descriptionEs : tour.description}
                            </p>
                            <div className="flex items-center gap-4 mt-2">
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                ~{tour.estimatedDuration} min
                              </span>
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <CheckCircle className="h-3 w-3" />
                                {tour.steps.length} {isSpanish ? 'pasos' : 'steps'}
                              </span>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => handleStartTour(tour.id)}
                          >
                            <Play className="h-4 w-4 mr-1" />
                            {isSpanish ? 'Iniciar' : 'Start'}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        {/* Scripts & Rehearsal Tab */}
        <TabsContent value="scripts">
          <ScriptRehearsalPanel />
        </TabsContent>
      </Tabs>

      {/* Tour Overlay */}
      {activeTour && (
        <GuidedTourOverlay
          tour={activeTour}
          onComplete={handleTourComplete}
          onExit={handleTourExit}
        />
      )}
    </div>
  );
}
