# Pixora — Email Signature Management Platform Architecture

> **Purpose**: This is the living architecture document for the project. Reference this in every new conversation so context is never lost.

---

## 1. System Overview

You are building an **Exclaimer-style email signature management SaaS** with these core capabilities:

| Capability | Description |
|---|---|
| **Signature Template Engine** | HTML signature templates with dynamic placeholders |
| **Dynamic Resource Builder** | Client-defined resource schemas (like Sanity content builder) — future-proof |
| **Rule Engine** | Assign resources by Global / Country / Job Title / Group / Individual |
| **Relay Server** | Server-side signature injection via M365 mail flow connectors |
| **Outlook Add-in** | Client-side signature preview while composing |
| **Multi-Tenant SaaS** | Self-service onboarding via OAuth2 admin consent |

> [!IMPORTANT]
> **Building from scratch.** The existing Next.js app is being abandoned. Starting fresh with a proper architecture, Vercel Postgres, and a dynamic Resource Builder.

---

## 2. High-Level Architecture

```
┌─ VERCEL ───────────────────────┐   ┌─ VPS (Hetzner/DO) ────────┐
│  Next.js App (from scratch)    │   │  Relay Server              │
│  + Neon Postgres (free)        │   │  (Node.js + smtp-server)   │
│                                │   │                            │
│  - Dashboard                   │   │  - Listens on port 25 TLS  │
│  - Resource Builder (dynamic)  │   │  - Receives email from M365│
│  - User management             │   │  - Parses sender info      │
│  - Rule engine                 │   │  - Queries Neon PG for     │
│  - Billing (Razorpay)            │   │    rules + resources       │
│  - /api/signature (add-in)     │   │  - Builds signature HTML   │
│  - /api/webhooks (Graph)       │   │  - Injects into email      │
│  - Outlook add-in hosting      │   │  - Returns email to M365   │
│  - Neon Postgres (DB)          │   │  - Health check endpoint   │
└───────────────┬────────────────┘   └──────────────┬─────────────┘
                │                                    │
                │   VPS connects to Neon PG ─────────┘
                │
                ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                           MICROSOFT 365 (Client Tenant)                                  │
│                                                                                          │
│  ┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────┐                  │
│  │ Send Connector   │───▶│ YOUR RELAY (VPS) │───▶│ Receive Connector   │                  │
│  │ (Outbound→VPS)   │    │ port 25          │    │ (Inbound from VPS)  │                  │
│  └─────────────────┘    └──────────────────┘    └─────────────────────┘                  │
│                                                                                          │
│  ┌─────────────────┐    ┌──────────────────────────────────────────────────────────────┐ │
│  │ Transport Rule   │    │ Outlook Add-in (Manifest)                                   │ │
│  │ (routes email    │    │ - Event-based activation (OnNewMessageCompose)               │ │
│  │  to relay VPS)   │    │ - Calls Vercel /api/signature for preview                   │ │
│  └─────────────────┘    └──────────────────────────────────────────────────────────────┘ │
│                                                                                          │
│  ┌──────────────────────────────────────────────────────────────────────────────────────┐│
│  │ Azure AD / Entra ID — User profiles, Groups, Job titles, OAuth2 admin consent       ││
│  └──────────────────────────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

### Key Hosting Split

| What | Where | Why |
|---|---|---|
| **Next.js app + DB** | **Vercel + Neon Postgres** | All-in-one deploy, free tier DB with 0.5GB |
| **Relay server** | **Hetzner/DigitalOcean VPS** | Port 25 open (required for SMTP relay), full server control |

---

## 3. Answers to Your Questions

### Q1: Self-Service Onboarding (Like Exclaimer)

**Your understanding is correct.** You need a **multi-tenant Azure AD app registration** with **admin consent flow**.

#### How It Works

1. **Register ONE app** in your own Azure tenant as **multi-tenant** ("Accounts in any organizational directory")
2. On your landing page, add a **"Connect to Microsoft 365"** button
3. That button redirects the client's admin to:
   ```
   https://login.microsoftonline.com/common/adminconsent
     ?client_id=YOUR_APP_CLIENT_ID
     &redirect_uri=https://app.pixora.com/onboarding/callback
     &state=random_state_value
   ```
4. Their admin signs in, sees permissions you're requesting, clicks **Accept**
5. Azure redirects back to your callback URL with `tenant_id` and `admin_consent=True`
6. You store the `tenant_id` in your database — this tenant is now onboarded
7. Using your app's **client credentials** (App ID + Secret), you can now call **Microsoft Graph API** for that tenant:
   ```
   POST https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token
   Body: client_id, client_secret, scope=https://graph.microsoft.com/.default, grant_type=client_credentials
   ```

#### Permissions You Need (Application-level, not Delegated)

| Permission | Reason |
|---|---|
| `User.Read.All` | Read all user profiles (name, job title, country, photo) |
| `Group.Read.All` | Read group memberships |
| `Directory.Read.All` | Read organizational data |
| `Mail.Send` | Only if you need to send test emails |

> [!IMPORTANT]
> **No more manual App ID/Tenant ID/Secret setup per client!** Your single multi-tenant app registration handles everything. The client's admin just clicks "Accept" and they're onboarded.

#### Connector Setup Automation

After onboarding, you still need to set up M365 connectors and transport rules in the client's tenant. Options:

- **PowerShell remoting via Exchange Online** — You can use the Exchange Online Management module with the admin's delegated permissions to programmatically create connectors and transport rules
- **Semi-automated** — Provide a step-by-step guide with a PowerShell script the admin runs (this is what Exclaimer does)
- **Manual** — Walk the admin through Exchange Admin Center (least scalable)

> [!TIP]
> For your first client, go with the **semi-automated PowerShell script** approach. Full automation via Exchange Online API requires additional permissions (`Exchange.ManageAsApp`) and is more complex to set up.

---

### Q2: Next.js Optimization — Stop Fetching on Every Page Load

**You are right that fetching user profiles from M365 on every page load is wasteful.** Here's the correct approach:

#### Strategy: Database + Sync Job (Not SSG/ISR)

Since you're building a SaaS with a database, **SSG/ISR is NOT the right pattern here**. ISR is for static content websites (blogs, marketing pages). For your admin dashboard:

1. **Sync users to your database** on onboarding and periodically after
2. **Use Server Components** (Next.js App Router) to fetch from your DB (fast, no client waterfalls)
3. **Set up Microsoft Graph Webhooks** to receive real-time notifications when users/groups change

#### Implementation

```
Flow:
┌──────────┐    Webhook     ┌──────────────┐     Query     ┌────────────┐
│ Azure AD │ ─────────────▶ │ /api/webhook │ ──────────── ▶│ PostgreSQL │
│ (changes)│                │ (Next.js API)│                │ (users,    │
└──────────┘                └──────────────┘                │  groups)   │
                                                            └────────────┘
                                                                  │
                                                            ┌─────▼──────┐
                                                            │  Dashboard │
                                                            │  Pages     │
                                                            └────────────┘
```

**Step 1**: On onboarding, do a **full sync** — pull all users and groups from MS Graph and store in PostgreSQL

**Step 2**: Register a **Microsoft Graph webhook subscription** for user and group changes:
```
POST https://graph.microsoft.com/v1.0/subscriptions
{
  "changeType": "created,updated,deleted",
  "notificationUrl": "https://app.pixora.com/api/webhooks/graph",
  "resource": "/users",
  "expirationDateTime": "2026-03-08T00:00:00Z",
  "clientState": "your-secret-state"
}
```

**Step 3**: When webhook fires, update only the changed users in your DB

**Step 4**: Dashboard pages query your local DB (milliseconds, not seconds)

> [!NOTE]
> Graph webhook subscriptions expire (max 29 days for `/users`). Set up a cron job to renew them before they expire.

---

### Q3: Relay Server Hosting — ✅ DECIDED

**Relay goes on a separate VPS (Hetzner or DigitalOcean).** Azure/AWS/GCP all block port 25 on standard subscriptions.

| Provider | Port 25 | Monthly Cost | Recommended |
|---|---|---|---|
| **Hetzner** | ✅ Open (after verification) | $4-8 | ⭐ Best value |
| **DigitalOcean** | ✅ Open (after ticket) | $6-12 | ⭐ Easiest setup |
| **Vultr** | ✅ Open (after request) | $5-10 | Good alternative |
| **OVH / OVHcloud** | ✅ Open | $5-10 | EU-focused |

#### Setup Steps (After You Pick a Provider)

1. Provision an Ubuntu 22.04 VPS (2 vCPU, 4GB RAM is plenty)
2. Submit a support ticket to enable port 25 (explain it's for email signature relay, not bulk mailing)
3. Point a subdomain to the VPS IP: `relay.pixora.com → VPS_IP`
4. Install Node.js 20+ and deploy the relay app
5. Get a TLS certificate (Let's Encrypt) for `relay.pixora.com`
6. Set up SPF/DKIM/DMARC DNS records

#### Your Relay Server Is a Node.js App (Not Postfix)

```
Node.js App (smtp-server + mailparser + nodemailer)
├── Listens on port 25 (TLS via Let's Encrypt)
├── Receives email from M365 Send Connector
├── Parses the email (extracts sender, headers)
├── Queries Neon Postgres for sender's resource types + rules
├── Injects HTML signature into the email body
├── Adds header: X-Pixora-Processed: true
├── Sends email back to M365 MX endpoint on port 25
└── HTTP health check on port 3001 (for monitoring)
```

The npm package `smtp-server` lets you create a full SMTP server in Node.js. No Postfix needed.

---

### Q4: New Email vs Reply Detection

**Yes, this is supported.** There are two layers:

#### Server-Side (Relay Server)
Your relay server can inspect email headers:
- **New email**: No `In-Reply-To` or `References` header
- **Reply/Forward**: Has `In-Reply-To` and/or `References` headers
- **Forward**: Usually has `X-MS-Exchange-MessageSentRepresentingType` or subject starts with "FW:"

In your admin dashboard, provide options:
- ✅ Add full signature to new emails
- ✅ Add abbreviated signature to replies
- ❌ Don't add signature to replies
- ✅ Add signature to forwards

#### Client-Side (Outlook Add-in)
The add-in API `getComposeTypeAsync()` returns whether it's a new message, reply, reply-all, or forward. You can use this to show different signature previews.

---

### Q5: Calendar Invite Signatures

**You are partially correct.** Calendar invites (meeting requests) have an HTML body, and you CAN inject your signature HTML into that body. It functions like a signature but technically it's just HTML content in the invite body.

#### How to Support It

**Server-side (Relay):** Calendar invites are sent as emails with `Content-Type: text/calendar` attachment. Your relay server can:
1. Detect that the email contains a calendar invite (`Content-Type` includes `method=REQUEST`)
2. Find the HTML body part of the email
3. Inject the signature HTML

**Client-side (Add-in):** The `OnNewAppointmentOrganizer` event fires when a user creates a new calendar event. You can use `setSignatureAsync()` here too.

> [!NOTE]
> Calendar invite signature support is available via the Outlook add-in `OnNewAppointmentOrganizer` event, which is supported in Outlook on the web and new Outlook on Windows. Classic Outlook support varies.

---

### Q6: Cursor Position UX Issue

**This is a well-known problem, and there's a direct API solution.**

When your Outlook add-in sets the signature using `setSignatureAsync()`, the cursor behavior depends on how you use the API:

#### Solution: Use `prependOnSendAsync` or Set Signature + Body Together

```javascript
// In your add-in's event handler for OnNewMessageCompose:

// 1. Set the signature (this goes at the bottom)
Office.context.mailbox.item.body.setSignatureAsync(
  signatureHtml,
  { coercionType: Office.CoercionType.Html },
  function(result) {
    // 2. After signature is set, prepend an empty line at the top
    // and set cursor position
    Office.context.mailbox.item.body.prependAsync(
      "<br/>",
      { coercionType: Office.CoercionType.Html },
      function() {
        // Cursor will be at the top where user expects it
      }
    );
  }
);
```

**Key point:** `setSignatureAsync()` is designed to NOT move the cursor when used in event-based activation (background mode). If you're experiencing cursor jumping, it's likely because you're modifying the body content instead of using the dedicated signature API.

> [!TIP]
> Use **event-based activation** (`OnNewMessageCompose` event) instead of task pane activation. Event-based add-ins run in the background and set the signature without any visible UI interruption. The cursor stays at the top of the compose window.

---

### Q7: Signature Preview While Composing

**Yes, the Outlook add-in (manifest) is the only way to show a signature preview in the compose window.** This is how Exclaimer does it too.

#### Exclaimer's Two-Layer Approach

```
Layer 1: Outlook Add-in (Client-Side Preview)
├── Shows signature while user composes email
├── Uses event-based activation (OnNewMessageCompose)
├── Calls setSignatureAsync() to inject preview
├── This is a "best-effort" preview — decorative only
└── If add-in fails/isn't installed, email still gets signature via relay

Layer 2: Relay Server (Server-Side Injection)
├── This is the REAL signature application
├── Processes EVERY email regardless of add-in status
├── Removes any client-injected signature
├── Adds the definitive, rule-based signature
└── Guarantees consistency across all devices/clients
```

> [!IMPORTANT]
> The relay server should **strip** any signature the add-in may have inserted and **replace** it with the server-side version. This ensures consistency even if the add-in inserts a stale/wrong signature.

#### Your Outlook Add-in Setup

You need a **Unified Manifest** (JSON format, recommended for new add-ins):

```json
{
  "$schema": "https://developer.microsoft.com/json-schemas/teams/vDevPreview/MicrosoftTeams.schema.json",
  "manifestVersion": "devPreview",
  "id": "your-add-in-id",
  "name": { "short": "Pixora Signatures" },
  "extensions": [{
    "requirements": { "scopes": ["mail"] },
    "runtimes": [{
      "id": "autorun",
      "type": "general",
      "code": { "page": "https://app.pixora.com/add-in/commands.html" }
    }],
    "autoRunEvents": [{
      "events": [
        { "type": "newMessageComposeCreated", "actionId": "onNewMessage" },
        { "type": "newAppointmentOrganizerCreated", "actionId": "onNewAppointment" }
      ]
    }]
  }]
}
```

The add-in calls your `/api/signature?email={user_email}` endpoint to get the preview HTML.

> [!NOTE]
> For the preview/add-in endpoint (`/api/signature`), your token-based auth is still relevant! The add-in should authenticate with your API. Keep this endpoint.

---

### Q8: Port 25 Blocking — ✅ RESOLVED

**Resolved by moving relay to a VPS provider (Hetzner/DigitalOcean) that allows port 25.**

| Port | Name | Where | Purpose |
|---|---|---|---|
| **25** | SMTP | **VPS (relay) inbound** | M365 sends email TO your relay |
| **25** | SMTP | **VPS (relay) outbound** | Your relay sends email BACK to M365 MX |
| **443** | HTTPS | **Vercel** | Dashboard, API, add-in hosting |
| **3001** | HTTP | **VPS** | Relay health check endpoint |

Port 587 (SMTP Submission) is NOT needed in this architecture. It's for client-to-server auth, which is irrelevant for a relay.

---

## 4. SaaS vs Single-Tenant: Decision

> [!IMPORTANT]
> **Go with SaaS architecture from day one.** The extra effort is minimal (~15-20% more work) and saves you from a painful rewrite later.

### What's Different in SaaS vs Single-Tenant

| Aspect | Single-Tenant | Multi-Tenant SaaS | Extra Effort |
|---|---|---|---|
| Database | No `tenant_id` column | Every table has `tenant_id` | Low |
| Auth | Hardcoded creds | Multi-tenant Azure AD app | Low (you need it for onboarding anyway) |
| Relay server | One instance | One instance, routes by tenant | Low |
| Billing | None | Stripe integration | Medium |
| Admin portal | One dashboard | Dashboard per tenant + super-admin | Medium |
| Isolation | N/A | Tenant data isolation | Low (just WHERE clauses) |

### Your SaaS Admin Panel Requirements

1. **Super-Admin Dashboard** (your internal tool)
   - List all tenants using your product
   - Suspend/activate tenants
   - View subscription status

2. **Billing** (via Razorpay)
   - Monthly / Yearly / Lifetime plans
   - Razorpay Subscriptions API handles recurring payments
   - Webhook from Razorpay → update tenant status in your DB

---

## 5. Tech Stack (Final)

| Component | Technology | Hosting |
|---|---|---|
| **Admin Dashboard** | Next.js 16 (App Router) — **fresh build** | **Vercel** (free tier → Pro $20/mo) |
| **Database** | PostgreSQL | **Neon** (free tier 0.5GB) |
| **ORM** | Drizzle ORM | — |
| **Relay Server** | Node.js + `smtp-server` + `mailparser` | **Hetzner/DigitalOcean VPS** ($4-8/mo) |
| **Outlook Add-in** | JavaScript + Office.js | Served from Vercel (Next.js static routes) |
| **Authentication** | Azure AD multi-tenant + Auth.js | — |
| **Billing** | Razorpay | — |
| **File Storage** | S3-compatible (cert logos, banners) | **Cloudflare R2** (free tier 10GB) |
| **Background Jobs** | Vercel Cron + VPS cron | webhook renewals, banner scheduling |
| **DNS + SSL** | Cloudflare | Free tier |
| **Monitoring** | UptimeRobot or Better Stack | Free tier |

---

## 6. Dynamic Resource Builder

This is the core innovation. Instead of hardcoded tables for certifications, legal text, and banners, clients **define their own resource schemas** — like Sanity's content builder.

### How It Works

```
Admin creates a Resource Type:
┌──────────────────────────────────────────────────────────┐
│  Resource Type: "Certification"                          │
│                                                          │
│  Fields:                                                 │
│  ┌────────────┬──────────┬──────────┬─────────────────┐  │
│  │ Field Name │ Type     │ Required │ Validation      │  │
│  ├────────────┼──────────┼──────────┼─────────────────┤  │
│  │ logo       │ image    │ yes      │ max 200KB       │  │
│  │ title      │ text     │ yes      │ max 100 chars   │  │
│  │ alt_text   │ text     │ no       │ max 150 chars   │  │
│  │ link       │ url      │ no       │ —               │  │
│  └────────────┴──────────┴──────────┴─────────────────┘  │
└──────────────────────────────────────────────────────────┘

Admin creates an item using this schema:
┌──────────────────────────────────────────────────────────┐
│  Item: "ISO 27001"                                       │
│  logo: /uploads/iso27001.png                             │
│  title: "ISO 27001 Certified"                            │
│  alt_text: "ISO 27001 Information Security"               │
│  link: https://example.com/iso                           │
└──────────────────────────────────────────────────────────┘
```

### Supported Field Types

| Field Type | Input | Storage | Use in Signature |
|---|---|---|---|
| `text` | Single-line text input | `string` | Plain text, headings |
| `textarea` | Multi-line text input | `string` | Legal disclaimers, paragraphs |
| `richtext` | Rich text editor | `html string` | Formatted legal text |
| `image` | File upload | `url` (stored in R2) | Logos, cert badges, banners |
| `url` | URL input | `string` | Links on images or text |
| `date` | Date picker | `ISO date string` | Banner start/end dates |
| `select` | Dropdown | `string` | Predefined choices |
| `toggle` | Boolean toggle | `boolean` | Show/hide flags |
| `number` | Numeric input | `number` | Sort order, dimensions |
| `color` | Color picker | `hex string` | Accent colors |

### Why This Is Better Than Hardcoded Tables

| Hardcoded (old) | Dynamic Builder (new) |
|---|---|
| `certifications` table with fixed columns | Client defines "Certification" resource with any fields they want |
| `legal_texts` table with `content_html` | Client defines "Legal Text" resource — could add language field, region, etc. |
| `banners` table with `start_date`, `end_date` | Client defines "Banner" resource — adds date fields if they need time-bound |
| New resource type = code change + migration | New resource type = client clicks "Add Resource Type" in dashboard |
| One size fits all clients | Each client structures resources for their needs |

### Resource Builder UI Flow

```
1. Tenant admin → Dashboard → "Resource Types"
2. Clicks "+ New Resource Type"
3. Names it (e.g., "Certification", "Banner", "Legal Disclaimer")
4. Drag-and-drop field builder:
   [+ Add Field] → pick type → set label, name, required, validation
5. Save → schema stored as JSON in `resource_types.fields_schema`
6. Now go to "Resources" → pick type → "+ New Item"
7. Dynamic form rendered from the schema → fill in values → save
8. Item values stored as JSON in `resource_items.field_values`
```

---

## 7. Database Schema (Neon Postgres + Drizzle ORM)

```sql
-- ═══════════════════════════════════════════
-- MULTI-TENANT CORE
-- ═══════════════════════════════════════════
tenants (
  id              UUID PRIMARY KEY,
  azure_tenant_id TEXT UNIQUE NOT NULL,
  name            TEXT NOT NULL,
  domain          TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'suspended' | 'trial'
  razorpay_customer_id TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
)

-- ═══════════════════════════════════════════
-- SYNCED FROM M365
-- ═══════════════════════════════════════════
users (
  id              UUID PRIMARY KEY,
  tenant_id       UUID REFERENCES tenants(id),
  azure_user_id   TEXT NOT NULL,
  email           TEXT NOT NULL,
  display_name    TEXT,
  job_title       TEXT,
  department      TEXT,
  country         TEXT,
  city            TEXT,
  phone           TEXT,
  photo_url       TEXT,
  synced_at       TIMESTAMPTZ DEFAULT NOW()
)

groups (
  id              UUID PRIMARY KEY,
  tenant_id       UUID REFERENCES tenants(id),
  azure_group_id  TEXT NOT NULL,
  name            TEXT NOT NULL,
  synced_at       TIMESTAMPTZ DEFAULT NOW()
)

user_groups (
  user_id         UUID REFERENCES users(id),
  group_id        UUID REFERENCES groups(id),
  PRIMARY KEY (user_id, group_id)
)

-- ═══════════════════════════════════════════
-- DYNAMIC RESOURCE BUILDER (the key innovation)
-- ═══════════════════════════════════════════
resource_types (
  id              UUID PRIMARY KEY,
  tenant_id       UUID REFERENCES tenants(id),
  name            TEXT NOT NULL,           -- "Certification", "Banner", "Legal Text"
  slug            TEXT NOT NULL,           -- "certification", "banner", "legal-text"
  icon            TEXT,                    -- optional icon identifier
  fields_schema   JSONB NOT NULL,          -- array of field definitions (see below)
  sort_order      INT DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
)
-- fields_schema example:
-- [
--   { "name": "logo", "type": "image", "label": "Logo", "required": true, "validation": { "maxSize": 200000 } },
--   { "name": "title", "type": "text", "label": "Title", "required": true, "validation": { "maxLength": 100 } },
--   { "name": "alt_text", "type": "text", "label": "Alt Text", "required": false },
--   { "name": "link", "type": "url", "label": "Link URL", "required": false }
-- ]

resource_items (
  id              UUID PRIMARY KEY,
  tenant_id       UUID REFERENCES tenants(id),
  resource_type_id UUID REFERENCES resource_types(id),
  name            TEXT NOT NULL,           -- display name, e.g. "ISO 27001"
  field_values    JSONB NOT NULL,          -- { "logo": "https://...", "title": "ISO 27001", ... }
  is_active       BOOLEAN DEFAULT true,
  valid_from      TIMESTAMPTZ,             -- optional: for time-bound resources (banners)
  valid_until     TIMESTAMPTZ,             -- optional: auto-deactivate after this date
  sort_order      INT DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
)

-- ═══════════════════════════════════════════
-- RULE ENGINE
-- ═══════════════════════════════════════════
rules (
  id              UUID PRIMARY KEY,
  tenant_id       UUID REFERENCES tenants(id),
  resource_item_id UUID REFERENCES resource_items(id),
  scope_type      TEXT NOT NULL,           -- 'global' | 'country' | 'job_title' | 'group' | 'individual'
  scope_value     TEXT NOT NULL,           -- '*' | 'Germany' | 'Engineer' | group_id | user_id
  priority        INT DEFAULT 0,           -- higher = overrides lower
  created_at      TIMESTAMPTZ DEFAULT NOW()
)

-- ═══════════════════════════════════════════
-- SIGNATURE TEMPLATES
-- ═══════════════════════════════════════════
templates (
  id              UUID PRIMARY KEY,
  tenant_id       UUID REFERENCES tenants(id),
  name            TEXT NOT NULL,
  html_template   TEXT NOT NULL,           -- uses {{resource.field}} placeholders
  is_default      BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT NOW()
)

-- ═══════════════════════════════════════════
-- SETTINGS
-- ═══════════════════════════════════════════
signature_settings (
  id              UUID PRIMARY KEY,
  tenant_id       UUID REFERENCES tenants(id) UNIQUE,
  add_to_new      BOOLEAN DEFAULT true,
  add_to_replies  BOOLEAN DEFAULT false,
  add_to_forwards BOOLEAN DEFAULT true,
  add_to_calendar BOOLEAN DEFAULT false,
  reply_template_id UUID REFERENCES templates(id)
)

-- ═══════════════════════════════════════════
-- INDIVIDUAL OVERRIDES
-- ═══════════════════════════════════════════
user_overrides (
  id              UUID PRIMARY KEY,
  user_id         UUID REFERENCES users(id),
  tenant_id       UUID REFERENCES tenants(id),
  override_items  JSONB,                   -- { "add": [item_ids], "remove": [item_ids] }
  custom_template_id UUID REFERENCES templates(id)
)

-- ═══════════════════════════════════════════
-- SAAS BILLING
-- ═══════════════════════════════════════════
subscriptions (
  id              UUID PRIMARY KEY,
  tenant_id       UUID REFERENCES tenants(id) UNIQUE,
  plan            TEXT NOT NULL,           -- 'starter' | 'business' | 'enterprise'
  billing_cycle   TEXT NOT NULL,           -- 'monthly' | 'yearly' | 'lifetime'
  razorpay_subscription_id TEXT,
  status          TEXT DEFAULT 'active',   -- 'active' | 'past_due' | 'cancelled'
  current_period_end TIMESTAMPTZ
)
```

### How the Template References Dynamic Fields

Templates use `{{resourceType.fieldName}}` placeholders that the signature builder resolves:

```html
<!-- Example template snippet -->
<table>
  <tr>
    <td>
      <!-- User info from M365 -->
      <strong>{{user.displayName}}</strong><br/>
      {{user.jobTitle}} | {{user.department}}
    </td>
  </tr>
  <tr>
    <!-- Dynamic certifications -->
    {{#each certification}}
      <td><img src="{{this.logo}}" alt="{{this.alt_text}}" width="40" /></td>
    {{/each}}
  </tr>
  <tr>
    <!-- Dynamic legal text -->
    <td style="font-size:9px;">{{legal_text.content}}</td>
  </tr>
  <tr>
    <!-- Dynamic banner (only if active + within date range) -->
    {{#if banner}}
      <td><a href="{{banner.link}}"><img src="{{banner.image}}" /></a></td>
    {{/if}}
  </tr>
</table>
```

---

## 8. Cost Analysis

### Your Fixed Costs (Monthly)

| Item | Where | Cost | Notes |
|---|---|---|---|
| VPS (Relay Server) | Hetzner/DO | $4-8 | CX22 (2 vCPU, 4GB RAM) |
| Next.js + DB | Vercel + Neon | $0 | Free tiers for both |
| Domain + DNS/SSL | Cloudflare | $1-2 | Free SSL, domain ~$12/yr |
| File Storage | Cloudflare R2 | $0 | Free tier (10GB) |
| Monitoring | UptimeRobot | $0 | Free tier (50 monitors) |
| Razorpay fees | Razorpay | 2% per txn | No setup fee, no annual fee |
| **Total (starting)** | | **~$5-10/mo** | |
| **Total (10+ clients)** | | **~$25-50/mo** | |

### Your Variable Costs (Per Client)

| Item | Cost | Notes |
|---|---|---|
| Microsoft Graph API calls | $0 | Free with the app registration |
| Email processing (relay) | $0 | Self-hosted, no per-email cost |
| Database rows | Negligible | ~100-5000 users per client |
| Bandwidth | ~$0.01-0.05/client | Minimal for signature data |

### Suggested Pricing

| Plan | Monthly | Yearly | Lifetime |
|---|---|---|---|
| **Starter** (up to 50 users) | $49/mo | $470/yr (20% off) | $1,500 |
| **Business** (up to 250 users) | $99/mo | $950/yr | $3,000 |
| **Enterprise** (unlimited) | $199/mo | $1,900/yr | Custom |

> These are competitive with Exclaimer ($2-4/user/month) but more attractive for smaller organizations.

---

## 9. Phased Implementation Roadmap

### Phase 1: Next.js Foundation (Week 1-2) — **FROM SCRATCH**

- [ ] Initialize Next.js 16 project with App Router
- [ ] Set up Vercel Postgres + Drizzle ORM + migrations
- [ ] Database schema (all tables above)
- [ ] Multi-tenant data model (`tenant_id` on all tables)
- [ ] Azure AD multi-tenant auth (NextAuth.js)
- [ ] Basic layout, navigation, tenant-scoped dashboard shell

### Phase 2: Resource Builder + Rule Engine (Week 2-4) — 🎯 Core Feature

- [ ] Resource Type Builder UI (create/edit schemas with drag-and-drop fields)
- [ ] Dynamic form renderer (generates form from `fields_schema` JSON)
- [ ] Resource Item CRUD (create items using dynamic forms)
- [ ] File upload to Cloudflare R2 (for image fields)
- [ ] Time-bound resource support (`valid_from` / `valid_until`)
- [ ] Rule engine UI (assign resource items by global / country / job_title / group / individual)
- [ ] User sync from M365 to Neon Postgres + Graph webhooks
- [ ] Signature template editor with `{{resource.field}}` placeholders
- [ ] Signature builder logic (resolve rules → build HTML)
- [ ] `/api/signature?email=` endpoint

### Phase 3: Relay Server (Week 4-6)

- [ ] Set up VPS on Hetzner/DigitalOcean
- [ ] Build Node.js SMTP relay server using `smtp-server` package
- [ ] Connect relay to Neon Postgres (read rules + resources)
- [ ] Email parsing and signature injection logic
- [ ] New vs Reply vs Forward detection
- [ ] `X-Pixora-Processed` header to prevent double-processing
- [ ] TLS/SSL + SPF/DKIM/DMARC setup
- [ ] Help client set up M365 Send/Receive connectors + transport rule

### Phase 4: Outlook Add-in (Week 6-7)

- [ ] Build Outlook add-in with unified manifest
- [ ] Event-based activation for `OnNewMessageCompose`
- [ ] `OnNewAppointmentOrganizer` for calendar invites
- [ ] `getComposeTypeAsync()` for reply detection
- [ ] `setSignatureAsync()` for cursor-friendly signature injection
- [ ] Token-based auth for add-in → your API
- [ ] Deploy add-in to client's M365 org

### Phase 5: SaaS Onboarding + Billing (Week 7-9)

- [ ] Landing page with "Connect to Microsoft 365" button
- [ ] Admin consent flow (`/adminconsent` redirect + callback)
- [ ] Automated initial user sync on onboarding
- [ ] PowerShell script generator for connector setup
- [ ] Razorpay integration (monthly / yearly / lifetime)
- [ ] Super-admin dashboard (list tenants, suspend, activate)
- [ ] Subscription enforcement (block relay if suspended)

---

## 10. Corrections to Your Understanding

| What You Said | Correction |
|---|---|
| "Port 578 something" | The port is **587** — SMTP Submission port. It's for client-to-server auth, NOT for relay servers. Your relay needs port **25**. |
| "Docker with Postfix" | You don't need Postfix. Use the `smtp-server` Node.js package. Docker is optional for deployment convenience but not required. |
| "Built it capability to act as relay" | Correct concept, wrong tool. Don't use Postfix — it's an MTA designed for Linux sysadmins. A Node.js SMTP server gives you full programmatic control. |
| "Manifest file takes 24 hrs to host" | Correct — Microsoft's sideloading can take up to 24 hours to propagate org-wide. There's no way to speed this up. |
| "Token concept for /signature" | Your token-based auth for the API is good practice. **Keep it even with relay approach** — the Outlook add-in still needs to call your API for the preview signature. |
| "ISR/SSG for user pages" | Wrong pattern for a dashboard app. Use **database + server components**. ISR is for static content sites. |

---

## 11. Key Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| M365 connector setup complexity | Client onboarding friction | PowerShell automation script + detailed guide |
| Relay server downtime = emails delayed | High (business-critical) | Health checks, monitoring, failover config in M365 transport rule |
| Port 25 deliverability (IP reputation) | Emails going to spam | Proper SPF/DKIM/DMARC + warm up IP gradually |
| Graph webhook subscription expiry | Stale user data | Cron job to renew subscriptions every 25 days |
| Outlook add-in not supported on all clients | Inconsistent preview experience | Relay is the source of truth; add-in is best-effort |
| Dynamic schema complexity | Harder to query/validate | JSONB + Drizzle ORM + validation at API layer |

---

## 12. File/Folder Structure (Proposed)

```
pixora/
├── apps/
│   ├── web/                        # Next.js 16 — FROM SCRATCH
│   │   ├── app/
│   │   │   ├── (auth)/             # Login, onboarding, OAuth callback
│   │   │   ├── (dashboard)/        # Tenant dashboard
│   │   │   │   ├── users/          # M365 user list + profiles
│   │   │   │   ├── resource-types/ # Resource Builder (schema editor)
│   │   │   │   ├── resources/      # Resource Items (dynamic forms)
│   │   │   │   ├── rules/          # Assign resources to scopes
│   │   │   │   ├── templates/      # Signature template editor
│   │   │   │   └── settings/       # Signature settings
│   │   │   ├── (super-admin)/      # Your internal admin panel
│   │   │   ├── api/
│   │   │   │   ├── signature/      # Signature preview API
│   │   │   │   ├── webhooks/       # Graph + Razorpay webhooks
│   │   │   │   ├── onboarding/     # OAuth callback
│   │   │   │   └── resources/      # Resource CRUD endpoints
│   │   │   └── add-in/             # Outlook add-in static files
│   │   ├── components/
│   │   │   ├── resource-builder/   # Schema editor components
│   │   │   │   ├── FieldPicker.tsx
│   │   │   │   ├── SchemaEditor.tsx
│   │   │   │   └── DynamicForm.tsx  # Renders form from schema
│   │   │   ├── signature/
│   │   │   │   ├── TemplateEditor.tsx
│   │   │   │   └── SignaturePreview.tsx
│   │   │   └── ui/                 # Shared UI components
│   │   ├── lib/
│   │   │   ├── db/
│   │   │   │   ├── schema.ts       # Drizzle schema definitions
│   │   │   │   ├── client.ts       # Vercel Postgres client
│   │   │   │   └── migrations/     # Drizzle migrations
│   │   │   ├── graph.ts            # Microsoft Graph client
│   │   │   ├── signature-builder.ts # Resolve rules → build HTML
│   │   │   └── razorpay.ts          # Razorpay client
│   │   ├── drizzle.config.ts
│   │   └── package.json
│   │
│   └── relay/                      # Node.js SMTP Relay Server
│       ├── src/
│       │   ├── server.ts           # SMTP server (port 25)
│       │   ├── parser.ts           # Email parsing
│       │   ├── injector.ts         # Signature injection
│       │   ├── rules.ts            # Rule engine (query Neon PG)
│       │   └── health.ts           # Health check endpoint
│       ├── Dockerfile
│       └── package.json
│
├── packages/
│   └── shared/                     # Shared types + signature logic
│       ├── types.ts                # Resource, Rule, Template types
│       └── signature-builder.ts    # Shared between web + relay
│
└── package.json                    # Monorepo root (pnpm workspaces)
```

---

## 13. Next Steps — What to Do Right Now

For your **first client who is waiting**, here's the priority order:

1. **Initialize Next.js project** — Fresh build with App Router, Vercel Postgres, Drizzle ORM
2. **Build Resource Builder** — This is the core differentiator; let client define their resource schemas
3. **Build the relay server** — Get a VPS, build the Node.js SMTP server, set up M365 connectors
4. **Build the Outlook add-in** — Compose-mode preview
5. **SaaS features** (onboarding, billing) come after client #1 is delivered

### Pre-Development Checklist

- [ ] Pick VPS provider (Hetzner or DigitalOcean)
- [ ] Provision VPS + request port 25 access (do this NOW, approval may take days)
- [ ] Create Vercel project + enable Vercel Postgres
- [ ] Point `relay.pixora.com` to VPS IP (Cloudflare DNS)
- [ ] Set up monorepo with pnpm workspaces

> [!TIP]
> **Start a new conversation and say:** "Read the architecture document at `C:\Users\Admin\.gemini\antigravity\brain\85ca97f3-72d1-4768-9885-af1ba1129a49\architecture.md` — I want to work on [specific phase]." This ensures context is preserved across conversations.
