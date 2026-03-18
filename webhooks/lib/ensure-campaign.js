'use strict';

/**
 * ensure-campaign.js
 *
 * Auto-creates a stub campaign row if the given campaignId doesn't exist.
 * This prevents FK violations on voice_call_log when a call arrives for a
 * campaign that wasn't pre-created in the DB (e.g. test calls, new campaigns
 * launched without DB setup).
 *
 * Status 'auto-created' is distinct from 'active'/'completed' so dashboards
 * and cron checks can surface stubs that need human review.
 */

async function ensureCampaignExists(campaignId, supabase) {
  if (!campaignId) return;
  if (!supabase) return;

  try {
    const { data } = await supabase
      .from('voice_campaigns')
      .select('id')
      .eq('id', campaignId)
      .maybeSingle();

    if (!data) {
      const { error } = await supabase
        .from('voice_campaigns')
        .upsert(
          {
            id: campaignId,
            name: `[Auto-created] ${campaignId}`,
            status: 'auto-created',
            event_type: 'general',
            notes: `Auto-created by webhook at ${new Date().toISOString()}. Please update name and details.`
          },
          { onConflict: 'id', ignoreDuplicates: true }
        );

      if (error) {
        console.error(`[ensure-campaign] Failed to auto-create stub for ${campaignId}:`, error.message);
      } else {
        console.warn(`[ensure-campaign] ⚠️  Auto-created stub campaign: ${campaignId} — needs human review`);
      }
    }
  } catch (err) {
    // Never throw — this is a best-effort safety net
    console.error(`[ensure-campaign] Unexpected error for ${campaignId}:`, err.message);
  }
}

module.exports = ensureCampaignExists;
