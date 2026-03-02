import { DefaultSession } from "next-auth";

declare module "next-auth" {
    interface Session {
        user: {
            tenantId: string;
            azureTenantId: string;
        } & DefaultSession["user"];
    }
}

declare module "next-auth/jwt" {
    interface JWT {
        tenantId?: string;
        azureTenantId?: string;
    }
}
