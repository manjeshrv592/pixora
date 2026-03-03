import { readFileSync, existsSync } from "node:fs";

export interface RelayConfig {
    hostname: string;
    smtpPort: number;
    healthPort: number;
    databaseUrl: string | null;
    tls: {
        key: string;
        cert: string;
    } | null;
    isProd: boolean;
}

export function loadConfig(): RelayConfig {
    const env = process.env;

    const hostname = env.RELAY_HOSTNAME || "localhost";
    const smtpPort = parseInt(env.SMTP_PORT || "25", 10);
    const healthPort = parseInt(env.HEALTH_PORT || "3001", 10);
    const isProd = env.NODE_ENV === "production";
    const databaseUrl = env.DATABASE_URL || null;

    if (!databaseUrl) {
        console.warn(
            "⚠ DATABASE_URL not set — running in pass-through mode (no signature injection)"
        );
    }

    // Load TLS certs if paths are provided
    let tls: RelayConfig["tls"] = null;
    const keyPath = env.TLS_KEY_PATH;
    const certPath = env.TLS_CERT_PATH;

    if (keyPath && certPath) {
        if (!existsSync(keyPath)) {
            console.warn(`⚠ TLS key not found at ${keyPath} — running without TLS`);
        } else if (!existsSync(certPath)) {
            console.warn(
                `⚠ TLS cert not found at ${certPath} — running without TLS`
            );
        } else {
            tls = {
                key: readFileSync(keyPath, "utf-8"),
                cert: readFileSync(certPath, "utf-8"),
            };
            console.log("🔒 TLS certificates loaded");
        }
    } else if (isProd) {
        console.warn(
            "⚠ Production mode without TLS — set TLS_KEY_PATH and TLS_CERT_PATH"
        );
    }

    return { hostname, smtpPort, healthPort, databaseUrl, tls, isProd };
}
