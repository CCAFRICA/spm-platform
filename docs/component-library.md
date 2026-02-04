# SPM Platform Component Library

This document catalogs the UI components used throughout the SPM Platform, including shadcn/ui base components and custom implementations.

## Base Components (shadcn/ui)

### Card

Primary container for content sections.

```tsx
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

<Card className="border-0 shadow-lg">
  <CardHeader>
    <CardTitle>Card Title</CardTitle>
    <CardDescription>Optional description</CardDescription>
  </CardHeader>
  <CardContent>
    {/* Content */}
  </CardContent>
</Card>
```

**Variants used:**
- `border-0 shadow-lg` - Primary card styling
- `border-0 shadow-md` - Metric cards
- Gradient backgrounds for special cards (SPIFs, alerts)

### Badge

Status indicators and labels.

```tsx
import { Badge } from "@/components/ui/badge";

// Default
<Badge>Default</Badge>

// Status variants
<Badge className="bg-emerald-100 text-emerald-700">Active</Badge>
<Badge className="bg-amber-100 text-amber-700">Pending</Badge>
<Badge className="bg-red-100 text-red-700">Rejected</Badge>

// With outline
<Badge variant="outline">Category</Badge>

// Secondary
<Badge variant="secondary">Label</Badge>
```

**Common color patterns:**
| Status | Background | Text |
|--------|------------|------|
| Success/Active | `bg-emerald-100` | `text-emerald-700` |
| Warning/Pending | `bg-amber-100` | `text-amber-700` |
| Error/Rejected | `bg-red-100` | `text-red-700` |
| Info/Default | `bg-blue-100` | `text-blue-700` |
| Purple/Executive | `bg-purple-100` | `text-purple-700` |
| Indigo/Accelerator | `bg-indigo-100` | `text-indigo-700` |

### Button

Interactive action elements.

```tsx
import { Button } from "@/components/ui/button";

// Primary
<Button>Action</Button>

// Variants
<Button variant="outline">Secondary</Button>
<Button variant="ghost">Tertiary</Button>
<Button variant="destructive">Delete</Button>

// Sizes
<Button size="sm">Small</Button>
<Button size="lg">Large</Button>

// With icon
<Button className="gap-2">
  <Icon className="h-4 w-4" />
  Label
</Button>
```

### Table

Data display with consistent styling.

```tsx
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

<div className="rounded-lg border border-slate-200">
  <Table>
    <TableHeader>
      <TableRow className="bg-slate-50">
        <TableHead className="font-semibold">Column</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow className="hover:bg-slate-50">
        <TableCell>Value</TableCell>
      </TableRow>
    </TableBody>
  </Table>
</div>
```

### Select

Dropdown selection controls.

```tsx
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

<Select value={value} onValueChange={setValue}>
  <SelectTrigger className="w-[150px]">
    <SelectValue placeholder="Select..." />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="all">All</SelectItem>
    <SelectItem value="option1">Option 1</SelectItem>
  </SelectContent>
</Select>
```

### Input

Text input fields.

```tsx
import { Input } from "@/components/ui/input";

// Basic
<Input placeholder="Search..." />

// With icon
<div className="relative">
  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
  <Input placeholder="Search..." className="pl-9" />
</div>
```

### Avatar

User profile images with fallback.

```tsx
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

<Avatar className="h-8 w-8">
  <AvatarImage src="/avatars/user.jpg" />
  <AvatarFallback className="text-xs bg-slate-200">
    SC
  </AvatarFallback>
</Avatar>
```

## Chart Components

### CompensationPieChart

Displays commission breakdown by category.

```tsx
import CompensationPieChart from "@/components/charts/CompensationPieChart";

<CompensationPieChart />
```

Features:
- Donut style with inner label
- Hover tooltips
- Legend below chart
- Responsive sizing

### CompensationTrendChart

Monthly trend visualization.

```tsx
import CompensationTrendChart from "@/components/charts/CompensationTrendChart";

<CompensationTrendChart />
```

Features:
- Combined bar and area chart
- Commission (bars) + Quota (area)
- Interactive tooltips
- Monthly x-axis

## Navigation Components

### Sidebar

Main application navigation.

```tsx
// Located in layout, not directly imported
// Configured in: src/components/navigation/Sidebar.tsx
```

Features:
- Collapsible sections
- Active state indicators
- Q4 progress indicator
- Mobile responsive

### Navbar

Top navigation bar.

```tsx
// Located in layout, not directly imported
// Configured in: src/components/navigation/Navbar.tsx
```

Features:
- Search input
- Notifications bell with badge
- User menu dropdown
- Breadcrumb-style title

## Layout Patterns

### Page Container

Standard page layout wrapper.

```tsx
<div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
  <div className="container mx-auto px-6 py-8">
    {/* Page content */}
  </div>
</div>
```

### Page Header

Consistent header with title and description.

```tsx
<div className="mb-6">
  <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
    Page Title
  </h1>
  <p className="mt-2 text-slate-600 dark:text-slate-400">
    Page description text
  </p>
</div>
```

### Metric Cards Grid

Summary statistics layout.

```tsx
<div className="grid gap-4 md:grid-cols-4 mb-6">
  <Card className="border-0 shadow-md">
    <CardContent className="pt-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">Metric Label</p>
          <p className="text-2xl font-bold">Value</p>
        </div>
        <Icon className="h-8 w-8 text-slate-300" />
      </div>
    </CardContent>
  </Card>
  {/* More cards... */}
</div>
```

### Two Column Grid

Side-by-side content panels.

```tsx
<div className="grid gap-6 lg:grid-cols-2">
  <Card>Left Panel</Card>
  <Card>Right Panel</Card>
</div>
```

### Three Column Grid

Card grid layout.

```tsx
<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
  {items.map(item => (
    <Card key={item.id}>...</Card>
  ))}
</div>
```

## Utility Patterns

### Status Icon Function

```tsx
function getStatusIcon(status: string) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    case "failed":
      return <XCircle className="h-4 w-4 text-red-500" />;
    case "pending":
      return <Clock className="h-4 w-4 text-amber-500" />;
    default:
      return <Clock className="h-4 w-4 text-slate-500" />;
  }
}
```

### Style Mapping Function

```tsx
function getSeverityStyle(severity: string): { bg: string; text: string } {
  switch (severity) {
    case "critical":
      return { bg: "bg-red-100", text: "text-red-700" };
    case "warning":
      return { bg: "bg-amber-100", text: "text-amber-700" };
    case "success":
      return { bg: "bg-emerald-100", text: "text-emerald-700" };
    default:
      return { bg: "bg-slate-100", text: "text-slate-700" };
  }
}
```

### Currency Formatter

```tsx
function formatCurrency(amount: number): string {
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`;
  }
  if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(0)}K`;
  }
  return `$${amount.toLocaleString()}`;
}
```

### Date Formatter

```tsx
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
```

## Icon Usage

Icons from Lucide React are used consistently:

| Icon | Usage |
|------|-------|
| `DollarSign` | Compensation, payments |
| `TrendingUp` | Performance, growth |
| `Users` | Teams, personnel |
| `Target` | Goals, quotas |
| `Calendar` | Dates, schedules |
| `CheckCircle2` | Success, completed |
| `AlertTriangle` | Warning, at risk |
| `XCircle` | Error, failed |
| `Clock` | Pending, time |
| `Zap` | SPIFs, acceleration |
| `Bell` | Notifications |
| `Database` | Data operations |
| `Settings` | Configuration |

## Color Palette

### Brand Colors

```css
/* Primary */
--navy: 210 50% 20%;
--sky: 200 95% 45%;

/* Status */
--emerald: Positive/Success
--amber: Warning/Pending
--red: Error/Critical
--blue: Info/Neutral
```

### Semantic Usage

- **Slate**: Neutral backgrounds, text, borders
- **Emerald**: Success states, positive metrics
- **Amber**: Warnings, pending states
- **Red**: Errors, critical alerts
- **Indigo/Purple**: Feature highlights, charts
- **Blue**: Information, links

## Responsive Breakpoints

| Breakpoint | Width | Usage |
|------------|-------|-------|
| Default | < 640px | Mobile single column |
| `sm:` | >= 640px | Small tablets |
| `md:` | >= 768px | Tablets, 2-column grids |
| `lg:` | >= 1024px | Desktop, 3-column grids |
| `xl:` | >= 1280px | Large desktop |

## Dark Mode

All components support dark mode via Tailwind's `dark:` variant:

```tsx
<div className="bg-slate-100 dark:bg-slate-800">
  <p className="text-slate-900 dark:text-slate-50">Content</p>
</div>
```
