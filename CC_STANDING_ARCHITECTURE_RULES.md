# CC STANDING ARCHITECTURE RULES
## MANDATORY — Include at top of every OB/HF/SD prompt

*Version 2.1 — February 21, 2026*
*Replaces: Version 2.0 (February 19, 2026)*
*Original: CLEARCOMP_STANDING_PRINCIPLES.md*

---

## SECTION A: DESIGN PRINCIPLES (NON-NEGOTIABLE)

### 1. AI-First, Never Hardcoded
The platform uses AI to interpret plans, analyze data, and map fields. **Every downstream system must consume the AI's decisions — never re-derive them with hardcoded logic.**

- NEVER hardcode field names, column patterns, or language-specific strings
- NEVER add entries to static dictionaries/lookup tables for field matching
- NEVER assume data structure, language, or format
- The AI interpretation step produces semantic mappings. All downstream code reads those mappings.
- Every solution must work for ANY customer, ANY data source, ANY language, ANY column naming convention

**Test:** If a Korean company uploaded data in Hangul with completely different column names and sheet structures, would this code still work? If no, it's hardcoded.

### 2. Scale by Design, Not Retrofit
Every architectural decision must work at 10x current volume. A platform that processes 119K records today must handle 2M+ records tomorrow without re-architecture.

- NEVER send row data through HTTP request/response bodies — use file storage
- NEVER use sequential per-row database calls — use bulk operations
- NEVER design for "current test case" — design for enterprise scale
- Data transport: File Storage (Supabase Storage) → Server Processing → Database
- Chunk sizes: minimum 5,000 rows for bulk inserts, prefer single bulk insert per table

**Test:** Would this approach work for 2 million records? 10 million? If the answer is "we'd need to redesign," the approach is wrong now.

### 3. Fix Logic, Not Data
Never provide answer values. Never give CC the answer key. Systems derive correct results from source material. If a test produces wrong results, fix the logic — don't patch the data to match expectations.

### 4. Be the Thermostat, Not the Thermometer
Act on data (recommend, alert, adjust), don't just display it. The platform makes decisions and takes actions — it doesn't just show dashboards.

### 5. Closed-Loop Learning
Platform activity generates training signals for continuous improvement. AI mappings that get manually corrected inform future AI interpretation. The platform gets smarter with use.

### 6. Security, Scale, Performance by Design
These three are designed in from the start, never retrofitted. Provider abstraction for AI (no hardcoded vendor). Row-Level Security for multi-tenancy. Audit trails for compliance.

### 7. Prove, Don't Describe
Show evidence, not claims. Every proof gate must verify LIVE, RENDERED, RUNNING state — not file existence, code review, or self-attestation.

### 8. Domain-Agnostic Always
The platform is Vialuce — a Performance Optimization Engine. NOT an ICM tool. Every architectural decision, naming convention, and data model must work across any domain (compensation, franchise operations, any future module). Use case examples belong in labeled sections only. Biased architecture → biased platform.

### 9. IAP Gate (Principle 9)
Every UI measure must score on Intelligence, Acceleration, Performance. Measures failing all 3 are cut. Standing design gate for all OB/HF touching UI.

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
| AP-18 | AI generates analysis on empty data (fabricated numbers) | Data-existence gate: check calculation_results count > 0 before AI generation | CLT-72 F-38 |

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

### Pipeline & Lifecycle (NEW — CLT-72)
| # | Anti-Pattern | Correct Pattern | Source |
|---|---|---|---|
| AP-19 | Import commits records despite unresolved field mappings | Validation gate: warn on critical unmapped fields, require confirmation | CLT-72 F-52 |
| AP-20 | Lifecycle advances with all entities at $0 payout | Block advancement with $0 total; allow override with explicit confirmation | CLT-72 F-63 |
| AP-21 | Summary card total differs from sum of detail rows | Single data source for both summary and detail (calculation_results) | CLT-72 F-56 |
| AP-22 | Period detector interprets month values (1,2,3) as years (2001,2002,2003) | Validate detected year is within reasonable range (current year ± 5) | CLT-72 F-48 |

---

## SECTION D: CC OPERATIONAL RULES

### Build & Deploy
1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000 responds
3. Final step of every OB/HF/SD: `gh pr create --base main --head dev` with descriptive title and body
4. Git commit messages: ASCII only
5. Completion reports and proof gates saved to PROJECT ROOT
6. **Git commands MUST run from repo root (spm-platform), NOT from web/.** Running git from web/ causes web/web/ double-path errors.

### Supabase
7. **Supabase migrations MUST be executed live** (SQL Editor or `supabase db push`) AND verified with a database query. File existence ≠ applied. Proof gate = live DB query showing changes exist.
8. Use service role client for server-side bulk operations
9. Use browser client only for user-scoped reads
10. Every table the pipeline writes to must have VL Admin INSERT/UPDATE policies

### Prompts & Handoffs
11. Autonomy Directive as first line: NEVER ask yes/no. NEVER say "shall I". Just act.
12. Never provide CC with answer values — fix logic not data
13. All handoffs must include accumulated rules/preferences
14. CC Admin always sees English regardless of tenant locale
15. OB/HF prompt committed to git (Rule 29)

### Proof Gates
16. RENDERED output, not file existence
17. LIVE database state, not migration file committed
18. BROWSER console clean, not "code handles errors gracefully"
19. REAL data displayed, not placeholder/hardcoded values
20. ACTUAL performance measured, not "estimated < 60 seconds"

### Architecture
21. Architecture Decision Gate required before implementation (Section B)
22. Evaluate every approach against the Anti-Pattern Registry (Section C)
23. If in doubt between "quick" and "right," choose "right"
24. Every OB/HF touching data pipeline: include scale analysis (current volume vs 10x vs 100x)

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
□ Architecture Decision committed before implementation?
□ Anti-Pattern Registry checked — zero violations?
□ Scale test: works for 10x current volume?
□ AI-first: zero hardcoded field names/patterns added?
□ All Supabase migrations executed AND verified with DB query?
□ Proof gates verify LIVE/RENDERED state, not file existence?
□ Browser console clean on localhost?
□ Real data displayed, no placeholders?
□ Single code path (no duplicate pipelines)?
□ Atomic operations (clean state on failure)?
```

---

---

## SECTION G: SUPABASE BATCH SIZE LIMIT

All `.in('column', array)` calls MUST batch at ≤200 items.
Arrays >200 UUIDs produce URLs that exceed Supabase's URL limit and silently return 0 rows.

This has caused 3 production failures:
1. Entity data consolidation (route.ts) — 719 UUIDs → 0 rows
2. Entity display (page-loaders.ts) — 719 UUIDs → 0 rows
3. Reconciliation matching (reconciliation route) — 719 UUIDs → 0 rows

Pattern: chunk the array, query each chunk, merge results.
Grep for `.in(` periodically and verify batch sizes.

---

*These rules are non-negotiable. Every architectural decision, every function, every data flow must be evaluated against them. If a proposed solution violates any principle or repeats an anti-pattern, STOP and redesign. The cost of redesign now is always less than the cost of fixing it after deployment.*

*"Choose right over quick. Every time."*
