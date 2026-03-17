-- Temple Voice Platform: Database Migration 001
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/wzmznkipskvjgzzagzap/sql

CREATE TABLE IF NOT EXISTS voice_campaign_contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  phone TEXT NOT NULL,
  name TEXT,
  language TEXT DEFAULT 'English',
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending','called','answered','voicemail','no-answer','busy','failed','opted-out','confirmed'
  )),
  call_attempts INTEGER DEFAULT 0,
  last_called_at TIMESTAMPTZ,
  outcome TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(campaign_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_vcc_campaign_id ON voice_campaign_contacts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_vcc_status ON voice_campaign_contacts(status);
CREATE INDEX IF NOT EXISTS idx_vcc_phone ON voice_campaign_contacts(phone);

CREATE TABLE IF NOT EXISTS voice_call_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  vapi_call_id TEXT UNIQUE,
  campaign_id TEXT,
  contact_phone TEXT,
  disposition TEXT,
  duration_seconds INTEGER DEFAULT 0,
  transcript_text TEXT,
  raw_event JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vcl_campaign_id ON voice_call_log(campaign_id);
CREATE INDEX IF NOT EXISTS idx_vcl_vapi_call_id ON voice_call_log(vapi_call_id);

ALTER TABLE voice_campaign_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_call_log ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE voice_campaign_contacts IS 'Temple Voice Platform: one row per contact per campaign';
COMMENT ON TABLE voice_call_log IS 'Temple Voice Platform: one row per VAPI call event';
