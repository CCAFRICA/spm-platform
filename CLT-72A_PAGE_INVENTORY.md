# CLT-72A: COMPLETE PLATFORM PAGE INVENTORY AND LINKAGE MAP

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". Execute every phase sequentially. This is a DIAGNOSTIC, not a BUILD. Do not modify any code.**

---

## WHAT THIS IS

A comprehensive inventory of every page, route, sidebar link, and navigation target in the Vialuce platform. For each item, document: what it is, where it links, whether it's functional, and what state its data is in.

**Output:** A single markdown file (`CLT-72A_PAGE_INVENTORY.md`) at the project root containing the complete platform map.

---

## STANDING RULES

- Run git commands from repo root: `cd /Users/AndrewAfrica/spm-platform && git add ...`
- This is READ-ONLY. Do not modify any source files.
- PASTE real output for every diagnostic command.

---

## PHASE 1: ROUTE DISCOVERY

Find every page.tsx in the app directory — this is the definitive list of all routes.

```bash
cd /Users/AndrewAfrica/spm-platform/web

echo "============================================"
echo "ALL ROUTES (page.tsx files)"
echo "============================================"
find src/app -name "page.tsx" -not -path "*/node_modules/*" | sort | while read f; do
  ROUTE=$(echo "$f" | sed 's|src/app||' | sed 's|/page.tsx||' | sed 's|\[|:|g' | sed 's|\]||g')
  LINES=$(wc -l < "$f")
  echo "$ROUTE ($LINES lines)"
done
```

**PASTE the complete output.**

---

## PHASE 2: SIDEBAR NAVIGATION LINKS

Extract every link from the sidebar/navigation components.

```bash
echo "============================================"
echo "SIDEBAR LINK TARGETS"
echo "============================================"

# Find all sidebar/nav components
find src/components -name "*sidebar*" -o -name "*nav*" -o -name "*rail*" -o -name "*menu*" | grep -v node_modules | sort

echo ""
echo "--- Link hrefs in navigation components ---"
grep -rn "href=\|to=\|push(\|navigate(" \
  src/components/navigation/ src/components/layout/ src/components/sidebar/ \
  --include="*.tsx" --include="*.ts" 2>/dev/null | \
  grep -oP '(?:href=|to=|push\(|navigate\()["\x27]/[^"'\'']*' | \
  sort -u | head -80

echo ""
echo "--- Route definitions in layout/workspace configs ---"
grep -rn "route\|path\|href\|defaultRoute" \
  src/lib/navigation/ src/config/ src/lib/config/ \
  --include="*.ts" --include="*.tsx" 2>/dev/null | \
  grep -v node_modules | head -40
```

**PASTE the complete output.**

---

## PHASE 3: WORKSPACE STRUCTURE

Map every workspace and its sub-pages.

```bash
echo "============================================"
echo "WORKSPACE → SUB-PAGE TREE"
echo "============================================"

for workspace in operate perform investigate design configure govern financial my-compensation admin data; do
  echo ""
  echo "=== /$workspace ==="
  find "src/app/$workspace" -name "page.tsx" 2>/dev/null | sort | while read f; do
    ROUTE=$(echo "$f" | sed 's|src/app||' | sed 's|/page.tsx||')
    LINES=$(wc -l < "$f")
    # Check if it has data fetching
    HAS_FETCH=$(grep -c "supabase\|fetch(\|getServer\|use.*Query" "$f" 2>/dev/null || echo "0")
    HAS_CLIENT=$(grep -c "'use client'" "$f" 2>/dev/null || echo "0")
    echo "  $ROUTE ($LINES lines, fetch:$HAS_FETCH, client:$HAS_CLIENT)"
  done
  
  COUNT=$(find "src/app/$workspace" -name "page.tsx" 2>/dev/null | wc -l)
  if [ "$COUNT" -eq 0 ]; then
    echo "  (no pages found)"
  fi
done
```

**PASTE the complete output.**

---

## PHASE 4: SIDEBAR MENU STRUCTURE

Extract the actual sidebar menu items, sections, and their targets from the source.

```bash
echo "============================================"
echo "SIDEBAR MENU DEFINITIONS"
echo "============================================"

# Look for menu item arrays/configs
grep -rn "menuItems\|navItems\|sidebarItems\|workspaceNav\|sections" \
  src/components/navigation/ src/components/layout/ src/lib/navigation/ \
  --include="*.ts" --include="*.tsx" 2>/dev/null | \
  grep -v node_modules | head -20

echo ""
echo "--- Full sidebar config (if exists) ---"
for f in $(find src -name "*sidebar*config*" -o -name "*nav*config*" -o -name "*workspace*config*" -o -name "*menu*config*" | grep -v node_modules | head -5); do
  echo ""
  echo "=== $f ==="
  cat "$f"
done

echo ""
echo "--- Workspace definitions ---"
for f in $(find src -name "*workspace*" -path "*/config/*" -o -name "*workspace*" -path "*/lib/*" | grep -v node_modules | grep "\.ts" | head -5); do
  echo ""
  echo "=== $f ==="
  cat "$f"
done
```

**PASTE the complete output.**

---

## PHASE 5: LINK TARGET VALIDATION

For every route found in sidebar/navigation, verify the target page exists.

```bash
echo "============================================"
echo "LINK TARGET VALIDATION"
echo "============================================"

# Extract all href targets from navigation
LINKS=$(grep -rn "href=\|to=\|push(" \
  src/components/navigation/ src/components/layout/ \
  --include="*.tsx" --include="*.ts" 2>/dev/null | \
  grep -oP '(?:href=|to=|push\()["\x27](/[^"'\''?#]*)' | \
  sed "s/.*[\"']\//\//" | sort -u)

echo "Checking if each navigation target has a page.tsx..."
echo ""
for link in $LINKS; do
  # Convert route to file path
  FILE_PATH="src/app${link}/page.tsx"
  # Handle dynamic segments
  FILE_PATH_DYN=$(echo "$FILE_PATH" | sed 's|:[^/]*|[^/]*|g')
  
  if [ -f "$FILE_PATH" ]; then
    echo "  ✅ $link → $FILE_PATH"
  else
    # Try glob for dynamic routes
    FOUND=$(find src/app -path "*${link}*/page.tsx" 2>/dev/null | head -1)
    if [ -n "$FOUND" ]; then
      echo "  ✅ $link → $FOUND (dynamic)"
    else
      echo "  ❌ $link → NO PAGE FOUND"
    fi
  fi
done
```

**PASTE the complete output.**

---

## PHASE 6: PAGE FUNCTIONALITY ASSESSMENT

For each page, determine its functional state.

```bash
echo "============================================"
echo "PAGE FUNCTIONALITY ASSESSMENT"
echo "============================================"

find src/app -name "page.tsx" -not -path "*/node_modules/*" | sort | while read f; do
  ROUTE=$(echo "$f" | sed 's|src/app||' | sed 's|/page.tsx||')
  LINES=$(wc -l < "$f")
  
  # Indicators
  HAS_SUPABASE=$(grep -c "supabase\|createClient\|getServer" "$f" 2>/dev/null || echo "0")
  HAS_FETCH=$(grep -c "fetch(\|useSWR\|useQuery" "$f" 2>/dev/null || echo "0")
  HAS_MOCK=$(grep -c "mock\|demo\|sample\|placeholder\|TODO\|FIXME\|hardcoded" "$f" 2>/dev/null || echo "0")
  HAS_FORM=$(grep -c "onSubmit\|handleSubmit\|form\|Form" "$f" 2>/dev/null || echo "0")
  HAS_BUTTONS=$(grep -c "onClick\|handleClick\|Button" "$f" 2>/dev/null || echo "0")
  HAS_EMPTY=$(grep -c "No.*found\|empty\|nothing\|no data\|no results" "$f" 2>/dev/null || echo "0")
  IS_CLIENT=$(grep -c "'use client'" "$f" 2>/dev/null || echo "0")
  
  # Classify
  if [ "$HAS_SUPABASE" -gt 0 ] || [ "$HAS_FETCH" -gt 0 ]; then
    DATA="LIVE"
  elif [ "$HAS_MOCK" -gt 0 ]; then
    DATA="MOCK/DEMO"
  else
    DATA="STATIC"
  fi
  
  echo "$ROUTE | ${LINES}L | data:$DATA | forms:$HAS_FORM | buttons:$HAS_BUTTONS | empty:$HAS_EMPTY | client:$IS_CLIENT"
done
```

**PASTE the complete output.**

---

## PHASE 7: BUTTON/ACTION AUDIT

Find every button and its click handler to identify dead buttons.

```bash
echo "============================================"
echo "BUTTONS WITH NO HANDLERS (potential dead buttons)"
echo "============================================"

# Find buttons that might not have handlers
find src/app -name "page.tsx" -not -path "*/node_modules/*" | sort | while read f; do
  ROUTE=$(echo "$f" | sed 's|src/app||' | sed 's|/page.tsx||')
  
  # Count buttons vs onClick handlers
  BUTTONS=$(grep -c "<Button\|<button" "$f" 2>/dev/null || echo "0")
  HANDLERS=$(grep -c "onClick\|onSubmit\|handleClick\|handleSubmit" "$f" 2>/dev/null || echo "0")
  
  if [ "$BUTTONS" -gt 0 ] && [ "$HANDLERS" -lt "$BUTTONS" ]; then
    echo "  ⚠️  $ROUTE — $BUTTONS buttons, $HANDLERS handlers ($(($BUTTONS - $HANDLERS)) potentially unwired)"
  fi
done

echo ""
echo "============================================"
echo "CONSOLE.LOG / TODO in pages (unfinished work)"
echo "============================================"
grep -rn "TODO\|FIXME\|HACK\|console\.log\|// WIP\|// TEMP" \
  src/app/ --include="*.tsx" --include="*.ts" 2>/dev/null | \
  grep -v node_modules | grep -v ".next" | head -30
```

**PASTE the complete output.**

---

## PHASE 8: CROSS-REFERENCE — SIDEBAR SECTIONS vs ACTUAL ROUTES

Based on the CLT-72 browser walkthrough, the sidebar has these sections. Verify each:

```bash
echo "============================================"
echo "SIDEBAR SECTION VERIFICATION"
echo "============================================"

echo ""
echo "=== WORKSPACES ==="
for ws in operate perform investigate design configure govern; do
  EXISTS=$(find src/app/$ws -name "page.tsx" 2>/dev/null | head -1)
  echo "  /$ws → $([ -n "$EXISTS" ] && echo '✅ exists' || echo '❌ MISSING')"
done

echo ""
echo "=== OPERATE sub-items ==="
for sub in import calculate reconcile approve pay monitor results; do
  EXISTS=$(find src/app/operate/$sub -name "page.tsx" 2>/dev/null | head -1)
  echo "  /operate/$sub → $([ -n "$EXISTS" ] && echo '✅ exists' || echo '❌ MISSING')"
done

echo ""
echo "=== INVESTIGATE sub-items ==="
for sub in search transactions entities calculations audit-trail disputes adjustments forensics trace; do
  EXISTS=$(find src/app/investigate/$sub -name "page.tsx" 2>/dev/null | head -1)
  if [ -z "$EXISTS" ]; then
    # Try alternate paths
    EXISTS=$(find src/app -path "*$sub*" -name "page.tsx" 2>/dev/null | head -1)
  fi
  echo "  /investigate/$sub → $([ -n "$EXISTS" ] && echo "✅ $EXISTS" || echo '❌ MISSING')"
done

echo ""
echo "=== CONFIGURE sub-items ==="
for sub in people users plans rules teams; do
  EXISTS=$(find src/app/configure/$sub -name "page.tsx" 2>/dev/null | head -1)
  echo "  /configure/$sub → $([ -n "$EXISTS" ] && echo '✅ exists' || echo '❌ MISSING')"
done

echo ""
echo "=== PERFORM ==="
EXISTS=$(find src/app/perform -name "page.tsx" 2>/dev/null | head -1)
echo "  /perform → $([ -n "$EXISTS" ] && echo '✅ exists' || echo '❌ MISSING')"

echo ""
echo "=== MY PAY / MY COMPENSATION ==="
for sub in my-compensation my-pay; do
  EXISTS=$(find src/app/$sub -name "page.tsx" 2>/dev/null | head -1)
  echo "  /$sub → $([ -n "$EXISTS" ] && echo '✅ exists' || echo '❌ MISSING')"
done
```

**PASTE the complete output.**

---

## PHASE 9: GENERATE INVENTORY DOCUMENT

Create `CLT-72A_PAGE_INVENTORY.md` at the project root with:

### Section 1: Route Tree
Complete hierarchical list of every route with:
- Path
- Line count
- Data source (LIVE / MOCK / STATIC)
- Client or Server component

### Section 2: Sidebar → Route Linkage Map
For each sidebar section and item:
- Label shown in sidebar
- Target route
- Page exists? (✅/❌)
- Page functional? (data loads, buttons work, or stub)

### Section 3: Page Status Matrix

| Route | Lines | Data | Forms | Buttons | Handlers | Status |
|-------|-------|------|-------|---------|----------|--------|

Where Status is one of:
- **FUNCTIONAL** — page loads, shows real data, actions work
- **DISPLAY-ONLY** — page loads, shows data, but action buttons don't fire
- **EMPTY** — page loads but shows "no data" / empty state
- **STUB** — page exists but is placeholder / minimal content
- **DEAD-END** — page navigates somewhere unexpected or loops back
- **MISSING** — sidebar links to route that has no page.tsx

### Section 4: Dead Buttons Inventory
Every button identified as potentially unwired, with file path and line number.

### Section 5: Navigation Issues
- Circular links (A → B → A)
- Duplicate paths (two routes to same content)
- Orphan pages (exist but no sidebar link)
- Missing pages (sidebar link but no page)

### Section 6: Recommendations
Prioritized list:
1. Pages that should be hidden/disabled until functional
2. Dead buttons that should be removed or wired
3. Duplicate routes that should be consolidated
4. Suggested default landing page per persona/role

---

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add CLT-72A_PAGE_INVENTORY.md && git commit -m "CLT-72A: Complete platform page inventory and linkage map" && git push origin dev`

---

*CLT-72A — February 21, 2026*
*"You can't fix what you can't see. Map everything first."*
