import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db/client";
import { subscriptions, tenants } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * POST /api/webhooks/razorpay
 * 
 * Handles Razorpay webhook events for subscription lifecycle.
 * Validates the webhook signature, then updates subscription + tenant status.
 */
export async function POST(request: NextRequest) {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!webhookSecret) {
        console.error("RAZORPAY_WEBHOOK_SECRET not configured");
        return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
    }

    // ─── Validate Signature ──────────────────────────────
    const signature = request.headers.get("x-razorpay-signature");
    const body = await request.text();

    if (!signature) {
        return NextResponse.json({ error: "Missing signature" }, { status: 400 });
    }

    const expectedSignature = crypto
        .createHmac("sha256", webhookSecret)
        .update(body)
        .digest("hex");

    if (signature !== expectedSignature) {
        console.error("Invalid webhook signature");
        return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    // ─── Process Event ───────────────────────────────────
    const event = JSON.parse(body);
    const eventType = event.event;
    const payload = event.payload;

    console.log(`Razorpay webhook: ${eventType}`);

    try {
        switch (eventType) {
            case "subscription.activated": {
                const sub = payload.subscription.entity;
                const tenantId = sub.notes?.tenantId;
                if (!tenantId) break;

                await db
                    .update(subscriptions)
                    .set({
                        status: "active",
                        currentPeriodEnd: sub.current_end
                            ? new Date(sub.current_end * 1000)
                            : null,
                    })
                    .where(eq(subscriptions.razorpaySubscriptionId, sub.id));

                await db
                    .update(tenants)
                    .set({ status: "active" })
                    .where(eq(tenants.id, tenantId));

                console.log(`Subscription activated for tenant ${tenantId}`);
                break;
            }

            case "subscription.charged": {
                const sub = payload.subscription.entity;

                await db
                    .update(subscriptions)
                    .set({
                        status: "active",
                        currentPeriodEnd: sub.current_end
                            ? new Date(sub.current_end * 1000)
                            : null,
                    })
                    .where(eq(subscriptions.razorpaySubscriptionId, sub.id));

                console.log(`Subscription charged: ${sub.id}`);
                break;
            }

            case "subscription.cancelled": {
                const sub = payload.subscription.entity;
                const tenantId = sub.notes?.tenantId;

                await db
                    .update(subscriptions)
                    .set({ status: "cancelled" })
                    .where(eq(subscriptions.razorpaySubscriptionId, sub.id));

                // Don't immediately suspend — let current period end
                console.log(`Subscription cancelled: ${sub.id}`);
                break;
            }

            case "subscription.paused": {
                const sub = payload.subscription.entity;
                const tenantId = sub.notes?.tenantId;

                await db
                    .update(subscriptions)
                    .set({ status: "past_due" })
                    .where(eq(subscriptions.razorpaySubscriptionId, sub.id));

                if (tenantId) {
                    await db
                        .update(tenants)
                        .set({ status: "suspended" })
                        .where(eq(tenants.id, tenantId));
                }

                console.log(`Subscription paused: ${sub.id}`);
                break;
            }

            case "payment.failed": {
                const payment = payload.payment.entity;
                console.warn(`Payment failed: ${payment.id}, reason: ${payment.error_description}`);
                // Don't immediately change status — Razorpay retries automatically
                break;
            }

            default:
                console.log(`Unhandled webhook event: ${eventType}`);
        }

        return NextResponse.json({ received: true });
    } catch (error) {
        console.error("Webhook processing error:", error);
        return NextResponse.json({ error: "Processing failed" }, { status: 500 });
    }
}
