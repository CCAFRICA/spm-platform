# OB-204 — MIGRATION 018 APPLIED + PHASE F PROCEED
**Date:** 2026-06-13 · **Issued by:** Architect, couriered verbatim.

PR #496 merged. Migration 018 (tenants.notification_email) applied to production. Pull main before proceeding.

## PHASE F: ROSTER BULK PROMOTION + HIERARCHY FROM DATA

Branch `ob-204-hierarchy`. The standing directive §3.6 governs in full. This is the last build phase (Q-K, sequenced last so A1–A6 never waited on it).

### F.1 — Bulk promotion (F11)

The roster panel ("Entities without platform access" — `entities.profile_id IS NULL`, tenant-scoped) becomes multi-select with attribute filters (the columns CEEC carried in committed_data).

- Admin selects entities → assigns one role to the selection → batch invite executes as **iterated calls through the single door** (`createUser` per entity — no batch bypass, per-row atomicity, idempotent re-run keyed on entity→existing-profile linkage).
- Invite email per entity is sourced from the entity's import-classified email-semantic field — structural lookup via field-classification records, NO header-name literal (Korean Test). Absent email → inline manual fill before submit.
- Partial-failure report rendered per entity (name, outcome, error if failed).
- Bulk F5 (group role change on existing users) on the same selection surface.
- Layered email routing (D.2) applies — `notifyEmail` override and `tenant.notification_email` work on bulk sends.

### F.2 — CPI pass (Decision 158 split)

`web/src/lib/entities/cpi.ts` — Contextual Proximity Inference.

- **Input:** the roster import's classified fields + entity rows for a tenant.
- **LLM call (recognition):** emits compact relationship-intent JSON: `{sourceEntityRef, targetEntityRef, relationshipType, dimension, evidenceFields[]}`. The prompt asks for structural signals only — containment, shared-attribute, hierarchical-by-exclusion, cardinality. Zero domain/language literals in the prompt's structural identification (Korean Test).
- **Deterministic constructor (construction):** validates refs against tenant entities, writes `entity_relationships` rows with `source='ai_inferred'`, confidence per signal strength, `evidence` = the structural facts (which fields, which dimension), `context` = `{importId}`. Idempotent per import (upsert keyed on source+target+type+import).
- First-class dimensions for rosters: containment (manager-identifier-classified fields), shared-attribute (location/zone co-membership), hierarchical-by-exclusion, cardinality.
- Zero domain/language literals in constructor logic (AP-25). The constructor validates relationship_type against a structural enum, not free text from the LLM.

### F.3 — Review panel

On the `/configure/users` surface (admin, own tenant):
- Confidence-ranked inferred edges with evidence display (which fields drove the inference, which dimension, confidence score).
- Confirm → `source='human_confirmed'` (UPDATE, not new row).
- Reject → `effective_to = now()` (end-dated, never deleted — the graph is temporal).
- Inferred edges NEVER feed scope silently — only confirmed or imported_explicit/human_created `manages`-type edges materialize (§4A.2: hints, never gates).

### F.4 — Materializer

`materializeProfileScope(profileId)` — confirmed/explicit `manages`-subgraph traversal → upsert `profile_scope` (`scope_type='graph_derived'`, `visible_entity_ids` array).

Triggered by the writer on:
- Role change to/from manager
- F11 promotion of a manager-role user
- Edge confirm/reject in the review panel

Consumption (RLS read policies, manager team views) explicitly NOT wired — this build proves scope contents (A7), not scope enforcement (§9 successor).

### F.5 — A7 harness

`scripts/ob204-hierarchy-harness.ts`:
1. Seed a sandbox tenant with a roster containing a containment field (e.g., entities with a manager-ref column).
2. Run the CPI pass → assert proposed edges match the containment structure (source=ai_inferred, correct relationship_type, evidence cites the containment field).
3. Confirm the manager edges via service call → assert source flips to human_confirmed.
4. Promote the manager entity to a user via F11 (createUser through the door) with role=manager.
5. Assert `profile_scope.visible_entity_ids` set-equals exactly that manager's direct reports from the roster.
6. Reject an edge → assert `effective_to` is set, scope regenerates without the rejected entity.

Paste full output. This is the A7 acceptance proof: manager/employee constructed from data, end to end.

### Standing rules in this phase
- No hardcoded domains (D standing rule) — any links in CPI prompts or evidence displays resolve from env.
- I-1 holds — CPI events record entity UUIDs and structural facts, no PII.
- Korean Test (AP-25) — field identification is structural (classified semantic types), never header-name literals.
- Decision 158 — LLM recognizes, code constructs. No LLM-authored SQL or direct DB writes.

Commit per component (F.1, F.2, F.3, F.4, F.5 as natural units), build-verified. PR at phase end: `gh pr create --base main --head ob-204-hierarchy --title "OB-204 Phase F: roster bulk promotion + hierarchy-from-data (CPI + materializer)"`. Architect merges.

---

*OB-204 · Phase F · manager/employee constructed, not configured*
*vialuce.ai · Intelligence. Acceleration. Performance.*
