import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { RelayConfig } from "./config.js";

const startTime = Date.now();

/**
 * Creates a minimal HTTP health check server on the configured port.
 * Used by monitoring tools (UptimeRobot, Better Stack) and load balancers.
 */
export function createHealthServer(config: RelayConfig) {
    const server = createServer(
        (req: IncomingMessage, res: ServerResponse) => {
            if (req.url === "/health" || req.url === "/") {
                const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
                const body = JSON.stringify({
                    status: "ok",
                    service: "pixora-relay",
                    hostname: config.hostname,
                    uptime: uptimeSeconds,
                    smtpPort: config.smtpPort,
                    tls: config.tls !== null,
                    timestamp: new Date().toISOString(),
                });

                res.writeHead(200, {
                    "Content-Type": "application/json",
                    "Cache-Control": "no-cache",
                });
                res.end(body);
            } else {
                res.writeHead(404, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Not found" }));
            }
        }
    );

    return server;
}
