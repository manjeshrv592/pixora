# Stage 5: Resource Items + Dynamic Forms — Complete

**Status:** ✅ Complete  
**Date:** 2026-03-02

---

## Files Created

### 1. R2 Client — `apps/web/src/lib/r2.ts`
- `uploadToR2(file, key, contentType)` — uploads file buffer to Cloudflare R2, returns public URL
- `deleteFromR2(key)` — removes file from R2
- Uses `@aws-sdk/client-s3` with S3-compatible R2 endpoint

### 2. Upload API Route — `apps/web/src/app/api/upload/route.ts`
- POST endpoint accepting `multipart/form-data`
- Validates file type (JPEG, PNG, GIF, WebP, SVG) and size (max 2MB)
- Tenant-scoped file paths: `tenants/<tenantId>/uploads/<uuid>.<ext>`
- Returns `{ url, key }` on success

### 3. Server Actions — `apps/web/src/app/(dashboard)/resources/actions.ts`
- `createResourceItem(data)` — validates field values against resource type schema, stores as JSONB
- `updateResourceItem(id, data)` — same validation + tenant ownership check
- `deleteResourceItem(id, resourceTypeId)` — deletes associated rules first, then item
- `toggleResourceItemActive(id)` — quick active/inactive toggle
- `getResourceItems(resourceTypeId, page, pageSize)` — paginated query
- Dynamic validation: required, maxLength, min/max, URL format, hex color, date parsing

### 4. Resources List Page — `apps/web/src/app/(dashboard)/resources/page.tsx`
- Resource type tabs at top (clickable, highlights active type)
- Card grid showing items with name, status badge, creation date
- Time-bound status indicators: Active (green), Scheduled (amber), Expired (red), Inactive (gray)
- Empty states for no types and no items
- Pagination (10 per page)

### 5. Dynamic Form — `apps/web/src/components/resource-builder/DynamicForm.tsx`
- Renders form inputs from `FieldDefinition[]` schema
- 10 field types: text, textarea, richtext, image, url, date, select, toggle, number, color
- Image field: file upload to R2 + URL paste fallback, with preview and remove button
- Validation hints displayed below each field
- Error display per field

### 6. Rich Text Editor — `apps/web/src/components/resource-builder/RichTextEditor.tsx`
- TipTap WYSIWYG editor with dark-themed toolbar
- Bold, italic, bullet list, numbered list, undo, redo
- Placeholder support
- Uses `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-placeholder`

### 7. Resource Item Form — `apps/web/src/components/resource-builder/ResourceItemForm.tsx`
- Wraps DynamicForm with item name, time-bound settings, active toggle
- Handles both create and edit modes
- `valid_from` / `valid_until` datetime-local pickers
- Error banner and loading spinner

### 8. New Item Page — `apps/web/src/app/(dashboard)/resources/[typeId]/new/page.tsx`
- Server component fetching resource type schema
- Renders ResourceItemForm in create mode

### 9. Item Detail Page — `apps/web/src/app/(dashboard)/resources/[typeId]/[id]/page.tsx`
- Read-only display of all field values (images as thumbnails, URLs as links, colors as swatches, rich text rendered)
- Time-bound schedule section with dates
- Status badge with icon
- Edit, Delete, Toggle Active action buttons

### 10. Delete Button — `apps/web/src/app/(dashboard)/resources/[typeId]/[id]/DeleteButton.tsx`
- Inline confirmation flow (Delete → Confirm/Cancel)
- Deletes associated rules before removing item

### 11. Toggle Active Button — `apps/web/src/app/(dashboard)/resources/[typeId]/[id]/ToggleActiveButton.tsx`
- Toggle button with visual state (green active, gray inactive)
- Optimistic UI update with server action

### 12. Edit Item Page — `apps/web/src/app/(dashboard)/resources/[typeId]/[id]/edit/page.tsx`
- Pre-populates ResourceItemForm with existing values
- Formats dates for datetime-local inputs

---

## Dependencies Added
- `@tiptap/react` — React integration for TipTap editor
- `@tiptap/pm` — ProseMirror core
- `@tiptap/starter-kit` — Bold, italic, lists, headings, etc.
- `@tiptap/extension-placeholder` — Placeholder text
- `@aws-sdk/client-s3` — S3-compatible client for Cloudflare R2

---

## Database Tables Used (already existed from Stage 1)
- `resource_items` — `id`, `tenantId`, `resourceTypeId`, `name`, `fieldValues` (JSONB), `isActive`, `validFrom`, `validUntil`, `sortOrder`, `createdAt`
- `resource_types` — referenced for schema validation
- `rules` — cleaned up on item deletion

---

## Build Status
```
✓ Compiled successfully
✓ TypeScript passed
Routes: /resources, /resources/[typeId]/new, /resources/[typeId]/[id], /resources/[typeId]/[id]/edit
API: /api/upload
```

---

## Architecture Notes
- Image uploads go to R2 under `tenants/<tenantId>/uploads/<uuid>.<ext>` for tenant isolation
- Field values validated server-side against the resource type's `fields_schema` before insert/update
- Time-bound status computed at render time (not stored) — Active/Scheduled/Expired based on current date
- Delete action cascades: rules referencing the item are deleted first
- TipTap editor is ~50KB gzipped, much lighter than full CKEditor/TinyMCE
- Consistent with existing UI patterns: dark theme (#12121a cards, #1e1e2e borders, violet accents)
