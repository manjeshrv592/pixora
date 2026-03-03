import { simpleParser, type ParsedMail } from "mailparser";

// ─── Compose Type Detection ─────────────────────────

export type ComposeType = "new" | "reply" | "forward";

/**
 * Detect whether an email is a new message, reply, or forward
 * based on headers and subject.
 */
export function detectComposeType(parsed: ParsedMail): ComposeType {
    // Check for reply indicators
    const inReplyTo = parsed.inReplyTo;
    const references = parsed.references;

    if (inReplyTo || (references && references.length > 0)) {
        return "reply";
    }

    // Check for forward indicators
    const subject = parsed.subject || "";
    if (/^(fw:|fwd:)/i.test(subject.trim())) {
        return "forward";
    }

    // Check Exchange-specific forward header
    const headers = parsed.headers;
    if (headers.has("x-ms-exchange-messagesentrepresentingtype")) {
        return "forward";
    }

    return "new";
}

/**
 * Check if the email has already been processed by the relay
 * to prevent double-processing loops.
 */
export function isAlreadyProcessed(parsed: ParsedMail): boolean {
    return parsed.headers.has("x-pixora-processed");
}

/**
 * Parse a raw email buffer into a structured object.
 */
export async function parseEmail(
    rawEmail: Buffer
): Promise<ParsedMail> {
    return simpleParser(rawEmail);
}

/**
 * Extract sender email address from the parsed email.
 */
export function getSenderEmail(parsed: ParsedMail): string | null {
    if (parsed.from && parsed.from.value && parsed.from.value.length > 0) {
        return parsed.from.value[0].address || null;
    }
    return null;
}
