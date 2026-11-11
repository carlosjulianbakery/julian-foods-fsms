# Task System Spec — Julian Bakery FSMS

## Overview
Rule-based task system replacing the old template/instance system.
Built in phases; old system stays live until Phase 6.

## Models

### Facility
- id, name, calendarTabName, createdAt

### TaskRule
- id, title, description?, facilityId (→Facility), ownerId (→User)
- triggerType: RECURRING | PRODUCTION_DAY | PRODUCTION_PRODUCT | ONE_OFF
- recurrenceUnit?: "day" | "week" | "month"
- recurrenceEvery?: Int (default 1)
- recurrenceStart: DateTime @db.Date
- formKey?: String (key into task-form-registry)
- isActive: Boolean default true
- createdAt, updatedAt

### RuleInstance (table: rule_instances)
- id, ruleId (→TaskRule), dueDate: DateTime @db.Date
- status: UPCOMING | DUE_TODAY | IN_PROGRESS | DONE | OVERDUE | SKIPPED | MISSED
- label: String default "" (used for multi-instance rules per day)
- doneAt?, doneById?, skippedAt?, skippedById?, skipReason?
- createdAt, updatedAt
- @@unique([ruleId, dueDate, label])

## Form Registry (src/lib/task-form-registry.ts)
Maps formKey → { label, href(instanceId) }

Keys: daily_cleaning, preop, monthly_cleaning, batch_sheet, receiving

## Phase 1 Deliverables
1. Prisma models + SQL migration
2. Seed two facilities
3. Task-form registry
4. API routes /api/task-rules and /api/task-instances
5. Generator: creates RuleInstances idempotently, Pacific dates
6. Status updater: UPCOMING→DUE_TODAY→OVERDUE in same cron
7. Cron at /api/cron/task-generator — daily 30 15 * * * UTC
8. Admin page /dashboard/admin/task-rules — list, create, edit, deactivate
9. Admin page /dashboard/admin/task-instances — read-only list
10. Sidebar entry "Task Rules"
11. Seed 3 rules owned by Ivan Torres

## Phase 2+ (future)
Calendar view, supervisor task list, PRODUCTION_DAY/PRODUCT triggers,
form linking, completion flow, dashboard widget.
