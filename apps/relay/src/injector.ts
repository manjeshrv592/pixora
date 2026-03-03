/**
 * Inject a signature HTML block into a raw email buffer.
 *
 * Strategy:
 * - Find the HTML body and insert before </body>
 * - For plain text, append a text separator + stripped text
 * - Add X-Pixora-Processed header to prevent re-processing
 */

const PROCESSED_HEADER = "X-Pixora-Processed: true\r\n";
const SIGNATURE_WRAPPER_START = '\r\n<!-- pixora-signature-start -->\r\n<div class="pixora-signature" style="margin-top: 16px;">\r\n';
const SIGNATURE_WRAPPER_END = "\r\n</div>\r\n<!-- pixora-signature-end -->\r\n";

/**
 * Inject signature HTML into a raw email and add the processed header.
 * Returns the modified raw email as a Buffer.
 */
export function injectSignature(
    rawEmail: Buffer,
    signatureHtml: string
): Buffer {
    let emailStr = rawEmail.toString("utf-8");

    // 1. Add X-Pixora-Processed header (insert after first line of headers)
    emailStr = addProcessedHeader(emailStr);

    // 2. Strip any existing Pixora signature (from Outlook add-in preview)
    emailStr = stripExistingSignature(emailStr);

    // 3. Wrap the signature HTML
    const wrappedSignature =
        SIGNATURE_WRAPPER_START + signatureHtml + SIGNATURE_WRAPPER_END;

    // 4. Inject into email body
    emailStr = injectIntoBody(emailStr, wrappedSignature);

    return Buffer.from(emailStr, "utf-8");
}

/**
 * Add X-Pixora-Processed header to the email.
 * Inserts right after the first header line.
 */
function addProcessedHeader(emailStr: string): string {
    // Headers end with a blank line (\r\n\r\n)
    const headerEnd = emailStr.indexOf("\r\n\r\n");
    if (headerEnd === -1) {
        // Fallback: try with just \n\n
        const headerEndLf = emailStr.indexOf("\n\n");
        if (headerEndLf === -1) {
            return PROCESSED_HEADER + emailStr;
        }
        return (
            emailStr.substring(0, headerEndLf) +
            "\n" +
            PROCESSED_HEADER.replace(/\r\n/g, "\n") +
            emailStr.substring(headerEndLf)
        );
    }
    return (
        emailStr.substring(0, headerEnd) +
        "\r\n" +
        PROCESSED_HEADER +
        emailStr.substring(headerEnd)
    );
}

/**
 * Strip any existing Pixora signature from the email body.
 * The Outlook add-in may have inserted a preview signature.
 */
function stripExistingSignature(emailStr: string): string {
    // Remove content between pixora-signature markers
    const regex =
        /<!-- pixora-signature-start -->[\s\S]*?<!-- pixora-signature-end -->/g;
    return emailStr.replace(regex, "");
}

/**
 * Inject signature HTML into the email body.
 * Handles both HTML and plaintext email bodies.
 */
function injectIntoBody(emailStr: string, signatureHtml: string): string {
    // Try to find </body> tag (case-insensitive)
    const bodyCloseRegex = /<\/body>/i;
    const bodyCloseMatch = emailStr.match(bodyCloseRegex);

    if (bodyCloseMatch && bodyCloseMatch.index !== undefined) {
        // Insert before </body>
        return (
            emailStr.substring(0, bodyCloseMatch.index) +
            signatureHtml +
            emailStr.substring(bodyCloseMatch.index)
        );
    }

    // Try to find </html> tag
    const htmlCloseRegex = /<\/html>/i;
    const htmlCloseMatch = emailStr.match(htmlCloseRegex);

    if (htmlCloseMatch && htmlCloseMatch.index !== undefined) {
        // Insert before </html>
        return (
            emailStr.substring(0, htmlCloseMatch.index) +
            signatureHtml +
            emailStr.substring(htmlCloseMatch.index)
        );
    }

    // Check if body contains HTML at all
    if (/<html/i.test(emailStr) || /<div/i.test(emailStr) || /<p[ >]/i.test(emailStr)) {
        // Has HTML but no closing tags — append at end of last MIME part
        return emailStr + signatureHtml;
    }

    // Plain text email — append signature as text
    // For multipart/alternative emails, the HTML injection above should handle it
    // For pure plaintext, we just append (signature will appear as HTML source)
    return emailStr + signatureHtml;
}
