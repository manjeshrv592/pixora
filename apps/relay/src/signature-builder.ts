import { eq, and, inArray } from "drizzle-orm";
import type { RelayDb } from "./db/client.js";
import {
    users,
    groups,
    userGroups,
    rules,
    resourceItems,
    resourceTypes,
    templates,
    userOverrides,
    signatureSettings,
} from "./db/schema.js";

// ─── Types ──────────────────────────────────────────

type ScopeType = "global" | "country" | "job_title" | "group" | "individual";

const SCOPE_PRIORITY: Record<ScopeType, number> = {
    global: 0,
    country: 1,
    job_title: 2,
    group: 3,
    individual: 4,
};

export interface ResolvedResource {
    resourceTypeId: string;
    resourceTypeName: string;
    resourceTypeSlug: string;
    items: Array<{
        id: string;
        name: string;
        fieldValues: unknown;
        matchedScope: string;
        matchedScopeValue: string;
        matchedPriority: number | null;
    }>;
}

export interface SignatureSettings {
    addToNew: boolean;
    addToReplies: boolean;
    addToForwards: boolean;
    addToCalendar: boolean;
    replyTemplateId: string | null;
}

// ─── Rule Resolution ────────────────────────────────

/**
 * Resolve rules for a user — port of resolveRulesForUserInternal from the web app.
 */
async function resolveRulesForUser(
    db: RelayDb,
    userId: string,
    tenantId: string
) {
    // 1. Fetch user profile
    const [user] = await db
        .select()
        .from(users)
        .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)))
        .limit(1);

    if (!user) return null;

    // 2. Fetch user's group memberships
    const userGroupRows = await db
        .select({
            groupId: userGroups.groupId,
            groupName: groups.name,
        })
        .from(userGroups)
        .innerJoin(groups, eq(userGroups.groupId, groups.id))
        .where(eq(userGroups.userId, userId));

    const userGroupIds = userGroupRows.map((ug) => ug.groupId);

    // 3. Fetch all rules for this tenant
    const allRules = await db
        .select({
            id: rules.id,
            resourceItemId: rules.resourceItemId,
            scopeType: rules.scopeType,
            scopeValue: rules.scopeValue,
            priority: rules.priority,
        })
        .from(rules)
        .where(eq(rules.tenantId, tenantId));

    // 4. Filter rules that match this user
    const matchingRules = allRules.filter((rule) => {
        switch (rule.scopeType) {
            case "global":
                return true;
            case "country":
                return (
                    user.country?.toLowerCase() === rule.scopeValue.toLowerCase()
                );
            case "job_title":
                return (
                    user.jobTitle?.toLowerCase() === rule.scopeValue.toLowerCase()
                );
            case "group":
                return userGroupIds.includes(rule.scopeValue);
            case "individual":
                return rule.scopeValue === userId;
            default:
                return false;
        }
    });

    // 5. Fetch active, time-valid resource items
    const matchingItemIds = [
        ...new Set(matchingRules.map((r) => r.resourceItemId)),
    ];

    if (matchingItemIds.length === 0) {
        return { user, resolvedResources: [] as ResolvedResource[] };
    }

    const matchingItems = await db
        .select({
            id: resourceItems.id,
            name: resourceItems.name,
            resourceTypeId: resourceItems.resourceTypeId,
            fieldValues: resourceItems.fieldValues,
            isActive: resourceItems.isActive,
            validFrom: resourceItems.validFrom,
            validUntil: resourceItems.validUntil,
            resourceTypeName: resourceTypes.name,
            resourceTypeSlug: resourceTypes.slug,
        })
        .from(resourceItems)
        .innerJoin(
            resourceTypes,
            eq(resourceItems.resourceTypeId, resourceTypes.id)
        )
        .where(
            and(
                inArray(resourceItems.id, matchingItemIds),
                eq(resourceItems.isActive, true)
            )
        );

    // Filter by time validity
    const now = new Date();
    const activeItems = matchingItems.filter((item) => {
        if (item.validFrom && now < item.validFrom) return false;
        if (item.validUntil && now > item.validUntil) return false;
        return true;
    });

    // 6. Resolve by priority
    const itemsByType = new Map<
        string,
        {
            resourceTypeName: string;
            resourceTypeSlug: string;
            items: Array<{
                item: (typeof activeItems)[0];
                matchedRule: (typeof matchingRules)[0];
                effectivePriority: number;
            }>;
        }
    >();

    for (const item of activeItems) {
        const rulesForItem = matchingRules
            .filter((r) => r.resourceItemId === item.id)
            .sort((a, b) => {
                const scopeDiff =
                    SCOPE_PRIORITY[b.scopeType as ScopeType] -
                    SCOPE_PRIORITY[a.scopeType as ScopeType];
                if (scopeDiff !== 0) return scopeDiff;
                return (b.priority ?? 0) - (a.priority ?? 0);
            });

        if (rulesForItem.length === 0) continue;

        const bestRule = rulesForItem[0];
        const effectivePriority =
            SCOPE_PRIORITY[bestRule.scopeType as ScopeType] * 1000 +
            (bestRule.priority ?? 0);

        if (!itemsByType.has(item.resourceTypeId)) {
            itemsByType.set(item.resourceTypeId, {
                resourceTypeName: item.resourceTypeName,
                resourceTypeSlug: item.resourceTypeSlug,
                items: [],
            });
        }

        itemsByType.get(item.resourceTypeId)!.items.push({
            item,
            matchedRule: bestRule,
            effectivePriority,
        });
    }

    const resolvedResources: ResolvedResource[] = Array.from(
        itemsByType.entries()
    ).map(([typeId, { resourceTypeName, resourceTypeSlug, items }]) => ({
        resourceTypeId: typeId,
        resourceTypeName,
        resourceTypeSlug,
        items: items
            .sort((a, b) => b.effectivePriority - a.effectivePriority)
            .map((entry) => ({
                id: entry.item.id,
                name: entry.item.name,
                fieldValues: entry.item.fieldValues,
                matchedScope: entry.matchedRule.scopeType,
                matchedScopeValue: entry.matchedRule.scopeValue,
                matchedPriority: entry.matchedRule.priority,
            })),
    }));

    return { user, resolvedResources };
}

// ─── Template Rendering ─────────────────────────────

function renderTemplate(
    htmlTemplate: string,
    userData: Record<string, string | null | undefined>,
    resourcesBySlug: Record<string, Array<Record<string, unknown>>>
): string {
    let result = htmlTemplate;

    // 1. {{#each slug}}...{{/each}}
    result = result.replace(
        /\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g,
        (_match, slug: string, inner: string) => {
            const items = resourcesBySlug[slug];
            if (!items || items.length === 0) return "";
            return items
                .map((item) =>
                    inner.replace(/\{\{this\.(\w+)\}\}/g, (_m, fieldName: string) => {
                        const val = item[fieldName];
                        return val != null ? String(val) : "";
                    })
                )
                .join("");
        }
    );

    // 2. {{#if slug}}...{{/if}}
    result = result.replace(
        /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
        (_match, slug: string, inner: string) => {
            const items = resourcesBySlug[slug];
            if (!items || items.length === 0) return "";
            return inner;
        }
    );

    // 3. {{user.field}}
    result = result.replace(
        /\{\{user\.(\w+)\}\}/g,
        (_match, field: string) => {
            const val = userData[field];
            return val != null ? String(val) : "";
        }
    );

    // 4. {{slug.field}} — first item shorthand
    result = result.replace(
        /\{\{(\w+)\.(\w+)\}\}/g,
        (_match, slug: string, field: string) => {
            const items = resourcesBySlug[slug];
            if (!items || items.length === 0) return "";
            const val = items[0][field];
            return val != null ? String(val) : "";
        }
    );

    return result;
}

// ─── Main Builder ───────────────────────────────────

export interface SignatureResult {
    html: string;
    templateName: string;
    settings: SignatureSettings;
}

/**
 * Build the fully rendered signature HTML for a sender email.
 * This is the main entry point for the relay server.
 */
export async function buildSignatureForEmail(
    db: RelayDb,
    senderEmail: string
): Promise<SignatureResult | null> {
    // 1. Look up user by email
    const [user] = await db
        .select({ id: users.id, tenantId: users.tenantId })
        .from(users)
        .where(eq(users.email, senderEmail.toLowerCase()))
        .limit(1);

    if (!user) {
        console.log(`  ⚠ No user found for ${senderEmail}`);
        return null;
    }

    // 2. Resolve rules
    const resolved = await resolveRulesForUser(db, user.id, user.tenantId);
    if (!resolved) return null;

    // 3. Check for user overrides
    const [override] = await db
        .select()
        .from(userOverrides)
        .where(
            and(
                eq(userOverrides.userId, user.id),
                eq(userOverrides.tenantId, user.tenantId)
            )
        )
        .limit(1);

    // 4. Select template
    let template;
    const effectiveTemplateId = override?.customTemplateId || null;

    if (effectiveTemplateId) {
        const [t] = await db
            .select()
            .from(templates)
            .where(
                and(
                    eq(templates.id, effectiveTemplateId),
                    eq(templates.tenantId, user.tenantId)
                )
            )
            .limit(1);
        template = t;
    }

    // Fall back to default template
    if (!template) {
        const [t] = await db
            .select()
            .from(templates)
            .where(
                and(
                    eq(templates.tenantId, user.tenantId),
                    eq(templates.isDefault, true)
                )
            )
            .limit(1);
        template = t;
    }

    if (!template) {
        console.log(`  ⚠ No template found for tenant ${user.tenantId}`);
        return null;
    }

    // 5. Apply overrides to resources
    let resolvedResources = resolved.resolvedResources;

    if (override?.overrideItems) {
        const overrideData = override.overrideItems as {
            add?: string[];
            remove?: string[];
        };

        if (overrideData.remove && overrideData.remove.length > 0) {
            resolvedResources = resolvedResources
                .map((group) => ({
                    ...group,
                    items: group.items.filter(
                        (item) => !overrideData.remove!.includes(item.id)
                    ),
                }))
                .filter((group) => group.items.length > 0);
        }
    }

    // 6. Build resourcesBySlug map
    const resourcesBySlug: Record<string, Array<Record<string, unknown>>> = {};
    for (const group of resolvedResources) {
        resourcesBySlug[group.resourceTypeSlug] = group.items.map(
            (item) => (item.fieldValues as Record<string, unknown>) || {}
        );
    }

    // 7. Render template
    const userData: Record<string, string | null | undefined> = {
        displayName: resolved.user.displayName,
        email: resolved.user.email,
        jobTitle: resolved.user.jobTitle,
        department: resolved.user.department,
        country: resolved.user.country,
        city: resolved.user.city,
        phone: resolved.user.phone,
        photoUrl: resolved.user.photoUrl,
    };

    const html = renderTemplate(template.htmlTemplate, userData, resourcesBySlug);

    // 8. Fetch signature settings
    const [settingsRow] = await db
        .select()
        .from(signatureSettings)
        .where(eq(signatureSettings.tenantId, user.tenantId))
        .limit(1);

    const settings: SignatureSettings = settingsRow
        ? {
            addToNew: settingsRow.addToNew ?? true,
            addToReplies: settingsRow.addToReplies ?? false,
            addToForwards: settingsRow.addToForwards ?? true,
            addToCalendar: settingsRow.addToCalendar ?? false,
            replyTemplateId: settingsRow.replyTemplateId,
        }
        : {
            addToNew: true,
            addToReplies: false,
            addToForwards: true,
            addToCalendar: false,
            replyTemplateId: null,
        };

    return { html, templateName: template.name, settings };
}
