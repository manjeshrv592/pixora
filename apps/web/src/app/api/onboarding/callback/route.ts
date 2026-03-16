import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db/client";
import { tenants } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { performInitialSync } from "@/lib/onboarding/sync";

/**
 * GET /api/onboarding/callback
 * 
 * Microsoft redirects here after the admin grants (or denies) consent.
 * Query params from Microsoft:
 *   - tenant: the Azure tenant ID that granted consent
 *   - admin_consent: "True" if consent was granted
 *   - state: the CSRF token we sent
 *   - error, error_description: if consent was denied
 */
export async function GET(request: NextRequest) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const searchParams = request.nextUrl.searchParams;

    const azureTenantId = searchParams.get("tenant");
    const adminConsent = searchParams.get("admin_consent");
    const state = searchParams.get("state");
    const error = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");

    // ─── Handle Errors (admin denied consent) ────────────
    if (error) {
        console.error("Admin consent denied:", error, errorDescription);
        const errorUrl = new URL("/landing", appUrl);
        errorUrl.searchParams.set("error", "consent_denied");
        errorUrl.searchParams.set("message", errorDescription || "Admin consent was denied");
        return NextResponse.redirect(errorUrl.toString());
    }

    // ─── Validate Required Params ────────────────────────
    if (!azureTenantId || adminConsent !== "True" || !state) {
        const errorUrl = new URL("/landing", appUrl);
        errorUrl.searchParams.set("error", "invalid_response");
        return NextResponse.redirect(errorUrl.toString());
    }

    // ─── Validate CSRF State ─────────────────────────────
    const cookieStore = await cookies();
    const savedState = cookieStore.get("onboarding_state")?.value;

    if (!savedState || savedState !== state) {
        const errorUrl = new URL("/landing", appUrl);
        errorUrl.searchParams.set("error", "invalid_state");
        return NextResponse.redirect(errorUrl.toString());
    }

    // Clear the state cookie
    cookieStore.delete("onboarding_state");

    try {
        // ─── Create or Find Tenant ───────────────────────
        const [existingTenant] = await db
            .select({ id: tenants.id })
            .from(tenants)
            .where(eq(tenants.azureTenantId, azureTenantId))
            .limit(1);

        let tenantId: string;

        if (existingTenant) {
            tenantId = existingTenant.id;
        } else {
            // Create new tenant with trial status
            // We don't have the org name yet — it will be updated on first user login
            const [newTenant] = await db
                .insert(tenants)
                .values({
                    azureTenantId,
                    name: "New Organization",
                    domain: "pending",
                    status: "trial",
                })
                .returning({ id: tenants.id });

            tenantId = newTenant.id;
        }

        // ─── Run Initial Sync ────────────────────────────
        const syncResult = await performInitialSync(tenantId, azureTenantId);

        // Update tenant name/domain from synced user data if it was just created
        if (!existingTenant && syncResult.userCount > 0) {
            // Use the first synced user's email domain as the tenant domain
            const { users: usersTable } = await import("@/lib/db/schema");
            const [firstUser] = await db
                .select({ email: usersTable.email, displayName: usersTable.displayName })
                .from(usersTable)
                .where(eq(usersTable.tenantId, tenantId))
                .limit(1);

            if (firstUser?.email) {
                const domain = firstUser.email.split("@")[1] || "unknown";
                await db
                    .update(tenants)
                    .set({
                        domain,
                        name: domain.split(".")[0]?.charAt(0).toUpperCase() +
                            domain.split(".")[0]?.slice(1) || domain,
                    })
                    .where(eq(tenants.id, tenantId));
            }
        }

        // ─── Redirect to Login with Success ─────────────
        const successUrl = new URL("/login", appUrl);
        successUrl.searchParams.set("onboarded", "true");
        successUrl.searchParams.set("users", syncResult.userCount.toString());
        successUrl.searchParams.set("groups", syncResult.groupCount.toString());
        if (syncResult.error) {
            successUrl.searchParams.set("sync_warning", syncResult.error);
        }
        return NextResponse.redirect(successUrl.toString());

    } catch (err) {
        console.error("Onboarding callback error:", err);
        const errorUrl = new URL("/landing", appUrl);
        errorUrl.searchParams.set("error", "onboarding_failed");
        errorUrl.searchParams.set("message", err instanceof Error ? err.message : "Unknown error");
        return NextResponse.redirect(errorUrl.toString());
    }
}
