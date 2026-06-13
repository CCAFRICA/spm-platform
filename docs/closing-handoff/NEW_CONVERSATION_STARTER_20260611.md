# NEW CONVERSATION DIRECTIVE — 2026-06-11
**Paste this entire document as the first message of the next conversation. Appended artifacts follow at the bottom.**

## PRE-READ SEQUENCE (fresh-agent-first ordering — Correction 19)
1. **STRATEGIC FRAME below + Handoff Section -1** — what we are building, the milestone, the binding constraint.
2. **Handoff Section 0** — five critical facts.
3. **Handoff Section 19** — first three turns.
4. **Handoff Section 20** — path detail (A recommended; B/C fold in).
5. **DS-027** (appended) — the functional design awaiting disposition.
6. `HANDOFF_TEMPLATE_CORRECTIONS.md` + patches (project files) — discipline reference; read at action time, not pre-action.
7. Remaining handoff sections — on demand.

## WHO YOU ARE
You are the **architect channel** for Vialuce: design, governance, interpretation, directive drafting. You never implement. **CC (Claude Code)** is the implementation channel and does ALL git, code, and tsx-script reads. **Andrew** is the architect-of-record and courier: he pastes directives to CC verbatim, applies all Supabase Dashboard SQL/config (SR-44), and his dispositions supersede any stale directive text. Concise gate format when Andrew must act: "You need to run X / Where: Y / Steps: 1, 2, 3." Every CC directive (including DIAGs) is a structured MD file per `INF_Structured_Compliant_Drafting_Reference_20260513.md`, CC paste block LAST, completion report at `docs/completion-reports/`. No human passwords persisted anywhere, ever — user-context verification uses the service-role mint pattern (generateLink→verifyOtp). SEARCH-BEFORE-UNKNOWN: never present an unknown without listing the searches already run.

## STRATEGIC FRAME
Vialuce is a domain-agnostic ICM/SPM platform (prime-DAG engine + convergence layer; AI recognizes, code constructs; Progressive Performance cost curve). **Milestone: User-Ready.** Platform personas now work end-to-end in production (HF-283). **Binding constraint: tenant users cannot be trusted to exist correctly** — all were seed-created outside any validated path, and the Sabor trio still fails login (RCA open; prime untested suspect: `capabilities` object-vs-array shape). The sanctioned resolution is the **User Provisioning & RBAC build (DS-027 → OB)**: one validated writer, contracts at the door, Sabor re-provisioned through it as acceptance test A1. Filter every action through: *does it advance tenant users working in production via this build (or close the Sabor RCA in ≤5 bounded minutes)?* If neither, defer. Open-ended Sabor troubleshooting is explicitly halted by the architect.

## WHAT IS ALREADY TRUE (do not re-derive; do not let rescinded claims re-harden)
- HF-283 CLOSED, production-verified: `is_platform()` predicate, 72 policies re-keyed; platform@/tdadmin/eoadmin enter tenants. Merges `54416d6b`, `b95f14c7`, `ab958dd1`.
- HF-284 shipped (`3a09afa8`) and **verified at the middleware layer** (session-ownership tagging; five `bookkeeping_reset→login.success` pairs in production). **Its SR-43 close is RESCINDED** — the Sabor user-facing login still fails; `login.success` fires before the profile fetch and is NOT outcome evidence. A correcting addendum to PR #477 is owed (Path C).
- Sabor RCA NOT ESTABLISHED. Eliminated with receipts: data/linkage, RLS policy, query-under-JWT, session survival, provider, cache. The profiles row demonstrably reaches the failing browser (200, 1.1 kB). Untested suspect: capabilities shape (object on all failing rows, array on all working rows). Two bounded probes are pre-drafted in Handoff §20-B.
- Falsified this session (keep falsified): MFA-shield theory; stale-cookie as sole cause; stale-bundle as confirmed resolution; "eoadmin enters" pre-HF-283.
- DS-027 (appended) operationalizes DS-014 (still DRAFT — lock proposed with DS-027 §1 amendments). DIAG-063 is WITHDRAWN — never execute.

## FIRST THREE TURNS (mirrors Handoff §19)
- **Turn 1 (you):** orientation confirmation explicitly naming the milestone and binding constraint per Section -1.3/-1.4, plus any drift you detect. No other tools.
- **Turn 2 (Andrew, zero commands):** state-change check; Site URL confirmation (if not done: Supabase Dashboard → Auth → URL Configuration → `https://vialuce.ai` + redirect allowlist, now); SR-43-rescind acknowledgment status.
- **Turn 3 (Andrew → you):** DS-027 §1/§9 dispositions + probe decision (pre-OB or in-OB). You then draft the **Provisioning/RBAC OB directive** in full formation. CC executes; Andrew couriers.

## APPENDED ARTIFACTS (paste below this line, in order)
1. `SESSION_HANDOFF_20260611.md` — in full.
2. `DS-027_USER_PROVISIONING_RBAC_FUNCTIONAL_DESIGN_20260611.md` — in full.

*vialuce.ai · Intelligence. Acceleration. Performance.*
*Strategy → state → action → discipline → reference. The OB is the fix; A1 is the proof.*
