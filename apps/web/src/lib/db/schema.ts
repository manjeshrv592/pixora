import { pgTable, uuid, text, boolean, integer, timestamp, jsonb, primaryKey } from "drizzle-orm/pg-core";

// ═══════════════════════════════════════════
// MULTI-TENANT CORE
// ═══════════════════════════════════════════

export const tenants = pgTable("tenants", {
    id: uuid("id").defaultRandom().primaryKey(),
    azureTenantId: text("azure_tenant_id").unique().notNull(),
    name: text("name").notNull(),
    domain: text("domain").notNull(),
    status: text("status").notNull().default("active"), // 'active' | 'suspended' | 'trial'
    razorpayCustomerId: text("razorpay_customer_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ═══════════════════════════════════════════
// SYNCED FROM M365
// ═══════════════════════════════════════════

export const users = pgTable("users", {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id).notNull(),
    azureUserId: text("azure_user_id").notNull(),
    email: text("email").notNull(),
    displayName: text("display_name"),
    jobTitle: text("job_title"),
    department: text("department"),
    country: text("country"),
    city: text("city"),
    phone: text("phone"),
    photoUrl: text("photo_url"),
    syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow(),
});

export const groups = pgTable("groups", {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id).notNull(),
    azureGroupId: text("azure_group_id").notNull(),
    name: text("name").notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow(),
});

export const userGroups = pgTable(
    "user_groups",
    {
        userId: uuid("user_id").references(() => users.id).notNull(),
        groupId: uuid("group_id").references(() => groups.id).notNull(),
    },
    (table) => [
        primaryKey({ columns: [table.userId, table.groupId] }),
    ]
);

// ═══════════════════════════════════════════
// DYNAMIC RESOURCE BUILDER
// ═══════════════════════════════════════════

export const resourceTypes = pgTable("resource_types", {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id).notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    icon: text("icon"),
    fieldsSchema: jsonb("fields_schema").notNull(), // Array of field definitions
    sortOrder: integer("sort_order").default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const resourceItems = pgTable("resource_items", {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id).notNull(),
    resourceTypeId: uuid("resource_type_id").references(() => resourceTypes.id).notNull(),
    name: text("name").notNull(),
    fieldValues: jsonb("field_values").notNull(), // { "logo": "https://...", "title": "..." }
    isActive: boolean("is_active").default(true),
    validFrom: timestamp("valid_from", { withTimezone: true }),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    sortOrder: integer("sort_order").default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ═══════════════════════════════════════════
// RULE ENGINE
// ═══════════════════════════════════════════

export const rules = pgTable("rules", {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id).notNull(),
    resourceItemId: uuid("resource_item_id").references(() => resourceItems.id).notNull(),
    scopeType: text("scope_type").notNull(), // 'global' | 'country' | 'job_title' | 'group' | 'individual'
    scopeValue: text("scope_value").notNull(), // '*' | 'Germany' | 'Engineer' | group_id | user_id
    priority: integer("priority").default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ═══════════════════════════════════════════
// SIGNATURE TEMPLATES
// ═══════════════════════════════════════════

export const templates = pgTable("templates", {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id).notNull(),
    name: text("name").notNull(),
    htmlTemplate: text("html_template").notNull(),
    isDefault: boolean("is_default").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ═══════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════

export const signatureSettings = pgTable("signature_settings", {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id).unique().notNull(),
    addToNew: boolean("add_to_new").default(true),
    addToReplies: boolean("add_to_replies").default(false),
    addToForwards: boolean("add_to_forwards").default(true),
    addToCalendar: boolean("add_to_calendar").default(false),
    replyTemplateId: uuid("reply_template_id").references(() => templates.id),
});

// ═══════════════════════════════════════════
// INDIVIDUAL OVERRIDES
// ═══════════════════════════════════════════

export const userOverrides = pgTable("user_overrides", {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id).notNull(),
    tenantId: uuid("tenant_id").references(() => tenants.id).notNull(),
    overrideItems: jsonb("override_items"), // { "add": [item_ids], "remove": [item_ids] }
    customTemplateId: uuid("custom_template_id").references(() => templates.id),
});

// ═══════════════════════════════════════════
// SAAS BILLING
// ═══════════════════════════════════════════

export const subscriptions = pgTable("subscriptions", {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id).unique().notNull(),
    plan: text("plan").notNull(), // 'starter' | 'business' | 'enterprise'
    billingCycle: text("billing_cycle").notNull(), // 'monthly' | 'yearly' | 'lifetime'
    razorpaySubscriptionId: text("razorpay_subscription_id"),
    status: text("status").default("active"), // 'active' | 'past_due' | 'cancelled'
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
});
