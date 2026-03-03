# Stage 6: Rule Engine — Complete

**Status:** ✅ Complete  
**Date:** 2026-03-03

---

## Files Created

### 1. Server Actions — `apps/web/src/app/(dashboard)/rules/actions.ts`
- `createRule(data)` — validates scope type/value, verifies resource item ownership, tenant-scoped insert
- `updateRule(id, data)` — ownership check + update
- `deleteRule(id)` — ownership check + delete, redirects to list
- `getRules(page, pageSize, scopeTypeFilter?)` — paginated query with optional scope filter, joins resource items + types
- `getRuleFormData()` — fetches resource types, items, users, groups, distinct countries/job titles for form dropdowns
- `resolveRulesForUser(userId)` — core rule resolution engine:
  1. Fetches user profile + group memberships
  2. Fetches all tenant rules
  3. Filters rules matching user (global, country, job_title, group, individual)
  4. For each resource item, picks highest-priority rule by scope hierarchy
  5. Returns grouped result by resource type with matched scope metadata

### 2. Rule Form — `apps/web/src/app/(dashboard)/rules/RuleForm.tsx`
- Shared client component for create and edit modes
- Resource item selector with optional type filter dropdown
- Scope type selector: 5 interactive cards (Global, Country, Job Title, Group, Individual)
- Dynamic scope value input per type: auto-`*` for global, dropdowns for country/job title/group/individual
- Priority number input with hierarchy explanation
- Error display, loading state

### 3. Rules List Page — `apps/web/src/app/(dashboard)/rules/page.tsx`
- Header with orange/amber gradient Scale icon
- "Preview" and "New Rule" action buttons
- Scope filter tabs: All, Global, Country, Job Title, Group, Individual
- Table: Resource Item (linked) | Scope badge (color-coded) | Value (resolved) | Priority | Type
- Resolves group IDs and user IDs to display names
- Pagination, empty state

### 4. New Rule Page — `apps/web/src/app/(dashboard)/rules/new/page.tsx`
- Server component fetching form data (types, items, users, groups, countries, job titles)
- Renders RuleForm in create mode

### 5. Rule Detail Page — `apps/web/src/app/(dashboard)/rules/[id]/page.tsx`
- Resource item card (linked to resource detail)
- Scope type badge with resolved value (group name, user name, etc.)
- Priority display
- Creation date
- Edit and Delete action buttons

### 6. Delete Button — `apps/web/src/app/(dashboard)/rules/[id]/DeleteButton.tsx`
- Inline confirmation flow (Delete → Confirm/Cancel)

### 7. Edit Rule Page — `apps/web/src/app/(dashboard)/rules/[id]/edit/page.tsx`
- Pre-populates RuleForm with existing rule data
- Auto-selects resource type filter from current item

### 8. Rule Preview Page — `apps/web/src/app/(dashboard)/rules/preview/page.tsx`
- User selector dropdown (shows name, job title, country)
- User profile card (avatar, email, job title, country, group badges)
- Resolved resources grouped by resource type
- Each item shows: name, matched scope badge (color-coded), scope value, priority
- Empty state when no rules match

---

## Rule Resolution Engine

**Priority hierarchy** (highest overrides lowest):
```
Individual (4) > Group (3) > Job Title (2) > Country (1) > Global (0)
```

Within the same scope level, explicit `priority` field (higher number wins) breaks ties.

**Resolution process:**
1. Fetch user's country, job title, and group memberships
2. Match all rules: global always matches, country/job_title by value comparison, group by membership, individual by user ID
3. For each resource item, select the rule with highest scope priority × 1000 + explicit priority
4. Filter out inactive items and items outside their valid_from/valid_until window
5. Group results by resource type

---

## Build Status
```
✓ Compiled successfully
✓ TypeScript passed in 4.2s
Routes: /rules, /rules/new, /rules/[id], /rules/[id]/edit, /rules/preview
```

---

## Architecture Notes
- Rule resolution is server-side only — no client-side rule logic
- Scope values for groups and individuals store UUIDs, resolved to display names at render time
- Preview page uses a simple form GET submission (no client JS needed for the selector)
- All queries are tenant-scoped via `getTenantId()` helper
- Consistent with existing UI patterns: dark theme (#12121a cards, #1e1e2e borders, violet accents, lucide icons)
- Scope type badges are color-coded: blue (global), emerald (country), amber (job title), purple (group), pink (individual)
