'use strict';

const ensureCampaignExists = require('../lib/ensure-campaign');

/**
 * Handle VAPI status-update events.
 * 
 * Logs call status changes to Supabase voice_call_log via upsert on vapi_call_id.
 * Status flow: queued → ringing → in-progress → ended
 * 
 * @param {object} message - VAPI status-update message
 * @param {object} supabase - Supabase client
 */
async function statusUpdateHandler(message, supabase) {
  try {
    const call = message.call || {};
    const callId = call.id || message.callId;
    const status = message.status || call.status;
    const campaignId = call.metadata?.campaignId || null;
    const contactPhone = call.customer?.number || null;

    console.log(`[status-update] callId=${callId} status=${status} campaign=${campaignId}`);

    if (!supabase) {
      console.warn('[status-update] Supabase not available — skipping DB write');
      return;
    }

    // Ensure campaign exists (auto-creates stub if missing — never throws)
    await ensureCampaignExists(campaignId, supabase);

    // Upsert into voice_call_log — create row if new, update status if exists
    const { error } = await supabase
      .from('voice_call_log')
      .upsert(
        {
          vapi_call_id: callId,
          campaign_id: campaignId,
          contact_phone: contactPhone,
          disposition: status,
          raw_event: message,
          updated_at: new Date().toISOString()
        },
        {
          onConflict: 'vapi_call_id',
          ignoreDuplicates: false
        }
      );

    if (error) {
      console.error('[status-update] Supabase upsert error:', error.message);
      return;
    }

    // If call is now in-progress, update contact status to 'called'
    if ((status === 'in-progress' || status === 'ringing') && campaignId && contactPhone) {
      const { error: contactError } = await supabase
        .from('voice_campaign_contacts')
        .update({
          status: 'called',
          last_called_at: new Date().toISOString()
        })
        .eq('campaign_id', campaignId)
        .eq('phone', contactPhone)
        .eq('status', 'pending'); // Only update if still pending

      if (contactError) {
        console.error('[status-update] Contact status update error:', contactError.message);
      }
    }

    console.log(`[status-update] ✅ Logged status=${status} for callId=${callId}`);

  } catch (err) {
    console.error('[status-update] FATAL error:', err.message, err.stack);
  }
}

module.exports = statusUpdateHandler;
