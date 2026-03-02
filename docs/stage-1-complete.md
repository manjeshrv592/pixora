# Stage 1: Project Scaffolding — Completion Report

> **Date:** 2026-03-02
> **Status:** ✅ COMPLETE

---

## What Was Built

### pnpm Monorepo Structure

- Root `package.json` with workspace scripts (`dev`, `build`, `db:*`)
- `pnpm-workspace.yaml` — workspaces: `apps/*`, `packages/*`
- `apps/web` — Next.js 16 application
- `apps/relay` — placeholder for SMTP relay server (Stage 8)
- `packages/shared` — shared TypeScript types

### Next.js 16.1.6 (App Router)

- Initialized with TypeScript, Tailwind CSS 4, ESLint, Turbopack
- App Router with `src/` directory
- Import alias: `@/*`

### Database — Neon Postgres + Drizzle ORM

- Connected to Neon Postgres (free tier, Singapore region)
- Drizzle ORM with `@neondatabase/serverless` driver
- All 11 tables created via `db:push`:
  - `tenants`, `users`, `groups`, `user_groups`
  - `resource_types`, `resource_items`
  - `rules`, `templates`, `signature_settings`
  - `user_overrides`, `subscriptions`
- Unique composite indexes on `(tenant_id, azure_user_id)` and `(tenant_id, azure_group_id)`
- Drizzle config loads env via `dotenv/config`

### Shared Types Package (`@pixora/shared`)

- `FieldType`, `FieldDefinition`, `FieldValidation` — for Resource Builder
- `ScopeType` — for Rule Engine
- `TenantStatus`, `SubscriptionPlan`, `BillingCycle`, `SubscriptionStatus` — for billing

---

## All Files Created

| File | Purpose |
|------|---------|
| `package.json` | Root monorepo config with convenience scripts |
| `pnpm-workspace.yaml` | Workspace definition |
| `.gitignore` | Root gitignore |
| `apps/web/` | Next.js 16 app (created via `create-next-app`) |
| `apps/web/src/lib/db/schema.ts` | Drizzle ORM schema — all 11 tables |
| `apps/web/src/lib/db/client.ts` | Drizzle client using Neon serverless driver |
| `apps/web/drizzle.config.ts` | Drizzle Kit config |
| `apps/web/.env.example` | Environment variable template |
| `apps/relay/package.json` | Relay server placeholder |
| `packages/shared/types.ts` | Shared TypeScript types |
| `packages/shared/package.json` | Shared package config |

---

## Environment Variables

```env
DATABASE_URL=postgresql://...@ep-xxxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
```

---

## Key Decisions

- **Neon over Vercel Postgres:** Vercel Postgres now uses Prisma Accelerate URLs (`wss://db.prisma.io`) which are incompatible with Drizzle ORM. Neon gives standard PostgreSQL URLs.
- **pnpm Monorepo:** Keeps web app, relay server, and shared types in one repo while allowing independent deployment.
- **Drizzle over Prisma:** Lighter, SQL-like syntax, better serverless performance with Neon's HTTP driver.
- **`.env` over `.env.local`:** Both Next.js and Drizzle Kit read `.env`, avoiding the need for separate env files.

---

## Verification

- ✅ `pnpm dev` — dev server runs on localhost:3000
- ✅ `pnpm --filter web db:push` — all 11 tables created in Neon
- ✅ Deployed to Vercel (root directory: `apps/web`)
- ✅ `pnpm --filter web build` — compiled successfully
