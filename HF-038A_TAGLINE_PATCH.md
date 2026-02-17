# HF-038A: TAGLINE PATCH — THERMOSTAT POSITIONING

NEVER ask yes/no. NEVER say "shall I". Just act.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server, `rm -rf .next`, `npm run build`, `npm run dev`, confirm localhost:3000 responds.

---

## THE CHANGE

The login screen tagline "See what you've earned." is a thermometer statement (passive, displays data). Replace with thermostat positioning (active, drives outcomes).

### Find and replace in the login page:

```bash
grep -rn "See what you've earned\|See what you.*earned" web/src/app/login/page.tsx
```

Replace the tagline text:

**Old:** `See what you've earned.`
**New:** `Intelligence. Acceleration. Performance.`

### Styling change:

The old tagline was italic. The new tagline is NOT italic — it's a declaration, not a quote.

- Remove `font-style: italic` or `italic` class
- Keep the color: `#A5B4FC` (indigo-200)
- Add letter-spacing: `tracking-wide` or `letter-spacing: 0.05em` — the three words should breathe
- Keep size: 14px
- Font-weight: 500 (medium, not 400)

### Also update anywhere else the tagline appears:

```bash
grep -rn "See what you've earned\|See what you.*earned" web/src/ --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v ".next"
```

This includes page metadata description in `layout.tsx`. Update:

**Old:** `"Performance Intelligence Platform — See what you've earned."`
**New:** `"Performance Intelligence Platform — Intelligence. Acceleration. Performance."`

---

## VERIFY

```bash
echo "=== Tagline check ==="
grep -rn "See what you" web/src/ --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v ".next" | wc -l
echo "Should be 0"

echo ""
echo "=== New tagline present ==="
grep -rn "Intelligence.*Acceleration.*Performance" web/src/app/login/page.tsx
echo "Should find 1 match"

echo ""
echo "=== Build ==="
cd web && npm run build 2>&1 | tail -3
```

---

## COMMIT

```bash
git add -A
git commit -m "HF-038A: Tagline — Intelligence. Acceleration. Performance."
git push origin dev
```

No new PR needed — this goes on the same dev branch as HF-038. If PR #31 is already merged, create a new PR:

```bash
gh pr create --base main --head dev \
  --title "HF-038A: Tagline — thermostat positioning" \
  --body "Replaces 'See what you've earned' (thermometer/passive) with 'Intelligence. Acceleration. Performance.' (thermostat/active). Domain-agnostic — works for ICM, FRMX, telecom, banking."
```
