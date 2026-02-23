# HF-057: RESTORE CC_STANDING_ARCHITECTURE_RULES.md TO REPO ROOT

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". Just act.**

---

## THE PROBLEM

CC logged this during OB-73:
```
CC_STANDING_ARCHITECTURE_RULES.md does not exist at the project root. 
Proceeding — the standing rules are embedded in the OB prompt itself.
```

This means CC has been operating WITHOUT the governance file that contains:
- 9 Design Principles (AI-First, Scale by Design, Fix Logic Not Data, etc.)
- Architecture Decision Gate template
- 22 Anti-Patterns (AP-1 through AP-22) with historical examples
- 23 Operational Rules
- Scale Reference table
- Quick Checklist

Every OB/HF prompt says "READ FIRST: CC_STANDING_ARCHITECTURE_RULES.md" — if the file doesn't exist at the expected path, CC skips it silently and loses all accumulated architectural wisdom.

---

## PHASE 1: LOCATE THE FILE

```bash
cd /Users/AndrewAfrica/spm-platform

echo "=== FIND CC_STANDING_ARCHITECTURE_RULES.md ==="
find . -name "CC_STANDING_ARCHITECTURE_RULES.md" -not -path "*/node_modules/*" -not -path "*/.next/*" 2>/dev/null

echo ""
echo "=== CHECK REPO ROOT ==="
ls -la CC_STANDING_ARCHITECTURE_RULES.md 2>/dev/null || echo "NOT at repo root"

echo ""
echo "=== CHECK WEB/ ==="
ls -la web/CC_STANDING_ARCHITECTURE_RULES.md 2>/dev/null || echo "NOT in web/"

echo ""
echo "=== CHECK GIT HISTORY ==="
git log --all --oneline -- CC_STANDING_ARCHITECTURE_RULES.md | head -5
git log --all --oneline -- web/CC_STANDING_ARCHITECTURE_RULES.md | head -5

echo ""
echo "=== CHECK IF DELETED ==="
git log --diff-filter=D --oneline -- CC_STANDING_ARCHITECTURE_RULES.md | head -3
git log --diff-filter=D --oneline -- web/CC_STANDING_ARCHITECTURE_RULES.md | head -3
```

**PASTE output.**

---

## PHASE 2: RESTORE

Based on Phase 1 findings, execute ONE of these paths:

### Path A: File exists in web/ but not repo root
```bash
cp web/CC_STANDING_ARCHITECTURE_RULES.md ./CC_STANDING_ARCHITECTURE_RULES.md
echo "Copied from web/ to repo root"
```

### Path B: File was deleted — restore from git
```bash
# Find the last commit that had it
LAST_COMMIT=$(git log --all --oneline -- CC_STANDING_ARCHITECTURE_RULES.md | head -1 | awk '{print $1}')
echo "Last commit with file: $LAST_COMMIT"
git show "$LAST_COMMIT:CC_STANDING_ARCHITECTURE_RULES.md" > CC_STANDING_ARCHITECTURE_RULES.md
echo "Restored from git history"
```

### Path C: File exists somewhere else
```bash
# Copy from wherever find located it
FOUND=$(find . -name "CC_STANDING_ARCHITECTURE_RULES.md" -not -path "*/node_modules/*" -not -path "*/.next/*" | head -1)
cp "$FOUND" ./CC_STANDING_ARCHITECTURE_RULES.md
echo "Copied from $FOUND to repo root"
```

### Path D: File is truly gone — recreate from SCHEMA_REFERENCE.md pattern
If none of the above work, the file content exists in project knowledge. But this should not happen — git history should have it.

---

## PHASE 3: VERIFY

```bash
cd /Users/AndrewAfrica/spm-platform

echo "=== VERIFY FILE EXISTS AT REPO ROOT ==="
ls -la CC_STANDING_ARCHITECTURE_RULES.md

echo ""
echo "=== VERIFY CONTENT — KEY SECTIONS ==="
echo "--- Section A: Design Principles ---"
grep -c "Design Principle\|AI-First\|Scale by Design\|Domain-Agnostic" CC_STANDING_ARCHITECTURE_RULES.md

echo ""
echo "--- Section C: Anti-Pattern Registry ---"
grep -c "AP-" CC_STANDING_ARCHITECTURE_RULES.md

echo ""
echo "--- Section D: Operational Rules ---"
grep -c "After EVERY commit\|git push\|rm -rf .next" CC_STANDING_ARCHITECTURE_RULES.md

echo ""
echo "=== VERIFY CC CAN READ IT ==="
head -5 CC_STANDING_ARCHITECTURE_RULES.md
echo "..."
tail -5 CC_STANDING_ARCHITECTURE_RULES.md

echo ""
echo "=== ALSO ENSURE SCHEMA_REFERENCE.md EXISTS ==="
ls -la SCHEMA_REFERENCE.md 2>/dev/null || echo "SCHEMA_REFERENCE.md also missing — check web/"
ls -la web/SCHEMA_REFERENCE.md 2>/dev/null || echo "Not in web/ either"
find . -name "SCHEMA_REFERENCE.md" -not -path "*/node_modules/*" -not -path "*/.next/*" 2>/dev/null
```

---

## PHASE 4: COMMIT + PUSH

```bash
cd /Users/AndrewAfrica/spm-platform
git add CC_STANDING_ARCHITECTURE_RULES.md
git add SCHEMA_REFERENCE.md 2>/dev/null
git commit -m "HF-057: Restore CC_STANDING_ARCHITECTURE_RULES.md to repo root — governance file was missing"
git push origin dev
```

---

## PROOF GATE

```
PG-1: File exists at /Users/AndrewAfrica/spm-platform/CC_STANDING_ARCHITECTURE_RULES.md
      EVIDENCE: [paste ls -la output]

PG-2: File contains all sections (A through F)
      EVIDENCE: [paste grep counts for key sections]

PG-3: cat CC_STANDING_ARCHITECTURE_RULES.md | head -3 shows the title
      EVIDENCE: [paste output]
```

---

*HF-057 — February 21, 2026*
*"If the governance file is missing, every OB runs ungoverned."*
