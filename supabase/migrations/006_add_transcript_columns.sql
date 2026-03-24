-- Migration 006: Add transcript/summary/call_type columns to campaign_call_attempts
-- Date: 2026-03-24
-- Author: Brahma
-- Reason: Backfill from Ram Navami 2026 campaign audit. VAPI API is the only
--         transcript source. These columns allow us to store transcripts in Supabase
--         so they are never lost if VAPI purges old call data.

-- Add transcript storage
ALTER TABLE campaign_call_attempts
  ADD COLUMN IF NOT EXISTS transcript  TEXT,
  ADD COLUMN IF NOT EXISTS summary     TEXT,
  ADD COLUMN IF NOT EXISTS call_type   TEXT NOT NULL DEFAULT 'outbound'
                                       CHECK (call_type IN ('outbound', 'inbound'));

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_cca_campaign_status
  ON campaign_call_attempts (campaign_id, status);

CREATE INDEX IF NOT EXISTS idx_cca_vapi_call_id
  ON campaign_call_attempts (vapi_call_id);

-- NOTE: After applying this migration, run the backfill script:
--   node scripts/backfill-transcripts-ram-navami-2026.js
-- This will populate transcript + summary for all 508 rows from the VAPI API.
