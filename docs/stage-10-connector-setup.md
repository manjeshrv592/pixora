# Stage 10: M365 Connector Setup Guide

**Goal:** Route all outbound email from your M365 tenant through your Pixora relay server (`103.6.168.17`) so signatures get injected automatically.

---

## Prerequisites

- ✅ Relay server running at `103.6.168.17:25` (health: `http://relay.simtech.one:3001/health`)
- ✅ Port 25 open on the server
- ⬜ Exchange Online PowerShell module installed on your Windows machine

---

## Step 1: Install Exchange Online PowerShell Module

Open **PowerShell as Administrator** on your Windows machine and run:

```powershell
Install-Module -Name ExchangeOnlineManagement -Force -AllowClobber
```

---

## Step 2: Connect to Exchange Online

```powershell
Import-Module ExchangeOnlineManagement
Connect-ExchangeOnline -UserPrincipalName admin@pixora365.onmicrosoft.com
```

This will open a browser window — sign in with your M365 admin account.

---

## Step 3: Create the Outbound Connector (Send Connector)

This tells M365: "Send all outbound email through my relay server."

```powershell
New-OutboundConnector `
    -Name "Pixora Relay Outbound" `
    -ConnectorType "Partner" `
    -SmartHosts "103.6.168.17" `
    -TlsSettings "EncryptionOnly" `
    -UseMXRecord $false `
    -IsTransportRuleScoped $true `
    -Enabled $true `
    -Comment "Routes outbound email through Pixora relay for signature injection"
```

> **Why "Partner" type?** Exchange Online only allows "Partner" or "OnPremises" for outbound connectors. Partner works for any external SMTP server.

> **Why TlsSettings "EncryptionOnly"?** Your relay uses a Let's Encrypt cert for STARTTLS. "EncryptionOnly" means it will use TLS but won't validate the certificate name against the smart host (since we're using an IP address, not a domain name).

---

## Step 4: Create the Transport Rule

This tells M365: "Route emails through the outbound connector, BUT skip emails that already have the `X-Pixora-Processed` header (to prevent loops when the relay forwards the email back)."

```powershell
New-TransportRule `
    -Name "Route through Pixora Relay" `
    -Enabled $true `
    -SentToScope "NotInOrganization" `
    -ExceptIfHeaderContainsMessageHeader "X-Pixora-Processed" `
    -ExceptIfHeaderContainsWords "true" `
    -RouteMessageOutboundConnector "Pixora Relay Outbound" `
    -Priority 0 `
    -Comments "Routes external emails through Pixora relay for signature injection. Skips already-processed emails."
```

> **Key details:**
> - `SentToScope "NotInOrganization"` — only routes external emails (internal emails between your M365 users won't go through the relay)
> - The `ExceptIfHeader` clause prevents infinite loops — your relay adds `X-Pixora-Processed: true` header after injecting the signature

---

## Step 5: Verify the Setup

Run these commands to confirm everything was created correctly:

```powershell
# Check the outbound connector
Get-OutboundConnector -Identity "Pixora Relay Outbound" | Format-List Name, SmartHosts, TlsSettings, IsTransportRuleScoped, Enabled

# Check the transport rule
Get-TransportRule -Identity "Route through Pixora Relay" | Format-List Name, State, SentToScope, RouteMessageOutboundConnector
```

---

## Step 6: Disconnect

```powershell
Disconnect-ExchangeOnline -Confirm:$false
```

---

## Step 7: Test End-to-End

1. Wait **5-10 minutes** for M365 to propagate the connector and rule
2. Send an email from `admin@pixora365.onmicrosoft.com` to your personal Gmail
3. Check the received email — it should now have the Pixora signature injected
4. Check the email headers in Gmail (three dots → "Show original") — look for:
   - `X-Pixora-Processed: true` header
   - `Received: from` should show your relay server IP

---

## Troubleshooting

| Issue | Check |
|---|---|
| Email still arrives without signature | Wait 10 min for rule propagation. Check relay logs: `docker compose logs -f` |
| Email doesn't arrive at all | Check relay server is accepting connections: `telnet 103.6.168.17 25` |
| Email arrives but lands in spam | Expected without rDNS — will be fixed once PTR record is set up |
| Relay logs show "no user found" | Make sure the sender email exists in the Pixora database (synced users) |
| Loop / duplicate emails | Verify transport rule has the `X-Pixora-Processed` exception |

---

## Quick Summary

```
M365 user sends email
     │
     ▼
Transport Rule matches (external recipient + no X-Pixora-Processed header)
     │
     ▼
Outbound Connector routes to 103.6.168.17:25 (STARTTLS)
     │
     ▼
Pixora Relay receives email
  → Looks up sender in DB
  → Resolves rules → builds signature HTML
  → Injects signature into email body
  → Adds X-Pixora-Processed: true header
  → Forwards to final recipient via direct SMTP
     │
     ▼
Recipient receives email WITH signature ✅
```
