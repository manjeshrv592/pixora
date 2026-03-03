import { createTransport } from "nodemailer";

/**
 * Forward raw email data to the recipient's MX server.
 * Uses nodemailer's `directTransport` which resolves MX records
 * and connects directly to the recipient's mail server on port 25.
 *
 * Stage 8: Pass-through only (no modifications).
 * Stage 9: Will inject signature before forwarding.
 */
export async function forwardEmail(
    rawEmail: Buffer,
    envelopeFrom: string,
    envelopeTo: string[]
): Promise<void> {
    // Direct transport: connects to recipient MX server directly
    const transporter = createTransport({
        direct: true,
        name: process.env.RELAY_HOSTNAME || "localhost",
    } as Parameters<typeof createTransport>[0]);

    const result = await transporter.sendMail({
        envelope: {
            from: envelopeFrom,
            to: envelopeTo,
        },
        raw: rawEmail,
    });

    console.log(
        `  📤 Delivered: messageId=${result.messageId}, accepted=${result.accepted?.length || 0}, rejected=${result.rejected?.length || 0}`
    );

    if (result.rejected && result.rejected.length > 0) {
        console.warn(`  ⚠ Rejected recipients: ${result.rejected.join(", ")}`);
    }
}
