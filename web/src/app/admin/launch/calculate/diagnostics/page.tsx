"use client";

/**
 * Calculation Diagnostics Page
 *
 * Checks all prerequisites for running calculations:
 * - Active compensation plan
 * - Committed data in data layer
 * - Configured payroll period
 * - Field mappings complete
 * - Context resolver status
 */

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Database,
  Calculator,
  Calendar,
  Users,
  Play,
  ArrowRight,
} from "lucide-react";
import { useTenant } from "@/contexts/tenant-context";
import { useLocale } from "@/contexts/locale-context";
import { useAuth } from "@/contexts/auth-context";
import { isCCAdmin } from "@/types/auth";
import { getPlans } from "@/lib/compensation/plan-storage";
import Link from "next/link";

interface DiagnosticCheck {
  id: string;
  name: string;
  nameEs: string;
  description: string;
  descriptionEs: string;
  status: "checking" | "pass" | "fail" | "warn";
  details?: string;
  detailsEs?: string;
  action?: {
    label: string;
    labelEs: string;
    href: string;
  };
}

export default function CalculationDiagnosticsPage() {
  const { currentTenant } = useTenant();
  const { locale } = useLocale();
  const { user } = useAuth();
  const userIsCCAdmin = user && isCCAdmin(user);
  const isSpanish = userIsCCAdmin ? false : (locale === "es-MX" || currentTenant?.locale === "es-MX");

  const [checks, setChecks] = useState<DiagnosticCheck[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [allPassed, setAllPassed] = useState(false);

  const tenantId = currentTenant?.id || "retailcgmx";

  const runDiagnostics = async () => {
    setIsRunning(true);

    // Initialize all checks as "checking"
    const initialChecks: DiagnosticCheck[] = [
      {
        id: "active-plan",
        name: "Active Compensation Plan",
        nameEs: "Plan de Compensación Activo",
        description: "An active plan is required to run calculations",
        descriptionEs: "Se requiere un plan activo para ejecutar cálculos",
        status: "checking",
      },
      {
        id: "committed-data",
        name: "Committed Data",
        nameEs: "Datos Confirmados",
        description: "Data must be imported and committed to the data layer",
        descriptionEs: "Los datos deben importarse y confirmarse en la capa de datos",
        status: "checking",
      },
      {
        id: "payroll-period",
        name: "Payroll Period Configuration",
        nameEs: "Configuración del Período de Nómina",
        description: "A payroll period must be configured for calculations",
        descriptionEs: "Se debe configurar un período de nómina para los cálculos",
        status: "checking",
      },
      {
        id: "field-mappings",
        name: "Field Mappings",
        nameEs: "Mapeo de Campos",
        description: "Data fields must be mapped to plan components",
        descriptionEs: "Los campos de datos deben mapearse a componentes del plan",
        status: "checking",
      },
      {
        id: "employee-roster",
        name: "Employee Roster",
        nameEs: "Plantilla de Empleados",
        description: "Employee data must be loaded for calculations",
        descriptionEs: "Los datos de empleados deben cargarse para los cálculos",
        status: "checking",
      },
    ];

    setChecks(initialChecks);

    // Run each check with a small delay for visual effect
    const updatedChecks = [...initialChecks];

    // Check 1: Active Plan
    await new Promise((r) => setTimeout(r, 300));
    const plans = getPlans(tenantId);
    const activePlan = plans.find((p) => p.status === "active");
    updatedChecks[0] = {
      ...updatedChecks[0],
      status: activePlan ? "pass" : "fail",
      details: activePlan ? `Found: ${activePlan.name}` : "No active plan found",
      detailsEs: activePlan ? `Encontrado: ${activePlan.name}` : "No se encontró un plan activo",
      action: !activePlan
        ? {
            label: "Create Plan",
            labelEs: "Crear Plan",
            href: "/design/plans",
          }
        : undefined,
    };
    setChecks([...updatedChecks]);

    // Check 2: Committed Data
    await new Promise((r) => setTimeout(r, 300));
    const dataLayerKey = `vialuce_data_layer_${tenantId}`;
    let committedData = null;
    if (typeof window !== "undefined") {
      try {
        const data = localStorage.getItem(dataLayerKey);
        committedData = data ? JSON.parse(data) : null;
      } catch {
        // Ignore parse errors
      }
    }
    const hasCommittedData = committedData?.committed && Object.keys(committedData.committed).length > 0;
    updatedChecks[1] = {
      ...updatedChecks[1],
      status: hasCommittedData ? "pass" : "fail",
      details: hasCommittedData
        ? `${Object.keys(committedData.committed).length} data sets committed`
        : "No committed data found",
      detailsEs: hasCommittedData
        ? `${Object.keys(committedData.committed).length} conjuntos de datos confirmados`
        : "No se encontraron datos confirmados",
      action: !hasCommittedData
        ? {
            label: "Import Data",
            labelEs: "Importar Datos",
            href: "/data/import/enhanced",
          }
        : undefined,
    };
    setChecks([...updatedChecks]);

    // Check 3: Payroll Period
    await new Promise((r) => setTimeout(r, 300));
    const periodKey = `vialuce_periods_${tenantId}`;
    let periods = null;
    if (typeof window !== "undefined") {
      try {
        const data = localStorage.getItem(periodKey);
        periods = data ? JSON.parse(data) : null;
      } catch {
        // Ignore parse errors
      }
    }
    const activePeriod = periods?.find((p: { status: string }) => p.status === "open" || p.status === "active");
    updatedChecks[2] = {
      ...updatedChecks[2],
      status: activePeriod ? "pass" : "warn",
      details: activePeriod
        ? `Current period: ${activePeriod.name || activePeriod.id}`
        : "No active period configured (using current month)",
      detailsEs: activePeriod
        ? `Período actual: ${activePeriod.name || activePeriod.id}`
        : "No hay período activo configurado (usando mes actual)",
      action: !activePeriod
        ? {
            label: "Configure Periods",
            labelEs: "Configurar Períodos",
            href: "/configure/periods",
          }
        : undefined,
    };
    setChecks([...updatedChecks]);

    // Check 4: Field Mappings
    await new Promise((r) => setTimeout(r, 300));
    const mappingKey = `vialuce_field_mappings_${tenantId}`;
    let mappings = null;
    if (typeof window !== "undefined") {
      try {
        const data = localStorage.getItem(mappingKey);
        mappings = data ? JSON.parse(data) : null;
      } catch {
        // Ignore parse errors
      }
    }
    const hasMappings = mappings && Object.keys(mappings).length > 0;
    updatedChecks[3] = {
      ...updatedChecks[3],
      status: hasMappings ? "pass" : hasCommittedData ? "warn" : "fail",
      details: hasMappings
        ? `${Object.keys(mappings).length} field mappings configured`
        : "No field mappings found",
      detailsEs: hasMappings
        ? `${Object.keys(mappings).length} mapeos de campos configurados`
        : "No se encontraron mapeos de campos",
      action: !hasMappings
        ? {
            label: "Configure Mappings",
            labelEs: "Configurar Mapeos",
            href: "/data/import/enhanced",
          }
        : undefined,
    };
    setChecks([...updatedChecks]);

    // Check 5: Employee Roster
    await new Promise((r) => setTimeout(r, 300));
    const employeeKey = `vialuce_employee_data`;
    let employees = null;
    if (typeof window !== "undefined") {
      try {
        const data = localStorage.getItem(employeeKey);
        employees = data ? JSON.parse(data) : null;
      } catch {
        // Ignore parse errors
      }
    }
    const hasEmployees = employees && employees.length > 0;
    updatedChecks[4] = {
      ...updatedChecks[4],
      status: hasEmployees ? "pass" : "warn",
      details: hasEmployees
        ? `${employees.length} employees loaded`
        : "No employee roster found (will use demo data)",
      detailsEs: hasEmployees
        ? `${employees.length} empleados cargados`
        : "No se encontró plantilla de empleados (se usarán datos de demostración)",
      action: !hasEmployees
        ? {
            label: "Import Employees",
            labelEs: "Importar Empleados",
            href: "/configuration/personnel",
          }
        : undefined,
    };
    setChecks([...updatedChecks]);

    // Check overall status
    const passed = updatedChecks.every((c) => c.status === "pass" || c.status === "warn");
    setAllPassed(passed);
    setIsRunning(false);
  };

  useEffect(() => {
    runDiagnostics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const getStatusIcon = (status: DiagnosticCheck["status"]) => {
    switch (status) {
      case "checking":
        return <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />;
      case "pass":
        return <CheckCircle2 className="h-5 w-5 text-green-600" />;
      case "fail":
        return <XCircle className="h-5 w-5 text-red-600" />;
      case "warn":
        return <AlertTriangle className="h-5 w-5 text-amber-500" />;
    }
  };

  const getStatusBadge = (status: DiagnosticCheck["status"]) => {
    switch (status) {
      case "checking":
        return <Badge variant="secondary">{isSpanish ? "Verificando..." : "Checking..."}</Badge>;
      case "pass":
        return <Badge className="bg-green-100 text-green-700">{isSpanish ? "Listo" : "Ready"}</Badge>;
      case "fail":
        return <Badge variant="destructive">{isSpanish ? "Requerido" : "Required"}</Badge>;
      case "warn":
        return <Badge className="bg-amber-100 text-amber-700">{isSpanish ? "Opcional" : "Optional"}</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
              {isSpanish ? "Diagnóstico de Cálculo" : "Calculation Diagnostics"}
            </h1>
            <p className="mt-2 text-slate-600 dark:text-slate-400">
              {isSpanish
                ? "Verificar requisitos previos antes de ejecutar cálculos"
                : "Verify prerequisites before running calculations"}
            </p>
          </div>
          <Button onClick={runDiagnostics} disabled={isRunning} variant="outline" className="gap-2">
            <RefreshCw className={`h-4 w-4 ${isRunning ? "animate-spin" : ""}`} />
            {isSpanish ? "Ejecutar Diagnóstico" : "Run Diagnostics"}
          </Button>
        </div>

        {/* Diagnostic Checks */}
        <div className="grid gap-4 mb-8">
          {checks.map((check) => (
            <Card key={check.id} className="border-0 shadow-md">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="mt-1">{getStatusIcon(check.status)}</div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-semibold">
                        {isSpanish ? check.nameEs : check.name}
                      </h3>
                      {getStatusBadge(check.status)}
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">
                      {isSpanish ? check.descriptionEs : check.description}
                    </p>
                    {check.details && (
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        {isSpanish ? check.detailsEs : check.details}
                      </p>
                    )}
                    {check.action && (
                      <Link href={check.action.href}>
                        <Button variant="link" className="p-0 h-auto mt-2 text-primary">
                          {isSpanish ? check.action.labelEs : check.action.label}
                          <ArrowRight className="h-4 w-4 ml-1" />
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Summary */}
        <Card className={`border-0 shadow-lg ${allPassed ? "bg-green-50" : "bg-amber-50"}`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {allPassed ? (
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              ) : (
                <AlertTriangle className="h-6 w-6 text-amber-600" />
              )}
              {allPassed
                ? isSpanish
                  ? "Sistema Listo para Cálculos"
                  : "System Ready for Calculations"
                : isSpanish
                ? "Se Requieren Acciones"
                : "Actions Required"}
            </CardTitle>
            <CardDescription>
              {allPassed
                ? isSpanish
                  ? "Todos los requisitos previos están satisfechos. Puede proceder a ejecutar cálculos."
                  : "All prerequisites are satisfied. You can proceed to run calculations."
                : isSpanish
                ? "Complete las acciones requeridas antes de ejecutar cálculos."
                : "Complete the required actions before running calculations."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <Link href="/operate/calculate">
                <Button disabled={!allPassed} className="gap-2">
                  <Play className="h-4 w-4" />
                  {isSpanish ? "Ejecutar Cálculos" : "Run Calculations"}
                </Button>
              </Link>
              <Link href="/admin/launch">
                <Button variant="outline">
                  {isSpanish ? "Volver al Lanzamiento" : "Back to Launch"}
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Quick Reference */}
        <Card className="mt-8 border-0 shadow-md">
          <CardHeader>
            <CardTitle className="text-base">
              {isSpanish ? "Referencia Rápida" : "Quick Reference"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              <Link href="/design/plans" className="p-4 border rounded-lg hover:bg-muted transition-colors">
                <Calculator className="h-5 w-5 text-primary mb-2" />
                <p className="font-medium">{isSpanish ? "Planes" : "Plans"}</p>
                <p className="text-xs text-muted-foreground">
                  {isSpanish ? "Gestionar planes de compensación" : "Manage compensation plans"}
                </p>
              </Link>
              <Link href="/data/import/enhanced" className="p-4 border rounded-lg hover:bg-muted transition-colors">
                <Database className="h-5 w-5 text-primary mb-2" />
                <p className="font-medium">{isSpanish ? "Importar Datos" : "Import Data"}</p>
                <p className="text-xs text-muted-foreground">
                  {isSpanish ? "Cargar datos de rendimiento" : "Load performance data"}
                </p>
              </Link>
              <Link href="/configure/periods" className="p-4 border rounded-lg hover:bg-muted transition-colors">
                <Calendar className="h-5 w-5 text-primary mb-2" />
                <p className="font-medium">{isSpanish ? "Períodos" : "Periods"}</p>
                <p className="text-xs text-muted-foreground">
                  {isSpanish ? "Configurar períodos de nómina" : "Configure payroll periods"}
                </p>
              </Link>
              <Link href="/configuration/personnel" className="p-4 border rounded-lg hover:bg-muted transition-colors">
                <Users className="h-5 w-5 text-primary mb-2" />
                <p className="font-medium">{isSpanish ? "Empleados" : "Employees"}</p>
                <p className="text-xs text-muted-foreground">
                  {isSpanish ? "Gestionar plantilla" : "Manage roster"}
                </p>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
