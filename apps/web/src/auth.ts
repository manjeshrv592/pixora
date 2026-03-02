import NextAuth from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { db } from "@/lib/db/client";
import { tenants } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const { handlers, signIn, signOut, auth } = NextAuth({
    providers: [
        MicrosoftEntraID({
            clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
            clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
            issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
            authorization: {
                params: {
                    scope: "openid profile email User.Read",
                },
            },
        }),
    ],
    pages: {
        signIn: "/login",
    },
    callbacks: {
        async signIn({ account, profile }) {
            if (!account || !profile) return false;

            // Extract Azure tenant ID from the token
            const azureTenantId = (profile as Record<string, unknown>).tid as string;
            if (!azureTenantId) return false;

            try {
                // Check if tenant already exists
                const existingTenant = await db
                    .select()
                    .from(tenants)
                    .where(eq(tenants.azureTenantId, azureTenantId))
                    .limit(1);

                if (existingTenant.length === 0) {
                    // Auto-create tenant on first login
                    const email = profile.email as string;
                    const domain = email?.split("@")[1] || "unknown";
                    const name =
                        (profile as Record<string, unknown>).name as string ||
                        domain;

                    await db.insert(tenants).values({
                        azureTenantId,
                        name,
                        domain,
                        status: "trial",
                    });
                }
            } catch (error) {
                console.error("Error during tenant creation:", error);
                return false;
            }

            return true;
        },

        async jwt({ token, account, profile }) {
            if (account && profile) {
                const azureTenantId = (profile as Record<string, unknown>)
                    .tid as string;
                token.azureTenantId = azureTenantId;

                // Look up our internal tenant ID
                const tenant = await db
                    .select({ id: tenants.id })
                    .from(tenants)
                    .where(eq(tenants.azureTenantId, azureTenantId))
                    .limit(1);

                if (tenant.length > 0) {
                    token.tenantId = tenant[0].id;
                }
            }
            return token;
        },

        async session({ session, token }) {
            if (token.tenantId) {
                session.user.tenantId = token.tenantId as string;
            }
            if (token.azureTenantId) {
                session.user.azureTenantId = token.azureTenantId as string;
            }
            return session;
        },
    },
});
