-- Migration 003: Webhook Safety Net
-- Raw webhook event log — no FK constraints, never fails to write.
-- This is the "black box flight recorder" for all VAPI events.
-- Even if campaign FK fails, upserts fail, or code crashes — raw payload is safe here.
-- Run against: JKYog Prod Supabase

CREATE TABLE IF NOT EXISTS voice_webhook_raw (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  vapi_call_id text,
  message_type text,                        -- 'status-update', 'end-of-call-report', etc.
  campaign_id  text,                        -- plain text, NO FK — intentional
  payload      jsonb       NOT NULL,        -- full raw VAPI payload
  received_at  timestamptz DEFAULT now()
);

-- Index for call-level lookups (replay, debug)
CREATE INDEX IF NOT EXISTS idx_vwr_call_id   ON voice_webhook_raw (vapi_call_id);
-- Index for time-range queries (audits, monitoring)
CREATE INDEX IF NOT EXISTS idx_vwr_received  ON voice_webhook_raw (received_at);
-- Index for type-based filtering
CREATE INDEX IF NOT EXISTS idx_vwr_type      ON voice_webhook_raw (message_type);
