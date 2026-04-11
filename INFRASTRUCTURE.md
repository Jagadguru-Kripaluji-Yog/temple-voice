# Temple Voice - Infrastructure Documentation

> **Last Updated:** April 11, 2026
> **Server:** Server 4 - Temple (217.77.9.66)
> **Repository:** `git@github.com:Jagadguru-Kripaluji-Yog/temple-voice.git`

---

## Overview

Temple Voice is a voice-enabled AI assistant for JKYog Temple, providing:
- **Voice interactions** via VAPI.ai telephony
- **Temple information** and event details
- **Donation processing** guidance
- **Spiritual content** and teachings

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Express.js |
| **Language** | TypeScript |
| **Database** | Supabase (PostgreSQL) |
| **Voice AI** | VAPI.ai |
| **Deployment** | systemd (not Docker) |

---

## Server 4 Environment

### Services

| Service | Status | Purpose |
|---------|--------|---------|
| temple-voice-webhook | needs attention | VAPI webhook receiver |
| supabase | degraded | Database and auth |
| affine-temple-setup | healthy | Documentation |
| strapi | healthy | Content management |

### Coolify UUIDs

| Service | UUID |
|---------|------|
| temple-voice-webhook | `yie4984dh7krue5qa1g9hpt6` |
| supabase | `kxntzvyozruw3nzu4rzkswo5` |
| affine-temple-setup | `ssw4ggocwcsscg48swkg4g44` |
| strapi | `pjk1p79gxr7x80rc7cr4aoii` |

---

## Deployment

Temple Voice uses **systemd** for deployment (not Docker/Coolify):

```bash
# Check service status
systemctl status temple-voice

# Restart service
systemctl restart temple-voice

# View logs
journalctl -u temple-voice -f
```

### Service File Location

```
/etc/systemd/system/temple-voice.service
```

---

## Required Environment Variables

```env
# Server
PORT=3000
NODE_ENV=production

# Supabase
SUPABASE_URL="https://supabase-url"
SUPABASE_ANON_KEY="eyJ..."
SUPABASE_SERVICE_ROLE_KEY="eyJ..."

# VAPI.ai
VAPI_API_KEY="..."
VAPI_ASSISTANT_ID="..."
VAPI_PHONE_NUMBER_ID="..."

# Webhook
WEBHOOK_SECRET="..."
```

---

## Database Schema

### Key Tables

| Table | Purpose |
|-------|---------|
| `calls` | Call history and transcripts |
| `intents` | Detected user intents |
| `events` | Temple events calendar |
| `donations` | Donation records |
| `contacts` | Caller information |

---

## Local Development

### Prerequisites

- Node.js >= 20
- npm or pnpm
- ngrok (for VAPI webhook testing)

### Quick Start

```bash
# Clone repository
git clone git@github.com:Jagadguru-Kripaluji-Yog/temple-voice.git
cd temple-voice

# Install dependencies
npm install

# Copy environment file
cp .env.example .env
# Edit .env with your configuration

# Start development server
npm run dev

# In another terminal, start ngrok for webhook testing
ngrok http 3000
```

### NPM Scripts

```bash
# Development
npm run dev          # Start with hot reload
npm run lint         # Run ESLint

# Build
npm run build        # Build for production
npm run start        # Start production server

# Testing
npm run test         # Run tests
```

---

## Project Structure

```
temple-voice/
├── src/
│   ├── routes/               # Express routes
│   │   ├── webhook.ts        # VAPI webhook handler
│   │   ├── events.ts         # Event endpoints
│   │   └── health.ts         # Health check
│   ├── services/
│   │   ├── vapi.ts           # VAPI integration
│   │   ├── intents.ts        # Intent handling
│   │   └── supabase.ts       # Database client
│   ├── handlers/             # Intent handlers
│   │   ├── events.ts
│   │   ├── donations.ts
│   │   └── general.ts
│   └── types/                # TypeScript definitions
├── .env.example              # Environment template
└── Dockerfile                # Container build (optional)
```

---

## VAPI Integration

### Webhook Endpoint

```
POST /api/webhook
```

Handles VAPI events:
- `call.started` - Call initiated
- `call.ended` - Call completed
- `transcript.update` - Real-time transcription
- `function.call` - Tool/function execution

### Assistant Configuration

The VAPI assistant is configured with:
- Temple information prompts
- Event lookup functions
- Donation guidance flows

---

## SSH Access (Server 4)

```bash
ssh root@217.77.9.66
# Password: See Tech Secrets
```

---

## Coolify Management

```bash
# List services on Server 4
coolify --context server4 app list

# Note: Temple Voice uses systemd, not Coolify
# Use systemctl commands instead

# For other services:
coolify --context server4 app restart kxntzvyozruw3nzu4rzkswo5  # Supabase
```

---

## Related Documentation

- **Coolify Infrastructure:** See Obsidian `Coolify-Infrastructure.md`
- **Tech Secrets:** See Obsidian `Secrets/Tech Secrets.md` for credentials
- **JKYog Client Profile:** See Obsidian `Clients/JKYog/`

---

*Document created April 11, 2026 for AI agent infrastructure context.*
