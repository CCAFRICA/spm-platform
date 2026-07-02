// SCI Analyze API — POST /api/import/sci/analyze
// Decision 77 — OB-127, OB-160C Consolidated Scoring Pipeline
// Accepts parsed file data, returns agent-classified proposal.
// Zero domain vocabulary. Korean Test applies.

// OB-150: Production timeout fix
export const runtime = 'nodejs';
export const maxDuration = 300; // Vercel Pro max

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateContentProfileStats, generateContentProfilePatterns } from '@/lib/sci/content-profile';
import { runDecomposedComprehension } from '@/lib/sci/header-comprehension';
import { createIngestionState, buildProposalFromState } from '@/lib/sci/synaptic-ingestion-state';
import type { ClassificationTrace } from '@/lib/sci/synaptic-ingestion-state';
import { resolveClassification } from '@/lib/sci/resolver';
// OB-203 Phase 3 (R2/DI-1): durable unit-state emission on the canonical surface.
import { emitUnitStates, type UnitStateSignalParams, type UnitComprehensionState } from '@/lib/sci/comprehension-state-service';
// OB-203 Phase 4 (R3): signal-spine vocabulary — fire-and-forget (DI-5 write-side; never blocks import).
import { fireSignal, buildTierResolutionSignal, buildCompositionSignal, buildSessionLifecycleSignal } from '@/lib/sci/comprehension-signal-vocabulary';
import { ob203Trace } from '@/lib/sci/ob203-verbose';
import { requiresHumanReview } from '@/lib/sci/agents';
// OB-199 Phase 4 supplement A: facade re-established at lib/sci/classification-signal-service.ts.
import { computeStructuralFingerprint, lookupPriorSignals, lookupLexicalPrior, computeClassificationDensity, writeClassificationSignal, emitComprehensionFailureSignals, emitReinforcementBlockedSignal, shouldReinforceUnit } from '@/lib/sci/classification-signal-service';
import { CanonicalWriteError } from '@/lib/intelligence/canonical-signal-writer';
// OB-199 Phase 4: ClassificationSignalPayload no longer constructed at call site
// (canonical writer accepts CanonicalSignalInput directly). Type import removed.
import type { ClassificationDensity, StructuralFingerprint } from '@/lib/sci/classification-signal-service';
import { lookupFingerprint, writeFingerprint, type FlywheelLookupResult } from '@/lib/sci/fingerprint-flywheel';
import { loadPromotedPatterns } from '@/lib/sci/promoted-patterns';
import { queryTenantContext, computeEntityIdOverlap } from '@/lib/sci/tenant-context';
import type { SCIProposal, ContentProfile, ContentUnitProposal, AgentType } from '@/lib/sci/sci-types';

const PROCESSING_ORDER: Record<AgentType, number> = {
  plan: 0,
  entity: 1,
  target: 2,
  transaction: 3,
  reference: 4,
};

export async function POST(req: NextRequest) {
  try {
    // Auth check
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const body = await req.json();
    const { tenantId, files, importSessionId: clientSessionId } = body as {
      tenantId: string;
      importSessionId?: string;   // OB-203 D12: client owns the session id so it can observe/recover
      files: Array<{
        fileName: string;
        sheets: Array<{
          sheetName: string;
          columns: string[];
          rows: Record<string, unknown>[];
          totalRowCount: number;
        }>;
      }>;
    };

    if (!tenantId || !files || files.length === 0) {
      return NextResponse.json({ error: 'tenantId and files required' }, { status: 400 });
    }

    // Verify tenant exists + read industry for domain flywheel (OB-160J)
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id, settings')
      .eq('id', tenantId)
      .single();

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }
    const tenantSettings = (tenant.settings as Record<string, unknown>) ?? {};
    const tenantDomainId = (tenantSettings.industry as string) || '';

    // OB-203 D12: prefer the CLIENT-provided session id so the client can poll live progress during
    // analyze and recover the proposal if the response races a stall-abort. Falls back to a fresh id.
    const proposalId = (clientSessionId && typeof clientSessionId === 'string') ? clientSessionId : crypto.randomUUID();
    // OB-203 Phase 3: importSessionId IS the comprehension-session identity — an alias of
    // proposalId (P2). Distinct from execute-side import_batch_id (HF-213). Stamped on every
    // unit-state signal so the import surface and Phase 5 poll one durable session.
    const importSessionId = proposalId;
    // OB-203 Phase 4 (R3): session lifecycle — `open` once per comprehension session.
    fireSignal(
      buildSessionLifecycleSignal({ tenantId, importSessionId, phase: 'open', unitCount: files.reduce((s, f) => s + f.sheets.length, 0) }),
      process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const contentUnits: ContentUnitProposal[] = [];
    const densityMap = new Map<string, ClassificationDensity>(); // OB-160K
    const fingerprintMap = new Map<string, StructuralFingerprint>(); // HF-094

    // OB-160L: Load promoted patterns once (from foundational signals)
    const promotedPatterns = await loadPromotedPatterns(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    for (const file of files) {
      // Phase A: Generate Content Profile STATS for all sheets (no patterns yet — HC primacy per Decision 108)
      // HF-196 Phase 1G Path α: Two-phase split. Stats are deterministic; patterns are computed
      // in Phase B after HC has run (Phase B receives HC interpretations and gates structural arms on HC silence).
      const profileMap = new Map<string, ContentProfile>();
      const sheetRowsBySheet = new Map<string, Record<string, unknown>[]>();
      const fileSheets: Array<{ sourceFile: string; sheetName: string }> = [];

      // OB-203 Phase 3: unit identity per sheet (= profile.contentUnitId, fileName::sheet::tabIndex).
      const unitIdBySheet = new Map<string, string>();
      const stateBase = (sheetName: string, state: UnitComprehensionState, seq: number, extra: Partial<UnitStateSignalParams> = {}): UnitStateSignalParams => ({
        tenantId, importSessionId, unitId: unitIdBySheet.get(sheetName)!, sheetName, sourceFileName: file.fileName, state, seq, ...extra,
      });

      // DI-1 (EPG-3.2): emit `persisted` at sheet ENUMERATION — state-zero, BEFORE any profiling.
      // If profiling later throws for a sheet, its persisted signal already exists durably.
      for (let tabIndex = 0; tabIndex < file.sheets.length; tabIndex++) {
        const sheet = file.sheets[tabIndex];
        unitIdBySheet.set(sheet.sheetName, `${file.fileName}::${sheet.sheetName}::${tabIndex}`);
      }
      await emitUnitStates(
        file.sheets.map(s => stateBase(s.sheetName, 'persisted', 0)),
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      );

      // Profiling — `profiled` on success, `failed_interpretation` (profiling_error) on throw.
      const profileStateParams: UnitStateSignalParams[] = [];
      for (let tabIndex = 0; tabIndex < file.sheets.length; tabIndex++) {
        const sheet = file.sheets[tabIndex];
        try {
          const profile = generateContentProfileStats(
            sheet.sheetName,
            tabIndex,
            file.fileName,
            sheet.columns,
            sheet.rows,
            sheet.totalRowCount,
          );
          profileMap.set(sheet.sheetName, profile);
          sheetRowsBySheet.set(sheet.sheetName, sheet.rows);
          fileSheets.push({ sourceFile: file.fileName, sheetName: sheet.sheetName });
          profileStateParams.push(stateBase(sheet.sheetName, 'profiled', 1));
        } catch (profErr) {
          console.error(`[OB-203][state] profiling failed for sheet=${sheet.sheetName}: ${profErr instanceof Error ? profErr.message : String(profErr)}`);
          profileStateParams.push(stateBase(sheet.sheetName, 'failed_interpretation', 1, { failureClass: 'profiling_error' }));
        }
      }
      await emitUnitStates(profileStateParams, process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

      // OB-174 Phase 3 / HF-197B: DS-017 Tier Routing — PER-SHEET fingerprint lookup BEFORE LLM call.
      // Pre-HF-197B: a single H(sheets[0]) was used for the entire file, causing cross-sheet
      // binding injection (DIAG-021 H3+H4). Per-sheet keying restores DS-017 §3.1 semantics.
      const sheetFlywheelResults = new Map<string, FlywheelLookupResult>();
      for (const sheet of file.sheets) {
        try {
          const result = await lookupFingerprint(
            tenantId,
            sheet.columns,
            sheet.rows,
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
          );
          sheetFlywheelResults.set(sheet.sheetName, result);
          console.log(`[SCI-FINGERPRINT] file=${file.fileName} sheet=${sheet.sheetName} fingerprint=${result.fingerprintHash.substring(0, 12)} tier=${result.tier} match=${result.match} confidence=${result.confidence}`);
        } catch (fpErr) {
          console.warn(`[SCI-FINGERPRINT] Lookup failed for sheet=${sheet.sheetName} (non-blocking): ${fpErr instanceof Error ? fpErr.message : 'unknown'}`);
        }
      }

      // OB-203 Phase 3: `recognized(tier)` — fingerprint lookup done; each profiled sheet
      // carries its recognition tier (Tier-1 sheet-flywheel hit, else Tier-3 novel → atoms).
      await emitUnitStates(
        Array.from(profileMap.keys()).map(sheetName =>
          stateBase(sheetName, 'recognized', 2, { tier: sheetFlywheelResults.get(sheetName)?.tier ?? null })),
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      );

      // HF-254 Fix 2b: the HF-236 divert gate (NATIVE_COLUMN_ROLES set +
      // insufficientFlywheelCache) is DELETED. HF-236 was a compensation (SR-34) for an
      // unreliable fingerprint write: when the cached fieldBindings lacked native
      // data_nature, it diverted the sheet into fresh-LLM HC — which, after HF-239 armed
      // the warm caches, routed straight into the now-deleted vocabulary fabrication gate
      // (D1) and corrupted the import to entity. HF-254 Fix 2a makes the fingerprint write
      // always carry native data_nature server-side, so the cache the warm import reads is
      // reliable and the compensation is removed. The fingerprint flywheel is now the SOLE
      // LLM-skip authority. (HF-247's lookupFingerprint column_roles-'unknown' outcome gate
      // is unchanged — it remains the failure-quality guard on the READ surface.)
      const sheetSkipHC = (sheetName: string) => {
        const r = sheetFlywheelResults.get(sheetName);
        return r?.tier === 1 && r.match;
      };

      // Phase B: OB-203 Phase 2 (5b) — DECOMPOSED comprehension for sheets where sheet-Tier-1
      // did not hit. Atom-level read-before-derive: known atoms claim roles (no LLM), only novel
      // residue is comprehended (bounded), failures are per-unit, atoms accumulate (gated).
      // HF-372 Phase F (converged with process-job, AP-17): EVERY sheet goes through decomposed
      // comprehension. The former Tier-1 skip + fieldBindings fabrication left interpretations
      // WITHOUT the model's bare primitives — the HF-367/368 classifier fail-louds on exactly that
      // (the analyze-route sibling of F-NEW-1). Decomposed comprehension IS the warm path: known
      // atoms claim from the flywheel without an LLM dispatch; only the novel/identifier residue
      // comprehends.
      const sheetsNeedingHC = file.sheets;
      let hcMetrics: import('@/lib/sci/sci-types').HeaderComprehensionMetrics | { llmCalled: boolean; llmCallDuration: number; averageConfidence: number; columnsInterpreted: number; crossSheetInsightCount: number };
      const perSheetFailure = new Map<string, import('@/lib/sci/sci-types').ComprehensionFailureClass>();
      let provenanceMap = new Map<string, { recognizedFraction: number; novelCount: number; llmCalled: boolean }>();
      if (sheetsNeedingHC.length === 0) {
        hcMetrics = {
          llmCalled: false,
          llmCallDuration: 0,
          averageConfidence: (() => {
            const confs = Array.from(sheetFlywheelResults.values()).map(r => r.confidence);
            return confs.length > 0 ? confs.reduce((s, c) => s + c, 0) / confs.length : 0;
          })(),
          columnsInterpreted: 0,
          crossSheetInsightCount: 0,
        };
      } else {
        const dc = await runDecomposedComprehension(
          profileMap,
          sheetsNeedingHC.map(s => ({ sheetName: s.sheetName, columns: s.columns, rows: s.rows, rowCount: s.totalRowCount })), // FULL rows (Deviation 2)
          tenantId,
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          // OB-203 D13: STREAM the comprehended/failed state as EACH sheet finishes (fire-and-forget),
          // so the import surface advances truthfully through the long comprehension stretch and the
          // client stall detector sees live progress. The batched comprehended emission below now
          // covers ONLY the Tier-1 (recognized, no-dispatch) sheets.
          (u) => {
            const unitId = unitIdBySheet.get(u.sheetName);
            if (!unitId) return;
            const state = u.status === 'failed_interpretation' ? 'failed_interpretation' as const : 'comprehended' as const;
            // D17: carry tier + knownCount on the STREAMED state so the telemetry counters (fingerprints,
            // atoms, LLM) move live off the per-sheet stream — not off the end-batched tier/composition
            // signals. The flywheel signals still fire below; these are the same numbers, streamed.
            const tier = sheetFlywheelResults.get(u.sheetName)?.tier ?? null;
            const colCount = profileMap.get(u.sheetName)?.structure.columnCount ?? 0;
            const novel = u.novelCount ?? 0;
            void emitUnitStates(
              [{ tenantId, importSessionId, unitId, sheetName: u.sheetName, sourceFileName: file.fileName, state, seq: 3, tier, knownCount: Math.max(0, colCount - novel), novelCount: u.novelCount, failureClass: u.failureClass }],
              process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
            );
            // D17: stream the decision verbose AT completion time (per-sheet), not end-batched.
            ob203Trace('llm', { sheet: u.sheetName, tier, decision: u.status === 'comprehended' ? 'made' : 'failed' });
            ob203Trace('atom', { sheet: u.sheetName, known: Math.max(0, colCount - novel), novel });
          },
        );
        hcMetrics = dc.metrics;
        provenanceMap = dc.provenance;
        // OB-203 Phase 1 (DI-4): per-unit failure — one durable failed_interpretation signal per
        // failed sheet, with ITS structural class (decomposed dispatch isolates failures per unit).
        for (const [sheetName, failureClass] of Array.from(dc.perSheetFailure.entries())) {
          perSheetFailure.set(sheetName, failureClass);
          await emitComprehensionFailureSignals(
            { failureClass, durationMs: 0 },
            [{ sheetName }],
            (name) => sheetFlywheelResults.get(name)?.fingerprintHash ?? null,
            (name) => sheetFlywheelResults.get(name)?.tier ?? null,
            { tenantId, sourceFileName: file.fileName },
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
          );
        }
      }

      // HF-372 Phase F: the HF-181/HF-254 Tier-1 fieldBindings INJECTION is DELETED — it fabricated
      // headerComprehension without the model's bare primitives (scope_role/nature_role/plan_role),
      // which the classifier reads by equality; every Tier-1 sheet then threw MissingRecognitionError.
      // Recognition now comes from decomposed comprehension for every sheet (warm atoms claim, above).
      const injectedBindingsBySheet = new Map<string, number>();

      // HF-372 Phase F: the Tier-1-only batched `comprehended` emit is DELETED — every sheet now
      // enters decomposed comprehension and streams its own state via the per-sheet callback above
      // (a second batch emit here would double-count). sheetSkipHC survives only as flywheel
      // telemetry input (tier display), not a recognition gate.
      void sheetSkipHC;

      // OB-203 Phase 4 (R3): tier-of-resolution + composition signals per comprehended unit
      // (fire-and-forget; DI-5 write-side). resolver = flywheel when Tier-1 recognition skipped the
      // LLM, else llm. composition confidence = the unit's atom recognized-fraction.
      for (const sheetName of Array.from(profileMap.keys())) {
        if (perSheetFailure.has(sheetName)) continue;
        const tier = sheetFlywheelResults.get(sheetName)?.tier ?? null;
        const prov = provenanceMap.get(sheetName);
        const unitId = unitIdBySheet.get(sheetName)!;
        const resolver = prov?.llmCalled ? 'llm' as const : 'flywheel' as const;
        fireSignal(
          buildTierResolutionSignal({ tenantId, unitId, sheetName, tier, resolver, injectedBindings: injectedBindingsBySheet.get(sheetName) ?? 0, importSessionId }),
          process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
        );
        // D17: the llm/fingerprint verbose now STREAMS per-sheet at comprehension time (onUnitDone +
        // Tier-1 emit above) — no longer end-batched here. The tier_resolution signal still fires here
        // for the flywheel (fieldBindings provenance), but the witness-trace happens at decision time.
        if (prov) {
          // knownCount: columns NOT in the novel residue (clean, NaN-free approximation; the load-
          // bearing signal is compositionConfidence = recognizedFraction).
          const colCount = profileMap.get(sheetName)?.structure.columnCount ?? prov.novelCount;
          const known = Math.max(0, colCount - prov.novelCount);
          fireSignal(
            buildCompositionSignal({ tenantId, unitId, sheetName, compositionConfidence: prov.recognizedFraction, knownCount: known, novelCount: prov.novelCount, importSessionId }),
            process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
          );
        }
      }

      // HF-196 Phase 1G Path α — Phase B: HC-aware pattern derivations (Decision 108).
      // HC has run (or been injected from Tier 1 flywheel); now compute patterns +
      // idField-derived structure fields with HC primacy. Structural arms gate on HC silence.
      for (const [sheetName, profile] of Array.from(profileMap.entries())) {
        const hcInterpretations = profile.headerComprehension?.interpretations;
        const sheetRows = sheetRowsBySheet.get(sheetName) ?? [];
        generateContentProfilePatterns(profile, hcInterpretations, sheetRows);
      }

      // ── HF-096: HC Diagnostic Logging (visible in Vercel Runtime Logs) ──
      console.log(`[SCI-HC-DIAG] file=${file.fileName} llmCalled=${hcMetrics.llmCalled} duration=${hcMetrics.llmCallDuration}ms avgConf=${hcMetrics.averageConfidence.toFixed(2)} cols=${hcMetrics.columnsInterpreted} insights=${hcMetrics.crossSheetInsightCount}`);
      for (const [sheetName, profile] of Array.from(profileMap.entries())) {
        const hc = profile.headerComprehension;
        if (hc) {
          const roles = Array.from(hc.interpretations.entries())
            .map(([col, interp]) => `${col}:${interp.data_nature}@${interp.confidence.toFixed(2)}`)
            .join(', ');
          console.log(`[SCI-HC-DIAG] sheet=${sheetName} roles=[${roles}]`);
        } else {
          console.log(`[SCI-HC-DIAG] sheet=${sheetName} HC=null (structural only)`);
        }
        // Profile state after HC override
        console.log(`[SCI-PROFILE-DIAG] sheet=${sheetName} idRepeatRatio=${profile.structure.identifierRepeatRatio.toFixed(2)} volumePattern=${profile.patterns.volumePattern} hasTemporal=${profile.patterns.hasTemporalColumns} hasDate=${profile.patterns.hasDateColumn} hasCurrency=${profile.patterns.hasCurrencyColumns} hasName=${profile.patterns.hasStructuralNameColumn} hasEntityId=${profile.patterns.hasEntityIdentifier} numericRatio=${profile.structure.numericFieldRatio.toFixed(2)}`);
      }

      // Phase C: Create Synaptic Ingestion State, classify
      const state = createIngestionState(tenantId, file.fileName, profileMap);
      state.promotedPatterns = promotedPatterns; // OB-160L

      // Phase E: Compute structural fingerprint and lookup prior signals + density
      for (let tabIndex = 0; tabIndex < file.sheets.length; tabIndex++) {
        const sheet = file.sheets[tabIndex];
        const profile = profileMap.get(sheet.sheetName);
        if (profile) {
          const fingerprint = computeStructuralFingerprint(profile);
          fingerprintMap.set(profile.contentUnitId, fingerprint); // HF-094
          const priors = await lookupPriorSignals(
            tenantId,
            fingerprint,
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            tenantDomainId,
          );
          // HF-254 Fix 3b: additive lexical prior (sibling of the structural prior). Recalls
          // role-bearing vocabulary_bindings for this sheet's columns and contributes via
          // data_nature distribution through the SAME prior-signal path. Non-gating; legacy
          // nature-less bindings contribute nothing.
          const lexicalPriors = await lookupLexicalPrior(
            tenantId,
            sheet.columns,
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
          );
          const allPriors = [...priors, ...lexicalPriors];
          if (allPriors.length > 0) {
            state.priorSignals.set(profile.contentUnitId, allPriors);
          }

          // OB-160K: Compute classification density per content unit
          const density = await computeClassificationDensity(
            tenantId,
            fingerprint,
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
          );
          densityMap.set(profile.contentUnitId, density);
        }
      }

      // HF-183: Compute entity ID overlap per sheet before classification
      // Korean Test: uses VALUE matching (entity external_ids), not column names
      try {
        const tenantCtx = await queryTenantContext(
          tenantId,
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
        );
        if (tenantCtx.existingEntityExternalIds.size > 0) {
          const overlapMap = new Map<string, import('@/lib/sci/tenant-context').EntityIdOverlap>();
          for (let tabIndex = 0; tabIndex < file.sheets.length; tabIndex++) {
            const sheet = file.sheets[tabIndex];
            const profile = profileMap.get(sheet.sheetName);
            if (profile) {
              const overlap = computeEntityIdOverlap(profile, sheet.rows, tenantCtx.existingEntityExternalIds);
              if (overlap) {
                overlapMap.set(profile.contentUnitId, overlap);
                console.log(`[SCI-OVERLAP] sheet=${sheet.sheetName} column=${overlap.sheetIdentifierColumn} overlap=${Math.round(overlap.overlapPercentage * 100)}% signal=${overlap.overlapSignal} (${overlap.matchingEntityIds.size}/${overlap.sheetUniqueValues.size})`);
              }
            }
          }
          if (overlapMap.size > 0) {
            state.entityIdOverlaps = overlapMap;
          }
        }
      } catch (overlapErr) {
        console.warn(`[SCI-OVERLAP] Computation failed (non-blocking):`, overlapErr instanceof Error ? overlapErr.message : 'unknown');
      }

      // HF-341 R6: the OB-203 D15 workbook-graph synthesis (a structural classifier
      // using idRepeatRatio + value-overlap to derive roster/fact/reference roles) is
      // DELETED. Classification is expression-derived; the graph fed only an advisory
      // proposal annotation, which is removed with it.

      // HF-341 R6: classification is derived from the LLM expression per sheet by
      // resolveClassification. The Level-2 CRR Bayesian scoring, the Level-1 HC-pattern
      // override, the workbook-graph classification prior, and the [SCI-HC-PATTERN] /
      // [SCI-SCORES-DIAG] diagnostics are all deleted (HF-341 R6). The workbook graph
      // synthesized above is still used below to ANNOTATE graph evidence on the proposal
      // (cu.graphEvidence) — it no longer informs classification.
      resolveClassification(state);

      // ── HF-240: workbook-level plan-signature reclassification ──
      // The Level-1 HC pattern classifier (`classifyByHCPattern`) returns
      // one of {entity, target, transaction, reference} but has no `plan`
      // branch — plan-ness is a WORKBOOK property, not a per-sheet
      // property. Level-2 PLAN_WEIGHTS can score plan, but only when
      // Level-1 returns null (HC coverage < 50%). With a warmed-up HC
      // LLM and a confidently classified plan workbook (rate tables +
      // roster + targets), Level-1 fires per-sheet and the file is
      // classified as `entity + reference + target` — never `plan`.
      //
      // The pre-HF-239 execute route had identical gating
      // (`confirmedClassification === 'plan'`), so the cold-start
      // regression presents identically post-HF-239. The architecturally
      // correct fix is workbook-level: AFTER per-sheet classification
      // completes, examine the sheet composition for this file. When
      // the composition matches the plan-workbook signature (small
      // multi-sheet workbook with non-transactional sheets and at least
      // one rate-table-shaped sheet), reclassify ALL of the file's
      // sheets to `plan`.
      //
      // The signature is purely structural — zero hardcoded filenames,
      // tenant names, or domain literals. The signal fires only when
      // (1) all of: ≥2 sheets, no transaction-classified sheet, total
      // committed rows < 1000 (configurations are small), and (2) at
      // least one sheet has rate-table structural signals (sparsity
      // > 0.30 OR percentage values OR auto-generated headers OR
      // reference-category row count).
      {
        const fileUnitIds = new Set(
          Array.from(state.contentUnits.entries())
            .filter(([, p]) => fileSheets.some(fs => fs.sheetName === p.tabName))
            .map(([id]) => id),
        );
        // HF-247 Phase 1: signature qualifies on plan's OWN content (Korean
        // Test, T1-E910 v2). Pre-HF-247 required hasRefOrTgt=true — a sibling
        // data-type precondition that blocked cold-start (no reference/target
        // sheets present). Single-sheet plans (>= 1 sheet) also qualify; the
        // pre-HF-247 >= 2 floor excluded them entirely.
        if (fileUnitIds.size >= 1) {
          const fileResolutions: Array<{ unitId: string; classification: AgentType; profile?: ContentProfile }> = [];
          for (const unitId of Array.from(fileUnitIds)) {
            const r = state.resolutions.get(unitId);
            const p = state.contentUnits.get(unitId);
            if (r && p) fileResolutions.push({ unitId, classification: r.classification, profile: p });
          }
          // HF-341 R5 (PG-R5-1): read the EXPRESSION — "does any sheet carry temporal events?" — not the
          // classification label. A data workbook has a sheet the LLM recognized as a temporal column over
          // an entity (events over time); a plan workbook does not. The `classification === 'transaction'`
          // label gate is removed (the label is inert provenance).
          const hasTransaction = fileResolutions.some(
            r => !!r.profile?.patterns?.hasTemporalColumns && !!r.profile?.patterns?.hasEntityIdentifier,
          );
          // HF-247: hasReferenceOrTarget retained for diagnostic logging only —
          // no longer in the matchesPlanSignature AND chain. A plan workbook
          // is a plan workbook because of what is IN it, not because of what
          // other sibling data types happen to be present.
          const hasReferenceOrTarget = fileResolutions.some(
            r => r.classification === 'reference' || r.classification === 'target',
          );
          let totalRows = 0;
          let hasRateTableSignal = false;
          // HF-267 P1 (Decision 108): a strong entity-identifier signal — HC's authoritative
          // identifier role, surfaced structurally as profile.patterns.hasEntityIdentifier (the
          // SAME signal the Plan Agent reads for its has_entity_id weight) — excludes a file from
          // the plan override. A roster/quota carries an entity identifier; a plan document does not.
          let anyHasEntityIdentifier = false;
          for (const r of fileResolutions) {
            if (!r.profile) continue;
            totalRows += r.profile.structure.rowCount;
            if (r.profile.patterns.hasEntityIdentifier) anyHasEntityIdentifier = true;
            if (
              // HF-267 P1: GENUINE plan discriminants only. rowCountCategory === 'reference'
              // (merely rowCount < 50) was REMOVED — it is a row-count threshold, not a plan
              // signal, and it let small rosters/quotas trip the override (a 32-row CRP roster
              // scored entity:0.93 but was force-routed to plan@0.80).
              r.profile.structure.sparsity > 0.30
              || r.profile.patterns.hasPercentageValues
              || r.profile.structure.headerQuality === 'auto_generated'
            ) {
              hasRateTableSignal = true;
            }
          }
          // HF-247: structural plan signature derived from own content:
          //   no transactional sheets present (transactional => not a plan)
          //   AND totalRows < 1000 (plans are configuration-sized, not data-sized)
          //   AND at least one sheet carries rate-table structural signal
          //     (sparsity / percentage values / auto-generated headers / reference-category row count).
          // Cold-start support: a plan file imported alone (no reference/target
          // sheets at the tenant) now qualifies. Single-sheet plans (1 sheet
          // file) also qualify.
          const matchesPlanSignature =
            !hasTransaction
            && totalRows < 1000
            && hasRateTableSignal
            // HF-267 P1: exclude files carrying a strong entity-identifier (rosters/quotas).
            // A genuine plan document has no entity-identifier column; this preserves cold-start
            // plan detection while stopping the override from capturing entity/target data.
            && !anyHasEntityIdentifier;
          if (matchesPlanSignature) {
            console.log(
              `[SCI-PLAN-WORKBOOK] file=${file.fileName} sheets=${fileResolutions.length} ` +
              `totalRows=${totalRows} signature=match — reclassifying all sheets to 'plan'`,
            );
            for (const r of fileResolutions) {
              const resolution = state.resolutions.get(r.unitId);
              if (resolution) {
                resolution.classification = 'plan' as AgentType;
                resolution.confidence = 0.80;
                resolution.decisionSource = 'plan_workbook_signature' as typeof resolution.decisionSource;
                resolution.requiresHumanReview = false;
              }
              const trace = state.traces.get(r.unitId);
              if (trace) {
                trace.finalClassification = 'plan' as AgentType;
                trace.finalConfidence = 0.80;
                trace.decisionSource = 'plan_workbook_signature' as typeof trace.decisionSource;
                trace.requiresHumanReview = false;
              }
              // Boost plan score in round2 so downstream consumers (UI
              // "all scores" display, requiresHumanReview) reflect the
              // workbook-level decision without ambiguity.
              const r2 = state.round2Scores.get(r.unitId);
              if (r2) {
                for (const s of r2) {
                  if (s.agent === 'plan') {
                    s.confidence = 0.80;
                    s.signals.unshift({
                      signal: 'plan_workbook_signature',
                      weight: 0.80,
                      evidence: `multi-sheet workbook signature (${fileResolutions.length} sheets, ${totalRows} rows, rate-table signals present)`,
                    });
                  } else {
                    s.confidence = Math.min(s.confidence, 0.10);
                  }
                }
                r2.sort((a, b) => b.confidence - a.confidence);
              }
            }
          } else {
            // HF-247: hasRefOrTgt retained in the log as DIAGNOSTIC context only.
            // It is not a precondition — the AND chain at matchesPlanSignature
            // above does not reference it. A plan workbook qualifies on its
            // own content; sibling data-type presence is incidental.
            console.log(
              `[SCI-PLAN-WORKBOOK] file=${file.fileName} sheets=${fileResolutions.length} ` +
              `totalRows=${totalRows} hasTx=${hasTransaction} rateTableSignal=${hasRateTableSignal} ` +
              `hasRefOrTgt=${hasReferenceOrTarget} (informational) — no plan signature`,
            );
          }
        }
      }

      // Build proposal from state (same format as before — proposal cards render correctly)
      // HF-106: Dedup safety net — one sheet = one content unit, always.
      // Remove ALL ::split entries. Split claims caused unique constraint violations
      // on import because two CUs map to the same sheet/committed_data rows.
      const fileContentUnits = buildProposalFromState(state, fileSheets)
        .filter(cu => {
          // HF-106: one sheet = one committed_data writer — drop a ::split CU that would write
          // committed_data (two writers collide on the same (tenant,batch,sheet,row)). OB-255 scoping:
          // a `plan` ::split writes rule_sets via the plan pipeline, NOT committed_data — the collision
          // hazard provably cannot occur — so KEEP it (the dual-natured sheet yields entities AND a plan).
          if (cu.contentUnitId.includes('::split') && cu.classification !== 'plan') {
            console.log(`[SCI-DEDUP] Removed split duplicate for ${cu.tabName} (${cu.classification})`);
            return false;
          }
          return true;
        });
      // OB-203 Phase 2 (DI-4): mark comprehension-failed units as `failed_interpretation`, each
      // with ITS sheet's structural class (per-unit failure from the decomposed dispatch).
      for (const cu of fileContentUnits) {
        const failureClass = perSheetFailure.get(cu.tabName);
        if (failureClass) cu.failedInterpretation = { failureClass, durationMs: 0 };
        // OB-203 Phase 2 (8): attach per-sheet atom recognition provenance (when computed).
        const prov = provenanceMap.get(cu.tabName);
        if (prov) cu.recognitionProvenance = prov;
      }
      // OB-203 Phase 3: `classified` — resolution complete. Failed units keep
      // `failed_interpretation` (NOT classified) so the durable state reflects the failure.
      await emitUnitStates(
        fileContentUnits
          .filter(cu => !perSheetFailure.has(cu.tabName) && unitIdBySheet.has(cu.tabName))
          .map(cu => stateBase(cu.tabName, 'classified', 4, { classification: cu.classification, confidence: cu.confidence })),
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      );

      console.log(`[SCI-PROPOSAL] ${fileContentUnits.length} content units for ${file.sheets.length} sheets`);
      contentUnits.push(...fileContentUnits);
    }

    // Determine processing order based on classification
    const processingOrder = contentUnits
      .slice()
      .sort((a, b) => PROCESSING_ORDER[a.classification] - PROCESSING_ORDER[b.classification])
      .map(u => u.contentUnitId);

    // Overall confidence
    const overallConfidence = contentUnits.length > 0
      ? contentUnits.reduce((sum, u) => sum + u.confidence, 0) / contentUnits.length
      : 0;

    // Human review if ANY unit needs it
    const anyNeedsReview = contentUnits.some(u => {
      const scores = u.allScores;
      return requiresHumanReview(scores);
    });

    // OB-160K: Build density summary for response
    const densitySummary: Record<string, { confidence: number; totalClassifications: number; overrideRate: number; executionMode: 'full_analysis' | 'light_analysis' | 'confident' }> = {};
    for (const [unitId, d] of Array.from(densityMap.entries())) {
      densitySummary[unitId] = {
        confidence: d.confidence,
        totalClassifications: d.totalClassifications,
        overrideRate: d.lastOverrideRate,
        executionMode: d.executionMode,
      };
    }

    // OB-203 Phase 4 (R3): session `settled` — analyze produced the proposal (no completion gate on
    // comprehension; `settled` marks the analyze pass done, units carry their own states).
    fireSignal(
      buildSessionLifecycleSignal({ tenantId, importSessionId, phase: 'settled', unitCount: contentUnits.length }),
      process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const proposal: SCIProposal = {
      proposalId,
      importSessionId,
      tenantId,
      sourceFiles: files.map(f => f.fileName),
      contentUnits,
      processingOrder,
      overallConfidence,
      requiresHumanReview: anyNeedsReview,
      timestamp: new Date().toISOString(),
      density: Object.keys(densitySummary).length > 0 ? densitySummary : undefined,
    };

    // OB-174 Phase 3 / HF-197B: Write fingerprints to flywheel after classification (fire-and-forget).
    // Per-sheet keying — each unit writes its OWN sheet's hash (was: always sheets[0]),
    // so each (tenant_id, fingerprint_hash) row reflects exactly one sheet's classification.
    try {
      for (const unit of proposal.contentUnits) {
        // OB-203 Phase 2 (DI-7): a failed_interpretation unit must NOT reinforce the fingerprint
        // flywheel (this is the path that raised poisoned confidence across failed runs). Gate on
        // the comprehension STATE, not confidence; Tier-1/comprehended units (no flag) proceed.
        if (!shouldReinforceUnit(unit)) {
          void emitReinforcementBlockedSignal(tenantId, unit.tabName, 'fingerprint_update', process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
          continue;
        }
        if (!unit.fieldBindings || unit.fieldBindings.length === 0) continue;
        // HF-254 Fix 2a: enrich fieldBindings with NATIVE data_nature, server-side, so the
        // cold-import cache the warm import reads carries real natures independent of the
        // client round-trip. SemanticBinding carries no data_nature; the only native source
        // is the HC interpretations (resolveClassification builds them onto the trace).
        const hcInterps = (unit.classificationTrace as Record<string, unknown> | undefined)
          ?.headerComprehension as
            | { interpretations?: Record<string, { data_nature?: string; identifies?: string; confidence?: number; characterization?: string }> }
            | undefined;
        const interpMap = hcInterps?.interpretations ?? {};
        // HF-268 A1 (Carry Everything — T1-E902 v2): the flywheel cache must carry EVERY
        // HC-interpreted column's data_nature, not just the subset that became a
        // semanticBinding. Previously this mapped unit.fieldBindings only (e.g. 5 of 11),
        // dropping sales_rep_id (reference_key nature) — so a Tier-1 warm replay reconstructed an
        // incomplete nature set and the entity pointer vanished, causing phantom entities (A2).
        // Build from the semantic bindings first (they carry semanticRole + confidence), then
        // ADD any HC column with a real data_nature not already covered. Low-quality
        // natures ('unknown'/empty) are gated out (HALT-4 — carry all STRUCTURAL natures, not blanket).
        const STRUCTURAL_NATURES = new Set(['identifier', 'reference_key', 'measure', 'temporal', 'name', 'attribute']);
        const enrichedBySource = new Map<string, Record<string, unknown>>();
        for (const b of unit.fieldBindings) {
          const interp = interpMap[b.sourceField];
          enrichedBySource.set(b.sourceField, {
            ...b,
            ...(interp?.data_nature ? { data_nature: interp.data_nature } : {}),
            ...(interp?.identifies ? { identifies: interp.identifies } : {}),
          });
        }
        for (const [colName, interp] of Object.entries(interpMap)) {
          if (enrichedBySource.has(colName)) continue;
          const nature = interp.data_nature;
          if (!nature || !STRUCTURAL_NATURES.has(nature)) continue;
          enrichedBySource.set(colName, {
            sourceField: colName,
            semanticRole: nature,
            confidence: typeof interp.confidence === 'number' ? interp.confidence : 0.8,
            displayContext: interp.characterization,
            data_nature: nature,
            ...(interp.identifies ? { identifies: interp.identifies } : {}),
          });
        }
        const enrichedFieldBindings = Array.from(enrichedBySource.values());
        // HF-373 Phase G (D10): column_roles carries the SEMANTIC-ROLE vocabulary on every write
        // site (this sync path previously preferred free-form data_nature PROSE — per-run-varying
        // strings the HF-247 quality gates cannot reason about, and a third vocabulary in one
        // column). With agents.ts now deriving semanticRole from the bare primitives, the role
        // map is deterministic per recognition; the prose stays on the bindings themselves.
        const columnRoles: Record<string, string> = {};
        for (const fb of enrichedFieldBindings) {
          columnRoles[fb.sourceField as string] = (fb.semanticRole as string) ?? (fb.data_nature as string);
        }
        // HF-197B: locate the unit's OWN sheet for the hash, not sheets[0].
        const sourceFile = files.find(f => f.fileName === unit.sourceFile);
        const sheetForUnit = sourceFile?.sheets.find(s => s.sheetName === unit.tabName);
        if (!sheetForUnit) {
          console.warn(`[SCI-FINGERPRINT] Could not locate sheet for unit sourceFile=${unit.sourceFile} tabName=${unit.tabName} — skipping flywheel write`);
          continue;
        }
        const hash = (await import('@/lib/sci/structural-fingerprint')).computeFingerprintHashSync(
          sheetForUnit.columns,
          sheetForUnit.rows,
        );
        writeFingerprint(
          tenantId,
          hash,
          {
            classification: unit.classification,
            confidence: unit.confidence,
            fieldBindings: enrichedFieldBindings,
            tabName: unit.tabName,
          },
          columnRoles,
          unit.sourceFile,
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
        ).catch(() => {}); // Fire-and-forget
      }
    } catch {
      // Flywheel write failure must NEVER block import
    }

    // HF-094: Write classification signals via dedicated columns (fire-and-forget)
    // Single write path: writeClassificationSignal (HF-092 indexed columns)
    try {
      for (const unit of proposal.contentUnits) {
        const fp = fingerprintMap.get(unit.contentUnitId);
        if (!fp) continue; // Document-based units (plan) have no fingerprint

        // OB-203 Phase 2 (DI-7): a failed_interpretation unit must NOT reinforce the CRR
        // classification:outcome prior (this is the path that learned Empleados->transaction@0.7555
        // from failures). Gate on comprehension state; emit a remediation signal, never silent.
        if (!shouldReinforceUnit(unit)) {
          void emitReinforcementBlockedSignal(tenantId, unit.tabName, 'crr_outcome', process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
          continue;
        }

        const unitTrace = unit.classificationTrace as unknown as ClassificationTrace | undefined;
        const unitDecisionSource = unitTrace?.decisionSource || 'crr_bayesian';

        // OB-199 Phase 4 supplement A: thin facade re-establishes SCI structural markers.
        writeClassificationSignal({
          tenantId,
          sourceFileName: unit.sourceFile,
          sheetName: unit.tabName,
          fingerprint: fp,
          classification: unit.classification,
          confidence: unit.confidence,
          decisionSource: unitDecisionSource,
          classificationTrace: (unit.classificationTrace as unknown as ClassificationTrace) ?? ({} as unknown as ClassificationTrace),
          vocabularyBindings: null,
          agentScores: Object.fromEntries(unit.allScores.map(s => [s.agent, s.confidence])),
          humanCorrectionFrom: null,
        }, process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).catch((err: unknown) => {
          if (err instanceof CanonicalWriteError) {
            console.warn(`[SCIAnalyze] classification:outcome CanonicalWriteError (${err.cause}): ${err.message}`);
          } else {
            console.warn('[SCIAnalyze] classification:outcome unexpected error:', err instanceof Error ? err.message : String(err));
          }
        });
      }
    } catch {
      // Signal capture failure must NEVER block import
    }

    // OB-203 D12: persist the proposal so the client can RECOVER it if the analyze response races a
    // stall-abort (the session read is the source of truth). Best-effort — never blocks the response.
    try {
      await supabase.storage.from('ingestion-raw').upload(
        `${tenantId}/proposals/${importSessionId}.json`,
        new Blob([JSON.stringify(proposal)], { type: 'application/json' }),
        { upsert: true, contentType: 'application/json' },
      );
    } catch (e) {
      console.warn(`[SCI-PROPOSAL] persist failed (non-blocking): ${e instanceof Error ? e.message : String(e)}`);
    }

    return NextResponse.json(proposal);

  } catch (err) {
    console.error('[SCI Analyze] Error:', err);
    return NextResponse.json(
      { error: 'Analysis failed', details: String(err) },
      { status: 500 }
    );
  }
}
