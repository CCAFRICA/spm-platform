# HF-219 Phase 0 — AP Discovery + signal-registry Footprint

**Date:** 2026-05-12
**Branch:** `dev` (reset to `f9f8310c` post-HF-218-merge)

## AP numbering discovery

Current standing rules `CC_STANDING_ARCHITECTURE_RULES.md` Section C contains AP-1 through AP-25 inclusive (verbatim grep):

```
AP-1, AP-2, AP-3, AP-4   (Data & Transport)
AP-5, AP-6, AP-7         (AI & Intelligence)
AP-8, AP-9, AP-10, AP-11 (Deployment & Verification)
AP-12, AP-13, AP-14      (Identity & State)
AP-15, AP-16, AP-17      (UX & Client)
AP-18, AP-19             (Schema & SQL)
AP-20, AP-21, AP-22, AP-23, AP-24, AP-25  (Calculation & Verification)
```

**Next available AP integer: AP-26.**

HF-219 Phase 7 inserts AP-26 (Closed-vocabulary signal registries / declared_writers / declared_readers / register-then-emit gates) into Section C "AI & Intelligence" subsection.

## signal-registry footprint

```
$ ls -la web/src/lib/intelligence/signal-registry.ts
-rw-r--r--  1 AndrewAfrica  staff  32729 May 12 09:52 web/src/lib/intelligence/signal-registry.ts
```

File size: 32,729 bytes (substantial). NOT introduced in HF-218; pre-dates as OB-199 Phase 2 infrastructure per Decision 154/155 + AUD-004 v3 E1/E2 (registration as canonical declaration surface). HF-218 added 5 new `register({...})` calls (convergence:binding_selection, convergence:engine_correction, engine:structural_exception, engine:exception, flywheel:fingerprint_decrement) — NOT the file itself.

### Files importing from signal-registry (`grep -rn "signal-registry"`)

```
web/src/lib/intelligence/__tests__/canonical-signal-writer.test.ts:19,21 — imports for side-effect register() trigger
web/src/lib/intelligence/canonical-signal-writer.ts:40                 — imports isRegistered, lookup, all (CORE ENFORCEMENT)
web/src/lib/intelligence/__tests__/ai-task-type-exhaustiveness.test.ts:3,9,21,63 — imports lookupAITaskSignalType
web/src/lib/intelligence/signal-registry.ts:504                         — self-reference in declared_readers comment
web/src/lib/intelligence/__tests__/signal-registry.test.ts              — entire file (registration coverage assertions)
web/src/lib/ai/training-signal-service.ts:15,20,26                      — imports lookupAITaskSignalType
```

### Files referencing register-pattern semantics

```
web/src/lib/intelligence/canonical-signal-writer.ts:40                  — isRegistered/lookup/allRegistered imports
web/src/lib/intelligence/__tests__/signal-registry.test.ts              — 8+ references to declared_writers/declared_readers
```

**Total files requiring refactoring at Phase 4:**

| File | Status | Notes |
|---|---|---|
| `web/src/lib/intelligence/signal-registry.ts` | DELETE | The file itself |
| `web/src/lib/intelligence/canonical-signal-writer.ts` | REFACTOR | Remove isRegistered/lookup imports; remove unregistered_signal_type throw; emission becomes unconditional |
| `web/src/lib/ai/training-signal-service.ts` | REFACTOR | Inline AI-task-to-signal-type mapping OR relocate to a separate (non-registry) module |
| `web/src/lib/intelligence/__tests__/signal-registry.test.ts` | DELETE | Entire file tests registry coverage; not applicable post-eradication |
| `web/src/lib/intelligence/__tests__/ai-task-type-exhaustiveness.test.ts` | DELETE/REFACTOR | Test depended on registry exhaustiveness; restructure to test direct mapping or delete |
| `web/src/lib/intelligence/__tests__/canonical-signal-writer.test.ts` | REFACTOR | Remove `import '../signal-registry'` side-effect; test cases that depended on registered-ness need update |

## Architectural note (verbatim, not classification)

The directive characterizes signal-registry as an HF-218 introduction. Per code archeology, the file is OB-199 Phase 2 substrate per "Decision 154/155 + AUD-004 v3 E1/E2: registration is the canonical declaration surface" (cited verbatim at `canonical-signal-writer.ts:284` in the `unregistered_signal_type` throw message). HF-218 added 5 new registrations within the existing pattern; HF-218 did NOT introduce the pattern.

Eradicating the registry per Disposition 5 implies:
- Refactoring OB-199's canonical-writer enforcement (Decision 154/155 architectural commitment becomes platform-side debt for VG substrate to address — parallel to E924/E904/E902 debt per Disposition 1)
- Recharacterizing the 16 AI task → signal_type mappings from "registry" to "direct closed-set enum" (per directive: "small closed enums are OK; the REGISTRY pattern is what's eradicated")

CC proceeds with eradication per directive structural mandate. The architect-channel question — whether the Decision 154/155 substrate-level commitment requires VG amendment, and whether AP-26 is sufficient platform-side without it — is dispositioned post-PR per Disposition 1 (substrate debt remains queued).

## Phase 0 outcome

- AP number selected: **AP-26**
- signal-registry file size: 32,729 bytes
- Files requiring refactoring: **6** (signal-registry.ts itself + 5 importers)
- canonical-signal-writer.ts depends on registry for OB-199 enforcement (substantial refactor)
- 3 test files depend on registry (1 deletion candidate, 2 refactor candidates)

Phase 1 ADR proceeds with 3 implementation decisions per directive.
