"use client";

/**
 * Acceleration — OB-322 O-7: HONEST STATE.
 *
 * Every fabricated element was removed: the "Holiday Push SPIF" and other invented SPIF programs,
 * the fake earned/in-progress badges, the mock alerts list, the canned coaching tips, and the
 * hardcoded regional recommendations. The page now shows only what the tenant's real data
 * supports — Top Performers and Top Movers, derived from calculation_results via the insights
 * data layer — and honest "not configured" empty states for SPIFs, Alerts, Coaching, and Goals,
 * because no such configuration exists in tenant data. Korean-clean (names/values from data).
 */

import { useState, useEffect, useMemo } from "react";
import { useIsVialuce } from "@/hooks/use-is-vialuce";
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Rocket,
  Bell,
  Target,
  Lightbulb,
  TrendingUp,
  TrendingDown,
  Trophy,
} from "lucide-react";
import { useTenant, useCurrency } from "@/contexts/tenant-context";
import { useLocale, isSpanishLocale } from "@/contexts/locale-context";
import {
  getCalculatedPeriods,
  getEntityTableData,
  type PeriodSummary,
  type EntityTableRow,
} from "@/lib/insights";
import { PeriodCards } from "@/components/insights";
import { pageVariants } from "@/lib/animations";

function initialsOf(name: string): string {
  return (name || "—").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

export default function AccelerationPage() {
  const { currentTenant } = useTenant();
  const { format } = useCurrency();
  const { locale } = useLocale();
  const isSpanish = isSpanishLocale(locale);
  const isVialuce = useIsVialuce();

  const [periods, setPeriods] = useState<PeriodSummary[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState("");
  const [rows, setRows] = useState<EntityTableRow[]>([]);
  const [periodsLoaded, setPeriodsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!currentTenant) return;
    let cancelled = false;
    getCalculatedPeriods(currentTenant.id)
      .then((ps) => {
        if (cancelled) return;
        setPeriods(ps);
        setSelectedPeriodId(ps[0]?.period_id ?? "");
        setPeriodsLoaded(true);
        if (ps.length === 0) setIsLoading(false);
      })
      .catch(() => { setPeriodsLoaded(true); setIsLoading(false); });
    return () => { cancelled = true; };
  }, [currentTenant]);

  useEffect(() => {
    if (!currentTenant || !selectedPeriodId) return;
    let cancelled = false;
    setIsLoading(true);
    // Pull a generous page sorted by delta vs prior so we can read both gainers and decliners.
    getEntityTableData(currentTenant.id, selectedPeriodId, { sortBy: "delta_prior", sortOrder: "desc", pageSize: 100 })
      .then((res) => { if (!cancelled) { setRows(res.rows); setIsLoading(false); } })
      .catch(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [currentTenant, selectedPeriodId]);

  const topPerformers = useMemo(
    () => [...rows].sort((a, b) => b.total_payout - a.total_payout).slice(0, 5),
    [rows],
  );
  const gainers = useMemo(
    () => rows.filter((r) => r.delta_prior != null && r.delta_prior > 0).slice(0, 5),
    [rows],
  );
  const decliners = useMemo(
    () => rows.filter((r) => r.delta_prior != null && r.delta_prior < 0).sort((a, b) => (a.delta_prior ?? 0) - (b.delta_prior ?? 0)).slice(0, 5),
    [rows],
  );
  const hasPriorDeltas = gainers.length > 0 || decliners.length > 0;

  const t = {
    heading: isSpanish ? "Aceleración" : "Acceleration",
    sub: isSpanish ? "Rendimiento real y programas de incentivos" : "Real performance and incentive programs",
    topPerformers: isSpanish ? "Mejores Resultados" : "Top Performers",
    topPerformersDesc: isSpanish ? "Por pago total este período" : "By total payout this period",
    movers: isSpanish ? "Mayores Cambios" : "Top Movers",
    moversDesc: isSpanish ? "Cambio frente al período anterior" : "Change versus the prior period",
    gainers: isSpanish ? "Suben" : "Gainers",
    decliners: isSpanish ? "Bajan" : "Decliners",
    noMovers: isSpanish ? "Se necesitan al menos dos períodos calculados para mostrar cambios." : "At least two calculated periods are required to show movement.",
    tabSpifs: isSpanish ? "Incentivos" : "SPIFs",
    tabAlerts: isSpanish ? "Alertas" : "Alerts",
    tabCoaching: isSpanish ? "Asesoría" : "Coaching",
    tabGoals: isSpanish ? "Metas" : "Goals",
    noSpifs: isSpanish ? "No hay programas de incentivos configurados." : "No incentive programs configured.",
    noSpifsBody: isSpanish ? "Los programas SPIF / incentivos aparecerán aquí cuando se configuren para este inquilino." : "SPIF / incentive programs will appear here when configured for this tenant.",
    noAlerts: isSpanish ? "Sin alertas." : "No alerts.",
    noAlertsBody: isSpanish ? "Las alertas aparecerán aquí cuando se configure el monitoreo basado en umbrales." : "Alerts will appear here when threshold-based monitoring is configured.",
    noCoaching: isSpanish ? "Sin contenido de asesoría." : "No coaching content.",
    noCoachingBody: isSpanish ? "La guía de asesoría aparecerá aquí cuando se configure." : "Coaching guidance will appear here when configured.",
    noGoals: isSpanish ? "Sin metas configuradas." : "No goals configured.",
    noGoalsBody: isSpanish ? "Las metas y el ritmo aparecerán aquí cuando se configuren objetivos para este inquilino." : "Goals and pacing will appear here when targets are configured for this tenant.",
    noData: isSpanish ? "No hay datos de cálculo" : "No Calculation Data",
    noDataBody: isSpanish ? "Los resultados aparecerán aquí una vez que se ejecuten cálculos." : "Results will appear here once calculations have been run.",
  };

  const EmptyTab = ({ icon: Icon, title, body }: { icon: typeof Bell; title: string; body: string }) => (
    <Card>
      <CardContent className="py-12 text-center">
        <Icon className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
        <p className="font-medium mb-1">{title}</p>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">{body}</p>
      </CardContent>
    </Card>
  );

  const PerfRow = ({ r, idx, showDelta }: { r: EntityTableRow; idx?: number; showDelta?: boolean }) => (
    <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
      {typeof idx === "number" && (
        <div className={`flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold ${
          idx === 0 ? "bg-amber-400 text-amber-950" : idx === 1 ? "bg-slate-300 text-slate-700" : idx === 2 ? "bg-amber-600 text-amber-50" : "bg-muted text-muted-foreground"
        }`}>{idx + 1}</div>
      )}
      <Avatar className="h-9 w-9"><AvatarFallback className="text-xs">{initialsOf(r.display_name)}</AvatarFallback></Avatar>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{r.display_name}</p>
        {r.variant && <p className="text-xs text-muted-foreground truncate">{r.variant}</p>}
      </div>
      <div className="text-right">
        <p className="text-sm font-semibold tabular-nums">{format(r.total_payout)}</p>
        {showDelta && r.delta_prior != null && (
          <p className={`text-xs tabular-nums flex items-center justify-end gap-0.5 ${r.delta_prior >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
            {r.delta_prior >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {format(Math.abs(r.delta_prior))}
          </p>
        )}
      </div>
    </div>
  );

  const header = isVialuce ? (
    <div className="phead">
      <div>
        <h1>{t.heading}</h1>
        <div className="sub">{t.sub}</div>
      </div>
    </div>
  ) : (
    <div className="mb-6">
      <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">{t.heading}</h1>
      <p className="mt-2 text-slate-600 dark:text-slate-400">{t.sub}</p>
    </div>
  );

  const body =
    periodsLoaded && periods.length === 0 ? (
      <Card>
        <CardContent className="py-16 text-center">
          <Rocket className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">{t.noData}</h3>
          <p className="text-muted-foreground max-w-md mx-auto">{t.noDataBody}</p>
        </CardContent>
      </Card>
    ) : (
      <div className="space-y-6">
        {periods.length > 0 && (
          <PeriodCards periods={periods} selectedPeriodId={selectedPeriodId} onPeriodChange={setSelectedPeriodId} />
        )}

        {/* Real performance — top performers + movers from calculation_results */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Trophy className="h-5 w-5 text-amber-500" />{t.topPerformers}</CardTitle>
              <CardDescription>{t.topPerformersDesc}</CardDescription>
            </CardHeader>
            <CardContent className="px-2">
              {isLoading ? (
                <p className="text-center py-8 text-muted-foreground text-sm">…</p>
              ) : topPerformers.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground text-sm">{t.noDataBody}</p>
              ) : (
                <div className="space-y-1">{topPerformers.map((r, i) => <PerfRow key={r.entity_id} r={r} idx={i} />)}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-emerald-500" />{t.movers}</CardTitle>
              <CardDescription>{t.moversDesc}</CardDescription>
            </CardHeader>
            <CardContent className="px-2">
              {isLoading ? (
                <p className="text-center py-8 text-muted-foreground text-sm">…</p>
              ) : !hasPriorDeltas ? (
                <p className="text-center py-8 text-muted-foreground text-sm max-w-xs mx-auto">{t.noMovers}</p>
              ) : (
                <div className="space-y-3">
                  {gainers.length > 0 && (
                    <div>
                      <p className="px-3 text-xs font-medium uppercase text-muted-foreground mb-1">{t.gainers}</p>
                      <div className="space-y-1">{gainers.map((r) => <PerfRow key={r.entity_id} r={r} showDelta />)}</div>
                    </div>
                  )}
                  {decliners.length > 0 && (
                    <div>
                      <p className="px-3 text-xs font-medium uppercase text-muted-foreground mb-1">{t.decliners}</p>
                      <div className="space-y-1">{decliners.map((r) => <PerfRow key={r.entity_id} r={r} showDelta />)}</div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Configuration-backed surfaces — honest empty states (no fabricated programs) */}
        <Tabs defaultValue="spifs" className="space-y-4">
          <TabsList>
            <TabsTrigger value="spifs"><Rocket className="h-4 w-4 mr-2" />{t.tabSpifs}</TabsTrigger>
            <TabsTrigger value="alerts"><Bell className="h-4 w-4 mr-2" />{t.tabAlerts}</TabsTrigger>
            <TabsTrigger value="coaching"><Lightbulb className="h-4 w-4 mr-2" />{t.tabCoaching}</TabsTrigger>
            <TabsTrigger value="goals"><Target className="h-4 w-4 mr-2" />{t.tabGoals}</TabsTrigger>
          </TabsList>
          <TabsContent value="spifs"><EmptyTab icon={Rocket} title={t.noSpifs} body={t.noSpifsBody} /></TabsContent>
          <TabsContent value="alerts"><EmptyTab icon={Bell} title={t.noAlerts} body={t.noAlertsBody} /></TabsContent>
          <TabsContent value="coaching"><EmptyTab icon={Lightbulb} title={t.noCoaching} body={t.noCoachingBody} /></TabsContent>
          <TabsContent value="goals"><EmptyTab icon={Target} title={t.noGoals} body={t.noGoalsBody} /></TabsContent>
        </Tabs>
      </div>
    );

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900"
    >
      <div className={isVialuce ? "page" : "container mx-auto px-4 md:px-6 py-8"}>
        {header}
        {body}
      </div>
    </motion.div>
  );
}
