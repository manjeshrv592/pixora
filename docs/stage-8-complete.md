# Stage 8: Relay Server — Setup & Basic SMTP — Complete

**Status:** ✅ Complete  
**Date:** 2026-03-03

---

## Files Created

### 1. Config Loader — `apps/relay/src/config.ts`
- Loads environment variables with sensible defaults
- TLS certificate loading from file paths (optional for dev)
- Warns in production if TLS not configured

### 2. SMTP Server — `apps/relay/src/server.ts`
- `createSmtpServer(config)` — returns configured `SMTPServer` instance
- Uses `smtp-server` package (port 25)
- `onConnect` — logs connections, accepts all (firewall-level restriction in prod)
- `onMailFrom` / `onRcptTo` — accepts any sender/recipient
- `onData` — collects raw email stream, forwards via `forwardEmail()`
- STARTTLS enabled when TLS certs are available
- Banner: `Pixora Relay Server`
- 30MB max message size
- AUTH disabled (relay mode, not submission)

### 3. Email Forwarder — `apps/relay/src/forwarder.ts`
- `forwardEmail(rawEmail, envelopeFrom, envelopeTo)` — sends email to destination MX
- Uses `nodemailer` with `directTransport` (resolves MX records automatically)
- Pass-through only — no email modification (signature injection in Stage 9)
- Logs delivery results (accepted/rejected counts)

### 4. Health Check Server — `apps/relay/src/health.ts`
- `createHealthServer(config)` — HTTP server on port 3001
- `GET /health` or `GET /` → JSON response with status, uptime, hostname, TLS status
- All other routes → 404

### 5. Entry Point — `apps/relay/src/index.ts`
- Starts SMTP server and health check server
- ASCII banner on startup
- Logs server configuration (port, hostname, TLS, environment)
- Graceful shutdown on SIGTERM/SIGINT (10s timeout)

### 6. Package Config — `apps/relay/package.json`
- Dependencies: `smtp-server`, `nodemailer`
- Dev dependencies: `typescript`, `tsx`, `@types/node`, `@types/nodemailer`, `@types/smtp-server`
- Scripts: `dev` (tsx watch), `build` (tsc), `start` (node dist/index.js)

### 7. TypeScript Config — `apps/relay/tsconfig.json`
- Target: ES2022, Module: NodeNext
- Strict mode, source maps, declarations

### 8. Deployment Files
- `Dockerfile` — Multi-stage build (builder + Alpine production image)
- `docker-compose.yml` — Production deployment with TLS cert volume mounts
- `.env.example` — Template for all environment variables

### 9. VPS Setup Guide — `docs/relay-setup.md`
- VPS provisioning (Hetzner/DigitalOcean)
- Port 25 access request instructions
- DNS configuration (Cloudflare A record)
- Let's Encrypt TLS via Certbot
- Docker deployment and native Node.js + PM2 options
- Firewall rules (UFW)
- Testing commands (curl, swaks, telnet)
- SPF/DKIM/DMARC DNS records (overview for Stage 9)
- Monitoring setup (UptimeRobot/Better Stack)

## Files Modified

### 10. Root package.json
- Added `relay:dev`, `relay:build`, `relay:start` scripts

### 11. Stages Guide — `docs/stages.md`
- Marked Stage 8 as ✅ Complete

---

## Architecture Notes
- Relay is a standalone Node.js app at `apps/relay` — NOT part of the Next.js app
- SMTP server uses `smtp-server` package — no Postfix or system-level MTA needed
- Direct transport resolves MX records automatically — no intermediate relay
- Stage 8 is pass-through only; Stage 9 will add DB queries + signature injection
- TLS is optional for local dev, required for production
- Can run locally on port 25 (admin terminal) or 2525 (no admin needed)
- Docker + docker-compose provided for production VPS deployment

---

## Build Status
```
✓ pnpm install --filter relay (all dependencies installed)
✓ pnpm --filter relay build (tsc compiled with no errors)
```

---

## Local Development

```bash
# From monorepo root
pnpm relay:dev      # Start with tsx watch (hot reload)
pnpm relay:build    # Compile TypeScript
pnpm relay:start    # Run compiled output

# Or from apps/relay
pnpm dev
pnpm build
pnpm start
```

## What's Next (Stage 9)
- Connect relay to Neon Postgres (read rules + resources)
- Email parsing with `mailparser`
- Signature injection into email HTML body
- New vs Reply vs Forward detection
- `X-Pixora-Processed` header to prevent loops
- SPF/DKIM/DMARC DNS records
