# Supabase Schema Blueprint

## OB-25 Phase 6: Database Schema Design for Supabase Migration

This document defines the complete database schema and Row-Level Security (RLS) policies
required for migrating ViaLuce from localStorage to Supabase PostgreSQL.

---

## 1. Core Tables

### 1.1 Tenants

```sql
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(64) UNIQUE NOT NULL,  -- e.g., 'retailco', 'restaurantmx'
  display_name VARCHAR(255) NOT NULL,
  industry VARCHAR(64) NOT NULL,
  country CHAR(2) NOT NULL,  -- ISO 3166-1 alpha-2
  locale VARCHAR(10) NOT NULL DEFAULT 'en-US',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  features JSONB NOT NULL DEFAULT '{}',
  settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_status ON tenants(status);
```

### 1.2 Users

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL,  -- 'vl_admin', 'admin', 'manager', 'sales_rep'
  avatar_url TEXT,
  locale VARCHAR(10),
  settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- VL Admin users have NULL tenant_id (platform-wide access)
  CONSTRAINT valid_role CHECK (
    role IN ('vl_admin', 'admin', 'manager', 'sales_rep')
  ),
  CONSTRAINT tenant_role_constraint CHECK (
    (role = 'vl_admin' AND tenant_id IS NULL) OR
    (role != 'vl_admin' AND tenant_id IS NOT NULL)
  )
);

-- Indexes
CREATE UNIQUE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_users_role ON users(role);
```

### 1.3 Employees (Sales Personnel)

```sql
CREATE TABLE employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  department VARCHAR(100),
  position VARCHAR(100),
  hire_date DATE,
  termination_date DATE,
  manager_id UUID REFERENCES employees(id),
  user_id UUID REFERENCES users(id),  -- Link to login account
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(tenant_id, employee_code)
);

CREATE INDEX idx_employees_tenant ON employees(tenant_id);
CREATE INDEX idx_employees_manager ON employees(manager_id);
CREATE INDEX idx_employees_code ON employees(tenant_id, employee_code);
```

---

## 2. Compensation Plan Tables

### 2.1 Compensation Plans

```sql
CREATE TABLE compensation_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',  -- draft, pending_approval, active, archived
  effective_date DATE NOT NULL,
  end_date DATE,
  version INTEGER NOT NULL DEFAULT 1,
  plan_data JSONB NOT NULL,  -- Complete plan definition
  approval_status VARCHAR(20),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_plans_tenant ON compensation_plans(tenant_id);
CREATE INDEX idx_plans_status ON compensation_plans(status);
CREATE INDEX idx_plans_effective ON compensation_plans(effective_date);
```

### 2.2 Plan Assignments

```sql
CREATE TABLE plan_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES compensation_plans(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  effective_date DATE NOT NULL,
  end_date DATE,
  assignment_type VARCHAR(20) NOT NULL DEFAULT 'primary',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(plan_id, employee_id, effective_date)
);

CREATE INDEX idx_assignments_tenant ON plan_assignments(tenant_id);
CREATE INDEX idx_assignments_employee ON plan_assignments(employee_id);
```

---

## 3. Transaction & Calculation Tables

### 3.1 Import Batches

```sql
CREATE TABLE import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  batch_number VARCHAR(50) NOT NULL,
  source_file VARCHAR(255),
  import_type VARCHAR(50) NOT NULL,  -- 'sales', 'cheques', 'adjustments'
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  record_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  imported_by UUID REFERENCES users(id),
  committed_at TIMESTAMPTZ,
  committed_by UUID REFERENCES users(id),
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_batches_tenant ON import_batches(tenant_id);
CREATE INDEX idx_batches_status ON import_batches(status);
CREATE INDEX idx_batches_created ON import_batches(tenant_id, created_at DESC);
```

### 3.2 Transactions

```sql
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES import_batches(id),
  employee_id UUID REFERENCES employees(id),
  transaction_date DATE NOT NULL,
  transaction_type VARCHAR(50) NOT NULL,
  amount DECIMAL(15, 2) NOT NULL,
  quantity DECIMAL(15, 4),
  product_code VARCHAR(100),
  product_name VARCHAR(255),
  customer_code VARCHAR(100),
  customer_name VARCHAR(255),
  territory VARCHAR(100),
  source_system VARCHAR(50),
  external_id VARCHAR(100),
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_txn_tenant ON transactions(tenant_id);
CREATE INDEX idx_txn_employee ON transactions(employee_id);
CREATE INDEX idx_txn_date ON transactions(tenant_id, transaction_date);
CREATE INDEX idx_txn_batch ON transactions(batch_id);
CREATE INDEX idx_txn_external ON transactions(tenant_id, external_id);
```

### 3.3 Calculations

```sql
CREATE TABLE calculations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period_id VARCHAR(20) NOT NULL,  -- e.g., '2024-W01', '2024-01'
  period_type VARCHAR(20) NOT NULL,  -- 'weekly', 'monthly', 'quarterly'
  employee_id UUID NOT NULL REFERENCES employees(id),
  plan_id UUID NOT NULL REFERENCES compensation_plans(id),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  calculation_data JSONB NOT NULL,  -- Component breakdowns
  total_amount DECIMAL(15, 2) NOT NULL,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  calculated_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES users(id),

  UNIQUE(tenant_id, period_id, employee_id, plan_id)
);

CREATE INDEX idx_calc_tenant ON calculations(tenant_id);
CREATE INDEX idx_calc_period ON calculations(tenant_id, period_id);
CREATE INDEX idx_calc_employee ON calculations(employee_id);
CREATE INDEX idx_calc_status ON calculations(status);
```

---

## 4. Audit & Governance Tables

### 4.1 Audit Log

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(50) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  resource_id UUID,
  old_values JSONB,
  new_values JSONB,
  metadata JSONB NOT NULL DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partitioned by month for performance
CREATE INDEX idx_audit_tenant ON audit_logs(tenant_id);
CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);
```

### 4.2 Approval Requests

```sql
CREATE TABLE approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  request_type VARCHAR(50) NOT NULL,  -- 'plan_approval', 'payout', 'adjustment'
  resource_type VARCHAR(50) NOT NULL,
  resource_id UUID NOT NULL,
  requested_by UUID NOT NULL REFERENCES users(id),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_approval_tenant ON approval_requests(tenant_id);
CREATE INDEX idx_approval_status ON approval_requests(status);
CREATE INDEX idx_approval_type ON approval_requests(request_type);
```

### 4.3 Disputes

```sql
CREATE TABLE disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id),
  transaction_id UUID REFERENCES transactions(id),
  calculation_id UUID REFERENCES calculations(id),
  dispute_type VARCHAR(50) NOT NULL,
  description TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  priority VARCHAR(20) NOT NULL DEFAULT 'medium',
  submitted_by UUID REFERENCES users(id),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_by UUID REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_disputes_tenant ON disputes(tenant_id);
CREATE INDEX idx_disputes_employee ON disputes(employee_id);
CREATE INDEX idx_disputes_status ON disputes(status);
```

---

## 5. Payout Tables

### 5.1 Payout Batches

```sql
CREATE TABLE payout_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period_id VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  total_amount DECIMAL(15, 2) NOT NULL,
  employee_count INTEGER NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  exported_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_payout_tenant ON payout_batches(tenant_id);
CREATE INDEX idx_payout_period ON payout_batches(tenant_id, period_id);
CREATE INDEX idx_payout_status ON payout_batches(status);
```

### 5.2 Payout Items

```sql
CREATE TABLE payout_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES payout_batches(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id),
  calculation_id UUID REFERENCES calculations(id),
  amount DECIMAL(15, 2) NOT NULL,
  payment_method VARCHAR(50),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_payout_item_batch ON payout_items(batch_id);
CREATE INDEX idx_payout_item_tenant ON payout_items(tenant_id);
CREATE INDEX idx_payout_item_employee ON payout_items(employee_id);
```

---

## 6. RBAC Tables

### 6.1 Roles

```sql
CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  permissions JSONB NOT NULL DEFAULT '[]',
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(tenant_id, name)
);

CREATE INDEX idx_roles_tenant ON roles(tenant_id);
```

### 6.2 User Role Assignments

```sql
CREATE TABLE user_role_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES users(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(user_id, role_id)
);

CREATE INDEX idx_assignment_tenant ON user_role_assignments(tenant_id);
CREATE INDEX idx_assignment_user ON user_role_assignments(user_id);
CREATE INDEX idx_assignment_role ON user_role_assignments(role_id);
```

---

## 7. Row-Level Security Policies

### 7.1 Helper Function

```sql
-- Get current tenant from session
CREATE OR REPLACE FUNCTION current_tenant_id()
RETURNS UUID AS $$
BEGIN
  RETURN NULLIF(current_setting('app.current_tenant_id', TRUE), '')::UUID;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user is VL Admin
CREATE OR REPLACE FUNCTION is_vl_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid() AND role = 'vl_admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 7.2 Tenant Isolation Policies

```sql
-- Enable RLS on all tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE compensation_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_role_assignments ENABLE ROW LEVEL SECURITY;

-- Tenants: VL Admin sees all, others see their tenant only
CREATE POLICY tenant_access ON tenants
  USING (is_vl_admin() OR id = current_tenant_id());

-- Users: VL Admin sees all, tenant users see same-tenant users
CREATE POLICY user_access ON users
  USING (
    is_vl_admin() OR
    tenant_id = current_tenant_id() OR
    id = auth.uid()
  );

-- Standard tenant isolation for data tables
CREATE POLICY employee_isolation ON employees
  USING (is_vl_admin() OR tenant_id = current_tenant_id());

CREATE POLICY plan_isolation ON compensation_plans
  USING (is_vl_admin() OR tenant_id = current_tenant_id());

CREATE POLICY assignment_isolation ON plan_assignments
  USING (is_vl_admin() OR tenant_id = current_tenant_id());

CREATE POLICY batch_isolation ON import_batches
  USING (is_vl_admin() OR tenant_id = current_tenant_id());

CREATE POLICY transaction_isolation ON transactions
  USING (is_vl_admin() OR tenant_id = current_tenant_id());

CREATE POLICY calculation_isolation ON calculations
  USING (is_vl_admin() OR tenant_id = current_tenant_id());

CREATE POLICY audit_isolation ON audit_logs
  USING (is_vl_admin() OR tenant_id = current_tenant_id());

CREATE POLICY approval_isolation ON approval_requests
  USING (is_vl_admin() OR tenant_id = current_tenant_id());

CREATE POLICY dispute_isolation ON disputes
  USING (is_vl_admin() OR tenant_id = current_tenant_id());

CREATE POLICY payout_batch_isolation ON payout_batches
  USING (is_vl_admin() OR tenant_id = current_tenant_id());

CREATE POLICY payout_item_isolation ON payout_items
  USING (is_vl_admin() OR tenant_id = current_tenant_id());

CREATE POLICY role_isolation ON roles
  USING (is_vl_admin() OR tenant_id = current_tenant_id());

CREATE POLICY assignment_isolation ON user_role_assignments
  USING (is_vl_admin() OR tenant_id = current_tenant_id());
```

### 7.3 Insert Policies

```sql
-- Prevent cross-tenant data insertion
CREATE POLICY employee_insert ON employees
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY transaction_insert ON transactions
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY calculation_insert ON calculations
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

-- VL Admin can create tenants
CREATE POLICY tenant_insert ON tenants
  FOR INSERT WITH CHECK (is_vl_admin());
```

---

## 8. Current Code Isolation Gaps

Based on OB-25 Phase 4 audit, the following services need tenant scoping fixes:

| Service | Current Issue | Migration Action |
|---------|--------------|------------------|
| `audit-service.ts` | Global `audit_log` key | Add tenant_id to all queries |
| `approval-service.ts` | Unscoped `approval_requests` | Filter by tenant_id |
| `payout-service.ts` | Unscoped `payout_batches` | Add tenant_id parameter |
| `data-service.ts` | No tenant awareness | Refactor to accept tenantId |
| `rbac-service.ts` | hasPermission() no tenant check | Add tenant membership validation |
| `restaurant-service.ts` | Hard-coded TENANT_ID | Accept tenantId parameter |
| `financial-service.ts` | Hard-coded imports | Dynamic tenant loading |

---

## 9. Migration Sequence

1. **Create Tables**: Deploy schema in order (tenants first, then dependent tables)
2. **Enable RLS**: Apply all policies before data migration
3. **Migrate Static Tenants**: retailco, restaurantmx, techcorp
4. **Migrate Dynamic Tenants**: From localStorage registry
5. **Migrate Data**: Per-tenant data migration with validation
6. **Update Services**: Replace localStorage calls with Supabase client
7. **Verify Isolation**: Test cross-tenant access prevention

---

## 10. ViaLuce User Interface

```typescript
// Canonical auth interface for ViaLuce platform
export interface ViaLuceUser {
  id: string;
  email: string;
  name: string;
  role: 'vl_admin' | 'admin' | 'manager' | 'sales_rep';
  tenantId: string | null;  // null for VL Admin
  permissions: string[];
  locale: string;
  avatarUrl?: string;
}

// Supabase session mapping
export function mapSupabaseUser(session: Session): ViaLuceUser {
  const { user } = session;
  const metadata = user.user_metadata;

  return {
    id: user.id,
    email: user.email!,
    name: metadata.name || user.email!,
    role: metadata.role || 'sales_rep',
    tenantId: metadata.tenant_id || null,
    permissions: metadata.permissions || [],
    locale: metadata.locale || 'en-US',
    avatarUrl: metadata.avatar_url,
  };
}
```

---

*Generated by OB-25 Phase 6 | ViaLuce Platform*
