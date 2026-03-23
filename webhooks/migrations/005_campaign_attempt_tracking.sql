-- ============================================================
-- Temple Voice Platform — Migration 005
-- Campaign attempt tracking for full historical reporting
--
-- Purpose: Track every call attempt per contact per campaign,
-- with retry support. Answers questions like:
--   "How did Ram Navami 2026 go, a month later?"
--   "Who never answered across all 3 retry attempts?"
--   "What was the final outcome for +14699457356?"
--
-- Executed by: Brahma 🪷 — 2026-03-23
-- ============================================================

BEGIN;

-- ── campaign_call_attempts ────────────────────────────────────────────────────
-- One row per call attempt. Multiple rows per phone (one per retry).
-- This is the atomic unit of campaign tracking.

CREATE TABLE IF NOT EXISTS campaign_call_attempts (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id     TEXT NOT NULL,               -- e.g. 'ram-navami-2026-0323'
  phone           TEXT NOT NULL,               -- E.164
  attempt_number  INTEGER NOT NULL DEFAULT 1,  -- 1 = first try, 2 = first retry, etc.
  vapi_call_id    TEXT,                        -- VAPI call ID (filled when available)
  status          TEXT NOT NULL DEFAULT 'submitted'
                  CHECK (status IN (
                    'submitted',     -- sent to VAPI, awaiting result
                    'answered',      -- customer picked up and had conversation
                    'voicemail',     -- went to voicemail / silence timeout
                    'no-answer',     -- rang but no pickup
                    'busy',          -- line was busy
                    'failed',        -- technical failure (Deepgram, Twilio, etc.)
                    'not-called'     -- skipped / DNC
                  )),
  ended_reason    TEXT,                        -- raw VAPI endedReason
  duration_sec    INTEGER DEFAULT 0,           -- call duration in seconds
  submitted_at    TIMESTAMPTZ DEFAULT NOW(),   -- when we sent to VAPI
  ended_at        TIMESTAMPTZ,                 -- when call completed
  notes           TEXT,                        -- any human or system notes
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(campaign_id, phone, attempt_number)   -- no duplicate attempts
);

CREATE INDEX IF NOT EXISTS idx_cca_campaign_id    ON campaign_call_attempts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_cca_phone          ON campaign_call_attempts(phone);
CREATE INDEX IF NOT EXISTS idx_cca_status         ON campaign_call_attempts(status);
CREATE INDEX IF NOT EXISTS idx_cca_vapi_call_id   ON campaign_call_attempts(vapi_call_id);

-- ── campaign_summaries ────────────────────────────────────────────────────────
-- One row per campaign attempt round. Updated after each attempt batch.

CREATE TABLE IF NOT EXISTS campaign_summaries (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id         TEXT NOT NULL,
  attempt_number      INTEGER NOT NULL DEFAULT 1,
  attempt_label       TEXT,                    -- e.g. 'Initial Run', 'Retry 1 - No Answer', 'Retry 2 - Voicemail'
  total_contacts      INTEGER DEFAULT 0,
  total_submitted     INTEGER DEFAULT 0,
  total_answered      INTEGER DEFAULT 0,
  total_voicemail     INTEGER DEFAULT 0,
  total_no_answer     INTEGER DEFAULT 0,
  total_busy          INTEGER DEFAULT 0,
  total_failed        INTEGER DEFAULT 0,
  started_at          TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(campaign_id, attempt_number)
);

ALTER TABLE campaign_call_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_summaries ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE campaign_call_attempts IS 'Temple Voice: every individual call attempt — supports retry tracking across multiple rounds';
COMMENT ON TABLE campaign_summaries IS 'Temple Voice: per-attempt summary for a campaign — the human-readable scorecard';

COMMIT;
