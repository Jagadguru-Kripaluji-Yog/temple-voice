-- Migration 004: Relax voice_campaigns constraints for webhook auto-created stubs
-- Required before deploying f4ca905 (webhook safety net).
--
-- Bug 1: 'auto-created' not in status CHECK → auto-stub upserts fail silently
-- Bug 2: event_type is NOT NULL → stub inserts fail without it
-- Bug 3: id format CHECK too strict → non-slug VAPI campaignIds rejected

-- Bug 1: Add 'auto-created' to status allowed values
ALTER TABLE voice_campaigns
  DROP CONSTRAINT IF EXISTS voice_campaigns_status_check;
ALTER TABLE voice_campaigns
  ADD CONSTRAINT voice_campaigns_status_check
  CHECK (status IN ('draft','active','paused','completed','archived','auto-created'));

-- Bug 2: Make event_type nullable with a default so stubs can insert without it
ALTER TABLE voice_campaigns
  ALTER COLUMN event_type DROP NOT NULL,
  ALTER COLUMN event_type SET DEFAULT 'general';

-- Bug 3: Drop the id format check — let any VAPI campaignId be stored as a stub.
-- Slug format is enforced at the application layer for real campaigns.
ALTER TABLE voice_campaigns
  DROP CONSTRAINT IF EXISTS voice_campaigns_id_check;
