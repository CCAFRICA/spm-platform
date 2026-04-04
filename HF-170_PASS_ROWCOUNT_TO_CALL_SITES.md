# HF-170: Pass rowCount to SCI Identifier Classification Call Sites
## Classification: Hotfix — SCI / Classification (HF-169 Completion)
## Priority: P0 — HF-169 cardinality check never fires because callers don't pass rowCount
## Scope: 2 files — agents.ts, negotiation.ts (CALL SITES only)
## Root Cause: CONFIRMED by code reading — not speculation

---

## CC_STANDING_ARCHITECTURE_RULES v3.0 — LOAD FROM REPO ROOT

Before ANY implementation, read `CC_STANDING_ARCHITECTURE_RULES.md` at repo root. All rules 1-39 active.

- **Rules 25-28 (Completion Reports):** Full completion report with pasted evidence mandatory.

---

## AUTONOMY DIRECTIVE

NEVER ask yes/no. NEVER say "shall I." Just act. Execute every phase in sequence. Commit after each phase. Push after each commit.

---

## THE PROBLEM — CONFIRMED BY CODE READING

HF-169 (PR #306) added a `rowCount` parameter to `assignSemanticRole` and `inferRoleForAgent`, plus cardinality logic:

```typescript
const uniquenessRatio = rowCount > 0 ? field.distinctCount / rowCount : 0;
if (uniquenessRatio > 0.8) {
  return { role: 'transaction_identifier', ... };
}
```

**But the callers were not updated to pass `rowCount`.** When TypeScript calls a function with fewer arguments than parameters, the missing parameter is `undefined`. So:

```typescript
// generateSemanticBindings calls:
assignSemanticRole(field, agent, hcRole)  // rowCount = undefined

// Inside assignSemanticRole:
const uniquenessRatio = undefined > 0 ? ... : 0;  // undefined > 0 = false → uniquenessRatio = 0
if (0 > 0.8) { ... }  // false — NEVER fires
```

Every identifier still gets `entity_identifier`. The fix exists but is unreachable.

This is **FP-69** (fix one, leave others) — the function body was fixed but the call sites were not.

---

## THE FIX

Two call sites need `rowCount` passed as the fourth argument:

1. **`generateSemanticBindings`** in `agents.ts` — calls `assignSemanticRole`
2. **`generatePartialBindings`** in `negotiation.ts` — calls `inferRoleForAgent`

---

## PHASE 1: DIAGNOSTIC

### Step 1.1: Confirm the call sites are missing rowCount

```bash
cd /Users/$(whoami)/Projects/spm-platform
echo "=== assignSemanticRole call sites ==="
grep -n "assignSemanticRole(" web/src/lib/sci/agents.ts

echo ""
echo "=== inferRoleForAgent call sites ==="
grep -n "inferRoleForAgent(" web/src/lib/sci/negotiation.ts

echo ""
echo "=== How is rowCount available on the profile? ==="
grep -n "rowCount\|structure\." web/src/lib/sci/agents.ts | head -20

echo ""
echo "=== ContentProfile structure definition ==="
grep -n "rowCount" web/src/lib/sci/sci-types.ts
```

**PASTE the full output.** This confirms:
- The call sites pass 3 args (not 4)
- Where `rowCount` lives on the ContentProfile (likely `profile.structure.rowCount`)

### Step 1.2: Read the function signatures

```bash
echo "=== assignSemanticRole signature ==="
grep -n "function assignSemanticRole" web/src/lib/sci/agents.ts

echo ""
echo "=== inferRoleForAgent signature ==="
grep -n "function inferRoleForAgent" web/src/lib/sci/negotiation.ts
```

**PASTE output.** Confirm both functions now have `rowCount: number` as the fourth parameter (from HF-169).

---

## PHASE 2: IMPLEMENTATION

### Change 2A: Update generateSemanticBindings in agents.ts

Find `generateSemanticBindings`. It currently calls `assignSemanticRole(field, agent, hcRole)`.

**Step 1:** Determine how rowCount is accessed. The ContentProfile has `structure.rowCount` (from the SCI spec and code). Verify by reading the function:

```bash
grep -n -B5 -A15 "function generateSemanticBindings" web/src/lib/sci/agents.ts
```

**Step 2:** Add rowCount extraction and pass it.

**BEFORE** (approximately):
```typescript
function generateSemanticBindings(profile: ContentProfile, agent: AgentType): SemanticBinding[] {
  const hc = profile.headerComprehension;
  return profile.fields.map(field => {
    const hcInterp = hc?.interpretations.get(field.fieldName);
    const hcRole = hcInterp?.columnRole;
    const binding = assignSemanticRole(field, agent, hcRole);
```

**AFTER:**
```typescript
function generateSemanticBindings(profile: ContentProfile, agent: AgentType): SemanticBinding[] {
  const hc = profile.headerComprehension;
  // HF-170: Pass rowCount so assignSemanticRole can distinguish entity vs transaction identifiers
  const rowCount = profile.structure?.rowCount ?? profile.fields.length ?? 0;
  return profile.fields.map(field => {
    const hcInterp = hc?.interpretations.get(field.fieldName);
    const hcRole = hcInterp?.columnRole;
    const binding = assignSemanticRole(field, agent, hcRole, rowCount);
```

**IMPORTANT:** The `rowCount` property may be at `profile.structure.rowCount`, or it may be at a different path. Use the diagnostic from Step 1.1 to find the correct path. Check BOTH:
- `profile.structure.rowCount`
- `profile.patterns.rowCount` (if patterns exist)
- If neither exists, look for where `totalRowCount` or equivalent is stored

Do NOT guess — grep for it.

### Change 2B: Update generatePartialBindings in negotiation.ts

Find `generatePartialBindings`. It currently calls `inferRoleForAgent(field, agent, hcRole)`.

**BEFORE** (approximately):
```typescript
export function generatePartialBindings(
  profile: ContentProfile,
  agent: AgentType,
  ownedFields: string[],
  sharedFields: string[]
): SemanticBinding[] {
  const relevantFields = new Set([...ownedFields, ...sharedFields]);
  const bindings: SemanticBinding[] = [];
  const hc = profile.headerComprehension;

  for (const field of profile.fields) {
    if (!relevantFields.has(field.fieldName)) continue;

    const hcInterp = hc?.interpretations.get(field.fieldName);
    const hcRole = hcInterp?.columnRole as ColumnRole | undefined;
    const role = inferRoleForAgent(field, agent, hcRole);
```

**AFTER:**
```typescript
export function generatePartialBindings(
  profile: ContentProfile,
  agent: AgentType,
  ownedFields: string[],
  sharedFields: string[]
): SemanticBinding[] {
  const relevantFields = new Set([...ownedFields, ...sharedFields]);
  const bindings: SemanticBinding[] = [];
  const hc = profile.headerComprehension;
  // HF-170: Pass rowCount so inferRoleForAgent can distinguish entity vs transaction identifiers
  const rowCount = profile.structure?.rowCount ?? profile.fields.length ?? 0;

  for (const field of profile.fields) {
    if (!relevantFields.has(field.fieldName)) continue;

    const hcInterp = hc?.interpretations.get(field.fieldName);
    const hcRole = hcInterp?.columnRole as ColumnRole | undefined;
    const role = inferRoleForAgent(field, agent, hcRole, rowCount);
```

### Step 2.3: Verify NO other call sites exist

```bash
echo "=== ALL calls to assignSemanticRole ==="
grep -rn "assignSemanticRole(" web/src/lib/sci/ --include="*.ts"

echo ""
echo "=== ALL calls to inferRoleForAgent ==="
grep -rn "inferRoleForAgent(" web/src/lib/sci/ --include="*.ts"
```

**Every call site must pass rowCount.** If there are additional callers beyond the two above, fix them too.

### Step 2.4: Commit

```bash
cd /Users/$(whoami)/Projects/spm-platform
git add web/src/lib/sci/agents.ts web/src/lib/sci/negotiation.ts
git commit -m "HF-170: Pass rowCount to assignSemanticRole and inferRoleForAgent call sites"
git push origin dev
```

---

## PHASE 3: BUILD

```bash
cd web
kill $(lsof -ti:3000) 2>/dev/null || true
rm -rf .next
npm run build
```

**Build MUST pass with zero errors.**

---

## PHASE 4: VERIFICATION SCRIPT

```bash
cat > /tmp/hf170-verify.sh << 'EOF'
#!/bin/bash
echo "=== HF-170 VERIFICATION ==="
echo ""
echo "1. assignSemanticRole called WITH rowCount:"
grep -n "assignSemanticRole(" web/src/lib/sci/agents.ts
echo ""
echo "2. inferRoleForAgent called WITH rowCount:"
grep -n "inferRoleForAgent(" web/src/lib/sci/negotiation.ts
echo ""
echo "3. rowCount extracted from profile:"
grep -n "const rowCount" web/src/lib/sci/agents.ts web/src/lib/sci/negotiation.ts
echo ""
echo "4. No 3-argument calls remain (should see 4 args in all calls):"
grep -n "assignSemanticRole(field, agent, hcRole)" web/src/lib/sci/agents.ts && echo "   ❌ OLD 3-arg call found" || echo "   ✅ No old 3-arg calls"
grep -n "inferRoleForAgent(field, agent, hcRole)" web/src/lib/sci/negotiation.ts && echo "   ❌ OLD 3-arg call found" || echo "   ✅ No old 3-arg calls"
echo ""
echo "=== END ==="
EOF
cd /Users/$(whoami)/Projects/spm-platform
bash /tmp/hf170-verify.sh
```

**PASTE the full output.** The critical check is #4 — no old 3-argument calls should remain.

---

## PHASE 5: PR CREATION

```bash
cd /Users/$(whoami)/Projects/spm-platform
gh pr create --base main --head dev \
  --title "HF-170: Pass rowCount to SCI identifier classification call sites (HF-169 completion)" \
  --body "## What
HF-169 added cardinality-based identifier classification to assignSemanticRole and inferRoleForAgent but the CALLERS (generateSemanticBindings, generatePartialBindings) were not updated to pass rowCount. The parameter defaulted to undefined, uniquenessRatio was always 0, and every identifier was still classified as entity_identifier.

## Fix
Pass profile.structure.rowCount to both call sites. Two lines changed.

## Evidence
CRP data file still had entity_id_field='transaction_id' after HF-169 deploy + reimport — the cardinality check never fired because rowCount was undefined.

## Files Changed
- web/src/lib/sci/agents.ts — generateSemanticBindings passes rowCount
- web/src/lib/sci/negotiation.ts — generatePartialBindings passes rowCount

## CC Failure Pattern
FP-69: Fix one, leave others. Function body fixed (HF-169), call sites not updated.
"
```

---

## PHASE 6: PRODUCTION VERIFICATION (POST-MERGE)

CRP clean slate was already done. After Andrew merges and Vercel deploys:

1. **Reimport CRP data file** (02_CRP_Sales_20260101_20260115.csv)
2. **Verify:**
```sql
SELECT metadata->>'entity_id_field' as entity_id_field, COUNT(*)
FROM committed_data
WHERE tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7'
GROUP BY 1;
```
**Expected:** `entity_id_field = 'sales_rep_id'` (NOT 'transaction_id')

3. **If still 'transaction_id':** Check Vercel logs during import for any `uniquenessRatio` logging. The issue would then be that HC isn't labeling either column as 'identifier', or the rowCount is still wrong.

---

## COMPLETION REPORT REQUIREMENTS

1. **Phase 1 diagnostic output** — grep showing old vs new call sites
2. **Phase 2 diff** — `git diff` showing the two-line change
3. **Phase 3 build output** — exit 0
4. **Phase 4 verification script output** — full paste, no old 3-arg calls
5. **Phase 5 PR URL**

**SELF-ATTESTATION IS NOT ACCEPTED.**

---

*"The function knew what to do. Nobody told it the row count. FP-69: fix the function, forget the caller."*
