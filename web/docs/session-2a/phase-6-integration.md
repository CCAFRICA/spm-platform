# Session 2A - Phase 6: Integration & Polish
## Duration: 30 minutes

### Objective
Wire everything together, test all flows, verify build.

---

## Task 6.1: Update Root Layout (5 min)

**File:** `src/app/layout.tsx`

Ensure all providers are properly nested:

```typescript
import { AuthProvider } from '@/contexts/auth-context';
import { ConfigProvider } from '@/contexts/config-context';
// ... other imports

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={/* your classes */}>
        <AuthProvider>
          <ConfigProvider>
            {/* Your existing layout structure */}
            {children}
          </ConfigProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
```

---

## Task 6.2: Update Sidebar Navigation (10 min)

Add new navigation items based on permissions:

```typescript
import { useAuth } from '@/contexts/auth-context';
import { usePermissions } from '@/hooks/use-permissions';

// In your Sidebar component:
const { user } = useAuth();
const { canViewAudit, canEditConfig } = usePermissions();

// Add these nav items:

// Under "Performance"
{ href: '/performance/approvals', label: 'Approvals', icon: ClipboardCheck }

// Under "Configuration" (only if user has permission)
{canEditConfig && { href: '/configuration/terminology', label: 'Terminology', icon: Settings }}

// Under "Admin" section (only for admins)
{canViewAudit && { href: '/admin/audit', label: 'Audit Log', icon: Shield }}
```

---

## Task 6.3: Add Audit Logging to Key Actions (10 min)

Add audit logging to existing pages:

**Orders Page - Log page views:**
```typescript
import { audit } from '@/lib/audit-service';
import { useEffect } from 'react';

useEffect(() => {
  audit.log({
    action: 'view',
    entityType: 'transaction',
    metadata: { page: 'orders' }
  });
}, []);
```

**Transaction Modal - Log detail views:**
```typescript
useEffect(() => {
  if (transaction) {
    audit.log({
      action: 'view',
      entityType: 'transaction',
      entityId: transaction.id,
      entityName: transaction.orderId
    });
  }
}, [transaction]);
```

**Inquiry Form - Log submissions:**
```typescript
// In handleSubmit, after successful submission:
audit.log({
  action: 'create',
  entityType: 'inquiry',
  entityId: 'new-inquiry',
  metadata: { transactionId, inquiryType }
});
```

---

## Task 6.4: Final Testing Checklist (5 min)

Run through each test:

```bash
npm run build
npm run dev
```

### Critical Path Tests

| # | Test | Expected | ✓ |
|---|------|----------|---|
| 1 | Navigate to `/login` | Login page shows 4 personas | |
| 2 | Select Sarah Chen, click Continue | Redirect to dashboard | |
| 3 | Check navbar | Shows "Sarah Chen, Sales Rep" | |
| 4 | Navigate to `/transactions/orders` | Orders table loads (no 404) | |
| 5 | Click eye icon on any order | Transaction modal opens | |
| 6 | Click "Commission Calculation" tab | Breakdown shown | |
| 7 | Click "Submit Inquiry" | Inquiry form opens | |
| 8 | Fill form, submit | Success message | |
| 9 | Navigate to `/performance/approvals` | Approvals page loads | |
| 10 | Click "New Request (Demo)" | Request created | |
| 11 | Approve or Reject request | Status changes | |
| 12 | Log out, login as Admin | Dashboard loads | |
| 13 | Navigate to `/admin/audit` | Audit log shows entries | |
| 14 | Filter by action type | Filters work | |
| 15 | Navigate to `/configuration/terminology` | Terminology page loads | |
| 16 | Edit "region" → "Franchise" | Change saves | |
| 17 | Check preview | Shows "Franchises" | |
| 18 | Check audit log | Change is logged | |
| 19 | `npm run build` | No errors | |

---

## Success Criteria

Session 2A is **COMPLETE** when:

- [x] Orders page loads (404 fixed)
- [x] Transaction detail modal works
- [x] Inquiry form submits
- [x] Audit logging captures all changes
- [x] 4 personas can log in
- [x] Role-based UI hiding works
- [x] Approval workflow functional
- [x] Terminology customization works
- [x] Build passes without errors

---

## What's Next (Session 2B)

With the foundation in place, Session 2B will add:

1. **Multi-language Support**
   - next-intl integration
   - en-US and es-MX translations
   - Language switcher

2. **Currency Conversion**
   - Display conversion (USD ↔ MXN)
   - User preference storage

3. **Transaction Import**
   - CSV/Excel file upload
   - Column mapping UI
   - Validation and preview

4. **Matrix Organization**
   - Complex data access rules
   - Dotted-line reporting

5. **Acceleration Expansion**
   - More recommendation types
   - Goal pacing
   - Gamification elements

---

## Cleanup

Before committing:

```bash
# Fix any linting issues
npm run lint -- --fix

# Ensure build works
npm run build

# Commit changes
git add .
git commit -m "Session 2A: Foundation systems complete

- Fixed Orders page 404
- Added transaction detail modal with calculation breakdown
- Added inquiry submission form
- Created audit logging infrastructure (SOC2 foundation)
- Created approval workflow system
- Added 4-persona login system
- Created terminology configuration framework
- Added role-based permissions"

git push origin session-2a-foundation
```

---

**🎉 Congratulations! Session 2A Foundation is Complete!**
