import { loadConfig } from "./config.js";
import { createDb } from "./db/client.js";
import { createSmtpServer } from "./server.js";
import { createHealthServer } from "./health.js";

// ─── Load configuration ─────────────────────────────────
const config = loadConfig();

console.log(`
╔═══════════════════════════════════════════════════╗
║           Pixora Relay Server                     ║
╚═══════════════════════════════════════════════════╝
`);

// ─── Initialize database connection ─────────────────────
const db = config.databaseUrl ? createDb(config.databaseUrl) : null;

if (db) {
    console.log("🗄️  Database connected (Neon Postgres)");
} else {
    console.log("⚠  No database — pass-through mode (no signature injection)");
}

// ─── Start SMTP server ──────────────────────────────────
const smtpServer = createSmtpServer(config, db);

smtpServer.listen(config.smtpPort, () => {
    console.log(`📬 SMTP server listening on port ${config.smtpPort}`);
    console.log(`   Hostname: ${config.hostname}`);
    console.log(`   TLS: ${config.tls ? "enabled (STARTTLS)" : "disabled"}`);
    console.log(`   Signature injection: ${db ? "enabled" : "disabled (no DB)"}`);
    console.log(`   Environment: ${config.isProd ? "production" : "development"}`);
});

smtpServer.on("error", (err) => {
    console.error("💥 SMTP server error:", err);
});

// ─── Start health check server ──────────────────────────
const healthServer = createHealthServer(config);

healthServer.listen(config.healthPort, () => {
    console.log(`🏥 Health check at http://localhost:${config.healthPort}/health`);
});

healthServer.on("error", (err) => {
    console.error("💥 Health server error:", err);
});

// ─── Graceful shutdown ──────────────────────────────────
function shutdown(signal: string) {
    console.log(`\n🛑 ${signal} received — shutting down...`);

    smtpServer.close(() => {
        console.log("   SMTP server closed");
        healthServer.close(() => {
            console.log("   Health server closed");
            console.log("   Goodbye!");
            process.exit(0);
        });
    });

    // Force exit after 10 seconds
    setTimeout(() => {
        console.error("   ⚠ Forced exit after timeout");
        process.exit(1);
    }, 10_000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
