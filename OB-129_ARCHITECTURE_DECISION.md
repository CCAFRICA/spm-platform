# Architecture Decision Record — OB-129

## Problem
Build the SCI proposal UI — the primary import experience that replaces the old DPI stepper.

## Option A: New page at /operate/import replacing old DPI
- Scale test: Works at 10x? YES — file parsing client-side, bulk processing server-side via SCI APIs
- AI-first: Any hardcoding? NO — all field classification via SCI agents, customer vocabulary from source
- Transport: Data through HTTP bodies? YES for analysis sample (50 rows), full data via execute API
- Atomicity: Clean state on failure? YES — each content unit processed independently, partial success tracked

## Option B: Full-screen modal/overlay from any Operate page
- Scale test: Works at 10x? YES
- AI-first: Any hardcoding? NO
- Transport: Data through HTTP bodies? Same as A
- Atomicity: Clean state on failure? YES
- **Problem:** Breaks browser navigation (back button), URL sharing, accessibility (focus management)

## Option C: New page at /operate/intake (new name)
- Scale test: Works at 10x? YES
- AI-first: Any hardcoding? NO
- Transport: Data through HTTP bodies? Same as A
- Atomicity: Clean state on failure? YES
- **Problem:** "Intake" is platform jargon. Users say "import" and "upload."

## CHOSEN: Option A — /operate/import with complete replacement
The route is familiar. The experience is new. Users who have muscle memory for "go to Import" still find it. The old DPI components are replaced (not hidden). The URL stays, the experience transforms.

Import is the entry point to the Operate lifecycle (Standing Rule 25: one canonical location per surface).

### Implementation Plan:
1. Replace /operate/import/page.tsx — new SCI state machine (was redirect to /data/import/enhanced)
2. Update Sidebar nav — point "Import Data" to /operate/import (was /data/import/enhanced)
3. Three new components: SCIUpload, SCIProposal, SCIExecution
4. Keep old enhanced import at /data/import/enhanced as deprecated (don't break existing bookmarks)
5. Keep /api/import/* routes — SCI execute API uses them internally

## REJECTED: Option B — modal overlays break browser navigation and accessibility
## REJECTED: Option C — "Intake" is platform jargon. Users say "import" and "upload."
