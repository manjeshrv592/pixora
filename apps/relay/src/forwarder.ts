import { createTransport } from "nodemailer";
import dns from "dns/promises";

/**
 * Forward raw email data to the recipient's MX server.
 * Resolves MX records for the recipient domain and connects
 * directly to their mail server on port 25.
 */
export async function forwardEmail(
    rawEmail: Buffer,
    envelopeFrom: string,
    envelopeTo: string[]
): Promise<void> {
    const hostname = process.env.RELAY_HOSTNAME || "localhost";

    for (const recipient of envelopeTo) {
        const domain = recipient.split("@")[1];
        if (!domain) {
            console.warn(`  ⚠ Invalid recipient (no domain): ${recipient}`);
            continue;
        }

        // Resolve MX records for recipient domain
        let mxHost: string;
        try {
            const mxRecords = await dns.resolveMx(domain);
            // Sort by priority (lowest = highest priority)
            mxRecords.sort((a, b) => a.priority - b.priority);
            mxHost = mxRecords[0].exchange;
            console.log(`  🔍 MX for ${domain}: ${mxHost} (priority ${mxRecords[0].priority})`);
        } catch {
            // Fallback: try the domain itself as mail server
            console.warn(`  ⚠ No MX record for ${domain} — trying domain directly`);
            mxHost = domain;
        }

        // Create SMTP transport to recipient's mail server
        const transporter = createTransport({
            host: mxHost,
            port: 25,
            secure: false,
            name: hostname,
            tls: {
                rejectUnauthorized: false, // Accept any cert from recipient MX
            },
            connectionTimeout: 30000,
            greetingTimeout: 30000,
            socketTimeout: 60000,
        });

        const result = await transporter.sendMail({
            envelope: {
                from: envelopeFrom,
                to: [recipient],
            },
            raw: rawEmail,
        });

        console.log(
            `  📤 Delivered to ${recipient}: messageId=${result.messageId}, accepted=${result.accepted?.length || 0}, rejected=${result.rejected?.length || 0}`
        );

        if (result.rejected && result.rejected.length > 0) {
            console.warn(`  ⚠ Rejected: ${result.rejected.join(", ")}`);
        }
    }
}

