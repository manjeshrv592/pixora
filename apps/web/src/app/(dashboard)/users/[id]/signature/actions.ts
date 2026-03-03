"use server";

import { db } from "@/lib/db/client";
import { userOverrides, resourceItems, resourceTypes } from "@/lib/db/schema";
import { getTenantId } from "@/lib/auth/helpers";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";

// ─── Get Override ───────────────────────────────────

export async function getUserOverride(userId: string) {
    const tenantId = await getTenantId();

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

    return override || null;
}

// ─── Save Override ──────────────────────────────────

export async function saveUserOverride(
    userId: string,
    data: {
        customTemplateId: string | null;
        overrideItems: { add: string[]; remove: string[] };
    }
): Promise<{ error?: string }> {
    const tenantId = await getTenantId();

    const [existing] = await db
        .select({ id: userOverrides.id })
        .from(userOverrides)
        .where(
            and(
                eq(userOverrides.userId, userId),
                eq(userOverrides.tenantId, tenantId)
            )
        )
        .limit(1);

    if (existing) {
        await db
            .update(userOverrides)
            .set({
                customTemplateId: data.customTemplateId || null,
                overrideItems: data.overrideItems,
            })
            .where(
                and(
                    eq(userOverrides.userId, userId),
                    eq(userOverrides.tenantId, tenantId)
                )
            );
    } else {
        await db.insert(userOverrides).values({
            userId,
            tenantId,
            customTemplateId: data.customTemplateId || null,
            overrideItems: data.overrideItems,
        });
    }

    revalidatePath(`/users/${userId}/signature`);
    return {};
}

// ─── Clear Override ─────────────────────────────────

export async function clearUserOverride(userId: string): Promise<{ error?: string }> {
    const tenantId = await getTenantId();

    await db
        .delete(userOverrides)
        .where(
            and(
                eq(userOverrides.userId, userId),
                eq(userOverrides.tenantId, tenantId)
            )
        );

    revalidatePath(`/users/${userId}/signature`);
    return {};
}

// ─── Get available items for override ───────────────

export async function getOverrideFormData() {
    const tenantId = await getTenantId();

    const items = await db
        .select({
            id: resourceItems.id,
            name: resourceItems.name,
            resourceTypeName: resourceTypes.name,
            resourceTypeId: resourceItems.resourceTypeId,
            isActive: resourceItems.isActive,
        })
        .from(resourceItems)
        .innerJoin(resourceTypes, eq(resourceItems.resourceTypeId, resourceTypes.id))
        .where(eq(resourceItems.tenantId, tenantId))
        .orderBy(resourceTypes.name, resourceItems.name);

    return items;
}
