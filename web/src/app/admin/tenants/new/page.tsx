'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/auth-context';
import { useTenant } from '@/contexts/tenant-context';
import { isVLAdmin } from '@/types/auth';
import {
  getTenantProvisioningEngine,
  getIndustryTemplates,
  type TenantProvisioningRequest,
} from '@/lib/tenant/provisioning-engine';
import {
  Building2,
  Globe,
  Palette,
  Package,
  UserPlus,
  CheckCircle2,
  Rocket,
  ChevronRight,
  ChevronLeft,
  AlertCircle,
} from 'lucide-react';
import type { TenantIndustry, Currency, Locale, TenantFeatures } from '@/types/tenant';

// Bilingual labels
const labels = {
  'en-US': {
    title: 'New Tenant Provisioning',
    subtitle: 'Create a new customer tenant instance',
    steps: {
      basic: 'Basic Info',
      localization: 'Localization',
      branding: 'Branding',
      modules: 'Modules',
      admin: 'Admin User',
      review: 'Review',
      provision: 'Provision',
    },
    fields: {
      companyName: 'Company Name',
      displayName: 'Display Name',
      industry: 'Industry',
      country: 'Country',
      currency: 'Currency',
      locale: 'Language/Locale',
      timezone: 'Timezone',
      primaryColor: 'Primary Color',
      logoUrl: 'Logo URL',
      adminEmail: 'Admin Email',
      adminName: 'Admin Name',
    },
    buttons: {
      next: 'Next',
      back: 'Back',
      provision: 'Provision Tenant',
      goToTenant: 'Go to Tenant',
    },
    features: {
      compensation: 'Compensation Management',
      performance: 'Performance Tracking',
      transactions: 'Transaction Management',
      salesFinance: 'Sales Finance',
      financial: 'Financial Management (POS Analytics)',
      forecasting: 'Forecasting',
      gamification: 'Gamification',
      learning: 'Learning & Development',
      coaching: 'Coaching',
      whatsappIntegration: 'WhatsApp Integration',
      mobileApp: 'Mobile App',
      apiAccess: 'API Access',
    },
    accessDenied: 'Access Denied',
    accessDeniedDesc: 'Only VL Admins can provision new tenants.',
  },
  'es-MX': {
    title: 'Provisión de Nuevo Inquilino',
    subtitle: 'Crear una nueva instancia de cliente',
    steps: {
      basic: 'Info Básica',
      localization: 'Localización',
      branding: 'Marca',
      modules: 'Módulos',
      admin: 'Usuario Admin',
      review: 'Revisar',
      provision: 'Provisionar',
    },
    fields: {
      companyName: 'Nombre de Empresa',
      displayName: 'Nombre para Mostrar',
      industry: 'Industria',
      country: 'País',
      currency: 'Moneda',
      locale: 'Idioma/Región',
      timezone: 'Zona Horaria',
      primaryColor: 'Color Primario',
      logoUrl: 'URL del Logo',
      adminEmail: 'Email del Admin',
      adminName: 'Nombre del Admin',
    },
    buttons: {
      next: 'Siguiente',
      back: 'Atrás',
      provision: 'Provisionar Inquilino',
      goToTenant: 'Ir al Inquilino',
    },
    features: {
      compensation: 'Gestión de Compensación',
      performance: 'Seguimiento de Rendimiento',
      transactions: 'Gestión de Transacciones',
      salesFinance: 'Finanzas de Ventas',
      financial: 'Gestión Financiera (Análisis POS)',
      forecasting: 'Pronósticos',
      gamification: 'Gamificación',
      learning: 'Aprendizaje y Desarrollo',
      coaching: 'Coaching',
      whatsappIntegration: 'Integración WhatsApp',
      mobileApp: 'Aplicación Móvil',
      apiAccess: 'Acceso API',
    },
    accessDenied: 'Acceso Denegado',
    accessDeniedDesc: 'Solo los Admins de CC pueden provisionar nuevos inquilinos.',
  },
};

const STEPS = ['basic', 'localization', 'branding', 'modules', 'admin', 'review', 'provision'] as const;
type Step = typeof STEPS[number];

const STEP_ICONS: Record<Step, React.ComponentType<{ className?: string }>> = {
  basic: Building2,
  localization: Globe,
  branding: Palette,
  modules: Package,
  admin: UserPlus,
  review: CheckCircle2,
  provision: Rocket,
};

const COUNTRIES = [
  { code: 'US', name: 'United States', nameEs: 'Estados Unidos' },
  { code: 'MX', name: 'Mexico', nameEs: 'México' },
  { code: 'CA', name: 'Canada', nameEs: 'Canadá' },
  { code: 'GB', name: 'United Kingdom', nameEs: 'Reino Unido' },
  { code: 'ES', name: 'Spain', nameEs: 'España' },
];

const CURRENCIES: { code: Currency; name: string }[] = [
  { code: 'USD', name: 'US Dollar ($)' },
  { code: 'MXN', name: 'Mexican Peso ($)' },
  { code: 'EUR', name: 'Euro (€)' },
  { code: 'GBP', name: 'British Pound (£)' },
  { code: 'CAD', name: 'Canadian Dollar ($)' },
];

const LOCALES: { code: Locale; name: string }[] = [
  { code: 'en-US', name: 'English (US)' },
  { code: 'es-MX', name: 'Español (México)' },
  { code: 'en-GB', name: 'English (UK)' },
  { code: 'fr-FR', name: 'Français (France)' },
];

// Timezone entries with display labels showing GMT offset
const TIMEZONES: { value: string; label: string }[] = [
  { value: 'America/New_York', label: 'America/New_York (GMT-5)' },
  { value: 'America/Chicago', label: 'America/Chicago (GMT-6)' },
  { value: 'America/Denver', label: 'America/Denver (GMT-7)' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (GMT-8)' },
  { value: 'America/Mexico_City', label: 'America/Mexico_City (GMT-6)' },
  { value: 'America/Mazatlan', label: 'America/Mazatlan (GMT-7)' },
  { value: 'America/Tijuana', label: 'America/Tijuana (GMT-8)' },
  { value: 'America/Cancun', label: 'America/Cancun (GMT-5, No DST)' },
  { value: 'Europe/London', label: 'Europe/London (GMT+0)' },
  { value: 'Europe/Paris', label: 'Europe/Paris (GMT+1)' },
  { value: 'Europe/Madrid', label: 'Europe/Madrid (GMT+1)' },
];

export default function NewTenantPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { currentTenant, setTenant } = useTenant();
  const [currentStep, setCurrentStep] = useState<Step>('basic');
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [provisionResult, setProvisionResult] = useState<{
    success: boolean;
    tenantId?: string;
    error?: string;
    warnings: string[];
  } | null>(null);

  // VL Admin locale override: VL Admins always see English regardless of tenant locale
  const userIsVLAdmin = user && isVLAdmin(user);
  const locale = (userIsVLAdmin ? 'en-US' : (currentTenant?.locale === 'es-MX' ? 'es-MX' : 'en-US')) as 'en-US' | 'es-MX';
  const t = labels[locale];

  // Form state
  const [formData, setFormData] = useState<{
    name: string;
    displayName: string;
    industry: TenantIndustry;
    country: string;
    currency: Currency;
    locale: Locale;
    timezone: string;
    primaryColor: string;
    logoUrl: string;
    adminEmail: string;
    adminName: string;
    features: Partial<TenantFeatures>;
  }>({
    name: '',
    displayName: '',
    industry: 'Technology',
    country: 'US',
    currency: 'USD',
    locale: 'en-US',
    timezone: 'America/New_York',
    primaryColor: '#1e40af',
    logoUrl: '',
    adminEmail: '',
    adminName: '',
    features: {
      compensation: true,
      performance: true,
      transactions: true,
      salesFinance: false,
      forecasting: false,
      gamification: false,
      learning: false,
      coaching: false,
      whatsappIntegration: false,
      mobileApp: false,
      apiAccess: false,
    },
  });

  const industryTemplates = getIndustryTemplates();

  // Check VL Admin access
  if (!user || !isVLAdmin(user)) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <CardTitle className="text-red-600">{t.accessDenied}</CardTitle>
            <CardDescription>{t.accessDeniedDesc}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const currentStepIndex = STEPS.indexOf(currentStep);

  const handleNext = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < STEPS.length) {
      setCurrentStep(STEPS[nextIndex]);
    }
  };

  const handleBack = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(STEPS[prevIndex]);
    }
  };

  const handleIndustryChange = (industry: TenantIndustry) => {
    const template = industryTemplates.find((t) => t.industry === industry);
    if (template) {
      setFormData((prev) => ({
        ...prev,
        industry,
        currency: template.defaultCurrency,
        locale: template.defaultLocale,
        timezone: template.defaultTimezone,
        features: {
          ...prev.features,
          ...template.defaultFeatures,
        },
      }));
    } else {
      setFormData((prev) => ({ ...prev, industry }));
    }
  };

  const handleProvision = async () => {
    setIsProvisioning(true);
    setCurrentStep('provision');

    try {
      const engine = getTenantProvisioningEngine();
      const request: TenantProvisioningRequest = {
        name: formData.name,
        displayName: formData.displayName,
        industry: formData.industry,
        country: formData.country,
        adminEmail: formData.adminEmail,
        adminName: formData.adminName, // Pass admin name to provisioning
        currency: formData.currency,
        locale: formData.locale,
        timezone: formData.timezone,
        primaryColor: formData.primaryColor,
        logo: formData.logoUrl || undefined,
        features: formData.features as Partial<TenantFeatures>,
      };

      const result = engine.provisionTenant(request);
      setProvisionResult(result);
    } catch (error) {
      setProvisionResult({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        warnings: [],
      });
    } finally {
      setIsProvisioning(false);
    }
  };

  const handleGoToTenant = async () => {
    if (provisionResult?.tenantId) {
      await setTenant(provisionResult.tenantId);
      router.push('/');
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 'basic':
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">{t.fields.companyName} *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Acme Corp"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="displayName">{t.fields.displayName} *</Label>
                <Input
                  id="displayName"
                  value={formData.displayName}
                  onChange={(e) => setFormData((prev) => ({ ...prev, displayName: e.target.value }))}
                  placeholder="Acme Corporation"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="industry">{t.fields.industry} *</Label>
              <Select
                value={formData.industry}
                onValueChange={(v) => handleIndustryChange(v as TenantIndustry)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {industryTemplates.map((template) => (
                    <SelectItem key={template.industry} value={template.industry}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formData.industry && (
                <p className="text-sm text-slate-500">
                  {industryTemplates.find((t) => t.industry === formData.industry)?.description}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="country">{t.fields.country} *</Label>
              <Select
                value={formData.country}
                onValueChange={(v) => setFormData((prev) => ({ ...prev, country: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((country) => (
                    <SelectItem key={country.code} value={country.code}>
                      {locale === 'es-MX' ? country.nameEs : country.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 'localization':
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="currency">{t.fields.currency}</Label>
                <Select
                  value={formData.currency}
                  onValueChange={(v) => setFormData((prev) => ({ ...prev, currency: v as Currency }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="locale">{t.fields.locale}</Label>
                <Select
                  value={formData.locale}
                  onValueChange={(v) => setFormData((prev) => ({ ...prev, locale: v as Locale }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LOCALES.map((l) => (
                      <SelectItem key={l.code} value={l.code}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="timezone">{t.fields.timezone}</Label>
              <Select
                value={formData.timezone}
                onValueChange={(v) => setFormData((prev) => ({ ...prev, timezone: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz.value} value={tz.value}>
                      {tz.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 'branding':
        return (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="primaryColor">{t.fields.primaryColor}</Label>
              <div className="flex gap-4 items-center">
                <Input
                  id="primaryColor"
                  type="color"
                  value={formData.primaryColor}
                  onChange={(e) => setFormData((prev) => ({ ...prev, primaryColor: e.target.value }))}
                  className="w-20 h-10 p-1 cursor-pointer"
                />
                <Input
                  value={formData.primaryColor}
                  onChange={(e) => setFormData((prev) => ({ ...prev, primaryColor: e.target.value }))}
                  placeholder="#1e40af"
                  className="flex-1"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="logoUrl">{t.fields.logoUrl}</Label>
              <Input
                id="logoUrl"
                value={formData.logoUrl}
                onChange={(e) => setFormData((prev) => ({ ...prev, logoUrl: e.target.value }))}
                placeholder="https://example.com/logo.png"
              />
            </div>
            <div className="p-4 rounded-lg border" style={{ borderColor: formData.primaryColor }}>
              <p className="text-sm text-slate-500 mb-2">Preview</p>
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold"
                  style={{ backgroundColor: formData.primaryColor }}
                >
                  {formData.displayName?.[0] || 'A'}
                </div>
                <span className="font-semibold">{formData.displayName || 'Company Name'}</span>
              </div>
            </div>
          </div>
        );

      case 'modules':
        return (
          <div className="space-y-4">
            <p className="text-sm text-slate-500 mb-4">
              Select the modules to enable for this tenant. Core modules are enabled by default.
            </p>
            <div className="grid grid-cols-2 gap-4">
              {Object.entries(t.features).map(([key, label]) => (
                <div key={key} className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-slate-50">
                  <Checkbox
                    id={key}
                    checked={formData.features[key as keyof TenantFeatures] || false}
                    onCheckedChange={(checked) =>
                      setFormData((prev) => ({
                        ...prev,
                        features: { ...prev.features, [key]: checked },
                      }))
                    }
                  />
                  <Label htmlFor={key} className="flex-1 cursor-pointer">
                    {label}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        );

      case 'admin':
        return (
          <div className="space-y-6">
            <p className="text-sm text-slate-500">
              Create the initial admin user for this tenant. They will receive an email invitation.
            </p>
            <div className="space-y-2">
              <Label htmlFor="adminName">{t.fields.adminName} *</Label>
              <Input
                id="adminName"
                value={formData.adminName}
                onChange={(e) => setFormData((prev) => ({ ...prev, adminName: e.target.value }))}
                placeholder="John Smith"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adminEmail">{t.fields.adminEmail} *</Label>
              <Input
                id="adminEmail"
                type="email"
                value={formData.adminEmail}
                onChange={(e) => setFormData((prev) => ({ ...prev, adminEmail: e.target.value }))}
                placeholder="admin@company.com"
              />
            </div>
          </div>
        );

      case 'review':
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <h4 className="font-medium text-slate-900 mb-2">{t.steps.basic}</h4>
                <dl className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-slate-500">{t.fields.companyName}:</dt>
                    <dd className="font-medium">{formData.name}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">{t.fields.displayName}:</dt>
                    <dd className="font-medium">{formData.displayName}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">{t.fields.industry}:</dt>
                    <dd className="font-medium">{formData.industry}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">{t.fields.country}:</dt>
                    <dd className="font-medium">{formData.country}</dd>
                  </div>
                </dl>
              </div>
              <div>
                <h4 className="font-medium text-slate-900 mb-2">{t.steps.localization}</h4>
                <dl className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-slate-500">{t.fields.currency}:</dt>
                    <dd className="font-medium">{formData.currency}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">{t.fields.locale}:</dt>
                    <dd className="font-medium">{formData.locale}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">{t.fields.timezone}:</dt>
                    <dd className="font-medium">{formData.timezone}</dd>
                  </div>
                </dl>
              </div>
            </div>
            <div>
              <h4 className="font-medium text-slate-900 mb-2">{t.steps.modules}</h4>
              <div className="flex flex-wrap gap-2">
                {Object.entries(formData.features)
                  .filter(([, enabled]) => enabled)
                  .map(([key]) => (
                    <Badge key={key} variant="secondary">
                      {t.features[key as keyof typeof t.features]}
                    </Badge>
                  ))}
              </div>
            </div>
            <div>
              <h4 className="font-medium text-slate-900 mb-2">{t.steps.admin}</h4>
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500">{t.fields.adminName}:</dt>
                  <dd className="font-medium">{formData.adminName}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">{t.fields.adminEmail}:</dt>
                  <dd className="font-medium">{formData.adminEmail}</dd>
                </div>
              </dl>
            </div>
          </div>
        );

      case 'provision':
        return (
          <div className="space-y-6 text-center py-8">
            {isProvisioning ? (
              <>
                <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-200 border-t-blue-600 mx-auto" />
                <p className="text-lg font-medium">Provisioning tenant...</p>
              </>
            ) : provisionResult?.success ? (
              <>
                <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
                <div>
                  <p className="text-lg font-medium text-green-600">Tenant Provisioned Successfully!</p>
                  <p className="text-slate-500 mt-1">Tenant ID: {provisionResult.tenantId}</p>
                </div>
                {provisionResult.warnings.length > 0 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-left">
                    <p className="font-medium text-yellow-800 mb-2">Warnings:</p>
                    <ul className="list-disc list-inside text-sm text-yellow-700">
                      {provisionResult.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <Button onClick={handleGoToTenant} size="lg">
                  {t.buttons.goToTenant}
                  <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              </>
            ) : (
              <>
                <AlertCircle className="h-16 w-16 text-red-500 mx-auto" />
                <div>
                  <p className="text-lg font-medium text-red-600">Provisioning Failed</p>
                  <p className="text-slate-500 mt-1">{provisionResult?.error}</p>
                </div>
                <Button variant="outline" onClick={() => setCurrentStep('review')}>
                  <ChevronLeft className="h-4 w-4 mr-2" />
                  Go Back
                </Button>
              </>
            )}
          </div>
        );
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 'basic':
        return formData.name && formData.displayName && formData.industry && formData.country;
      case 'localization':
        return formData.currency && formData.locale && formData.timezone;
      case 'branding':
        return true;
      case 'modules':
        return Object.values(formData.features).some((v) => v);
      case 'admin':
        return formData.adminEmail && formData.adminName && formData.adminEmail.includes('@');
      case 'review':
        return true;
      default:
        return false;
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">{t.title}</h1>
        <p className="text-slate-500">{t.subtitle}</p>
      </div>

      {/* Step Indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {STEPS.map((step, index) => {
            const Icon = STEP_ICONS[step];
            const isActive = step === currentStep;
            const isCompleted = index < currentStepIndex;

            return (
              <div key={step} className="flex items-center">
                <div
                  className={`
                    flex items-center justify-center w-10 h-10 rounded-full border-2 transition-colors
                    ${isActive ? 'border-blue-600 bg-blue-600 text-white' : ''}
                    ${isCompleted ? 'border-green-500 bg-green-500 text-white' : ''}
                    ${!isActive && !isCompleted ? 'border-slate-300 text-slate-400' : ''}
                  `}
                >
                  {isCompleted ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                </div>
                {index < STEPS.length - 1 && (
                  <div
                    className={`w-12 h-0.5 mx-2 ${
                      isCompleted ? 'bg-green-500' : 'bg-slate-200'
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
        <div className="flex justify-between mt-2">
          {STEPS.map((step) => (
            <span key={step} className="text-xs text-slate-500 w-10 text-center">
              {t.steps[step]}
            </span>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {(() => {
              const Icon = STEP_ICONS[currentStep];
              return <Icon className="h-5 w-5" />;
            })()}
            {t.steps[currentStep]}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {renderStepContent()}

          {/* Navigation Buttons */}
          {currentStep !== 'provision' && (
            <div className="flex justify-between mt-8 pt-6 border-t">
              <Button
                variant="outline"
                onClick={handleBack}
                disabled={currentStepIndex === 0}
              >
                <ChevronLeft className="h-4 w-4 mr-2" />
                {t.buttons.back}
              </Button>
              {currentStep === 'review' ? (
                <Button onClick={handleProvision} disabled={!canProceed()}>
                  <Rocket className="h-4 w-4 mr-2" />
                  {t.buttons.provision}
                </Button>
              ) : (
                <Button onClick={handleNext} disabled={!canProceed()}>
                  {t.buttons.next}
                  <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
