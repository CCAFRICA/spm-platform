'use client';

/**
 * Briefing Experience — Persona-Responsive Calculation Summary
 *
 * OB-163 Phases 5-7: Single route, three experiences.
 *   - Rep → Individual Briefing (emerald)
 *   - Manager → Manager Briefing (amber)
 *   - Admin → Admin Briefing (indigo)
 *
 * Standing Rule 26: Data loaded at page level, passed as props.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { useOperate } from '@/contexts/operate-context';
import { usePersona } from '@/contexts/persona-context';
import { RequireRole } from '@/components/auth/RequireRole';
import { OperateSelector } from '@/components/operate/OperateSelector';
import { PERSONA_TOKENS } from '@/lib/design/tokens';
import { captureBriefingSignal, flushPendingSignals } from '@/lib/signals/briefing-signals';
import {
  loadIndividualBriefing,
  loadManagerBriefing,
  loadAdminBriefing,
  type IndividualBriefingData,
  type ManagerBriefingData,
  type AdminBriefingData,
} from '@/lib/data/briefing-loader';
import { IndividualBriefing } from '@/components/briefing/IndividualBriefing';
import { ManagerBriefing } from '@/components/briefing/ManagerBriefing';
import { AdminBriefing } from '@/components/briefing/AdminBriefing';
import { Loader2, Briefcase } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

function BriefingPageInner() {
  const { currentTenant } = useTenant();
  const { format: formatCurrency } = useCurrency();
  const { persona, entityId: personaEntityId } = usePersona();
  const {
    plans,
    selectedPeriodId,
    isLoading: contextLoading,
  } = useOperate();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data for each persona view
  const [individualData, setIndividualData] = useState<IndividualBriefingData | null>(null);
  const [managerData, setManagerData] = useState<ManagerBriefingData | null>(null);
  const [adminData, setAdminData] = useState<AdminBriefingData | null>(null);

  // Entity selector for admin/manager previewing as individual
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [entityOptions, setEntityOptions] = useState<Array<{ id: string; displayName: string; externalId: string }>>([]);

  const tenantId = currentTenant?.id || '';
  const activePlans = plans.filter(p => p.status === 'active');
  const ruleSetId = activePlans[0]?.id || '';

  // For admin/manager, load entity options so they can preview individual briefings
  useEffect(() => {
    if (!tenantId || persona === 'rep') return;

    const loadEntities = async () => {
      const supabase = createClient();
      const { data: entities } = await supabase
        .from('entities')
        .select('id, display_name, external_id')
        .eq('tenant_id', tenantId)
        .eq('entity_type', 'individual')
        .eq('status', 'active')
        .order('display_name')
        .limit(200);

      if (entities) {
        setEntityOptions(entities.map(e => ({
          id: e.id,
          displayName: e.display_name || '',
          externalId: e.external_id || '',
        })));
      }
    };

    loadEntities();
  }, [tenantId, persona]);

  // Find a manager entity for the current user (for manager persona)
  const [managerEntityId, setManagerEntityId] = useState<string | null>(null);
  useEffect(() => {
    if (!tenantId || persona !== 'manager') return;

    const findManager = async () => {
      const supabase = createClient();

      // Check if the user's persona entity is a manager (has 'manages' relationships)
      if (personaEntityId) {
        const { data: rels } = await supabase
          .from('entity_relationships')
          .select('id')
          .eq('source_entity_id', personaEntityId)
          .eq('relationship_type', 'manages')
          .limit(1);

        if (rels && rels.length > 0) {
          setManagerEntityId(personaEntityId);
          return;
        }
      }

      // Fallback: find first manager entity in tenant
      const { data: rels } = await supabase
        .from('entity_relationships')
        .select('source_entity_id')
        .eq('tenant_id', tenantId)
        .eq('relationship_type', 'manages')
        .limit(1);

      if (rels && rels.length > 0) {
        setManagerEntityId(rels[0].source_entity_id);
      }
    };

    findManager();
  }, [tenantId, persona, personaEntityId]);

  // Load briefing data when selections change
  const loadBriefing = useCallback(async () => {
    if (!tenantId || !selectedPeriodId || !ruleSetId) return;

    setLoading(true);
    setError(null);

    try {
      if (persona === 'rep') {
        // Individual briefing — need entity ID
        const entityId = selectedEntityId || personaEntityId;
        if (!entityId) {
          // For admin previewing as rep with no entity, pick first entity
          const supabase = createClient();
          const { data: firstEntity } = await supabase
            .from('entities')
            .select('id')
            .eq('tenant_id', tenantId)
            .eq('entity_type', 'individual')
            .eq('status', 'active')
            .limit(1)
            .maybeSingle();

          if (firstEntity) {
            setSelectedEntityId(firstEntity.id);
            const data = await loadIndividualBriefing(tenantId, selectedPeriodId, ruleSetId, firstEntity.id);
            setIndividualData(data);
          } else {
            setError('No entities found');
          }
        } else {
          const data = await loadIndividualBriefing(tenantId, selectedPeriodId, ruleSetId, entityId);
          setIndividualData(data);
          if (!data) setError('No calculation results for this period');
        }
      } else if (persona === 'manager') {
        if (managerEntityId) {
          const data = await loadManagerBriefing(tenantId, selectedPeriodId, ruleSetId, managerEntityId);
          setManagerData(data);
          if (!data) setError('No team results for this period');
        } else {
          setError('No manager entity found');
        }
      } else {
        // Admin
        const data = await loadAdminBriefing(tenantId, selectedPeriodId, ruleSetId);
        setAdminData(data);
        if (!data) setError('No calculation results for this period');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load briefing');
    } finally {
      setLoading(false);
    }
  }, [tenantId, selectedPeriodId, ruleSetId, persona, personaEntityId, selectedEntityId, managerEntityId]);

  useEffect(() => {
    loadBriefing();
  }, [loadBriefing]);

  // OB-163 Phase 9: Signal capture — view event on data load
  const hasEmittedView = useRef(false);
  useEffect(() => {
    if (loading || hasEmittedView.current) return;
    const hasData = (persona === 'rep' && individualData) ||
      (persona === 'manager' && managerData) ||
      (persona === 'admin' && adminData);
    if (hasData && tenantId && selectedPeriodId) {
      hasEmittedView.current = true;
      captureBriefingSignal({
        signalType: 'view',
        persona,
        section: 'briefing_page',
        tenantId,
        periodId: selectedPeriodId,
        entityId: persona === 'rep' ? (selectedEntityId || personaEntityId || undefined) : undefined,
      });
    }
  }, [loading, persona, individualData, managerData, adminData, tenantId, selectedPeriodId, selectedEntityId, personaEntityId]);

  // Flush signals on unmount
  useEffect(() => {
    return () => { flushPendingSignals(); };
  }, []);

  // Persona switcher label
  const personaLabel = persona === 'admin' ? 'Admin' : persona === 'manager' ? 'Manager' : 'Individual';
  const personaToken = PERSONA_TOKENS[persona];

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-6 lg:p-8 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg bg-gradient-to-br ${personaToken.heroGrad}`}>
              <Briefcase className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-zinc-100">Briefing</h1>
              <p className="text-sm text-zinc-500">{personaToken.intentDescription}</p>
            </div>
          </div>
          <span className={`text-[10px] uppercase tracking-wider font-medium px-2.5 py-1 rounded-full border ${
            persona === 'admin'
              ? 'text-indigo-400 border-indigo-500/30 bg-indigo-500/10'
              : persona === 'manager'
                ? 'text-amber-400 border-amber-500/30 bg-amber-500/10'
                : 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
          }`}>
            {personaLabel}
          </span>
        </div>

        {/* Operate Selector */}
        <div className="mb-6">
          <OperateSelector />
        </div>

        {/* Entity selector for individual preview (admin/manager viewing as rep) */}
        {persona === 'rep' && entityOptions.length > 0 && (
          <div className="mb-6">
            <label className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium block mb-1.5">
              Preview As
            </label>
            <select
              className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-300 w-full max-w-xs"
              value={selectedEntityId || personaEntityId || ''}
              onChange={(e) => setSelectedEntityId(e.target.value)}
            >
              {entityOptions.map(ent => (
                <option key={ent.id} value={ent.id}>
                  {ent.displayName} ({ent.externalId})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Content */}
        {contextLoading || loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-600" />
            <span className="ml-2 text-sm text-zinc-500">Loading briefing...</span>
          </div>
        ) : error ? (
          <div className="text-center py-20">
            <p className="text-sm text-zinc-500">{error}</p>
            <p className="text-xs text-zinc-600 mt-1">
              Make sure calculations have been run for the selected period.
            </p>
          </div>
        ) : !selectedPeriodId ? (
          <div className="text-center py-20">
            <p className="text-sm text-zinc-500">Select a period to view the briefing.</p>
          </div>
        ) : (
          <>
            {persona === 'rep' && individualData && (
              <IndividualBriefing data={individualData} formatCurrency={formatCurrency} />
            )}
            {persona === 'manager' && managerData && (
              <ManagerBriefing data={managerData} formatCurrency={formatCurrency} />
            )}
            {persona === 'admin' && adminData && (
              <AdminBriefing data={adminData} formatCurrency={formatCurrency} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function BriefingPage() {
  return (
    <RequireRole roles={['platform', 'admin', 'tenant_admin']}>
      <BriefingPageInner />
    </RequireRole>
  );
}
