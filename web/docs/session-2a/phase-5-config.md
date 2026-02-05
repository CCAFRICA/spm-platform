# Session 2A - Phase 5: Configuration Framework
## Duration: 1 hour

### Objective
Create terminology customization system so clients can rename "Region" to "Franchise", etc.

---

## Task 5.1: Create Configuration Context (25 min)

**File:** `src/contexts/config-context.tsx`

```typescript
'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { audit } from '@/lib/audit-service';

interface TermDefinition {
  singular: string;
  plural: string;
}

interface TerminologyConfig {
  organizational: {
    region: TermDefinition;
    territory: TermDefinition;
    district: TermDefinition;
    store: TermDefinition;
  };
  roles: {
    salesRep: TermDefinition;
    manager: TermDefinition;
    director: TermDefinition;
  };
  transactions: {
    order: TermDefinition;
    sale: TermDefinition;
    deal: TermDefinition;
  };
  performance: {
    quota: TermDefinition;
    goal: TermDefinition;
    target: TermDefinition;
  };
  compensation: {
    commission: TermDefinition;
    bonus: TermDefinition;
    incentive: TermDefinition;
  };
}

const DEFAULT_TERMINOLOGY: TerminologyConfig = {
  organizational: {
    region: { singular: 'Region', plural: 'Regions' },
    territory: { singular: 'Territory', plural: 'Territories' },
    district: { singular: 'District', plural: 'Districts' },
    store: { singular: 'Store', plural: 'Stores' },
  },
  roles: {
    salesRep: { singular: 'Sales Rep', plural: 'Sales Reps' },
    manager: { singular: 'Manager', plural: 'Managers' },
    director: { singular: 'Director', plural: 'Directors' },
  },
  transactions: {
    order: { singular: 'Order', plural: 'Orders' },
    sale: { singular: 'Sale', plural: 'Sales' },
    deal: { singular: 'Deal', plural: 'Deals' },
  },
  performance: {
    quota: { singular: 'Quota', plural: 'Quotas' },
    goal: { singular: 'Goal', plural: 'Goals' },
    target: { singular: 'Target', plural: 'Targets' },
  },
  compensation: {
    commission: { singular: 'Commission', plural: 'Commissions' },
    bonus: { singular: 'Bonus', plural: 'Bonuses' },
    incentive: { singular: 'Incentive', plural: 'Incentives' },
  },
};

interface ConfigContextType {
  terminology: TerminologyConfig;
  isLoading: boolean;
  t: (path: string, plural?: boolean) => string;
  updateTerm: (category: string, key: string, singular: string, plural: string) => void;
  resetToDefaults: () => void;
}

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [terminology, setTerminology] = useState<TerminologyConfig>(DEFAULT_TERMINOLOGY);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('terminology_config');
    if (stored) {
      try { setTerminology(JSON.parse(stored)); } catch {}
    }
    setIsLoading(false);
  }, []);

  const t = (path: string, plural = false): string => {
    const [category, key] = path.split('.');
    const cat = terminology[category as keyof TerminologyConfig];
    if (!cat) return path;
    const term = cat[key as keyof typeof cat];
    if (!term) return key;
    return plural ? term.plural : term.singular;
  };

  const updateTerm = (category: string, key: string, singular: string, plural: string) => {
    const newTerminology = {
      ...terminology,
      [category]: {
        ...terminology[category as keyof TerminologyConfig],
        [key]: { singular, plural },
      },
    };
    setTerminology(newTerminology);
    localStorage.setItem('terminology_config', JSON.stringify(newTerminology));
    audit.log({
      action: 'update',
      entityType: 'config',
      entityId: 'terminology',
      reason: `Updated ${category}.${key}`,
    });
  };

  const resetToDefaults = () => {
    setTerminology(DEFAULT_TERMINOLOGY);
    localStorage.removeItem('terminology_config');
    audit.log({ action: 'update', entityType: 'config', entityId: 'terminology', reason: 'Reset to defaults' });
  };

  return (
    <ConfigContext.Provider value={{ terminology, isLoading, t, updateTerm, resetToDefaults }}>
      {children}
    </ConfigContext.Provider>
  );
}

export function useConfig() {
  const context = useContext(ConfigContext);
  if (!context) throw new Error('useConfig must be used within ConfigProvider');
  return context;
}
```

---

## Task 5.2: Create Terminology Editor Page (30 min)

**File:** `src/app/configuration/terminology/page.tsx`

```typescript
'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Settings, Edit, RotateCcw, Save, Building, Users, ShoppingCart, Target, DollarSign } from 'lucide-react';
import { useConfig } from '@/contexts/config-context';
import { usePermissions } from '@/hooks/use-permissions';

const CATEGORIES = [
  { key: 'organizational', label: 'Organizational', icon: Building },
  { key: 'roles', label: 'Roles', icon: Users },
  { key: 'transactions', label: 'Transactions', icon: ShoppingCart },
  { key: 'performance', label: 'Performance', icon: Target },
  { key: 'compensation', label: 'Compensation', icon: DollarSign },
];

export default function TerminologyPage() {
  const { terminology, updateTerm, resetToDefaults, t } = useConfig();
  const { canEditConfig } = usePermissions();
  const [activeTab, setActiveTab] = useState('organizational');
  const [editing, setEditing] = useState<{ category: string; key: string; singular: string; plural: string } | null>(null);

  const handleEdit = (category: string, key: string) => {
    const cat = terminology[category as keyof typeof terminology];
    const term = cat[key as keyof typeof cat];
    setEditing({ category, key, singular: term.singular, plural: term.plural });
  };

  const handleSave = () => {
    if (editing) {
      updateTerm(editing.category, editing.key, editing.singular, editing.plural);
      setEditing(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Settings className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Terminology</h1>
            <p className="text-muted-foreground text-sm">Customize platform terms</p>
          </div>
        </div>
        {canEditConfig && (
          <Button variant="outline" onClick={() => confirm('Reset all?') && resetToDefaults()}>
            <RotateCcw className="mr-2 h-4 w-4" />Reset
          </Button>
        )}
      </div>

      {!canEditConfig && (
        <Card className="border-yellow-300 bg-yellow-50 dark:bg-yellow-950">
          <CardContent className="py-3 text-sm text-yellow-800 dark:text-yellow-200">
            View only. Contact admin for changes.
          </CardContent>
        </Card>
      )}

      <Card className="bg-muted/30">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Preview</CardTitle></CardHeader>
        <CardContent className="text-sm">
          "{t('organizational.region', true)} Performance" • "Top {t('roles.salesRep', true)}"
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-5">
          {CATEGORIES.map(({ key, label, icon: Icon }) => (
            <TabsTrigger key={key} value={key}><Icon className="h-4 w-4 mr-1" />{label}</TabsTrigger>
          ))}
        </TabsList>

        {CATEGORIES.map(({ key, label, icon: Icon }) => (
          <TabsContent key={key} value={key}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Icon className="h-5 w-5" />{label}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 md:grid-cols-2">
                  {Object.entries(terminology[key as keyof typeof terminology]).map(([termKey, term]) => (
                    <div key={termKey} className="flex items-center justify-between p-3 rounded-lg border">
                      <div>
                        <p className="text-xs text-muted-foreground font-mono">{termKey}</p>
                        <p className="font-medium">{term.singular} <span className="text-muted-foreground">/ {term.plural}</span></p>
                      </div>
                      {canEditConfig && (
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(key, termKey)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      <Dialog open={!!editing} onOpenChange={() => setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Term</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-4">
              <p className="font-mono text-sm text-muted-foreground">{editing.key}</p>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Singular</Label><Input value={editing.singular} onChange={e => setEditing({...editing, singular: e.target.value})} /></div>
                <div><Label>Plural</Label><Input value={editing.plural} onChange={e => setEditing({...editing, plural: e.target.value})} /></div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={handleSave}><Save className="mr-2 h-4 w-4" />Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

---

## Task 5.3: Add ConfigProvider to Layout

Update `src/app/layout.tsx` to wrap with ConfigProvider (inside AuthProvider).

---

## Verification

```bash
npm run build && npm run dev
```

**Test:**
1. `/configuration/terminology` loads ✓
2. Edit "region" → "Franchise" ✓
3. Preview updates ✓
4. Audit log shows change ✓
5. Reset works ✓
