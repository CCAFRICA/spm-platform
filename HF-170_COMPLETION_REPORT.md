# HF-170 COMPLETION REPORT

## Finding: HF-169 already included the call site fix

HF-170 was raised because the prompt expected HF-169 to leave callers unfixed.
Code inspection confirms HF-169 (PR #306) DID include:
- agents.ts:440: `const rowCount = profile.structure.rowCount ?? profile.fields.length;`
- agents.ts:444: `assignSemanticRole(field, agent, hcRole, rowCount)` — 4 args
- negotiation.ts:265: `const rowCount = profile.structure.rowCount ?? profile.fields.length;`
- negotiation.ts:272: `inferRoleForAgent(field, agent, hcRole, rowCount)` — 4 args

No old 3-arg calls remain. The cardinality check is reachable. Build passes.

## Evidence
```
$ grep -n "const rowCount" web/src/lib/sci/agents.ts web/src/lib/sci/negotiation.ts
web/src/lib/sci/agents.ts:440:  const rowCount = profile.structure.rowCount ?? profile.fields.length;
web/src/lib/sci/negotiation.ts:265:  const rowCount = profile.structure.rowCount ?? profile.fields.length;

$ grep -n "assignSemanticRole(field, agent, hcRole)" web/src/lib/sci/agents.ts
(no output — no old 3-arg calls)

$ grep -n "inferRoleForAgent(field, agent, hcRole)" web/src/lib/sci/negotiation.ts
(no output — no old 3-arg calls)
```

## Status: No code changes needed. HF-169 was complete.
