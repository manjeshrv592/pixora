# Stage 12B: Razorpay Billing Integration — Complete

**Status:** ✅ Complete  
**Date:** 2026-03-15

---

## Files Created

### 1. Razorpay Client + Plan Config — `src/lib/razorpay.ts`
- Lazy-initialized Razorpay client (avoids build-time crash from missing env vars)
- Plan configuration: 3 tiers (Starter / Business / Enterprise) × 2 cycles (Monthly / Yearly)
- Per-tier features, max user limits, prices in paise (INR × 100)
- `razorpayPlanIds` loaded from env vars (`RAZORPAY_PLAN_STARTER_MONTHLY`, etc.)
- Helper: `getPlanConfig(tier)`, `formatPrice(paise)`

### 2. Billing Page (Server) — `src/app/(dashboard)/billing/page.tsx`
- Server component that fetches current subscription via `getCurrentSubscription()`
- Displays current plan status (plan name, billing cycle, status badge, period end date)
- Shows "Free Trial" or "No Plan" fallback for tenants without a subscription
- Passes serialized plan data to `BillingClient`

### 3. Billing Client (Interactive) — `src/app/(dashboard)/billing/billing-client.tsx`
- `"use client"` component with Monthly/Yearly toggle
- 3-column plan card grid (Starter / Business / Enterprise)
- "Most Popular" badge on Business tier
- Subscribe button → calls `createSubscription()` → redirects to Razorpay short URL
- Cancel button with confirmation dialog → calls `cancelSubscription()` → reloads page
- Loading states with spinner icons

### 4. Server Actions — `src/app/(dashboard)/billing/actions.ts`
- `getCurrentSubscription()` — fetches subscription row + tenant status
- `createSubscription(tier, cycle)` — creates/reuses Razorpay customer, creates Razorpay subscription, upserts DB row (conflict on `tenantId`), returns `shortUrl` for payment
- `cancelSubscription()` — cancels via Razorpay API, updates DB status

### 5. Webhook Handler — `src/app/api/webhooks/razorpay/route.ts`
- `POST /api/webhooks/razorpay` — validates `x-razorpay-signature` via HMAC-SHA256
- Handles 5 event types:
  - `subscription.activated` → sets subscription status `active`, updates `tenants.status` to `active`
  - `subscription.charged` → updates `currentPeriodEnd`, confirms `active`
  - `subscription.cancelled` → sets status `cancelled` (doesn't immediately suspend)
  - `subscription.paused` → sets subscription `past_due`, suspends tenant
  - `payment.failed` → logs warning (Razorpay auto-retries)

---

## Files Modified

### 6. DB Schema — `src/lib/db/schema.ts`
- Added `razorpayCustomerId` column to `tenants` table
- Added `subscriptions` table with columns: `id`, `tenantId` (unique FK), `plan`, `billingCycle`, `razorpaySubscriptionId`, `status`, `currentPeriodEnd`

### 7. Sidebar — `src/components/layout/Sidebar.tsx`
- Added "Billing" nav item with `CreditCard` icon → `/billing`

---

## Environment Variables Required

```
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
RAZORPAY_PLAN_STARTER_MONTHLY=plan_...
RAZORPAY_PLAN_STARTER_YEARLY=plan_...
RAZORPAY_PLAN_BUSINESS_MONTHLY=plan_...
RAZORPAY_PLAN_BUSINESS_YEARLY=plan_...
RAZORPAY_PLAN_ENTERPRISE_MONTHLY=plan_...
RAZORPAY_PLAN_ENTERPRISE_YEARLY=plan_...
```

---

## Subscription Flow

```
Tenant admin visits /billing
     │
     ▼
Selects plan + billing cycle (Monthly / Yearly)
     │
     ▼
Clicks "Subscribe"
     │
     ▼
createSubscription() server action
  → Gets or creates Razorpay customer (stores razorpayCustomerId on tenant)
  → Creates Razorpay subscription with plan_id
  → Upserts subscription row in DB (status: 'pending')
  → Returns Razorpay short_url
     │
     ▼
Browser redirects to Razorpay payment page
     │
     ▼
On successful payment, Razorpay sends webhook
  → subscription.activated → DB status = 'active', tenant status = 'active'
  → subscription.charged → updates currentPeriodEnd
     │
     ▼
Tenant refreshes /billing → sees active plan with period end date
```

---

## What's Next (Stage 12C)
- Super-admin dashboard (tenant list, suspend/activate controls)
