# Stage 7: Signature Template + API — Complete

**Status:** ✅ Complete  
**Date:** 2026-03-03

---

## Files Created

### 1. Signature Builder — `apps/web/src/lib/signature-builder.ts`
- `buildSignatureForUser(userId, tenantId, templateId?)` — main builder function
  1. Resolves rules for user via `resolveRulesForUserInternal`
  2. Checks for user overrides (custom template, add/remove items)
  3. Falls back to tenant's default template if no specific template
  4. Renders template with Handlebars-style placeholders
  5. Returns rendered HTML + metadata
- `buildSignatureByEmail(email, tenantId)` — lookup user by email, build signature
- `renderTemplate(html, userData, resourcesBySlug)` — template engine supporting:
  - `{{user.field}}` — user profile fields
  - `{{#each slug}}...{{this.field}}...{{/each}}` — loop over resource items by type slug
  - `{{#if slug}}...{{/if}}` — conditional rendering
  - `{{slug.field}}` — shorthand for first item of a resource type

### 2. Template Actions — `apps/web/src/app/(dashboard)/templates/actions.ts`
- `createTemplate(data)` — name, HTML, isDefault; auto-unsets other defaults
- `updateTemplate(id, data)` — ownership check + update
- `deleteTemplate(id)` — prevents deleting default or reply template
- `getTemplates(page, pageSize)` — paginated list
- `getTemplate(id)` — single template
- `setDefaultTemplate(id)` — unset all defaults, set new one
- `getAvailablePlaceholders()` — returns structured placeholder groups:
  - User Fields: displayName, email, jobTitle, department, country, city, phone, photoUrl
  - Per Resource Type: loop/if helpers + all field placeholders

### 3. Template List Page — `apps/web/src/app/(dashboard)/templates/page.tsx`
- Header with pink/rose gradient FileCode2 icon
- "Preview" and "New Template" action buttons
- Table: Name | Default badge (star) | Created date
- Pagination, empty state

### 4. Template Form — `apps/web/src/app/(dashboard)/templates/TemplateForm.tsx`
- Client component for create and edit modes
- Template name input
- HTML editor textarea (monospace, emerald-tinted text)
- Placeholder Picker sidebar: expandable categories with click-to-insert
- "Set as Default" toggle
- Live preview panel (sandboxed iframe rendering raw HTML)
- Copy HTML button

### 5. New Template Page — `apps/web/src/app/(dashboard)/templates/new/page.tsx`
- Server component fetching placeholders, renders TemplateForm

### 6. Template Detail Page — `apps/web/src/app/(dashboard)/templates/[id]/page.tsx`
- Template name, default badge, created date
- Rendered HTML preview (sandboxed iframe)
- Collapsible HTML source code view
- Edit and Delete action buttons

### 7. Delete Button — `apps/web/src/app/(dashboard)/templates/[id]/DeleteButton.tsx`
- Inline confirmation flow; disabled for default template

### 8. Edit Template Page — `apps/web/src/app/(dashboard)/templates/[id]/edit/page.tsx`
- Pre-populates TemplateForm with existing data

### 9. Signature Preview Page — `apps/web/src/app/(dashboard)/templates/preview/page.tsx`
- User selector + Template selector
- Fully rendered signature in sandboxed iframe
- Copy HTML button
- Resolved resources list with scope badges

### 10. Signature API — `apps/web/src/app/api/signature/route.ts`
- `GET /api/signature?email=user@domain.com`
- Looks up user by email → determines tenant → builds signature
- Returns rendered HTML with `Content-Type: text/html`
- 5-minute cache headers
- Error responses: 400 (missing email), 404 (not found), 500 (server error)

### 11. Settings Actions — `apps/web/src/app/(dashboard)/settings/actions.ts`
- `getSignatureSettings()` — fetch or return defaults
- `saveSignatureSettings(data)` — upsert settings

### 12. Settings Page — `apps/web/src/app/(dashboard)/settings/page.tsx`
- Toggle switches: New Emails, Replies, Forwards, Calendar Invites
- Reply template selector dropdown
- Save button with success indicator

### 13. Settings Form — `apps/web/src/app/(dashboard)/settings/SettingsForm.tsx`
- Client component with toggle state management and save action

### 14. User Override Actions — `apps/web/src/app/(dashboard)/users/[id]/signature/actions.ts`
- `getUserOverride(userId)` — fetch existing override
- `saveUserOverride(userId, data)` — upsert override (custom template, add/remove items)
- `clearUserOverride(userId)` — delete override
- `getOverrideFormData()` — list available resource items

### 15. User Override Page — `apps/web/src/app/(dashboard)/users/[id]/signature/page.tsx`
- Shows current rendered signature for the user
- OverrideForm for customization

### 16. Override Form — `apps/web/src/app/(dashboard)/users/[id]/signature/OverrideForm.tsx`
- Custom template selector
- Exclude items (tag chips with remove buttons)
- Include additional items (tag chips with add)
- Save/Reset actions

## Files Modified

### 17. Rule Resolution Refactor — `apps/web/src/app/(dashboard)/rules/actions.ts`
- Extracted `resolveRulesForUserInternal(userId, tenantId)` — core logic without session dependency
- `resolveRulesForUser(userId)` now wraps internal function with session tenantId
- Added `resourceTypeSlug` to resolved resource output

### 18. User Profile Page — `apps/web/src/app/(dashboard)/users/[id]/page.tsx`
- Added "Signature Override" link card after group memberships

---

## Template Rendering Engine

**Supported syntax:**
```
{{user.displayName}}                    — user profile field
{{#each certification}}                 — loop over items of resource type
  <img src="{{this.logo}}" />           — field value in loop
{{/each}}
{{#if banner}}                          — conditional block
  <a href="{{banner.link}}">...</a>     — first item shorthand
{{/if}}
{{legal_text.content}}                  — first item field shorthand
```

**Resolution flow:**
1. Resolve rules for user → get matched resource items by type
2. Apply user overrides (exclude/include items, custom template)
3. Build `resourcesBySlug` map from resolved items
4. Render template with regex-based substitution (no external library)

---

## Build Status
```
✓ Compiled successfully in 5.1s
✓ TypeScript passed
New routes: /templates, /templates/[id], /templates/[id]/edit, /templates/new,
            /templates/preview, /settings, /users/[id]/signature, /api/signature
Total routes: 19
```

---

## Architecture Notes
- Signature builder is session-independent — accepts tenantId directly for use by both dashboard and API
- Template rendering uses simple regex substitution (no Handlebars dependency)
- API endpoint looks up tenant from the user's email — no auth required (token auth added in Stage 11)
- User overrides stored as JSON: `{ add: [itemIds], remove: [itemIds] }`
- Settings persisted per-tenant with sensible defaults (new: on, replies: off, forwards: on, calendar: off)
- All new pages follow existing dark theme patterns (#12121a cards, #1e1e2e borders, violet accents)
- Sidebar already had Templates and Settings links from initial scaffold
