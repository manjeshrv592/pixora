"use server";

import { db } from "@/lib/db/client";
import { tenants, users, groups, userGroups } from "@/lib/db/schema";
import { getTenantId } from "@/lib/auth/helpers";
import {
    getGraphAccessToken,
    fetchGraphUsers,
    fetchGraphGroups,
    fetchGraphGroupMembers,
    fetchGraphUserPhoto,
} from "@/lib/graph";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

// ─── Helpers ─────────────────────────────────────────────────

async function getTenantAzureId(): Promise<{ tenantId: string; azureTenantId: string }> {
    const tenantId = await getTenantId();

    const tenant = await db
        .select({ azureTenantId: tenants.azureTenantId })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);

    if (tenant.length === 0) {
        throw new Error("Tenant not found");
    }

    return { tenantId, azureTenantId: tenant[0].azureTenantId };
}

// ─── Sync Users (Upsert via onConflictDoUpdate) ─────────────

export async function syncUsers(): Promise<{ success: boolean; count: number; error?: string }> {
    try {
        const { tenantId, azureTenantId } = await getTenantAzureId();

        const accessToken = await getGraphAccessToken(azureTenantId);
        const graphUsers = await fetchGraphUsers(accessToken);

        if (graphUsers.length === 0) {
            return { success: true, count: 0 };
        }

        // Upsert each user — uses unique index on (tenant_id, azure_user_id)
        // No more separate SELECT + INSERT/UPDATE (old N+1 pattern)
        for (const graphUser of graphUsers) {
            const email = graphUser.mail || graphUser.userPrincipalName;
            const phone = graphUser.businessPhones?.[0] || null;

            // Fetch profile photo (returns null if none set)
            const photoUrl = await fetchGraphUserPhoto(accessToken, graphUser.id);

            await db
                .insert(users)
                .values({
                    tenantId,
                    azureUserId: graphUser.id,
                    email,
                    displayName: graphUser.displayName,
                    jobTitle: graphUser.jobTitle,
                    department: graphUser.department,
                    country: graphUser.country,
                    city: graphUser.city,
                    phone,
                    photoUrl,
                    syncedAt: new Date(),
                })
                .onConflictDoUpdate({
                    target: [users.tenantId, users.azureUserId],
                    set: {
                        email,
                        displayName: graphUser.displayName,
                        jobTitle: graphUser.jobTitle,
                        department: graphUser.department,
                        country: graphUser.country,
                        city: graphUser.city,
                        phone,
                        photoUrl,
                        syncedAt: new Date(),
                    },
                });
        }

        revalidatePath("/users");
        revalidatePath("/");
        return { success: true, count: graphUsers.length };
    } catch (error) {
        console.error("Error syncing users:", error);
        return {
            success: false,
            count: 0,
            error: error instanceof Error ? error.message : "Unknown error",
        };
    }
}

// ─── Sync Groups (Upsert + Pre-built User Map + Batch Memberships) ──

export async function syncGroups(): Promise<{ success: boolean; groupCount: number; membershipCount: number; error?: string }> {
    try {
        const { tenantId, azureTenantId } = await getTenantAzureId();

        const accessToken = await getGraphAccessToken(azureTenantId);
        const graphGroups = await fetchGraphGroups(accessToken);

        if (graphGroups.length === 0) {
            return { success: true, groupCount: 0, membershipCount: 0 };
        }

        // Pre-build lookup map: azureUserId → DB user ID (1 query instead of N)
        const allTenantUsers = await db
            .select({ id: users.id, azureUserId: users.azureUserId })
            .from(users)
            .where(eq(users.tenantId, tenantId));

        const userLookup = new Map<string, string>();
        for (const u of allTenantUsers) {
            userLookup.set(u.azureUserId, u.id);
        }

        let groupCount = 0;
        let membershipCount = 0;

        for (const graphGroup of graphGroups) {
            // Upsert group — uses unique index on (tenant_id, azure_group_id)
            const result = await db
                .insert(groups)
                .values({
                    tenantId,
                    azureGroupId: graphGroup.id,
                    name: graphGroup.displayName,
                    syncedAt: new Date(),
                })
                .onConflictDoUpdate({
                    target: [groups.tenantId, groups.azureGroupId],
                    set: {
                        name: graphGroup.displayName,
                        syncedAt: new Date(),
                    },
                })
                .returning({ id: groups.id });

            const groupId = result[0].id;
            groupCount++;

            // Fetch members from Graph API
            const members = await fetchGraphGroupMembers(accessToken, graphGroup.id);

            // Clear existing memberships for this group
            await db.delete(userGroups).where(eq(userGroups.groupId, groupId));

            // Build batch of valid membership pairs using the pre-built map
            const membershipValues: { userId: string; groupId: string }[] = [];
            for (const member of members) {
                const dbUserId = userLookup.get(member.id);
                if (dbUserId) {
                    membershipValues.push({ userId: dbUserId, groupId });
                }
            }

            // Batch insert all memberships in a single query
            if (membershipValues.length > 0) {
                await db.insert(userGroups).values(membershipValues);
                membershipCount += membershipValues.length;
            }
        }

        revalidatePath("/groups");
        revalidatePath("/users");
        revalidatePath("/");
        return { success: true, groupCount, membershipCount };
    } catch (error) {
        console.error("Error syncing groups:", error);
        return {
            success: false,
            groupCount: 0,
            membershipCount: 0,
            error: error instanceof Error ? error.message : "Unknown error",
        };
    }
}
