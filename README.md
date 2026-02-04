# SPM Platform

A comprehensive Sales Performance Management platform for tracking compensation, performance metrics, and sales team operations.

## Project Structure

```
spm-platform/
├── web/                    # Next.js 14 web application
├── mobile/                 # Mobile app (future)
├── docs/                   # Documentation
└── mock-data/              # JSON mock data files
```

## Tech Stack

- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Components**: shadcn/ui
- **Charts**: Recharts
- **Icons**: Lucide React

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
# Navigate to web directory
cd web

# Install dependencies
npm install

# Start development server
npm run dev
```

The application will be available at `http://localhost:3000`.

### Build for Production

```bash
npm run build
npm start
```

## Application Routes

| Route | Description |
|-------|-------------|
| `/` | Dashboard home with overview stats and quick links |
| `/insights` | Insights hub |
| `/insights/compensation` | Compensation breakdown with charts and payment history |
| `/insights/performance` | Performance leaderboard and regional analysis |
| `/insights/trends` | Year-over-year trends and projections |
| `/transactions` | Transaction history with filters and search |
| `/performance` | Performance hub |
| `/performance/plans` | Compensation plan structures |
| `/performance/goals` | Individual and team goal tracking |
| `/configuration` | Personnel directory and settings |
| `/data` | Data operations and quality monitoring |
| `/acceleration` | Active SPIFs, alerts, and AI recommendations |

## Mock Data

The platform uses realistic mock data located in `/mock-data/`:

- **users.json** - 55 employees across 4 regions
- **compensation-plans.json** - 5 compensation plan types
- **transactions.json** - 100+ sales transactions
- **performance-data.json** - Performance metrics and aggregates
- **organizational-hierarchy.json** - Org structure with teams

## Key Features

### Insights Dashboard
- Compensation summary with period totals
- Interactive pie charts for commission breakdown
- Trend charts showing monthly performance
- Top performers leaderboard

### Transaction Management
- Full transaction history with pagination
- Filter by date, status, type, and amount
- Search functionality
- Status tracking (pending, approved, paid, rejected)

### Performance Tracking
- Individual and team goals
- Progress visualization
- Regional performance comparison
- Quota attainment tracking

### Compensation Plans
- Multiple plan types (Basic, Tiered, Accelerator, Team-Based, Executive)
- Plan structure details
- Assignment tracking
- Payout analytics

### Data Operations
- Data load monitoring
- Quality metrics and error tracking
- Sync status and scheduling
- Source system integration status

### Acceleration & Alerts
- Active SPIF programs
- System notifications
- AI-powered recommendations
- Performance alerts

## Documentation

- [Architecture Overview](./docs/architecture.md)
- [Component Library](./docs/component-library.md)

## Development

### Code Style

- TypeScript strict mode enabled
- ESLint configuration for code quality
- Prettier for formatting (recommended)

### Adding New Pages

1. Create page file in `web/src/app/[route]/page.tsx`
2. Add navigation link in `Sidebar.tsx`
3. Follow existing page patterns for consistency

### Working with Mock Data

Import from the data service:

```typescript
import { getUsers, getTransactions } from "@/lib/data-service";

const users = getUsers();
const transactions = getTransactions();
```

## License

Proprietary - Internal Use Only
