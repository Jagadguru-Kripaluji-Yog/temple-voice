-- ============================================================
-- Temple Voice Platform — Migration 002
-- Voice campaigns master registry + contact master table
-- + schema hardening per Theseus design review (2026-03-17)
--
-- Run order: execute entire file inside one transaction
-- Reviewed and approved by: Theseus ⚔️ (2026-03-17 23:10 CDT)
-- Executed by: Brahma 🪷
-- ============================================================

BEGIN;

-- ── Step 0: Defer FKs we add below so seed data can insert in any order ──────
-- (FKs are INITIALLY IMMEDIATE but we defer within this transaction for seeding)
-- SET CONSTRAINTS will be called after table creation below

-- ── Step 1: voice_contact_master ──────────────────────────────────────────────
-- Global deduplicated contact list. All campaigns reference this.
-- Prevents storing phone+name per campaign. Enables cross-campaign DNC checks.

CREATE TABLE IF NOT EXISTS voice_contact_master (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  phone            TEXT UNIQUE NOT NULL,       -- E.164 e.g. +14699457356
  name             TEXT,
  language         TEXT DEFAULT 'English',
  notes            TEXT,
  opted_out        BOOLEAN DEFAULT FALSE,
  opted_out_at     TIMESTAMPTZ,
  opted_out_reason TEXT,                       -- why: 'not interested', 'wrong number', etc.
  opted_out_source TEXT,                       -- how: 'in-call' | 'manual' | 'webhook'
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
  -- NOTE: no idx_vcm_phone — Postgres auto-creates index for UNIQUE constraint
);

ALTER TABLE voice_contact_master ENABLE ROW LEVEL SECURITY;
-- No RLS policies = only service_role can access (service role bypasses RLS automatically)
-- Add authenticated policies when/if a dashboard is built

-- ── Step 2: voice_campaigns ───────────────────────────────────────────────────
-- Master campaign registry. Every campaign must be registered here before calls fire.

CREATE TABLE IF NOT EXISTS voice_campaigns (
  id                TEXT PRIMARY KEY
                    CHECK (id ~ '^[0-9]{4}-[0-9]{2}-[a-z0-9-]+$'),
                    -- Enforces slug format: YYYY-MM-{event}[-v{n}] e.g. 2026-03-navratri
  name              TEXT NOT NULL,
  event_type        TEXT NOT NULL
                    CHECK (event_type IN ('navratri','ugadi','ram-navami','ltp','test','general')),
  status            TEXT DEFAULT 'draft'
                    CHECK (status IN ('draft','active','paused','completed','archived')),
  assistant_id      TEXT,                      -- VAPI assistant ID
  assistant_name    TEXT,                      -- Human-readable e.g. 'Taksh'
  phone_number      TEXT,                      -- Outbound caller ID e.g. '+14697951551'
  scheduled_start   TIMESTAMPTZ,              -- Planned calling window open
  scheduled_end     TIMESTAMPTZ,              -- Planned calling window close
  calling_window_start_hour INT DEFAULT 11,   -- TCPA: no calls before this hour (local time)
  calling_window_end_hour   INT DEFAULT 21,   -- TCPA: no calls after this hour (local time)
  launched_at       TIMESTAMPTZ,              -- Actual first call fired
  completed_at      TIMESTAMPTZ,              -- Actual last call completed
  -- Denormalized counters (acceptable for current volume; build a VIEW before scale)
  -- Tech debt: replace with computed VIEW when call volume exceeds ~10k/campaign
  total_contacts    INTEGER DEFAULT 0,
  total_called      INTEGER DEFAULT 0,
  total_answered    INTEGER DEFAULT 0,
  total_voicemail   INTEGER DEFAULT 0,
  total_no_answer   INTEGER DEFAULT 0,
  total_opted_out   INTEGER DEFAULT 0,
  notes             TEXT,
  created_by        TEXT DEFAULT 'system',    -- Agent or user who created. NOT hardcoded to Brahma.
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vc_event_type  ON voice_campaigns(event_type);
CREATE INDEX IF NOT EXISTS idx_vc_status      ON voice_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_vc_launched_at ON voice_campaigns(launched_at);

ALTER TABLE voice_campaigns ENABLE ROW LEVEL SECURITY;
-- No policies = service_role only. Add authenticated read policy when dashboard is built.

-- ── Step 3: Alter voice_campaign_contacts ─────────────────────────────────────

ALTER TABLE voice_campaign_contacts
  ADD COLUMN IF NOT EXISTS contact_master_id UUID REFERENCES voice_contact_master(id),
  ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ DEFAULT NOW();

-- FK to voice_campaigns — INITIALLY IMMEDIATE (enforced on every write)
-- Use explicit transaction deferral for bulk seeds: SET CONSTRAINTS fk_vcc_campaign DEFERRED
ALTER TABLE voice_campaign_contacts
  ADD CONSTRAINT fk_vcc_campaign
  FOREIGN KEY (campaign_id) REFERENCES voice_campaigns(id)
  DEFERRABLE INITIALLY IMMEDIATE;

CREATE INDEX IF NOT EXISTS idx_vcc_contact_master ON voice_campaign_contacts(contact_master_id);

-- ── Step 4: Alter voice_call_log ──────────────────────────────────────────────

ALTER TABLE voice_call_log
  ADD COLUMN IF NOT EXISTS assistant_id      TEXT,
  ADD COLUMN IF NOT EXISTS call_cost_usd     NUMERIC(10,6),  -- VAPI cost per call, 6 decimal places
  ADD COLUMN IF NOT EXISTS contact_master_id UUID REFERENCES voice_contact_master(id);

-- FK to voice_campaigns — INITIALLY IMMEDIATE
ALTER TABLE voice_call_log
  ADD CONSTRAINT fk_vcl_campaign
  FOREIGN KEY (campaign_id) REFERENCES voice_campaigns(id)
  DEFERRABLE INITIALLY IMMEDIATE;

CREATE INDEX IF NOT EXISTS idx_vcl_assistant_id ON voice_call_log(assistant_id);
CREATE INDEX IF NOT EXISTS idx_vcl_cost         ON voice_call_log(call_cost_usd);
CREATE INDEX IF NOT EXISTS idx_vcl_master       ON voice_call_log(contact_master_id);

-- ── Step 5: updated_at trigger (Postgres, not application-level) ──────────────
-- Application-level updated_at is unreliable — any direct SQL or missed code path
-- leaves stale timestamps. DB trigger is guaranteed regardless of write path.

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_voice_campaigns_updated_at         ON voice_campaigns;
DROP TRIGGER IF EXISTS trg_voice_contact_master_updated_at    ON voice_contact_master;
DROP TRIGGER IF EXISTS trg_voice_campaign_contacts_updated_at ON voice_campaign_contacts;
DROP TRIGGER IF EXISTS trg_voice_call_log_updated_at          ON voice_call_log;

CREATE TRIGGER trg_voice_campaigns_updated_at
  BEFORE UPDATE ON voice_campaigns
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_voice_contact_master_updated_at
  BEFORE UPDATE ON voice_contact_master
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_voice_campaign_contacts_updated_at
  BEFORE UPDATE ON voice_campaign_contacts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_voice_call_log_updated_at
  BEFORE UPDATE ON voice_call_log
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Step 6: Seed data — defer FKs for ordering flexibility ───────────────────

SET CONSTRAINTS fk_vcc_campaign, fk_vcl_campaign DEFERRED;

-- Fix 18 orphaned records (campaign_id = 'None') from pre-campaign test calls
INSERT INTO voice_campaigns (id, name, event_type, status, notes, created_by)
VALUES (
  '2026-03-test',
  'Test Calls — Pre-Campaign Dev',
  'test',
  'completed',
  'Voice quality + pipeline testing with Yatin Karnik on 2026-03-17. Pre-campaign dev calls.',
  'Brahma'
) ON CONFLICT (id) DO NOTHING;

UPDATE voice_call_log
SET campaign_id = '2026-03-test'
WHERE campaign_id = 'None' OR campaign_id IS NULL;

-- Seed the real first campaign
INSERT INTO voice_campaigns (
  id, name, event_type, status,
  assistant_id, assistant_name, phone_number,
  calling_window_start_hour, calling_window_end_hour,
  total_contacts, total_called, total_answered, total_no_answer, total_opted_out,
  launched_at, completed_at,
  notes, created_by
) VALUES (
  '2026-03-navratri',
  'Chaitra Navratri 2026 — Volunteer Test',
  'navratri',
  'completed',
  'f74762f1-531d-46cb-9a75-bcedb4c2d63f',
  'Taksh',
  '+14697951551',
  11, 21,
  13, 13, 9, 2, 0,
  '2026-03-17T01:26:05Z',
  '2026-03-18T01:45:00Z',
  'First live campaign. 13 volunteers called. 11 reached. Webhook transcript bug found and fixed same day. All transcripts backfilled.',
  'Brahma'
) ON CONFLICT (id) DO NOTHING;

-- Seed voice_contact_master from navratri contacts
INSERT INTO voice_contact_master (phone, name, language, notes)
VALUES
  ('+16194027179', 'Diana',         'English', 'volunteer'),
  ('+15085966841', 'Pooja Raghunath','English', 'volunteer'),
  ('+19728970111', 'Neha',          'English', 'volunteer'),
  ('+14256146281', 'Rohan ji',      'English', 'volunteer'),
  ('+19178633645', 'Pooja P ji',    'English', 'volunteer'),
  ('+19403009583', 'Smita ji',      'English', 'volunteer'),
  ('+19497058494', 'Saurabh ji',    'English', 'volunteer'),
  ('+19713362754', 'Kaustubh ji',   'English', 'volunteer'),
  ('+15715852226', 'Aditi ji',      'English', 'volunteer'),
  ('+12026743433', 'Manasi ji',     'English', 'volunteer'),
  ('+12017364960', 'Jhansi ji',     'English', 'volunteer'),
  ('+14696884996', 'Krity ji',      'English', 'volunteer'),
  ('+19727578069', 'Shreya Bhat',   'English', 'Temple President')
ON CONFLICT (phone) DO UPDATE SET
  name     = EXCLUDED.name,
  notes    = EXCLUDED.notes;

-- Link voice_campaign_contacts to contact_master
UPDATE voice_campaign_contacts vcc
SET contact_master_id = vcm.id
FROM voice_contact_master vcm
WHERE vcc.phone = vcm.phone
  AND vcc.campaign_id = '2026-03-navratri';

-- Link voice_call_log to contact_master
UPDATE voice_call_log vcl
SET contact_master_id = vcm.id
FROM voice_contact_master vcm
WHERE vcl.contact_phone = vcm.phone;

-- ── Step 7: Verification queries (results visible in migration output) ─────────

SELECT 'voice_campaigns' as table_name, COUNT(*) as rows FROM voice_campaigns
UNION ALL
SELECT 'voice_contact_master', COUNT(*) FROM voice_contact_master
UNION ALL
SELECT 'voice_campaign_contacts', COUNT(*) FROM voice_campaign_contacts
UNION ALL
SELECT 'voice_call_log', COUNT(*) FROM voice_call_log
UNION ALL
SELECT 'orphaned_none_records', COUNT(*) FROM voice_call_log
  WHERE campaign_id = 'None' OR campaign_id IS NULL;

COMMIT;

-- ── Post-migration: add comments ──────────────────────────────────────────────

COMMENT ON TABLE voice_campaigns IS
  'Master campaign registry. Every outbound call campaign must be registered here. '
  'Reviewed and approved by Theseus ⚔️ on 2026-03-17.';

COMMENT ON TABLE voice_contact_master IS
  'Global deduplicated contact list for all temple voice campaigns. '
  'Single source of truth for opt-out status across campaigns.';

COMMENT ON COLUMN voice_campaigns.total_contacts IS
  'TECH DEBT: Denormalized counter. Acceptable for current volume. '
  'Build a computed VIEW before scaling beyond ~10k calls/campaign.';

COMMENT ON COLUMN voice_campaigns.id IS
  'Human-readable slug. Format enforced by CHECK: YYYY-MM-{event}[-v{n}]. '
  'Examples: 2026-03-navratri, 2026-04-ram-navami, 2026-10-diwali-v2';
