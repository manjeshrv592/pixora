"use server";

import { db } from "@/lib/db/client";
import { users, groups, userGroups } from "@/lib/db/schema";
import {
    getGraphAccessToken,
    fetchGraphUsers,
    fetchGraphGroups,
    fetchGraphGroupMembers,
    fetchGraphUserPhoto,
} from "@/lib/graph";
import { eq } from "drizzle-orm";

/**
 * Perform initial user + group sync for a tenant.
 * This is a session-less version of the sync logic — used during onboarding
 * when there is no authenticated session yet.
 */
export async function performInitialSync(
    tenantId: string,
    azureTenantId: string
): Promise<{ userCount: number; groupCount: number; error?: string }> {
    try {
        const accessToken = await getGraphAccessToken(azureTenantId);

        // ─── Sync Users ──────────────────────────────────────
        const graphUsers = await fetchGraphUsers(accessToken);

        for (const graphUser of graphUsers) {
            const email = graphUser.mail || graphUser.userPrincipalName;
            const phone = graphUser.businessPhones?.[0] || null;

            // Fetch profile photo
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

        // ─── Sync Groups ─────────────────────────────────────
        const graphGroups = await fetchGraphGroups(accessToken);

        // Pre-build user lookup map
        const allTenantUsers = await db
            .select({ id: users.id, azureUserId: users.azureUserId })
            .from(users)
            .where(eq(users.tenantId, tenantId));

        const userLookup = new Map<string, string>();
        for (const u of allTenantUsers) {
            userLookup.set(u.azureUserId, u.id);
        }

        let groupCount = 0;

        for (const graphGroup of graphGroups) {
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

            // Fetch and sync members
            const members = await fetchGraphGroupMembers(accessToken, graphGroup.id);

            await db.delete(userGroups).where(eq(userGroups.groupId, groupId));

            const membershipValues: { userId: string; groupId: string }[] = [];
            for (const member of members) {
                const dbUserId = userLookup.get(member.id);
                if (dbUserId) {
                    membershipValues.push({ userId: dbUserId, groupId });
                }
            }

            if (membershipValues.length > 0) {
                await db.insert(userGroups).values(membershipValues);
            }
        }

        return { userCount: graphUsers.length, groupCount };
    } catch (error) {
        console.error("Initial sync error:", error);
        return {
            userCount: 0,
            groupCount: 0,
            error: error instanceof Error ? error.message : "Unknown error",
        };
    }
}
