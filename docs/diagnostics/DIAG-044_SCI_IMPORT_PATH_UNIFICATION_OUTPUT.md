# DIAG-044 -- SCI Import Path Unification Analysis Output

**Date:** 2026-05-14
**Branch:** diag-044-sci-import-path-unification
**HEAD commit at scaffold:** ab76ae3676e654f453dcae3e76133b8a7298fb91 (post-HF-223 merge)
**Scope:** Two SCI import execution paths -- inventory, divergence analysis, unification assessment

CC pastes verbatim code at every section. No interpretation. No PASS/FAIL. No design proposals.

---

## Phase 1 -- File inventory

### 1.1 / 1.3 -- All `web/src/app/api/import` route.ts files (with line counts)

```
$ find web/src/app/api/import -name "route.ts" -type f -print0 | sort -z | xargs -0 wc -l
    1047 web/src/app/api/import/commit/route.ts
     100 web/src/app/api/import/prepare/route.ts
     274 web/src/app/api/import/sci/analyze-document/route.ts
     497 web/src/app/api/import/sci/analyze/route.ts
     920 web/src/app/api/import/sci/execute-bulk/route.ts
    1865 web/src/app/api/import/sci/execute/route.ts
     379 web/src/app/api/import/sci/process-job/route.ts
      78 web/src/app/api/import/sci/trace/route.ts
    5160 total
```

### 1.2 -- Target paths (line counts)

```
$ wc -l web/src/app/api/import/sci/execute/route.ts web/src/app/api/import/sci/execute-bulk/route.ts
    1865 web/src/app/api/import/sci/execute/route.ts
     920 web/src/app/api/import/sci/execute-bulk/route.ts
    2785 total
```

Non-bulk path = 2.03x the bulk path by line count.

### 1.4 -- UI callers

```
$ grep -rn "import/sci/execute\|import/sci/execute-bulk" web/src/app/ web/src/components/ web/src/lib/ --include="*.ts" --include="*.tsx" | grep -v "route.ts" | grep -v node_modules
web/src/components/sci/SCIExecution.tsx:189:      const res = await fetchWithTimeout('/api/import/sci/execute-bulk', {
web/src/components/sci/SCIExecution.tsx:266:    const res = await fetchWithTimeout('/api/import/sci/execute', {
web/src/components/sci/SCIExecution.tsx:326:        const res = await fetchWithTimeout('/api/import/sci/execute', {
web/src/lib/sci/post-commit-construction.ts:5: * `/api/import/sci/execute` (plan path — ran entity resolution post-execute)
web/src/lib/sci/post-commit-construction.ts:6: * and `/api/import/sci/execute-bulk` (data path — entity resolution missing
```

`SCIExecution.tsx` calls both paths — `execute-bulk` once (line 189), `execute` twice (lines 266, 326). `post-commit-construction.ts` doc comment references both as the historical plan-path/data-path split.
