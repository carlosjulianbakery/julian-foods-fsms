# Julian's Foods — Food Safety Management System

A full-stack Food Safety Management System (FSMS) built with Next.js 14, PostgreSQL, and Prisma ORM.

## Features

- **Role-based authentication** — Operator, Supervisor, Admin roles
- **Dynamic form builder** — Create custom food safety forms with 8 field types (text, number, temperature, textarea, dropdown, checkbox, date, time)
- **Task scheduler** — Assign tasks to team members with due dates, priorities, recurrence (daily/weekly/monthly), and linked forms
- **Records management** — Document food safety events with structured key-value data, tags, and audit trail
- **Dashboard** — Real-time overview of tasks, submissions, and overdue items
- **Admin panel** — User management (role assignment, activate/deactivate), system settings
- **Full audit log** — Every create/update/delete is logged with user and timestamp

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Database | PostgreSQL |
| ORM | Prisma |
| Authentication | NextAuth.js (JWT sessions) |
| Styling | Tailwind CSS |
| Language | TypeScript |

## Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL 14+

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env.local
```

Edit `.env.local` with your database credentials:
```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/julian_foods_fsms"
NEXTAUTH_SECRET="your-32-char-secret"
NEXTAUTH_URL="http://localhost:3000"
```

### 3. Set up the database
```bash
npm run db:push      # Create tables from schema
npm run db:seed      # Seed with demo data
```

### 4. Run the development server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Demo Accounts

| Role | Email | Password |
|---|---|---|
| Admin | julian@julianfoods.com | admin123! |
| Supervisor | sarah@julianfoods.com | supervisor123! |
| Operator | mike@julianfoods.com | operator123! |

## Role Permissions

| Feature | Operator | Supervisor | Admin |
|---|:---:|:---:|:---:|
| View & fill forms | ✅ | ✅ | ✅ |
| Create/edit forms | ❌ | ✅ | ✅ |
| View tasks | Own | All | All |
| Create tasks | ❌ | ✅ | ✅ |
| Update task status | Own | All | All |
| Create records | ✅ | ✅ | ✅ |
| Archive records | ❌ | ✅ | ✅ |
| Manage users | ❌ | View | Full |
| System settings | ❌ | ❌ | ✅ |

## Project Structure

```
src/
├── app/
│   ├── (auth)/          # Login & Register pages
│   ├── (dashboard)/     # Dashboard, Forms, Tasks, Records
│   ├── (admin)/         # Admin-only pages
│   └── api/             # REST API routes
├── components/
│   ├── admin/           # User management components
│   ├── forms/           # Dynamic form renderer
│   ├── layout/          # Sidebar, Header, Providers
│   ├── records/         # Record management
│   ├── tasks/           # Task components
│   └── ui/              # Reusable UI (Modal, Badge, Toast, etc.)
└── lib/
    ├── auth.ts          # NextAuth configuration
    ├── prisma.ts        # Prisma client singleton
    └── utils.ts         # Helpers (formatting, colors)
prisma/
├── schema.prisma        # Database schema
└── seed.ts              # Demo data seeder
```

## API Routes

| Method | Route | Description | Min Role |
|---|---|---|---|
| POST | `/api/users/register` | Register new user | Public |
| PATCH | `/api/users/[id]` | Update role/status | Admin |
| GET | `/api/forms` | List forms | Any |
| POST | `/api/forms` | Create form | Supervisor |
| GET | `/api/forms/submissions` | List submissions | Any |
| POST | `/api/forms/submissions` | Submit form | Any |
| GET | `/api/tasks` | List tasks | Any |
| POST | `/api/tasks` | Create task | Supervisor |
| PATCH | `/api/tasks/[id]` | Update task status | Assignee/Supervisor |
| GET | `/api/records` | List records | Any |
| POST | `/api/records` | Create record | Any |
| DELETE | `/api/records/[id]` | Archive record | Supervisor |
