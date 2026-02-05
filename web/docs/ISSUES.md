# Issue Log

Tracking issues, enhancements, and technical debt for the Entity B Platform.

---

## Open Issues

### ISSUE-001: User Impersonation for Testing/Demos
**Created:** 2026-02-04
**Priority:** Medium
**Category:** Enhancement
**Related:** Access Framework

**Description:**
The login page was simplified to show only an email input (hiding tenant tabs) for security and scalability. This removed the convenient ability to quickly select different user personas (Admin, Manager, Sales Rep) across tenants for testing and demo purposes.

**Current Behavior:**
- Login page shows email input with collapsible "Demo accounts" hint
- Demo accounts list shows emails only, no role/tenant information
- Users must know or look up email addresses to test different roles

**Desired Behavior:**
- CC Admins should be able to easily impersonate different users within a tenant
- Development/demo environments could optionally show the full user picker
- Maintain security in production while enabling easy testing in non-prod

**Proposed Solutions:**
1. CC Admin impersonation panel after tenant selection
2. Environment-based demo mode flag
3. Persona switcher in navbar for CC Admins

**See Also:** `/docs/planning/access-framework.md`

---

### ISSUE-002: Navigation Menu - Transactions vs Sales Data Naming
**Created:** 2026-02-04
**Priority:** Low
**Category:** UX / Technical Debt
**Related:** Navigation, Session 3/4/5

**Description:**
There were two menu items both named "Transactions" - one as a primary menu item (for Orders) and one under the Data submenu (for Sales Data management). This caused confusion.

**Temporary Fix Applied:**
Renamed "Data > Transactions" to "Data > Sales Data" to distinguish it from the primary "Transactions" menu which contains Orders.

**Current Structure:**
- **Transactions** (primary) → Overview, Orders
- **Data** → Overview, Sales Data, Reports, Import Data

**Action Required:**
Sessions 3, 4, and 5 documentation may reference "Transactions" under the Data menu. When implementing those sessions, be aware that:
1. The menu item is now called "Sales Data"
2. The route remains `/data/transactions`
3. The naming convention may need further refinement based on how data flows evolve

**Status:** Deferred - revisit after next session development

---

## Closed Issues

*No closed issues yet.*

---

## Issue Template

```
### ISSUE-XXX: Title
**Created:** YYYY-MM-DD
**Priority:** Critical | High | Medium | Low
**Category:** Bug | Enhancement | Technical Debt | Security
**Related:** Feature area or session

**Description:**
Brief description of the issue.

**Current Behavior:**
What happens now.

**Desired Behavior:**
What should happen.

**Proposed Solutions:**
Potential approaches to resolve.
```
