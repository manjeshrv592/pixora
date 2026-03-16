# Stage 12A: Landing Page + Admin Consent Onboarding — Complete

**Status:** ✅ Complete  
**Date:** 2026-03-03

---

## Files Created

### 1. Onboarding Sync — `src/lib/onboarding/sync.ts`
- `performInitialSync(tenantId, azureTenantId)` — session-less sync logic
- Syncs users (with photos), groups, and group memberships
- Reuses existing Graph API helpers from `lib/graph.ts`
- Same upsert pattern as `users/actions.ts` but works without auth session

### 2. Admin Consent Redirect — `src/app/api/onboarding/consent/route.ts`
- `GET` handler → redirects to `https://login.microsoftonline.com/common/adminconsent`
- Generates CSRF state token stored in `onboarding_state` cookie (10-min TTL)
- Uses `NEXT_PUBLIC_APP_URL` for redirect URI

### 3. Consent Callback — `src/app/api/onboarding/callback/route.ts`
- `GET` handler → receives callback from Microsoft after admin consent
- Validates CSRF state from cookie
- Handles error cases (consent denied, invalid response, expired state)
- Creates tenant with `status: 'trial'` if not exists
- Triggers `performInitialSync()` — full user + group sync
- Updates tenant name/domain from first synced user's email
- Redirects to `/login?onboarded=true&users=N&groups=N`

### 4. Landing Page Layout — `src/app/(landing)/layout.tsx`
- Minimal pass-through layout (no sidebar/header)

### 5. Landing Page — `src/app/(landing)/landing/page.tsx`
- Public page at `/landing`
- Nav bar with Pixora logo + "Sign in" link
- Hero section with "Connect to Microsoft 365" CTA button
- Error banner for consent failures (consent_denied, invalid_state, etc.)
- "How it works" — 4-step flow (Connect → Sync → Configure → Done)
- 6 feature cards (Resource Builder, Rule Engine, Server-Side Injection, etc.)
- Bottom CTA section
- Footer
- Dark theme matching existing dashboard (`bg-[#0a0a0f]`, violet accents)

---

## Files Modified

### 6. Login Page — `src/app/(auth)/login/page.tsx`
- Added onboarding success banner (green, shows synced user/group counts)
- Shows sync warnings if any
- Added "New organization? Connect your Microsoft 365" link to landing page

### 7. Environment — `.env`
- Added `NEXT_PUBLIC_APP_URL=http://localhost:3000`

---

## Build Status
```
✓ pnpm --filter web run build (next build compiled with 0 errors)
✓ Routes confirmed: /landing, /api/onboarding/consent, /api/onboarding/callback
```

---

## Onboarding Flow

```
User visits /landing
     │
     ▼
Clicks "Connect to Microsoft 365"
     │
     ▼
GET /api/onboarding/consent
  → Sets CSRF cookie
  → Redirects to Microsoft admin consent URL
     │
     ▼
Admin approves permissions in Microsoft
     │
     ▼
GET /api/onboarding/callback?tenant=xxx&admin_consent=True&state=xxx
  → Validates CSRF state
  → Creates tenant in DB (status: 'trial')
  → Runs performInitialSync() (users + groups + memberships)
  → Updates tenant name/domain from synced data
  → Redirects to /login?onboarded=true&users=N&groups=N
     │
     ▼
Login page shows success banner
  → Admin signs in with Microsoft
  → Dashboard ready to use
```

---

## Setup Required (for production)

1. Update `NEXT_PUBLIC_APP_URL` in Vercel env vars to your production domain
2. Add `https://your-domain.com/api/onboarding/callback` as a redirect URI in your Azure App Registration (Entra ID → App registrations → Pixora → Authentication → Add redirect URI)

---

## What's Next (Stage 12B)
- Razorpay billing integration (plan selection, subscriptions, webhooks)
