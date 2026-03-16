# Relay Server — VPS Setup Guide

Step-by-step guide to deploy the Pixora Relay Server on a VPS.

---

## 1. Provision a VPS

**Recommended:** Hetzner CX22 (2 vCPU, 4GB RAM, $4.50/mo) or DigitalOcean Basic ($6/mo)

1. Create an Ubuntu 22.04 LTS server
2. Add your SSH key during provisioning
3. **Submit a support ticket to enable port 25** (inbound + outbound)
   - Explain: "Email signature relay server — not bulk mailing"
   - Hetzner: Usually approved within 24 hours
   - DigitalOcean: May take 1-3 business days

---

## 2. DNS Configuration (Cloudflare)

Add these DNS records:

| Type | Name | Value | Proxy |
|------|------|-------|-------|
| A | `relay` | `YOUR_VPS_IP` | DNS only (gray cloud) |
| MX | `relay` | `relay.simtech.one` | — |

> [!IMPORTANT]
> **DO NOT** proxy the relay subdomain through Cloudflare (orange cloud). SMTP traffic must go directly to the VPS IP.

---

## 3. Initial Server Setup

```bash
# SSH into your VPS
ssh root@YOUR_VPS_IP

# Update packages
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh

# Install Docker Compose
apt install docker-compose-plugin -y

# Verify
docker --version
docker compose version
```

---

## 4. Firewall (UFW)

```bash
ufw allow 22/tcp      # SSH
ufw allow 25/tcp      # SMTP
ufw allow 3001/tcp    # Health check
ufw allow 80/tcp      # Certbot HTTP challenge
ufw allow 443/tcp     # HTTPS (optional, for future use)
ufw enable
ufw status
```

---

## 5. TLS Certificate (Let's Encrypt)

```bash
# Install certbot
apt install certbot -y

# Get certificate (standalone mode — stops any service on port 80)
certbot certonly --standalone -d relay.simtech.one --agree-tos -m your@email.com

# Certificate files will be at:
# /etc/letsencrypt/live/relay.simtech.one/privkey.pem
# /etc/letsencrypt/live/relay.simtech.one/fullchain.pem

# Auto-renew (certbot installs a systemd timer by default)
certbot renew --dry-run
```

---

## 6. Deploy the Relay

### Option A: Docker (Recommended)

```bash
# Clone the repo (or copy the relay files)
mkdir -p /opt/pixora-relay
cd /opt/pixora-relay

# Copy files from apps/relay/ to this directory:
# - Dockerfile
# - docker-compose.yml
# - package.json
# - tsconfig.json
# - src/

# Create .env file
cp .env.example .env
nano .env
# Set:
#   RELAY_HOSTNAME=relay.simtech.one
#   SMTP_PORT=25
#   HEALTH_PORT=3001
#   NODE_ENV=production
#   (TLS paths are set in docker-compose.yml)

# Build and start
docker compose up -d --build

# Check logs
docker compose logs -f

# Verify health
curl http://localhost:3001/health
```

### Option B: Native Node.js + PM2

```bash
# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install nodejs -y

# Install PM2
npm install -g pm2

# Deploy
cd /opt/pixora-relay
npm install
npm run build

# Create .env
cp .env.example .env
nano .env
# Set RELAY_HOSTNAME, SMTP_PORT, TLS paths, NODE_ENV=production

# Start with PM2
pm2 start dist/index.js --name pixora-relay
pm2 save
pm2 startup

# Check logs
pm2 logs pixora-relay
```

---

## 7. Test the Relay

### Health Check
```bash
curl http://relay.simtech.one:3001/health
# Expected: {"status":"ok","service":"pixora-relay",...}
```

### SMTP Test (requires `swaks`)
```bash
# From another machine or the VPS itself
apt install swaks -y

swaks --to test@example.com \
      --from test@relay.simtech.one \
      --server relay.simtech.one \
      --port 25
```

### Telnet Test
```bash
telnet relay.simtech.one 25
# Should see: 220 relay.simtech.one ESMTP Pixora Relay Server
```

---

## 8. DNS Records for Email (Stage 9 Prep)

These will be needed when we set up M365 connectors in Stage 9-10:

| Type | Name | Value |
|------|------|-------|
| TXT (SPF) | `relay.simtech.one` | `v=spf1 ip4:YOUR_VPS_IP -all` |
| TXT (DKIM) | Set up later | DKIM signing in Stage 9 |
| TXT (DMARC) | `_dmarc.relay` | `v=DMARC1; p=none; rua=mailto:dmarc@pixora.com` |

---

## 9. Monitoring

Set up a health check monitor at [UptimeRobot](https://uptimerobot.com) or [Better Stack](https://betterstack.com):

- **URL**: `http://relay.simtech.one:3001/health`
- **Interval**: 5 minutes
- **Alert**: Email or Slack notification on failure
