# CC STANDING ARCHITECTURE RULES
## MANDATORY — Include at top of every OB/HF/SD prompt

*Version 3.0 — March 10, 2026*
*Replaces: Version 2.0 (February 19, 2026)*

---

## SECTION 0: GOVERNING PRINCIPLES (Decisions 123 & 124)

**These two principles sit above all other rules. They are the standard against which every architectural decision, every UX choice, every data model, every font selection, and every interaction pattern is evaluated.**

### GP-1: Transparent Architectural Compliance (Decision 123)

The platform's architecture must transparently embody compliance with all applicable governing standards — regulatory, financial, mathematical, and technical. **Compliance is not a layer added after architecture; compliance is a property that emerges from architecture.** The traceability between each architectural decision and the governing standard it satisfies must be explicit and documented.

**Test:** Could an auditor verify compliance from architecture documentation alone, without reading source code? If no, the compliance is procedural, not architectural.

**Examples of architectural compliance (not policy compliance):**
- Deterministic Calculation Boundary IS the audit control (not "we test for reproducibility")
- Row-Level Security IS the data isolation (not "we check tenant_id in application code")
- Banker's Rounding IS the bias elimination (not "we use consistent rounding")
- Immutable batch lifecycle IS the financial assertion (not "we log all changes")

### GP-2: Research-Derived Design (Decision 124)

Every platform decision — from arithmetic operations to font selection to interaction sequencing — must be derived from proven research in the applicable underlying discipline. **The platform does not default to convention, preference, or industry pattern.** It identifies the governing discipline, surveys the established research, and applies the proven principles structurally.

**Test:** Is the justification "other platforms do it this way" or "research in [named discipline] demonstrates [cited finding]"? The first fails. The second passes.

**The Abstraction Principle:** Find the governing discipline (not "SPM best practice" but "numerical analysis" or "cognitive load theory" or "pre-attentive visual processing"), understand the proven principles, and apply them structurally. The same intellectual move that produced the seven structural primitives: not "compensation calculation types" but "irreducible mathematical operations."

**Examples:**
- Rounding method: not "most platforms round half up" → "IEEE 754 and Kahan (1996) demonstrate that round half to even eliminates systematic bias at scale"
- Navigation: not "dashboards have sidebars" → "Hick's Law and cognitive load theory (Sweller, 1988) predict that reducing choices reduces decision time"
- Color: not "blue is professional" → "Opponent-process theory and WCAG 2.1 contrast ratios determine perceptible and meaningful color encoding"

---

## SECTION A: DESIGN PRINCIPLES (NON-NEGOTIABLE)

*Each principle is an instance of one or both Governing Principles (GP-1/GP-2).*

### 1. AI-First, Never Hardcoded ← GP-2
The platform uses AI to interpret plans, analyze data, and map fields. **Every downstream system must consume the AI's decisions — never re-derive them with hardcoded logic.**

- NEVER hardcode field names, column patterns, or language-specific strings
- NEVER add entries to static dictionaries/lookup tables for field matching
- NEVER assume data structure, language, or format
- The AI interpretation step produces semantic mappings. All downstream code reads those mappings.
- Every solution must work for ANY customer, ANY data source, ANY language, ANY column naming convention

**Test:** If a Korean company uploaded data in Hangul with completely different column names and sheet structures, would this code still work? If no, it's hardcoded.

### 2. Scale by Design, Not Retrofit ← GP-1 + GP-2
Every architectural decision must work at 10x current volume. A platform that processes 119K records today must handle 2M+ records tomorrow without re-architecture.

- NEVER send row data through HTTP request/response bodies — use file storage
- NEVER use sequential per-row database calls — use bulk operations
- NEVER design for "current test case" — design for enterprise scale
- Data transport: File Storage (Supabase Storage) → Server Processing → Database
- Chunk sizes: minimum 5,000 rows for bulk inserts, prefer single bulk insert per table

**Test:** Would this approach work for 2 million records? 10 million? If the answer is "we'd need to redesign," the approach is wrong now.

### 3. Fix Logic, Not Data ← GP-2
Never provide answer values. Never give CC the answer key. Systems derive correct results from source material. If a test produces wrong results, fix the logic — don't patch the data to match expectations.

**Research basis:** Formal verification — a system is correct if its logic is correct for all inputs, not if its data happens to produce correct outputs.

### 4. Be the Thermostat, Not the Thermometer ← GP-2
Act on data (recommend, alert, adjust), don't just display it. The platform makes decisions and takes actions — it doesn't just show dashboards.

**Research basis:** Control systems theory (Wiener, 1948) — feedback loops act on measurements, not just report them.

### 5. Closed-Loop Learning ← GP-2
Platform activity generates training signals for continuous improvement. AI mappings that get manually corrected inform future AI interpretation. The platform gets smarter with use.

**Research basis:** Machine learning feedback theory; affinity maturation (immunology); Bayesian updating.

### 6. Security, Scale, Performance by Design ← GP-1
These three are designed in from the start, never retrofitted. Provider abstraction for AI (no hardcoded vendor). Row-Level Security for multi-tenancy. Audit trails for compliance.

**Compliance basis:** SOC2 (security controls), SOC1/SSAE 18 (financial controls), GAAP (audit trail requirements).

### 7. Prove, Don't Describe ← GP-1
Show evidence, not claims. Every proof gate must verify LIVE, RENDERED, RUNNING state — not file existence, code review, or self-attestation.

**Compliance basis:** Audit methodology evidentiary standard — assertions require evidence, not attestation.

### 8. Domain-Agnostic Always ← GP-2
The platform is Vialuce — a Performance Optimization Engine. NOT an ICM tool. Every architectural decision, naming convention, and data model must work across any domain (compensation, franchise operations, any future module). Use case examples belong in labeled sections only. Biased architecture → biased platform.

**Research basis:** Abstraction principle — if the same mathematical operation appears in compensation, franchising, and channel management, the correct abstraction is the operation, not the domain.

### 9. IAP Gate ← GP-1 + GP-2
Every UI measure must score on Intelligence, Acceleration, Performance. Measures failing all 3 are cut. Standing design gate for all OB/HF touching UI.

### 10. Calculation Precision Standard (Decision 122) ← GP-1 + GP-2
The engine uses arbitrary-precision decimal arithmetic (decimal.js) with Banker's Rounding (IEEE 754 ROUND_HALF_EVEN). Rounding is applied per-component at plan-specified precision. Entity totals are sums of rounded components (GAAP line-item presentation). A rounding trace is stored per entity per component.

**Compliance basis:** IEEE 754-2019, GAAP ASC 820, BIS 2018, SOC1/SSAE 18.
**Research basis:** Goldberg (1991), Kahan (1996), Central Limit Theorem.

---

## SECTION B: ARCHITECTURE DECISION GATE (MANDATORY)

**Every OB/HF must include this phase BEFORE writing any implementation code.**

### PHASE: ARCHITECTURE DECISION (insert after Diagnostic, before Implementation)

Before writing ANY code, answer these questions in writing and commit the answers:

```
ARCHITECTURE DECISION RECORD
============================
Problem: [What are we solving?]

Option A: [First approach]
  - Scale test: Works at 10x? ___
  - AI-first: Any hardcoding? ___
  - Transport: Data through HTTP bodies? ___
  - Atomicity: Clean state on failure? ___

Option B: [Second approach]
  - Scale test: Works at 10x? ___
  - AI-first: Any hardcoding? ___
  - Transport: Data through HTTP bodies? ___
  - Atomicity: Clean state on failure? ___

Option C: [Third approach - if applicable]
  - Scale test: Works at 10x? ___
  - AI-first: Any hardcoding? ___
  - Transport: Data through HTTP bodies? ___
  - Atomicity: Clean state on failure? ___

CHOSEN: Option ___ because ___
REJECTED: Option ___ because ___

GOVERNING PRINCIPLES EVALUATION (Decisions 123 & 124)
=====================================================
G1 - Standard Identification: What governing standard(s) apply?
     [Named standard: IEEE, GAAP, SOC, WCAG, ISO, or peer-reviewed research]
G2 - Architectural Embodiment: How does architecture structurally guarantee compliance?
     [Named mechanism, not policy. Must survive reimplementation.]
G3 - Traceability: Can an auditor verify from documentation alone?
     [Standard → Architecture → Implementation chain]
G4 - Discipline Identification: What underlying discipline governs this decision?
     [Named discipline with cited research, not "best practice"]
G5 - Abstraction Test: Would the research still apply if vialuce changed domains?
     [Universal finding, not domain-specific convention]
G6 - Innovation Boundary: Is the innovation grounded in peer-reviewed evidence?
     [Cited source, not speculation]

Not all gates apply to every decision. But every decision must identify
which gates are relevant and pass those that are.
```

**DO NOT proceed to implementation until this is committed.**

---

## SECTION C: CC ANTI-PATTERN REGISTRY

These are specific mistakes that have occurred. **DO NOT REPEAT.**

### Data & Transport
| # | Anti-Pattern | Correct Pattern | Source |
|---|---|---|---|
| AP-1 | Send row data as JSON in HTTP bodies | Upload file to Supabase Storage, send metadata reference | HF-047 |
| AP-2 | 500-row sequential chunk inserts from browser | Bulk insert server-side, 5,000+ row chunks minimum | HF-045 |
| AP-3 | Browser Supabase client for bulk writes | Service role client on server-side API route | HF-045 |
| AP-4 | Sequential per-entity database calls | Batch SELECT + bulk INSERT for all entities at once | HF-045 |

### AI & Intelligence
| # | Anti-Pattern | Correct Pattern | Source |
|---|---|---|---|
| AP-5 | Add field names to hardcoded dictionaries (FIELD_ID_MAPPINGS) | AI semantic inference with confidence scores | HF-046 |
| AP-6 | Pattern match on column names in specific languages | AI analyzes data values + context, language-agnostic | Standing |
| AP-7 | Hardcode "50%" or any placeholder confidence score | Calculate real confidence from AI analysis results | HF-046 |

### Deployment & Verification
| # | Anti-Pattern | Correct Pattern | Source |
|---|---|---|---|
| AP-8 | Create Supabase migration file without executing | Execute in SQL Editor or via CLI AND verify with DB query | HF-044 |
| AP-9 | Report PASS based on file existence | Verify RENDERED output in browser or LIVE state in database | CLT-54 |
| AP-10 | Report PASS based on code review alone | Test on localhost, query database, check browser console | CLT-54 |
| AP-11 | Build shell/empty pages that pass existence checks | Proof gate = page renders with real data, not empty container | OB-53 |

### Identity & State
| # | Anti-Pattern | Correct Pattern | Source |
|---|---|---|---|
| AP-12 | Date.now()+Math.random() for IDs | crypto.randomUUID() always | OB-64 |
| AP-13 | Assume column names match database schema | Query information_schema.columns or check actual schema | HF-044/CLT-64 |
| AP-14 | Leave partial state on failure (entities created, data not) | Atomic: all succeed or clean up on failure | HF-045 |

### UX & Client
| # | Anti-Pattern | Correct Pattern | Source |
|---|---|---|---|
| AP-15 | Long-running operation with no progress feedback | Show stage indicators, progress bar, estimated time | CLT-64 |
| AP-16 | Navigate/refresh page during async operation | Disable navigation, show "don't close" message, or use server-side jobs | CLT-64 |
| AP-17 | Two separate code paths for the same feature (GPV + Enhanced) | Single pipeline, shared API route, wrapper UI only | CLT-63 |

### Schema & SQL
| # | Anti-Pattern | Correct Pattern | Source |
|---|---|---|---|
| AP-18 | Write SQL referencing columns without schema verification | `SELECT column_name FROM information_schema.columns WHERE table_name = X` before any SQL | FP-49 |
| AP-19 | Use `informational_label` or other fabricated column names | Verify against SCHEMA_REFERENCE_LIVE.md — no exceptions | FP-49 |

### Calculation & Verification
| # | Anti-Pattern | Correct Pattern | Source |
|---|---|---|---|
| AP-20 | Completion report claims PASS without production evidence | Paste Vercel Runtime Log output, calculation result, or DB query as proof | FP-60 |
| AP-21 | Diagnose calculation issues without comparing to ground truth | After EVERY calculation run, compare component-by-component against GT | FP-61 |
| AP-22 | Describe wrong total as "close" or "in the neighborhood" | State the delta and the root cause. Decision 95: 100% or wrong. | FP-62 |
| AP-23 | Apply sample/analysis limits to data commit paths | `SAMPLE_ROWS` belongs on AI analysis paths ONLY. Execute paths commit ALL rows. | FP-63 |
| AP-24 | Test only one branch of conditional logic | Every conditional must be tested with entities that PASS and entities that FAIL | FP-64 |
| AP-25 | Use native JavaScript `number` for financial calculation | Use arbitrary-precision decimal (decimal.js) with Banker's Rounding (Decision 122) | DS-010 |

---

## SECTION D: CC OPERATIONAL RULES

### Build & Deploy
1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000 responds
3. Final step of every OB/HF/SD: `gh pr create --base main --head dev` with descriptive title and body
4. Git commit messages: ASCII only
5. Completion reports and proof gates saved to PROJECT ROOT

### Supabase
6. **Supabase migrations MUST be executed live** (SQL Editor or `supabase db push`) AND verified with a database query. File existence ≠ applied. Proof gate = live DB query showing changes exist.
7. Use service role client for server-side bulk operations
8. Use browser client only for user-scoped reads
9. Every table the pipeline writes to must have VL Admin INSERT/UPDATE policies

### Prompts & Handoffs
10. Autonomy Directive as first line: NEVER ask yes/no. NEVER say "shall I". Just act.
11. Never provide CC with answer values — fix logic not data
12. All handoffs must include accumulated rules/preferences
13. CC Admin always sees English regardless of tenant locale
14. OB/HF prompt committed to git (Rule 29)

### Proof Gates
15. RENDERED output, not file existence
16. LIVE database state, not migration file committed
17. BROWSER console clean, not "code handles errors gracefully"
18. REAL data displayed, not placeholder/hardcoded values
19. ACTUAL performance measured, not "estimated < 60 seconds"
20. PRODUCTION evidence required — localhost PASS ≠ production PASS (FP-60)
21. GT comparison after every calculation run — component-by-component (FP-61)

### Architecture
22. Architecture Decision Gate required before implementation (Section B)
23. Evaluate every approach against the Anti-Pattern Registry (Section C)
24. If in doubt between "quick" and "right," choose "right"
25. Every OB/HF touching data pipeline: include scale analysis (current volume vs 10x vs 100x)
26. **Governing Principles Evaluation (G1-G6) required** for decisions touching architecture, UX, or visualization (Section B)

### Prompt-layer registry derivation (HF-195)
27. **Any LLM prompt that emits componentType (or any other registry-governed vocabulary) MUST derive its allowed values from the canonical registry (`PrimitiveEntry` or equivalent) at prompt-construction time.** Parallel hardcoded vocabulary lists in prompt content are prohibited. Build-time gate (`web/scripts/verify-korean-test.sh`, wired as `prebuild` in `web/package.json`) enforces zero quoted legacy primitive-name string literals outside `primitive-registry.ts`. Instantiates IGF-T1-E902 (Carry Everything, Express Contextually) and IGF-T1-E910 (Korean Test) at the prompt-layer surface. Recommended action `extend` per IRA-HF-195 Inv-1 supersession_candidate 1.

28. **Any dispatch consuming LLM-emitted vocabulary MUST honor three-tier resolution (LLM-Primary, Deterministic Fallback, Human Authority).** Exhaustive-switch patterns with `_exhaustive: never` compile-time guards are permitted ONLY when paired with EITHER (a) upstream constraint — the prompt that produces the input emits only registry-valid strings (Rule 27 holds), OR (b) downstream fallback — unrecognized strings map to a default primitive with a classification signal written. Naked `_exhaustive: never` patterns without one of these two conditions are prohibited. Instantiates IGF-T1-E903 (No Hardcoded Assumptions / Three-Tier Resolution Chain) at the prompt-layer surface. Recommended action `extend` per IRA-HF-195 Inv-1 supersession_candidate 2.

---

## SECTION E: SCALE REFERENCE

For context on architectural decisions:

| Data Volume | Records | Example Customer | Must Work? |
|---|---|---|---|
| Small | < 10K | Startup, 50 reps, 1 month | Yes (trivial) |
| Medium | 10K-500K | Mid-market, 200 reps, 12 months | Yes (current) |
| Large | 500K-5M | Enterprise, 2000 reps, 24 months | Yes (design target) |
| Enterprise | 5M-50M | Global, 50K reps, daily transactions | Yes (architecture must support) |

**Every architectural choice must work through "Large" without modification. "Enterprise" should require only configuration changes (chunk size, parallelism, timeouts), not re-architecture.**

---

## SECTION F: QUICK CHECKLIST (Copy into every prompt)

```
Before submitting completion report, verify:
□ Governing Principles (G1-G6) evaluated where applicable?
□ Architecture Decision committed before implementation?
□ Anti-Pattern Registry checked — zero violations?
□ Scale test: works for 10x current volume?
□ AI-first: zero hardcoded field names/patterns added?
□ All Supabase migrations executed AND verified with DB query?
□ Proof gates verify LIVE/RENDERED state, not file existence?
□ Production evidence included (not just localhost)?
□ GT comparison completed (if calculation HF)?
□ Both branches tested (if conditional logic)?
□ Browser console clean on localhost?
□ Real data displayed, no placeholders?
□ Single code path (no duplicate pipelines)?
□ Atomic operations (clean state on failure)?
□ Financial arithmetic uses decimal.js (not native number)?
```

---

*These rules are non-negotiable. Every architectural decision, every function, every data flow must be evaluated against them. If a proposed solution violates any principle or repeats an anti-pattern, STOP and redesign. The cost of redesign now is always less than the cost of fixing it after deployment.*

*"The platform is not built from software conventions. It is built from the disciplines that software conventions forgot to consult."*
