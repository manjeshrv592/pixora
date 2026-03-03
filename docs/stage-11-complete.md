# Stage 11: Outlook Add-in — Complete

**Status:** ✅ Complete  
**Date:** 2026-03-03

---

## Files Created

### 1. Manifest — `apps/web/public/add-in/manifest.json`
- Unified manifest (Teams JSON format / `devPreview`)
- App ID: `44ba2be0-5b19-4290-bb81-052cd7247db1` (replace with your own if needed)
- Event-based activation: `newMessageComposeCreated` → `onNewMessageCompose`
- Event-based activation: `newAppointmentOrganizerCreated` → `onNewAppointment`
- Mailbox requirement: `1.10+`
- Runtime: `commands.html` + `commands.js`
- Domain: `https://pixora.vercel.app` (update before sideloading)

### 2. Runtime Host — `apps/web/public/add-in/commands.html`
- Loads Office.js from CDN (`appsforoffice.microsoft.com`)
- Loads `commands.js`
- No visible UI (headless event-based runtime)

### 3. Event Handlers — `apps/web/public/add-in/commands.js`
- `onNewMessageCompose(event)`:
  - Gets user email from `Office.context.mailbox.userProfile`
  - Calls `getComposeTypeAsync()` → maps to `newMail` / `reply` / `replyAll` / `forward`
  - Fetches `GET /api/signature?email=...&composeType=...&format=json` with Bearer token
  - If `applied: true` → wraps HTML in `<!-- pixora-signature-start/end -->` markers
  - Calls `setSignatureAsync()` → injects preview (cursor stays at top)
  - Always calls `event.completed()` — errors fail silently
- `onNewAppointment(event)`: same flow with `composeType=calendar`
- Uses `XMLHttpRequest` for broad Office.js runtime compatibility
- Config vars: `API_BASE_URL`, `ADDIN_TOKEN` (update before deploying)

### 4. Icons
- `apps/web/public/add-in/icon-color.png` — 192×192 color icon
- `apps/web/public/add-in/icon-outline.png` — 32×32 outline icon

---

## Files Modified

### 5. Signature API — `apps/web/src/app/api/signature/route.ts`
- **Token auth**: Checks `Authorization: Bearer <token>` against `PIXORA_ADDIN_TOKEN` env var. 401 on invalid token. No header = legacy mode (backward compat with relay).
- **composeType param**: `?composeType=newMail|reply|replyAll|forward|calendar`. Checks against tenant's `signature_settings` (addToNew/Replies/Forwards/Calendar). Returns empty/not-applied if disabled.
- **JSON format**: `?format=json` or `Accept: application/json` → returns `{ html, templateName, composeType, applied, reason? }`
- **CORS**: `Access-Control-Allow-Origin: *` + OPTIONS preflight handler
- **Legacy compat**: No auth header + no format param = raw HTML response (unchanged behavior for relay server)

### 6. Next.js Config — `apps/web/next.config.ts`
- Added `headers()` config for CORS on `/api/signature` and `/add-in/:path*`

---

## Build Status
```
✓ pnpm --filter web build (next build compiled with 0 errors)
✓ /api/signature route confirmed in build output
```

---

## Setup Required (User Action)

1. **Generate `PIXORA_ADDIN_TOKEN`**: any random 32+ character string
   - Add to `apps/web/.env.local`: `PIXORA_ADDIN_TOKEN=your-random-token`
   - Add to Vercel env vars for production
2. **Update `commands.js`**: set `API_BASE_URL` and `ADDIN_TOKEN` values
3. **Update `manifest.json`**: change `pixora.vercel.app` to your actual domain
4. **Deploy to Vercel**: push to trigger deployment so static files are live
5. **Sideload manifest**: M365 Admin Center → Settings → Integrated Apps → Upload Custom App → select `manifest.json`
   - Propagation takes up to 24 hours
6. **Test**: Open Outlook Web → compose new email → signature should appear automatically

---

## What's Next (Stage 12)
- Landing page with "Connect to Microsoft 365" button
- Admin consent flow redirect + callback
- Razorpay integration (subscriptions, webhooks)
- Super-admin dashboard
- Subscription enforcement
