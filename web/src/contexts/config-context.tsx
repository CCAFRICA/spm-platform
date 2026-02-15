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
    // Use default terminology (no localStorage)
    setIsLoading(false);
  }, []);

  const t = (path: string, plural = false): string => {
    const [category, key] = path.split('.');
    const cat = terminology[category as keyof TerminologyConfig];
    if (!cat) return path;
    const term = cat[key as keyof typeof cat] as { singular: string; plural: string } | undefined;
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
    audit.log({
      action: 'update',
      entityType: 'config',
      entityId: 'terminology',
      reason: `Updated ${category}.${key}`,
    });
  };

  const resetToDefaults = () => {
    setTerminology(DEFAULT_TERMINOLOGY);
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
