"use server";

import { db } from "@/lib/db/client";
import { templates, resourceTypes, signatureSettings } from "@/lib/db/schema";
import { getTenantId } from "@/lib/auth/helpers";
import { eq, and, count, desc, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FieldDefinition } from "../resource-types/actions";

// ─── Create ─────────────────────────────────────────

export async function createTemplate(data: {
    name: string;
    htmlTemplate: string;
    isDefault: boolean;
}): Promise<{ error?: string }> {
    const tenantId = await getTenantId();

    if (!data.name.trim()) return { error: "Template name is required." };
    if (!data.htmlTemplate.trim()) return { error: "HTML template content is required." };

    // If marking as default, unset any current default
    if (data.isDefault) {
        await db
            .update(templates)
            .set({ isDefault: false })
            .where(and(eq(templates.tenantId, tenantId), eq(templates.isDefault, true)));
    }

    const [created] = await db
        .insert(templates)
        .values({
            tenantId,
            name: data.name.trim(),
            htmlTemplate: data.htmlTemplate,
            isDefault: data.isDefault,
        })
        .returning({ id: templates.id });

    revalidatePath("/templates");
    redirect(`/templates/${created.id}`);
}

// ─── Update ─────────────────────────────────────────

export async function updateTemplate(
    id: string,
    data: {
        name: string;
        htmlTemplate: string;
        isDefault: boolean;
    }
): Promise<{ error?: string }> {
    const tenantId = await getTenantId();

    if (!data.name.trim()) return { error: "Template name is required." };
    if (!data.htmlTemplate.trim()) return { error: "HTML template content is required." };

    // Verify ownership
    const [existing] = await db
        .select({ id: templates.id })
        .from(templates)
        .where(and(eq(templates.id, id), eq(templates.tenantId, tenantId)))
        .limit(1);

    if (!existing) return { error: "Template not found." };

    // If marking as default, unset any current default
    if (data.isDefault) {
        await db
            .update(templates)
            .set({ isDefault: false })
            .where(
                and(
                    eq(templates.tenantId, tenantId),
                    eq(templates.isDefault, true),
                    ne(templates.id, id)
                )
            );
    }

    await db
        .update(templates)
        .set({
            name: data.name.trim(),
            htmlTemplate: data.htmlTemplate,
            isDefault: data.isDefault,
        })
        .where(and(eq(templates.id, id), eq(templates.tenantId, tenantId)));

    revalidatePath("/templates");
    revalidatePath(`/templates/${id}`);
    redirect(`/templates/${id}`);
}

// ─── Delete ─────────────────────────────────────────

export async function deleteTemplate(id: string): Promise<{ error?: string }> {
    const tenantId = await getTenantId();

    const [existing] = await db
        .select({ id: templates.id, isDefault: templates.isDefault })
        .from(templates)
        .where(and(eq(templates.id, id), eq(templates.tenantId, tenantId)))
        .limit(1);

    if (!existing) return { error: "Template not found." };

    if (existing.isDefault) {
        return { error: "Cannot delete the default template. Set another template as default first." };
    }

    // Check if template is used as reply template in settings
    const [settings] = await db
        .select({ replyTemplateId: signatureSettings.replyTemplateId })
        .from(signatureSettings)
        .where(eq(signatureSettings.tenantId, tenantId))
        .limit(1);

    if (settings?.replyTemplateId === id) {
        return { error: "Cannot delete: this template is set as the reply template in settings." };
    }

    await db
        .delete(templates)
        .where(and(eq(templates.id, id), eq(templates.tenantId, tenantId)));

    revalidatePath("/templates");
    redirect("/templates");
}

// ─── Set Default ────────────────────────────────────

export async function setDefaultTemplate(id: string): Promise<{ error?: string }> {
    const tenantId = await getTenantId();

    const [existing] = await db
        .select({ id: templates.id })
        .from(templates)
        .where(and(eq(templates.id, id), eq(templates.tenantId, tenantId)))
        .limit(1);

    if (!existing) return { error: "Template not found." };

    // Unset all defaults
    await db
        .update(templates)
        .set({ isDefault: false })
        .where(and(eq(templates.tenantId, tenantId), eq(templates.isDefault, true)));

    // Set new default
    await db
        .update(templates)
        .set({ isDefault: true })
        .where(and(eq(templates.id, id), eq(templates.tenantId, tenantId)));

    revalidatePath("/templates");
    revalidatePath(`/templates/${id}`);
    return {};
}

// ─── Queries ────────────────────────────────────────

export async function getTemplates(page: number = 1, pageSize: number = 10) {
    const tenantId = await getTenantId();
    const offset = (page - 1) * pageSize;

    const [{ total }] = await db
        .select({ total: count() })
        .from(templates)
        .where(eq(templates.tenantId, tenantId));

    const templatesList = await db
        .select()
        .from(templates)
        .where(eq(templates.tenantId, tenantId))
        .orderBy(desc(templates.createdAt))
        .limit(pageSize)
        .offset(offset);

    return { templates: templatesList, total };
}

export async function getTemplate(id: string) {
    const tenantId = await getTenantId();

    const [template] = await db
        .select()
        .from(templates)
        .where(and(eq(templates.id, id), eq(templates.tenantId, tenantId)))
        .limit(1);

    return template || null;
}

// ─── Available Placeholders ─────────────────────────

export interface PlaceholderGroup {
    category: string;
    slug?: string;
    placeholders: Array<{
        label: string;
        value: string;
    }>;
}

export async function getAvailablePlaceholders(): Promise<PlaceholderGroup[]> {
    const tenantId = await getTenantId();

    // User fields
    const userPlaceholders: PlaceholderGroup = {
        category: "User Fields",
        placeholders: [
            { label: "Display Name", value: "{{user.displayName}}" },
            { label: "Email", value: "{{user.email}}" },
            { label: "Job Title", value: "{{user.jobTitle}}" },
            { label: "Department", value: "{{user.department}}" },
            { label: "Country", value: "{{user.country}}" },
            { label: "City", value: "{{user.city}}" },
            { label: "Phone", value: "{{user.phone}}" },
            { label: "Photo URL", value: "{{user.photoUrl}}" },
        ],
    };

    // Resource type fields
    const types = await db
        .select({
            id: resourceTypes.id,
            name: resourceTypes.name,
            slug: resourceTypes.slug,
            fieldsSchema: resourceTypes.fieldsSchema,
        })
        .from(resourceTypes)
        .where(eq(resourceTypes.tenantId, tenantId))
        .orderBy(resourceTypes.name);

    const resourceGroups: PlaceholderGroup[] = types.map((type) => {
        const fields = type.fieldsSchema as FieldDefinition[];
        const placeholders: PlaceholderGroup["placeholders"] = [];

        // Loop start/end helpers
        placeholders.push({
            label: `Loop: {{#each ${type.slug}}}`,
            value: `{{#each ${type.slug}}}`,
        });

        // Field placeholders within loop
        for (const field of fields) {
            placeholders.push({
                label: `  ${field.label} (in loop)`,
                value: `{{this.${field.name}}}`,
            });
        }

        placeholders.push({
            label: `End Loop: {{/each}}`,
            value: `{{/each}}`,
        });

        // Conditional block helper
        placeholders.push({
            label: `If has items: {{#if ${type.slug}}}`,
            value: `{{#if ${type.slug}}}`,
        });
        placeholders.push({
            label: `End If: {{/if}}`,
            value: `{{/if}}`,
        });

        // Direct access (first item shorthand)
        for (const field of fields) {
            placeholders.push({
                label: `${field.label} (first item)`,
                value: `{{${type.slug}.${field.name}}}`,
            });
        }

        return {
            category: type.name,
            slug: type.slug,
            placeholders,
        };
    });

    return [userPlaceholders, ...resourceGroups];
}
