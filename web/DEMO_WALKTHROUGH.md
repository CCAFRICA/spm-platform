# ClearComp Demo Walkthrough

## Demo Date: February 25, 2025

## Quick Start
```bash
npm run dev
```
Then open http://localhost:3000 and select **RetailCo Optical** tenant.

---

## Demo Scenario: Maria's Disputed Transaction

### The Problem
Maria Rodriguez assisted with a sale (TXN-2025-0147) but received 0% credit instead of her expected 50%. James Wilson incorrectly received 100% credit.

### Key Data Points
- **Transaction**: TXN-2025-0147 (Premium Protection Plan)
- **Amount**: $850
- **Expected Split**: Maria 50% / James 50%
- **Applied Split**: Maria 0% / James 100%
- **Maria's Lost Incentive**: ~$42.50

---

## Demo Flow

### 1. Employee Dashboard (`/my-compensation`)
**Story**: Maria logs in to check her January earnings.

- Show earnings summary: $1,359 for January 2025
- Highlight the "1 Pending Dispute" alert
- Point to Recent Transactions showing TXN-2025-0147 with "Disputed" badge
- Click on the disputed transaction

### 2. Transaction Detail (`/transactions/TXN-2025-0147`)
**Story**: Maria sees she wasn't credited for her work.

- Show the Attribution Details section
- Highlight the discrepancy: James got 100%, Maria got 0%
- Point out the "Report an Issue" button
- Click to start the dispute flow

### 3. Guided Dispute Flow (`/transactions/TXN-2025-0147/dispute`)
**Story**: Maria reports the issue through a self-service flow.

- Walk through the step-by-step wizard
- Show AI-powered analysis suggestions
- Submit the dispute

### 4. Manager Dispute Queue (`/transactions/disputes`)
**Story**: Switch to manager view to review disputes.

- Show the queue with Maria's pending dispute
- Click into the dispute detail
- Show the AI System Analyzer findings
- Demonstrate resolution options (Approve/Partial/Deny)

### 5. Dispute Analytics (`/insights/disputes`)
**Story**: Show the big picture impact of disputes.

- Self-Resolution Funnel: How many resolve at each step
- Category breakdown: What types of disputes are most common
- Resolution outcomes: Approval rates
- Metrics cards: Average resolution time, cost savings

### 6. Scenario Modeling (`/performance/scenarios`)
**Story**: Model "what-if" changes to compensation plans.

- Adjust the Insurance rate slider
- Show how it impacts employee earnings
- Compare Maria vs James side-by-side
- Show team-wide impact summary

### 7. Payout Approvals (`/performance/approvals/payouts`)
**Story**: Manager approves the monthly payout batch.

- Show January 2025 batch pending approval
- Note the dispute warning for Maria
- Click into batch detail to see all employees
- Demonstrate approve/reject workflow

---

## Navigation Quick Reference

| Feature | URL |
|---------|-----|
| Employee Dashboard | `/my-compensation` |
| Transactions List | `/transactions` |
| Transaction Detail | `/transactions/TXN-2025-0147` |
| Dispute Flow | `/transactions/TXN-2025-0147/dispute` |
| Dispute Queue (Manager) | `/transactions/disputes` |
| My Inquiries | `/transactions/inquiries` |
| Dispute Analytics | `/insights/disputes` |
| Scenario Modeling | `/performance/scenarios` |
| Payout Approvals | `/performance/approvals/payouts` |
| Plan Details | `/performance/plans` |

---

## Demo Personas

### Maria Rodriguez (Employee)
- Role: Sales Associate
- Location: Downtown Flagship
- Plan: RetailCo Optical Sales
- January Earnings: $1,359
- Has 1 pending dispute

### Mike Chen (Manager)
- Role: Sales Manager
- Can review/resolve disputes
- Can approve payout batches

---

## Key Talking Points

1. **Self-Service Resolution**: Employees can find answers and submit disputes without calling support
2. **AI-Powered Analysis**: System automatically analyzes disputes and suggests resolutions
3. **Transparency**: Full calculation breakdown shows exactly how compensation is calculated
4. **What-If Modeling**: Test plan changes before implementing them
5. **Approval Workflows**: Multi-tier approval for payouts with audit trail
6. **Analytics**: Real-time visibility into dispute patterns and self-resolution rates

---

## Reset Demo Data
If needed, clear localStorage to reset demo data:
```javascript
localStorage.clear()
```
Then refresh the page and re-select RetailCo tenant.
