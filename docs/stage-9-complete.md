# Stage 9: Relay Server — Signature Injection — Complete

**Status:** ✅ Complete  
**Date:** 2026-03-03

---

## Files Created

### 1. DB Client — `apps/relay/src/db/client.ts`
- `createDb(databaseUrl)` — factory returning Drizzle ORM instance over Neon HTTP
- Accepts DATABASE_URL as parameter (not global env read)

### 2. DB Schema — `apps/relay/src/db/schema.ts`
- Mirror of `apps/web/src/lib/db/schema.ts`
- All tables: tenants, users, groups, userGroups, resourceTypes, resourceItems, rules, templates, signatureSettings, userOverrides
- Duplicated (not shared) so relay is self-contained for VPS deployment

### 3. Signature Builder — `apps/relay/src/signature-builder.ts`
- `buildSignatureForEmail(db, senderEmail)` — main entry point
- Ported rule resolution from web app's `resolveRulesForUserInternal`:
  - Fetches user by email → determines tenant
  - Fetches group memberships
  - Fetches all tenant rules → filters by scope (global/country/job_title/group/individual)
  - Fetches active, time-valid resource items
  - Applies scope priority hierarchy (individual > group > job_title > country > global)
- User overrides (custom template, exclude items)
- Template selection (override → default)
- Template rendering with `{{user.field}}`, `{{#each slug}}`, `{{#if slug}}`, `{{slug.field}}`
- Fetches signature settings (addToNew/addToReplies/addToForwards)
- Returns `{ html, templateName, settings }` or null

### 4. Email Parser — `apps/relay/src/parser.ts`
- `parseEmail(rawBuffer)` — wraps mailparser's `simpleParser`
- `detectComposeType(parsed)` → `"new" | "reply" | "forward"`:
  - `In-Reply-To` / `References` headers → reply
  - Subject prefix `FW:` / `Fwd:` → forward
  - Exchange header `X-MS-Exchange-MessageSentRepresentingType` → forward
  - Otherwise → new
- `isAlreadyProcessed(parsed)` — checks `X-Pixora-Processed` header
- `getSenderEmail(parsed)` — extracts from `From` header

### 5. Signature Injector — `apps/relay/src/injector.ts`
- `injectSignature(rawEmail, signatureHtml)` — full injection pipeline:
  1. Adds `X-Pixora-Processed: true` header
  2. Strips existing Pixora signatures (from Outlook add-in preview)
  3. Wraps signature in `<!-- pixora-signature-start/end -->` markers
  4. Injects before `</body>` (or `</html>`, or appends if none)
- Returns modified raw email as Buffer

## Files Modified

### 6. SMTP Server — `apps/relay/src/server.ts`
- Now accepts `db` parameter (RelayDb | null)
- `onData` handler calls `processSignature()` pipeline:
  1. Parse email → check `X-Pixora-Processed` (skip if present)
  2. Extract sender → build signature
  3. Check compose type vs settings (addToNew/addToReplies/addToForwards)
  4. Inject or skip → forward
- Falls back to pass-through if no DB connection

### 7. Config — `apps/relay/src/config.ts`
- Added `databaseUrl` field from `DATABASE_URL` env var
- Warns if not set (operates in pass-through mode)

### 8. Entry Point — `apps/relay/src/index.ts`
- Creates DB connection from config
- Passes `db` to SMTP server
- Shows injection enabled/disabled in startup banner

### 9. Package — `apps/relay/package.json`
- Added: `@neondatabase/serverless`, `drizzle-orm`, `mailparser`
- Added dev: `@types/mailparser`

### 10. Environment — `apps/relay/.env.example`
- Added `DATABASE_URL` variable

---

## Signature Injection Pipeline

```
Email arrives on port 25
  ↓
Parse headers (mailparser)
  ↓
X-Pixora-Processed? → Skip (prevent loops)
  ↓
Extract sender email
  ↓
Look up user in DB → get tenant
  ↓
Resolve rules (scope priority: individual > group > job_title > country > global)
  ↓
Apply user overrides (custom template, exclude items)
  ↓
Select template (override → default)
  ↓
Render template ({{user.field}}, {{#each}}, {{#if}})
  ↓
Detect compose type (new / reply / forward)
  ↓
Check settings (addToNew / addToReplies / addToForwards)
  ↓
Inject signature before </body>
  ↓
Add X-Pixora-Processed header
  ↓
Forward to recipient MX
```

---

## Build Status
```
✓ pnpm install --filter relay (dependencies + mailparser, Neon, Drizzle installed)
✓ pnpm --filter relay build (tsc compiled with 0 errors)
```

---

## What's Next (Stage 10)
- Create Send Connector in M365 Exchange Admin (outbound → relay VPS)
- Create Receive Connector (inbound from relay IP)
- Create Transport Rule (route emails, skip if X-Pixora-Processed)
- PowerShell script for automated setup
- End-to-end test: Outlook → relay → signature injected → recipient
