import { NextResponse } from "next/server";
import { cookies } from "next/headers";

/**
 * GET /api/onboarding/consent
 * 
 * Redirects the user to Microsoft's admin consent endpoint.
 * This is the entry point for the self-service onboarding flow.
 * The client org's admin clicks "Connect to Microsoft 365" on the landing page,
 * which points here. We redirect them to Microsoft to approve permissions.
 */
export async function GET() {
    const clientId = process.env.AUTH_MICROSOFT_ENTRA_ID_ID;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    if (!clientId) {
        return NextResponse.json(
            { error: "Server misconfiguration: missing Azure client ID" },
            { status: 500 }
        );
    }

    // Generate CSRF state token
    const state = crypto.randomUUID();

    // Store state in a cookie for validation in the callback
    const cookieStore = await cookies();
    cookieStore.set("onboarding_state", state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 600, // 10 minutes
        path: "/",
    });

    const redirectUri = `${appUrl}/api/onboarding/callback`;

    const consentUrl = new URL("https://login.microsoftonline.com/common/adminconsent");
    consentUrl.searchParams.set("client_id", clientId);
    consentUrl.searchParams.set("redirect_uri", redirectUri);
    consentUrl.searchParams.set("state", state);

    return NextResponse.redirect(consentUrl.toString());
}
