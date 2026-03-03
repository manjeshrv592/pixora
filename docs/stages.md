# Pixora — Staged Development Guide

> **How to use this document:** Each stage is ONE working session. We complete it, verify it works, then move to the next. Start a new conversation with the prompt at the bottom of this document.

---

## Before We Start: Microsoft 365 Setup

You said you'll create a new trial account. Here's exactly what to do **before we write any code.**

### Step A: Create Microsoft 365 Business Trial

1. Go to [https://www.microsoft.com/en-us/microsoft-365/business/microsoft-365-business-premium?activetab=pivot:overviewtab](https://www.microsoft.com/en-us/microsoft-365/business/microsoft-365-business-premium?activetab=pivot:overviewtab)
2. Click **"Try free for 1 month"**
3. Use a work email or create a new one — you'll get a `.onmicrosoft.com` domain
4. Complete signup — you now have a Microsoft 365 admin center
5. **Add 3-5 test users** in Admin Center → Users → Active Users
   - Give them different **job titles** (e.g., "Engineer", "Manager", "Designer")
   - Give them different **countries** (e.g., "Germany", "USA", "India")
   - Give them different **departments**
6. **Create 2-3 groups** in Admin Center → Teams & Groups → Active Teams & Groups
   - e.g., "Marketing", "Engineering"
   - Add different users to each group

### Step B: Register Multi-Tenant Azure AD App

1. Go to [https://entra.microsoft.com](https://entra.microsoft.com) (same account)
2. Navigate: **Identity → Applications → App registrations → + New registration**
3. Fill in:
   - **Name**: `Pixora Signature Manager`
   - **Supported account types**: **Accounts in any organizational directory** (Multi-tenant)
   - **Redirect URI**: Select **Web** → enter `http://localhost:3000/api/auth/callback/azure-ad` (we'll update this later)
4. After creation, note down:
   - **Application (client) ID** — this is your `AZURE_CLIENT_ID`
   - **Directory (tenant) ID** — this is your `AZURE_TENANT_ID`
5. Go to **Certificates & secrets → + New client secret**
   - Description: `dev-secret`
   - Expires: 24 months
   - **Copy the secret value immediately** — this is your `AZURE_CLIENT_SECRET`
6. Go to **API permissions → + Add a permission → Microsoft Graph → Application permissions**
   - Add: `User.Read.All`, `Group.Read.All`, `GroupMember.Read.All`, `Directory.Read.All`
   - Click **"Grant admin consent for [your org]"**

> [!CAUTION]
> Copy the client secret VALUE immediately after creating it. You can never see it again after leaving the page.

### Step C: Set Up Accounts for Other Services

- **Vercel account**: [vercel.com](https://vercel.com) — sign up with GitHub
- **Cloudflare account**: [cloudflare.com](https://cloudflare.com) — for R2 storage (free tier), DNS later
- **Razorpay account**: [razorpay.com](https://razorpay.com) — create account, stay in test mode for now
- **VPS provider account**: Create account on [Hetzner](https://hetzner.com) or [DigitalOcean](https://digitalocean.com) — don't provision a server yet, we'll do that in Stage 8

---

## ✅ Stage 1: Project Scaffolding — COMPLETE

**Completed.** Next.js 16 monorepo scaffolded with pnpm workspaces. Neon Postgres connected via Drizzle ORM. All 11 database tables created. Deployed to Vercel.

---

## ✅ Stage 2: Authentication — COMPLETE

**Completed.** Auth.js v5 with Microsoft Entra ID (multi-tenant). Tenant auto-creation on first login. Protected routes, login page, dashboard shell with collapsible sidebar.

---

## ✅ Stage 3: User Sync from M365 — COMPLETE

**Completed.** Graph API client with client credentials flow. Sync Users/Groups buttons. Users list with server-side pagination, user profiles, groups list with member counts, group detail pages. Data reads from DB, not Graph API.

---

## ✅ Stage 4: Resource Type Builder — COMPLETE

**Completed.** Resource Type Builder with full CRUD. Field schema editor supporting 10 field types with type-specific validation. List page with card grid and pagination. Detail, edit, and delete flows. Slug uniqueness per tenant.

---

## ✅ Stage 5: Resource Items + Dynamic Forms — COMPLETE

**Completed.** Resource Items CRUD with dynamic forms generated from schema. TipTap rich text editor. Image upload to Cloudflare R2. All 10 field types supported. Time-bound resources with status indicators (Active/Scheduled/Expired). List page with type selector tabs.

## ✅ Stage 6: Rule Engine — COMPLETE

**Completed.** Rule Engine with full CRUD. Five scope types (Global, Country, Job Title, Group, Individual) with priority hierarchy. Dynamic RuleForm with scope-specific value inputs. Rules list with scope filter tabs. Rule Preview page — select a user and see exactly which resources they receive with matched scope badges.

---

## ✅ Stage 7: Signature Template + API — COMPLETE

**Completed.** Signature template editor with placeholder autocomplete (user fields + resource type fields). Signature builder engine (Handlebars-style rendering). Template CRUD with default management. Signature preview page (select user + template → rendered HTML). `/api/signature?email=` public endpoint. Per-user signature overrides (custom template, add/remove items). Signature settings page (new/replies/forwards/calendar toggles, reply template selector).

---

## Stage 8: Relay Server — Setup & Basic SMTP

**Goal:** A Node.js SMTP server running on a VPS that can receive and forward email.

**What we build:**
- Provision VPS on Hetzner/DigitalOcean (I'll guide you step by step)
- Request port 25 access
- DNS setup: `relay.pixora.com` → VPS IP
- TLS certificate via Let's Encrypt
- Node.js SMTP server using `smtp-server` package
- Basic pass-through: receive email on port 25 → forward to M365 MX
- Health check HTTP endpoint on port 3001

**What you'll have at the end:** A working SMTP server that receives email and forwards it. No signature injection yet — just proving the mail flow works.

---

## Stage 9: Relay Server — Signature Injection

**Goal:** Relay server injects signature into emails passing through it.

**What we build:**
- Connect relay to Vercel Postgres (read-only)
- Email parsing with `mailparser`
- Extract sender email from headers
- Query DB: resolve rules for this sender → get signature HTML
- Inject signature into email body (HTML part)
- New vs Reply vs Forward detection (headers inspection)
- `X-Pixora-Processed` header to prevent loops
- SPF/DKIM/DMARC DNS records

**What you'll have at the end:** Emails passing through the relay get the correct signature injected automatically.

---

## Stage 10: M365 Connector Setup

**Goal:** Client's M365 is connected to your relay so all outbound email routes through it.

**What we do (guided setup, not code):**
- Create Send Connector in Exchange Admin (outbound → your relay VPS)
- Create Receive Connector in Exchange Admin (inbound from your relay IP)
- Create Transport Rule (route emails through the send connector, except if `X-Pixora-Processed` header exists)
- I'll provide the exact PowerShell script for all of this
- Test end-to-end: send email from Outlook → relay adds signature → recipient sees signature

**What you'll have at the end:** Full end-to-end working flow. Send an email from your test M365 account, signature gets added server-side.

---

## Stage 11: Outlook Add-in

**Goal:** Users see a signature preview while composing emails in Outlook.

**What we build:**
- Unified manifest JSON file
- Event-based activation handler (`OnNewMessageCompose`, `OnNewAppointmentOrganizer`)
- Compose type detection (new / reply / forward)
- Call `/api/signature` to fetch preview HTML
- `setSignatureAsync()` to inject preview (cursor stays at top)
- Token-based auth for add-in API calls
- Deploy to your M365 org for testing

**What you'll have at the end:** Open Outlook Web → compose new email → signature appears automatically at the bottom. Cursor stays at top. Reply emails get abbreviated signature (or none, based on settings).

---

## Stage 12: SaaS Features

**Goal:** Self-service onboarding, billing, and admin panel.

**What we build:**
- Landing page with "Connect to Microsoft 365" button
- Admin consent flow redirect + callback handler
- Automated initial user sync on onboarding
- Razorpay integration (subscriptions API, webhooks, payment links)
- Super-admin dashboard (list tenants, suspend/activate)
- Subscription enforcement (block relay if suspended)
- PowerShell script generator for connector setup

**What you'll have at the end:** A second organization can sign up, connect their M365, and start using the product — all self-service.

---

## Quick Reference

| Stage | Deliverable | Approx Time |
|---|---|---|
| Setup | M365 trial + Azure AD app + accounts | 1-2 hours |
| 1 | Project scaffolding + DB | ✅ Complete |
| 2 | Auth + login | ✅ Complete |
| 3 | User/group sync from M365 | ✅ Complete |
| 4 | Resource Type Builder | ✅ Complete |
| 5 | Resource Items + dynamic forms | ✅ Complete |
| 6 | Rule engine | ✅ Complete |
| 7 | Signature template + API | ✅ Complete |
| 8 | Relay server setup | 2-3 hours |
| 9 | Relay signature injection | 3-4 hours |
| 10 | M365 connector setup | 1-2 hours |
| 11 | Outlook add-in | 3-4 hours |
| 12 | SaaS features | 4-6 hours |

> [!TIP]
> **Prompt to start a new conversation:**
> ```
> Read these files for full context on the Pixora project:
> - d:\office-projects\pixora\docs\architecture.md (full system architecture)
> - d:\office-projects\pixora\docs\stages.md (staged development guide)
> - d:\office-projects\pixora\docs\stage-[LATEST]-complete.md (latest stage completion report)
>
> Project: d:\office-projects\pixora (pnpm monorepo, Next.js 16 in apps/web)
> Database: Neon Postgres + Drizzle ORM (schema at apps/web/src/lib/db/schema.ts)
>
> I'm ready for Stage [X]. Let's build it.
> ```
