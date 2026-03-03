import { SMTPServer } from "smtp-server";
import type { RelayConfig } from "./config.js";
import type { RelayDb } from "./db/client.js";
import { forwardEmail } from "./forwarder.js";
import { parseEmail, detectComposeType, isAlreadyProcessed, getSenderEmail } from "./parser.js";
import { buildSignatureForEmail } from "./signature-builder.js";
import { injectSignature } from "./injector.js";

/**
 * Creates and returns the SMTP server instance.
 * Receives emails, injects signature, and forwards to recipient MX.
 */
export function createSmtpServer(config: RelayConfig, db: RelayDb | null): SMTPServer {
    const serverOptions: ConstructorParameters<typeof SMTPServer>[0] = {
        name: config.hostname,
        banner: "Pixora Relay Server",
        size: 30 * 1024 * 1024, // 30 MB max message size
        disabledCommands: ["AUTH"],
        authOptional: true,

        // ─── Connection handler ─────────────────────────
        onConnect(session, callback) {
            console.log(
                `📨 Connection from ${session.remoteAddress}:${session.remotePort}`
            );
            callback();
        },

        // ─── MAIL FROM handler ──────────────────────────
        onMailFrom(address, session, callback) {
            console.log(`  From: ${address.address}`);
            callback();
        },

        // ─── RCPT TO handler ────────────────────────────
        onRcptTo(address, session, callback) {
            console.log(`  To: ${address.address}`);
            callback();
        },

        // ─── DATA handler ───────────────────────────────
        onData(stream, session, callback) {
            const chunks: Buffer[] = [];

            stream.on("data", (chunk: Buffer) => {
                chunks.push(chunk);
            });

            stream.on("end", async () => {
                let rawEmail: Buffer = Buffer.concat(chunks);
                const envelopeFrom = session.envelope.mailFrom
                    ? session.envelope.mailFrom.address
                    : "";
                const envelopeTo = session.envelope.rcptTo.map((r) => r.address);

                console.log(
                    `  📧 Received ${rawEmail.length} bytes from ${envelopeFrom} → ${envelopeTo.join(", ")}`
                );

                try {
                    // ─── Signature Injection Pipeline ───────────
                    if (db) {
                        rawEmail = await processSignature(db, rawEmail, envelopeFrom) as Buffer;
                    } else {
                        console.log(`  ⚠ No DB connection — pass-through mode`);
                    }

                    // ─── Forward ───────────────────────────────
                    await forwardEmail(rawEmail, envelopeFrom, envelopeTo);
                    console.log(`  ✅ Forwarded successfully`);
                    callback();
                } catch (err) {
                    console.error(`  ❌ Forward failed:`, err);
                    callback(new Error("Failed to forward email — please retry"));
                }
            });

            stream.on("error", (err) => {
                console.error("  ❌ Stream error:", err);
                callback(new Error("Stream error"));
            });
        },

        // ─── Close handler ──────────────────────────────
        onClose(session) {
            console.log(`📪 Connection closed from ${session.remoteAddress}`);
        },
    };

    // TLS support
    if (config.tls) {
        serverOptions.secure = false;
        serverOptions.key = config.tls.key;
        serverOptions.cert = config.tls.cert;
        console.log("🔒 STARTTLS enabled");
    } else {
        serverOptions.disabledCommands = ["AUTH", "STARTTLS"];
        console.log("⚠ Running without TLS (ok for development)");
    }

    return new SMTPServer(serverOptions);
}

// ─── Signature Processing ───────────────────────────

async function processSignature(
    db: RelayDb,
    rawEmail: Buffer,
    envelopeFrom: string
): Promise<Buffer> {
    // 1. Parse the email to inspect headers
    const parsed = await parseEmail(rawEmail);

    // 2. Check if already processed (prevent loops)
    if (isAlreadyProcessed(parsed)) {
        console.log(`  ⏭ Already processed — skipping signature injection`);
        return rawEmail;
    }

    // 3. Get sender email
    const senderEmail = getSenderEmail(parsed) || envelopeFrom;
    if (!senderEmail) {
        console.log(`  ⚠ No sender email found — skipping`);
        return rawEmail;
    }

    // 4. Build signature for this sender
    const result = await buildSignatureForEmail(db, senderEmail);
    if (!result) {
        console.log(`  ⚠ No signature found for ${senderEmail} — pass-through`);
        return rawEmail;
    }

    // 5. Check compose type vs settings
    const composeType = detectComposeType(parsed);
    console.log(`  📝 Compose type: ${composeType}, Template: ${result.templateName}`);

    const shouldInject =
        (composeType === "new" && result.settings.addToNew) ||
        (composeType === "reply" && result.settings.addToReplies) ||
        (composeType === "forward" && result.settings.addToForwards);

    if (!shouldInject) {
        console.log(`  ⏭ Signature disabled for ${composeType} — skipping`);
        return rawEmail;
    }

    // 6. Inject signature
    console.log(`  ✨ Injecting signature for ${senderEmail}`);
    return injectSignature(rawEmail, result.html);
}
