# Stage 3: User & Group Sync from Microsoft 365 — Complete

**Status:** ✅ Complete  
**Date:** 2026-03-02

---

## Files Created

### 1. Microsoft Graph Client — `apps/web/src/lib/graph.ts`
- Client credentials flow (app-only tokens) using `AUTH_MICROSOFT_ENTRA_ID_ID` + `AUTH_MICROSOFT_ENTRA_ID_SECRET`
- Gets `azureTenantId` from the session to request per-tenant tokens
- `getGraphAccessToken(azureTenantId)` — POST to `/oauth2/v2.0/token`
- `fetchGraphUsers(accessToken)` — GET `/v1.0/users` with pagination, filters `userType eq 'Member'`
- `fetchGraphGroups(accessToken)` — GET `/v1.0/groups` with pagination
- `fetchGraphGroupMembers(accessToken, groupId)` — GET `/v1.0/groups/{id}/members` with pagination
- `fetchAllPages(url, accessToken)` — handles `@odata.nextLink` pagination

### 2. Server Actions — `apps/web/src/app/(dashboard)/users/actions.ts`
- `syncUsers()` — fetches all M365 users → upserts into `users` table (matched by `azure_user_id` + `tenant_id`), updates `synced_at`
- `syncGroups()` — fetches groups → upserts into `groups` table → fetches members per group → rebuilds `user_groups` junction table
- Both call `revalidatePath()` for relevant routes
- Both return `{ success, count/groupCount }` or `{ error }` for UI feedback

### 3. Sync Buttons — `apps/web/src/app/(dashboard)/users/SyncButtons.tsx`
- `SyncUsersButton` — client component, calls `syncUsers()` action
- `SyncGroupsButton` — client component, calls `syncGroups()` action
- States: idle → loading (spinner) → success (checkmark, 3s) or error (alert, 5s) → idle

### 4. Users List Page — `apps/web/src/app/(dashboard)/users/page.tsx`
- Server component with server-side pagination (10 per page via `?page=N`)
- Shows total count, last synced timestamp, only "Sync Users" button
- Table with avatar initials, name, email, job title, department, country
- Links to individual user profiles
- Uses reusable `Pagination` component

### 5. User Profile Page — `apps/web/src/app/(dashboard)/users/[id]/page.tsx`
- Displays full user details (email, job title, department, country, city, phone)
- Shows group memberships as clickable violet badges linking to `/groups/[id]`
- Back link to `/users`
- 404 if user not found or wrong tenant

### 6. Groups List Page — `apps/web/src/app/(dashboard)/groups/page.tsx`
- Server component with server-side pagination (10 per page)
- Card grid (3 columns) with group name and member count per group
- Shows only "Sync Groups" button
- Uses reusable `Pagination` component

### 7. Group Detail Page — `apps/web/src/app/(dashboard)/groups/[id]/page.tsx`
- Group header with name and member count
- Member list with avatar initials, name, email, job title
- Each member links to `/users/[id]`
- Back link to `/groups`

### 8. Reusable Pagination — `apps/web/src/components/Pagination.tsx`
- Client component using URL search params (`?page=N`)
- Shows "Showing X–Y of Z" + page number buttons with ellipsis
- Previous/Next buttons, disabled at boundaries
- Auto-hides when only 1 page
- Used by both Users and Groups pages

---

## Files Modified

### Sidebar — `apps/web/src/components/layout/Sidebar.tsx`
- Added `UsersRound` import from lucide-react
- Added "Groups" nav item between Users and Resource Types with `UsersRound` icon

### Login Button — `apps/web/src/app/(auth)/login/login-button.tsx`
- Changed "Sign in with Microsoft" button from pure white (`bg-white text-[#1a1a1a]`) to dark glass style (`bg-[#1a1a2e] text-white border border-[#2a2a3e]`) with violet hover glow

---

## Database Tables Used (already existed from Stage 2)
- `tenants` — `id`, `name`, `azureTenantId`, `domain`, `plan`, `createdAt`
- `users` — `id`, `tenantId`, `azureUserId`, `email`, `displayName`, `jobTitle`, `department`, `country`, `city`, `phone`, `syncedAt`
- `groups` — `id`, `tenantId`, `azureGroupId`, `name`, `syncedAt`
- `user_groups` — `userId`, `groupId` (junction table, composite PK)

---

## Azure App Registration Requirements
The app needs these **Application permissions** (not delegated) with admin consent:
- `User.Read.All`
- `Group.Read.All`
- `GroupMember.Read.All`

---

## Build Status
```
✓ Compiled successfully
✓ TypeScript passed
Routes: /, /users, /users/[id], /groups, /groups/[id], /login, /api/auth/[...nextauth]
```

---

## Architecture Notes
- Graph API uses **client credentials flow** (app-only), not user delegation
- Data is synced to local Postgres; pages read from DB, never from Graph API on load
- Upsert pattern prevents duplicates on re-sync
- `user_groups` is fully rebuilt per group on each sync (delete all + re-insert)
- Pagination is server-side (SQL LIMIT/OFFSET), not client-side
- IDE shows drizzle-orm type errors (phantom duplicate pnpm resolution) — these are **IDE-only**, build passes clean
