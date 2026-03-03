import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { buildSignatureByEmail } from "@/lib/signature-builder";

export async function GET(request: NextRequest) {
    const email = request.nextUrl.searchParams.get("email");

    if (!email) {
        return NextResponse.json(
            { error: "Missing required parameter: email" },
            { status: 400 }
        );
    }

    try {
        // Find user by email to get their tenant
        const [user] = await db
            .select({
                id: users.id,
                tenantId: users.tenantId,
            })
            .from(users)
            .where(eq(users.email, email))
            .limit(1);

        if (!user) {
            return NextResponse.json(
                { error: "User not found" },
                { status: 404 }
            );
        }

        const result = await buildSignatureByEmail(email, user.tenantId);

        if (!result) {
            return NextResponse.json(
                { error: "Could not build signature. No default template found." },
                { status: 404 }
            );
        }

        // Return rendered HTML
        return new NextResponse(result.html, {
            status: 200,
            headers: {
                "Content-Type": "text/html; charset=utf-8",
                "Cache-Control": "public, max-age=300, s-maxage=300",
            },
        });
    } catch (error) {
        console.error("Signature API error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
