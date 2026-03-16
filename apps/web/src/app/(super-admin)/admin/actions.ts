"use server";

import { db } from "@/lib/db/client";
import { tenants, users, subscriptions } from "@/lib/db/schema";
import { eq, count, sql } from "drizzle-orm";
import { requireSuperAdmin } from "@/lib/auth/helpers";
import { revalidatePath } from "next/cache";

// ═══════════════════════════════════════════
// Types
// ═══════════════════════════════════════════

export interface TenantRow {
    id: string;
    name: string;
    domain: string;
    status: string;
    userCount: number;
    subscriptionPlan: string | null;
    subscriptionStatus: string | null;
    createdAt: Date | null;
}

// ═══════════════════════════════════════════
// List All Tenants
// ═══════════════════════════════════════════

export async function getAllTenants(): Promise<TenantRow[]> {
    await requireSuperAdmin();

    const rows = await db
        .select({
            id: tenants.id,
            name: tenants.name,
            domain: tenants.domain,
            status: tenants.status,
            userCount: count(users.id),
            subscriptionPlan: subscriptions.plan,
            subscriptionStatus: subscriptions.status,
            createdAt: tenants.createdAt,
        })
        .from(tenants)
        .leftJoin(users, eq(users.tenantId, tenants.id))
        .leftJoin(subscriptions, eq(subscriptions.tenantId, tenants.id))
        .groupBy(
            tenants.id,
            tenants.name,
            tenants.domain,
            tenants.status,
            subscriptions.plan,
            subscriptions.status,
            tenants.createdAt
        )
        .orderBy(sql`${tenants.createdAt} DESC`);

    return rows.map((r) => ({
        ...r,
        userCount: Number(r.userCount),
    }));
}

// ═══════════════════════════════════════════
// Suspend Tenant
// ═══════════════════════════════════════════

export async function suspendTenant(tenantId: string): Promise<{ success: boolean }> {
    await requireSuperAdmin();

    await db
        .update(tenants)
        .set({ status: "suspended" })
        .where(eq(tenants.id, tenantId));

    revalidatePath("/admin");
    return { success: true };
}

// ═══════════════════════════════════════════
// Activate Tenant
// ═══════════════════════════════════════════

export async function activateTenant(tenantId: string): Promise<{ success: boolean }> {
    await requireSuperAdmin();

    await db
        .update(tenants)
        .set({ status: "active" })
        .where(eq(tenants.id, tenantId));

    revalidatePath("/admin");
    return { success: true };
}
