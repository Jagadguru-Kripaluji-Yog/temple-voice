# Temple Voice Platform 🪷

AI-powered outreach platform for Radha Krishna Temple of Dallas (RKT) / JKYog.  
Uses VAPI voice agents to invite the community to temple events and festivals.

---

## Purpose

Temple Voice automates outreach calls using conversational AI voice agents. Instead of manual phone trees, volunteers upload a contact list, run a script, and the platform handles calling — with warm, devotional personas that represent the temple community authentically.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Temple Voice Platform                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │  assistants/ │    │  campaigns/  │    │    contacts/     │  │
│  │              │    │              │    │                  │  │
│  │  arjun/      │    │  navratri/   │    │  do-not-call.csv │  │
│  │  _template/  │    │  _template/  │    │                  │  │
│  └──────┬───────┘    └──────┬───────┘    └────────┬─────────┘  │
│         │                  │                      │            │
│         └──────────────────┼──────────────────────┘            │
│                            │                                   │
│                    ┌───────▼──────┐                            │
│                    │   scripts/   │                            │
│                    │              │                            │
│                    │ launch-      │                            │
│                    │ campaign.js  │                            │
│                    │ validate-    │                            │
│                    │ contacts.js  │                            │
│                    │ report.js    │                            │
│                    └───────┬──────┘                            │
│                            │                                   │
│              ┌─────────────▼───────────────┐                  │
│              │         VAPI API             │                  │
│              │  POST /call (batch)          │                  │
│              └─────────────┬───────────────┘                  │
│                            │                                   │
│              ┌─────────────▼───────────────┐                  │
│              │      Voice Calls go out      │                  │
│              │  Agent: Arjun (or others)    │                  │
│              └─────────────┬───────────────┘                  │
│                            │                                   │
│              ┌─────────────▼───────────────┐                  │
│              │    webhooks/server.js        │                  │
│              │    (port 3200)               │                  │
│              │                             │                  │
│              │  POST /webhook/vapi          │                  │
│              │  GET  /health                │                  │
│              │  GET  /campaign/:id/status   │                  │
│              └─────────────┬───────────────┘                  │
│                            │                                   │
│              ┌─────────────▼───────────────┐                  │
│              │         Supabase             │                  │
│              │  voice_campaign_contacts     │                  │
│              │  voice_call_log              │                  │
│              └─────────────────────────────┘                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## How to Add a New Voice Assistant

1. **Copy the template:**
   ```bash
   cp -r assistants/_template assistants/yourname
   ```

2. **Write the system prompt** in `assistants/yourname/system-prompt.md`

3. **Edit `config.json`** with real values (name, firstMessage, voicemailMessage, etc.)

4. **Create via VAPI API:**
   ```bash
   curl -s -X POST https://api.vapi.ai/assistant \
     -H "Authorization: Bearer $VAPI_API_KEY" \
     -H "Content-Type: application/json" \
     -d @assistants/yourname/config.json > /tmp/created.json
   
   # Copy the returned ID into config.json
   cat /tmp/created.json | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['id'])"
   ```

5. **Assign to a phone number:**
   ```bash
   curl -s -X PATCH https://api.vapi.ai/phone-number/PHONE_NUMBER_ID \
     -H "Authorization: Bearer $VAPI_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"assistantId": "YOUR_ASSISTANT_ID"}'
   ```

6. **Create `CHANGELOG.md`** documenting what you built and why.

7. **Commit** everything.

See `assistants/_template/README.md` for full step-by-step.

---

## How to Run a Campaign

### 1. Prepare contacts
```bash
# Validate and clean your CSV first
node scripts/validate-contacts.js my-contacts.csv

# This outputs my-contacts-cleaned.csv — use this for the campaign
```

### 2. Add contacts to campaign
```bash
cp my-contacts-cleaned.csv campaigns/2026-03-navratri/contacts.csv
```

### 3. Launch
```bash
# Loads contacts to Supabase, checks DNC list, fires calls via VAPI
node scripts/launch-campaign.js 2026-03-navratri
```

### 4. Monitor
```bash
# Check live status via webhook server
curl http://localhost:3200/campaign/2026-03-navratri/status

# Or run the report script
node scripts/report.js 2026-03-navratri
```

### 5. Review results
- Call logs: `campaigns/2026-03-navratri/results/calls.jsonl`
- Opt-outs: `campaigns/2026-03-navratri/results/opt-outs.csv`
- Summary: `campaigns/2026-03-navratri/results/summary.md` (after running report.js)

---

## How to Deploy the Webhook Server

The webhook server receives real-time events from VAPI (call ended, status updates, tool calls, etc.).

```bash
cd webhooks
cp .env.example .env
# Edit .env with real values

npm install
npm start
```

For production deployment, see `webhooks/README.md` for:
- systemd service setup
- nginx reverse proxy config
- VAPI webhook URL configuration

---

## Multi-Agent Usage

The platform is designed to support multiple voice agents for different purposes:

| Agent | Purpose | Status |
|-------|---------|--------|
| Arjun | Festival/event outreach calls | ✅ Active |
| _(future)_ | Hindi-language calls | Planned |
| _(future)_ | Seva volunteer recruitment | Planned |
| _(future)_ | Donation follow-up | Planned |

Each agent lives in `assistants/<name>/` with its own config, system prompt, and changelog.

---

## Directory Structure

```
temple-voice/
├── README.md                          # This file
├── assistants/
│   ├── _template/                     # Blueprint for new assistants
│   │   ├── config.json
│   │   └── README.md
│   └── arjun/                         # Active festival outreach agent
│       ├── config.json                # Live VAPI config (with ID)
│       ├── system-prompt.md           # Human-readable system prompt
│       ├── CHANGELOG.md               # Version history
│       └── versions/                  # Snapshots of past configs
│           └── 2026-03-17-initial.json
├── campaigns/
│   ├── _template/                     # Blueprint for new campaigns
│   └── 2026-03-navratri/              # Chaitra Navratri 2026
│       ├── campaign.json              # Config (assistant, phone, window)
│       ├── contacts.csv               # Upload your contact list here
│       ├── README.md
│       └── results/                   # Call logs, opt-outs, summaries
│           ├── calls.jsonl
│           ├── opt-outs.csv
│           └── summary.md
├── contacts/
│   ├── do-not-call.csv                # Global DNC list (append-only)
│   └── README.md
├── webhooks/
│   ├── server.js                      # Express webhook server (port 3200)
│   ├── package.json
│   ├── .env.example
│   ├── README.md
│   ├── handlers/
│   │   ├── end-of-call.js
│   │   ├── tool-call.js
│   │   ├── assistant-request.js
│   │   └── status-update.js
│   └── migrations/
│       └── 001_voice_tables.sql       # Run once in Supabase SQL editor
└── scripts/
    ├── launch-campaign.js             # Fire calls for a campaign
    ├── validate-contacts.js           # Clean/normalize contact CSV
    ├── report.js                      # Generate campaign summary
    ├── package.json
    └── README.md
```

---

## Key IDs and Endpoints

| Resource | Value |
|----------|-------|
| Arjun assistant ID | `11325470-888c-48dd-a76e-eaeb5522bb7d` |
| Prod phone number | `+14697951551` |
| Phone number ID | `9bbf1477-f0ca-4903-89bd-1101df90d511` |
| Supabase project | `wzmznkipskvjgzzagzap` |
| Webhook port | `3200` |
| VAPI dashboard | https://dashboard.vapi.ai |
| Supabase dashboard | https://supabase.com/dashboard/project/wzmznkipskvjgzzagzap |

---

## Built By

🪷 **Brahma** — Principal Engineer, Confer Solutions AI  
For **Radha Krishna Temple of Dallas (JKYog)**  
Initial build: 2026-03-17
