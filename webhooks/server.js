'use strict';

require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const endOfCallHandler = require('./handlers/end-of-call');
const toolCallHandler = require('./handlers/tool-call');
const assistantRequestHandler = require('./handlers/assistant-request');
const statusUpdateHandler = require('./handlers/status-update');

// ─── Config ──────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3200;
const VAPI_WEBHOOK_SECRET = process.env.VAPI_WEBHOOK_SECRET;
const VERSION = '1.0.0';

// ─── Supabase Client ──────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ─── Express App ──────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

// Request logger
app.use((req, res, next) => {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${req.method} ${req.path}`);
  next();
});

// VAPI secret validation middleware (for webhook endpoints)
function validateVapiSecret(req, res, next) {
  if (!VAPI_WEBHOOK_SECRET) {
    // If no secret configured, skip validation (dev mode)
    console.warn('[WARN] VAPI_WEBHOOK_SECRET not set — skipping auth');
    return next();
  }
  const incoming = req.headers['x-vapi-secret'];
  if (!incoming || incoming !== VAPI_WEBHOOK_SECRET) {
    console.warn('[WARN] Invalid or missing x-vapi-secret header');
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: VERSION
  });
});

// Campaign status
app.get('/campaign/:id/status', async (req, res) => {
  const campaignId = req.params.id;
  try {
    const { data, error } = await supabase
      .from('voice_campaign_contacts')
      .select('status')
      .eq('campaign_id', campaignId);

    if (error) throw error;

    const breakdown = {};
    for (const row of data) {
      breakdown[row.status] = (breakdown[row.status] || 0) + 1;
    }

    res.json({
      campaign_id: campaignId,
      total: data.length,
      breakdown,
      retrieved_at: new Date().toISOString()
    });
  } catch (err) {
    console.error('[ERROR] /campaign/:id/status:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Main VAPI webhook — async handler (respond 200 immediately, process in background)
app.post('/webhook/vapi', validateVapiSecret, async (req, res) => {
  // Respond immediately so VAPI doesn't retry
  res.status(200).json({ received: true });

  const message = req.body?.message || req.body;
  const messageType = message?.type;

  console.log(`[VAPI] message.type = ${messageType}`);

  try {
    switch (messageType) {
      case 'end-of-call-report':
        await endOfCallHandler(message, supabase);
        break;

      case 'tool-calls':
        // Tool calls need synchronous response — this async path won't work for tool-calls
        // Tool calls should come to /webhook/vapi/tool-calls instead
        console.warn('[WARN] tool-calls received on async endpoint — use /webhook/vapi/tool-calls');
        break;

      case 'status-update':
        await statusUpdateHandler(message, supabase);
        break;

      default:
        console.log(`[VAPI] Unhandled message type: ${messageType}`);
    }
  } catch (err) {
    console.error(`[ERROR] Processing webhook (type=${messageType}):`, err.message);
  }
});

// VAPI tool calls — synchronous (must return results in response)
app.post('/webhook/vapi/tool-calls', validateVapiSecret, async (req, res) => {
  const message = req.body?.message || req.body;
  try {
    const results = await toolCallHandler(message, supabase);
    res.json({ results });
  } catch (err) {
    console.error('[ERROR] tool-calls handler:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// VAPI assistant request — synchronous (inbound call routing)
app.post('/webhook/vapi/assistant-request', validateVapiSecret, async (req, res) => {
  const message = req.body?.message || req.body;
  try {
    const response = await assistantRequestHandler(message, supabase);
    res.json(response);
  } catch (err) {
    console.error('[ERROR] assistant-request handler:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Error Handler ────────────────────────────────────────────────────────────

app.use((err, req, res, next) => {
  console.error('[ERROR] Unhandled:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[Temple Voice Webhook] Server running on port ${PORT}`);
  console.log(`[Temple Voice Webhook] Health: http://localhost:${PORT}/health`);
  console.log(`[Temple Voice Webhook] VAPI secret auth: ${VAPI_WEBHOOK_SECRET ? 'ENABLED' : 'DISABLED (dev mode)'}`);
});

module.exports = app;
