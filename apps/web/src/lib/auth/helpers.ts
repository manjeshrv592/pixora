import { auth } from "@/auth";
import { redirect } from "next/navigation";

/**
 * Get the current authenticated session.
 * Returns null if not authenticated.
 */
export async function getCurrentSession() {
    const session = await auth();
    return session;
}

/**
 * Require authentication. Redirects to /login if not authenticated.
 * Returns the session if authenticated.
 */
export async function requireAuth() {
    const session = await auth();
    if (!session?.user) {
        redirect("/login");
    }
    return session;
}

/**
 * Get the current tenant ID from the session.
 * Throws redirect to /login if not authenticated or no tenant.
 */
export async function getTenantId(): Promise<string> {
    const session = await requireAuth();
    if (!session.user.tenantId) {
        redirect("/login");
    }
    return session.user.tenantId;
}

/**
 * Check if the current user is a super admin.
 * Compares session email against SUPER_ADMIN_EMAILS env var (comma-separated).
 */
export async function isSuperAdmin(): Promise<boolean> {
    const session = await auth();
    if (!session?.user?.email) return false;

    const emails = (process.env.SUPER_ADMIN_EMAILS || "")
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);

    return emails.includes(session.user.email.toLowerCase());
}

/**
 * Require super admin access. Redirects to / if not authorized.
 */
export async function requireSuperAdmin() {
    const session = await requireAuth();
    const superAdmin = await isSuperAdmin();
    if (!superAdmin) {
        redirect("/");
    }
    return session;
}
