# E1.1 — Calculation entry point grep (verbatim)

**Command:**
```bash
grep -rn "POST\|export async function" web/src/app/api/calculation/ --include="*.ts" | head -20
```

**Output:**
```
web/src/app/api/calculation/density/route.ts:14:export async function GET(request: NextRequest) {
web/src/app/api/calculation/density/route.ts:60:export async function DELETE(request: NextRequest) {
web/src/app/api/calculation/run/route.ts:2: * POST /api/calculation/run
web/src/app/api/calculation/run/route.ts:66:export async function POST(request: NextRequest) {
```

The POST handler is `web/src/app/api/calculation/run/route.ts:66`. File length: 2507 lines. POST handler spans lines 66–2507 (file contains one top-level function declaration; closing brace at line 2507 is the handler's terminator).
