# Temple Voice Webhook Server

Express.js server that receives real-time events from VAPI and persists call data to Supabase.

**Port:** 3200  
**Version:** 1.0.0

---

## Setup

### 1. Environment Variables

```bash
cd webhooks
cp .env.example .env
```

Edit `.env` with real values:

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: 3200) |
| `VAPI_WEBHOOK_SECRET` | Secret from VAPI dashboard → Webhooks |
| `SUPABASE_URL` | `https://wzmznkipskvjgzzagzap.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | From Supabase dashboard → Settings → API |
| `DEFAULT_ASSISTANT_ID` | Arjun's assistant ID |
| `CAMPAIGNS_DIR` | Relative path to campaigns directory |
| `CONTACTS_DIR` | Relative path to contacts directory |

### 2. Install Dependencies

```bash
npm install
```

### 3. Run the Database Migration

Go to: https://supabase.com/dashboard/project/wzmznkipskvjgzzagzap/sql  
Paste and run: `migrations/001_voice_tables.sql`

---

## Running Locally

```bash
# Production mode
npm start

# Development mode (auto-restart on file changes)
npm run dev
```

Test the health endpoint:
```bash
curl http://localhost:3200/health
```

Expected response:
```json
{"status":"ok","timestamp":"2026-03-17T...","version":"1.0.0"}
```

---

## Production Deployment (systemd)

Create `/etc/systemd/system/temple-voice-webhook.service`:

```ini
[Unit]
Description=Temple Voice Webhook Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/repos/temple-voice/webhooks
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production
EnvironmentFile=/root/repos/temple-voice/webhooks/.env

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable temple-voice-webhook
sudo systemctl start temple-voice-webhook
sudo systemctl status temple-voice-webhook
```

View logs:
```bash
sudo journalctl -u temple-voice-webhook -f
```

---

## nginx Reverse Proxy

Add to your nginx config (e.g., `/etc/nginx/sites-available/temple-voice`):

```nginx
server {
    listen 80;
    server_name voice-webhook.radhakrishnatemple.net;

    location / {
        proxy_pass http://localhost:3200;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable and get SSL:
```bash
sudo ln -s /etc/nginx/sites-available/temple-voice /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d voice-webhook.radhakrishnatemple.net
```

---

## Configure VAPI Webhook URL

1. Go to: https://dashboard.vapi.ai/account
2. Under **Webhooks**, set Server URL to: `https://voice-webhook.radhakrishnatemple.net/webhook/vapi`
3. Copy the secret and put it in `.env` as `VAPI_WEBHOOK_SECRET`

For assistant-specific webhooks (tool calls, assistant requests):
- Tool calls: `https://voice-webhook.radhakrishnatemple.net/webhook/vapi/tool-calls`
- Assistant request: `https://voice-webhook.radhakrishnatemple.net/webhook/vapi/assistant-request`

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Server health check |
| GET | `/campaign/:id/status` | Campaign call status breakdown |
| POST | `/webhook/vapi` | Main VAPI event webhook (async) |
| POST | `/webhook/vapi/tool-calls` | Tool call webhook (sync) |
| POST | `/webhook/vapi/assistant-request` | Inbound call routing (sync) |

---

## Testing with curl

```bash
# Health check
curl http://localhost:3200/health

# Campaign status
curl http://localhost:3200/campaign/2026-03-navratri/status

# Simulate end-of-call event
curl -s -X POST http://localhost:3200/webhook/vapi \
  -H "Content-Type: application/json" \
  -H "x-vapi-secret: your_secret_here" \
  -d '{
    "message": {
      "type": "end-of-call-report",
      "call": {
        "id": "test-call-123",
        "customer": {"number": "+12145551234"},
        "metadata": {"campaignId": "2026-03-navratri"}
      },
      "durationSeconds": 90,
      "artifact": {
        "transcript": "Hello, I wanted to invite you to our Navratri celebration."
      },
      "endedReason": "customer-ended-call"
    }
  }'

# Simulate tool call
curl -s -X POST http://localhost:3200/webhook/vapi/tool-calls \
  -H "Content-Type: application/json" \
  -H "x-vapi-secret: your_secret_here" \
  -d '{
    "message": {
      "type": "tool-calls",
      "toolCallList": [{
        "id": "tc-001",
        "function": {
          "name": "lookup_contact",
          "arguments": {"phone": "+12145551234"}
        }
      }]
    }
  }'
```

---

## Handlers

| File | Event Type | Description |
|------|------------|-------------|
| `handlers/end-of-call.js` | `end-of-call-report` | Logs call, detects opt-outs, updates DNC list |
| `handlers/tool-call.js` | `tool-calls` | `lookup_contact`, `confirm_attendance` |
| `handlers/assistant-request.js` | Inbound calls | Routes to correct assistant |
| `handlers/status-update.js` | `status-update` | Logs status changes to Supabase |
