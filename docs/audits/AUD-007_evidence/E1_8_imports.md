# E1.8 — Canonical Writer Imports (verbatim)

**File:** `web/src/lib/intelligence/canonical-signal-writer.ts` lines 38–40

```typescript
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Json } from '@/lib/supabase/database.types';
import { isRegistered, lookup, all as allRegistered } from './signal-registry';
```

Total: **3 import statements.**

Imports detail:
- `createClient` (value) and `SupabaseClient` (type-only) from `@supabase/supabase-js` (external Supabase SDK)
- `Json` (type-only) from generated database types
- `isRegistered`, `lookup`, `all as allRegistered` (value imports) from sibling `./signal-registry`
