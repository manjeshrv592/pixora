import { db } from "@/lib/db/client";
import { users, templates, userOverrides } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { resolveRulesForUserInternal } from "@/app/(dashboard)/rules/actions";

// ─── Types ──────────────────────────────────────────

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

export interface SignatureResult {
    html: string;
    templateId: string;
    templateName: string;
    resolvedResources: ResolvedResource[];
}

// ─── Template Rendering ─────────────────────────────

/**
 * Render a Handlebars-style template with user data and resolved resources.
 *
 * Supported syntax:
 *   {{user.displayName}}        — user field
 *   {{#each certification}}     — loop over items of resource type by slug
 *     {{this.logo}}             — field value of current item
 *   {{/each}}
 *   {{#if banner}}              — conditional: render block only if type has items
 *   {{/if}}
 */
function renderTemplate(
    htmlTemplate: string,
    userData: Record<string, string | null | undefined>,
    resourcesBySlug: Record<string, Array<Record<string, unknown>>>
): string {
    let result = htmlTemplate;

    // 1. Handle {{#each slug}}...{{/each}} blocks
    result = result.replace(
        /\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g,
        (_match, slug: string, inner: string) => {
            const items = resourcesBySlug[slug];
            if (!items || items.length === 0) return "";

            return items
                .map((item) => {
                    // Replace {{this.fieldName}} with the item's field value
                    return inner.replace(
                        /\{\{this\.(\w+)\}\}/g,
                        (_m, fieldName: string) => {
                            const val = item[fieldName];
                            return val != null ? String(val) : "";
                        }
                    );
                })
                .join("");
        }
    );

    // 2. Handle {{#if slug}}...{{/if}} blocks
    result = result.replace(
        /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
        (_match, slug: string, inner: string) => {
            const items = resourcesBySlug[slug];
            if (!items || items.length === 0) return "";
            return inner;
        }
    );

    // 3. Handle {{user.field}} placeholders
    result = result.replace(
        /\{\{user\.(\w+)\}\}/g,
        (_match, field: string) => {
            const val = userData[field];
            return val != null ? String(val) : "";
        }
    );

    // 4. Handle {{slug.field}} — first item of a resource type (shorthand)
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

// ─── User Data Helper ───────────────────────────────

function userToRecord(user: {
    displayName: string | null;
    email: string;
    jobTitle: string | null;
    department: string | null;
    country: string | null;
    city: string | null;
    phone: string | null;
    photoUrl: string | null;
}): Record<string, string | null> {
    return {
        displayName: user.displayName,
        email: user.email,
        jobTitle: user.jobTitle,
        department: user.department,
        country: user.country,
        city: user.city,
        phone: user.phone,
        photoUrl: user.photoUrl,
    };
}

// ─── Main Builder Functions ─────────────────────────

/**
 * Build the fully rendered signature HTML for a user.
 * Optionally specify a templateId; otherwise uses the tenant's default.
 */
export async function buildSignatureForUser(
    userId: string,
    tenantId: string,
    templateId?: string
): Promise<SignatureResult | null> {
    // 1. Resolve rules for this user
    const resolved = await resolveRulesForUserInternal(userId, tenantId);
    if (!resolved) return null;

    // 2. Check for user overrides
    const [override] = await db
        .select()
        .from(userOverrides)
        .where(
            and(
                eq(userOverrides.userId, userId),
                eq(userOverrides.tenantId, tenantId)
            )
        )
        .limit(1);

    // Use override template if set and no explicit templateId was passed
    const effectiveTemplateId = templateId || override?.customTemplateId || null;

    // 3. Fetch the template
    let template;
    if (effectiveTemplateId) {
        const [t] = await db
            .select()
            .from(templates)
            .where(
                and(
                    eq(templates.id, effectiveTemplateId),
                    eq(templates.tenantId, tenantId)
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
                    eq(templates.tenantId, tenantId),
                    eq(templates.isDefault, true)
                )
            )
            .limit(1);
        template = t;
    }

    if (!template) return null;

    // 4. Apply overrides to resolved resources
    let resolvedResources = resolved.resolvedResources;

    if (override?.overrideItems) {
        const overrideData = override.overrideItems as {
            add?: string[];
            remove?: string[];
        };

        // Remove items
        if (overrideData.remove && overrideData.remove.length > 0) {
            resolvedResources = resolvedResources.map((group) => ({
                ...group,
                items: group.items.filter(
                    (item) => !overrideData.remove!.includes(item.id)
                ),
            }));
            // Remove empty groups
            resolvedResources = resolvedResources.filter(
                (group) => group.items.length > 0
            );
        }

        // Note: "add" override items would require additional DB lookups
        // and will be handled in a future iteration
    }

    // 5. Build resourcesBySlug map for template rendering
    const resourcesBySlug: Record<string, Array<Record<string, unknown>>> = {};
    for (const group of resolvedResources) {
        resourcesBySlug[group.resourceTypeSlug] = group.items.map(
            (item) => (item.fieldValues as Record<string, unknown>) || {}
        );
    }

    // 6. Render the template
    const userData = userToRecord(resolved.user);
    const html = renderTemplate(template.htmlTemplate, userData, resourcesBySlug);

    return {
        html,
        templateId: template.id,
        templateName: template.name,
        resolvedResources,
    };
}

/**
 * Build signature by looking up a user by email address.
 */
export async function buildSignatureByEmail(
    email: string,
    tenantId: string
): Promise<SignatureResult | null> {
    const [user] = await db
        .select({ id: users.id })
        .from(users)
        .where(
            and(
                eq(users.email, email),
                eq(users.tenantId, tenantId)
            )
        )
        .limit(1);

    if (!user) return null;

    return buildSignatureForUser(user.id, tenantId);
}
