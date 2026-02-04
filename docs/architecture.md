# SPM Platform Architecture

## Overview

The SPM (Sales Performance Management) Platform is built as a modern web application using Next.js 14 with the App Router pattern. This document outlines the architectural decisions, patterns, and structure of the application.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        Web Browser                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Next.js Application                      │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                    App Router                        │    │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────────┐   │    │
│  │  │insights│ │transact│ │perform │ │configuration│   │    │
│  │  └────────┘ └────────┘ └────────┘ └────────────┘   │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Shared Components                       │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────────────┐    │    │
│  │  │ shadcn/ui│ │  Charts  │ │    Navigation    │    │    │
│  │  └──────────┘ └──────────┘ └──────────────────┘    │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                 Data Layer                           │    │
│  │  ┌────────────────┐    ┌────────────────────┐       │    │
│  │  │  Data Service  │───▶│    Mock JSON Data  │       │    │
│  │  └────────────────┘    └────────────────────┘       │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
web/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── layout.tsx          # Root layout with navigation
│   │   ├── page.tsx            # Home dashboard
│   │   ├── insights/           # Insights section
│   │   │   ├── page.tsx
│   │   │   ├── compensation/
│   │   │   ├── performance/
│   │   │   └── trends/
│   │   ├── transactions/       # Transaction management
│   │   ├── performance/        # Performance section
│   │   │   ├── plans/
│   │   │   └── goals/
│   │   ├── configuration/      # Settings & personnel
│   │   ├── data/               # Data operations
│   │   └── acceleration/       # SPIFs & alerts
│   ├── components/
│   │   ├── ui/                 # shadcn/ui components
│   │   ├── charts/             # Recharts wrappers
│   │   └── navigation/         # Navbar & Sidebar
│   └── lib/
│       ├── types.ts            # TypeScript interfaces
│       ├── data-service.ts     # Data access layer
│       └── utils.ts            # Utility functions
├── public/                     # Static assets
└── mock-data/ → ../mock-data/  # Symlink to shared mock data
```

## Core Patterns

### 1. Page Structure

Each page follows a consistent structure:

```tsx
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
// ... other imports

// Mock data or data fetching
const data = [...];

// Helper functions
function formatValue(value: number): string { ... }

// Main component
export default function PageName() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Page Title</h1>
          <p className="mt-2 text-slate-600">Page description</p>
        </div>

        {/* Content sections */}
        <Card className="border-0 shadow-lg">
          ...
        </Card>
      </div>
    </div>
  );
}
```

### 2. Component Composition

The application uses shadcn/ui as the foundation with custom composition:

- **Cards**: Primary container for content sections
- **Badges**: Status indicators and labels
- **Tables**: Data display with sorting/filtering
- **Buttons**: Actions with consistent variants
- **Select/Input**: Form controls

### 3. Data Flow

```
Mock JSON → Data Service → Page Component → UI Components
```

The data service (`lib/data-service.ts`) provides:
- Type-safe data access
- Filtering and aggregation functions
- Computed values (e.g., dashboard stats)

### 4. Styling Approach

- **Tailwind CSS**: Utility-first styling
- **CSS Variables**: Theme customization via `globals.css`
- **Dark Mode**: Full dark mode support via `dark:` variants
- **Responsive**: Mobile-first with `sm:`, `md:`, `lg:` breakpoints

## Key Design Decisions

### Client Components

All pages use `"use client"` directive because:
- Interactive features (filters, search, tooltips)
- Recharts requires client-side rendering
- State management with React hooks

### Mock Data Strategy

Mock data is:
- Stored in JSON files for easy editing
- Realistic with proper relationships
- Covers edge cases (high performers, at-risk, etc.)

### Navigation Architecture

Two-tier navigation:
1. **Sidebar**: Primary navigation with section grouping
2. **Navbar**: Search, notifications, user menu

The sidebar maintains state for expanded/collapsed sections.

## Type System

### Core Interfaces

```typescript
interface User {
  id: string;
  name: string;
  email: string;
  role: "sales_rep" | "manager" | "vp" | "director";
  region: string;
  team: string;
  performance_tier: "top" | "high" | "medium" | "low";
}

interface Transaction {
  id: string;
  date: string;
  type: "commission" | "bonus" | "spif" | "draw" | "adjustment";
  amount: number;
  status: "pending" | "approved" | "paid" | "rejected";
  // ... additional fields
}

interface CompensationPlan {
  id: string;
  name: string;
  type: "basic" | "tiered" | "accelerator" | "team_based" | "executive";
  structure: PlanStructure;
  // ... additional fields
}
```

## Performance Considerations

### Static Generation

Pages without dynamic data can be statically generated at build time, resulting in:
- Fast initial page loads
- Reduced server load
- Better SEO

### Code Splitting

Next.js automatically code-splits by route, keeping initial bundle sizes small.

### Chart Optimization

Recharts components are wrapped to:
- Lazy load chart libraries
- Optimize re-renders with proper memoization
- Handle responsive sizing

## Future Architecture Considerations

### API Integration

When connecting to real APIs:
1. Replace mock data imports with API calls
2. Add loading states and error handling
3. Implement caching strategy (SWR, React Query, or Next.js caching)

### Authentication

Recommended approach:
- NextAuth.js for authentication
- Middleware for protected routes
- Role-based access control

### State Management

For complex state needs:
- Zustand for global state
- React Query for server state
- URL state for filters/search

## Testing Strategy

Recommended testing approach:
- **Unit Tests**: Jest for utility functions
- **Component Tests**: React Testing Library
- **E2E Tests**: Playwright or Cypress
- **Visual Regression**: Chromatic or Percy
