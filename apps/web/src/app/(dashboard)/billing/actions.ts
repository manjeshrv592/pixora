"use server";

import { db } from "@/lib/db/client";
import { subscriptions, tenants } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getTenantId } from "@/lib/auth/helpers";
import { getRazorpay, getPlanConfig, type PlanTier, type BillingCycle } from "@/lib/razorpay";
import { revalidatePath } from "next/cache";

// ═══════════════════════════════════════════
// Get Current Subscription
// ═══════════════════════════════════════════

export async function getCurrentSubscription() {
    const tenantId = await getTenantId();

    const [subscription] = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.tenantId, tenantId))
        .limit(1);

    const [tenant] = await db
        .select({ status: tenants.status, razorpayCustomerId: tenants.razorpayCustomerId })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);

    return {
        subscription: subscription || null,
        tenantStatus: tenant?.status || "trial",
        hasCustomerId: !!tenant?.razorpayCustomerId,
    };
}

// ═══════════════════════════════════════════
// Create Subscription
// ═══════════════════════════════════════════

export async function createSubscription(
    tier: PlanTier,
    cycle: BillingCycle
): Promise<{ subscriptionId?: string; shortUrl?: string; error?: string }> {
    const tenantId = await getTenantId();

    const plan = getPlanConfig(tier);
    if (!plan) {
        return { error: "Invalid plan selected" };
    }

    const planId = plan.razorpayPlanIds[cycle];
    if (!planId) {
        return { error: "This plan is not yet configured. Please contact support." };
    }

    try {
        // Get or create Razorpay customer
        const [tenant] = await db
            .select({ id: tenants.id, name: tenants.name, razorpayCustomerId: tenants.razorpayCustomerId })
            .from(tenants)
            .where(eq(tenants.id, tenantId))
            .limit(1);

        let customerId = tenant?.razorpayCustomerId;

        if (!customerId) {
            const customer = await getRazorpay().customers.create({
                name: tenant?.name || "Organization",
                notes: { tenantId },
            });
            customerId = customer.id;

            await db
                .update(tenants)
                .set({ razorpayCustomerId: customerId })
                .where(eq(tenants.id, tenantId));
        }

        // Create subscription
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const subscription = await (getRazorpay().subscriptions.create as any)({
            plan_id: planId,
            customer_id: customerId,
            total_count: cycle === "monthly" ? 120 : 10, // max billing cycles
            notes: {
                tenantId,
                tier,
                cycle,
            },
        });

        // Store subscription in DB
        await db
            .insert(subscriptions)
            .values({
                tenantId,
                plan: tier,
                billingCycle: cycle,
                razorpaySubscriptionId: subscription.id,
                status: "pending",
            })
            .onConflictDoUpdate({
                target: subscriptions.tenantId,
                set: {
                    plan: tier,
                    billingCycle: cycle,
                    razorpaySubscriptionId: subscription.id,
                    status: "pending",
                },
            });

        revalidatePath("/billing");

        return {
            subscriptionId: subscription.id,
            shortUrl: subscription.short_url,
        };
    } catch (error) {
        console.error("Razorpay subscription error:", error);
        return {
            error: error instanceof Error ? error.message : "Failed to create subscription",
        };
    }
}

// ═══════════════════════════════════════════
// Cancel Subscription
// ═══════════════════════════════════════════

export async function cancelSubscription(): Promise<{ success: boolean; error?: string }> {
    const tenantId = await getTenantId();

    const [subscription] = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.tenantId, tenantId))
        .limit(1);

    if (!subscription?.razorpaySubscriptionId) {
        return { success: false, error: "No active subscription found" };
    }

    try {
        await getRazorpay().subscriptions.cancel(subscription.razorpaySubscriptionId);

        await db
            .update(subscriptions)
            .set({ status: "cancelled" })
            .where(eq(subscriptions.tenantId, tenantId));

        revalidatePath("/billing");
        return { success: true };
    } catch (error) {
        console.error("Cancel subscription error:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to cancel subscription",
        };
    }
}
