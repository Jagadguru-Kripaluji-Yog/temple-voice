'use strict';

const ensureCampaignExists = require('../lib/ensure-campaign');
const fs = require('fs');
const path = require('path');

const CAMPAIGNS_DIR = process.env.CAMPAIGNS_DIR
  ? path.resolve(__dirname, '..', process.env.CAMPAIGNS_DIR)
  : path.resolve(__dirname, '../../campaigns');

const CONTACTS_DIR = process.env.CONTACTS_DIR
  ? path.resolve(__dirname, '..', process.env.CONTACTS_DIR)
  : path.resolve(__dirname, '../../contacts');

const DNC_FILE = path.join(CONTACTS_DIR, 'do-not-call.csv');

const OPT_OUT_PHRASES = [
  'please remove me',
  'stop calling',
  'do not call',
  "don't call",
  'remove me from',
  'not interested',
  'take me off',
  'remove my number'
];

/**
 * Handle VAPI end-of-call-report events.
 *
 * BUG FIX (2026-03-17): status-update handler was upserting rows with
 * disposition='ended' BEFORE end-of-call-report fired with the transcript.
 * The end-of-call INSERT then failed silently on conflict (vapi_call_id UNIQUE).
 * Fix: changed INSERT to UPSERT so end-of-call always overwrites the
 * status-update row with the real transcript and final disposition.
 */
async function endOfCallHandler(message, supabase) {
  try {
    const call = message.call || {};
    const artifact = message.artifact || {};

    const callId = call.id || message.callId;
    const campaignId = call.metadata?.campaignId || null;
    const contactPhone =
      call.customer?.number ||
      message.customer?.number ||
      call.from ||       // inbound caller number
      null;
    const endedReason = message.endedReason || call.endedReason || 'unknown';

    // Duration calculation
    let duration = 0;
    if (message.durationSeconds) {
      duration = Math.round(message.durationSeconds);
    } else if (call.startedAt && call.endedAt) {
      duration = Math.round((new Date(call.endedAt) - new Date(call.startedAt)) / 1000);
    }

    // Transcript — check both artifact.transcript and message.transcript
    const transcript = artifact.transcript || message.transcript || '';

    // Disposition
    let disposition = 'completed';
    if (endedReason === 'voicemail') disposition = 'voicemail';
    else if (['no-answer', 'silence-timed-out'].includes(endedReason)) disposition = 'no-answer';
    else if (['customer-busy', 'busy'].includes(endedReason)) disposition = 'busy';
    else if (endedReason === 'failed') disposition = 'failed';
    else if (['customer-ended-call', 'assistant-ended-call'].includes(endedReason)) disposition = 'answered';
    else if (endedReason === 'exceeded-max-duration') disposition = 'answered';

    // Opt-out detection
    const transcriptLower = transcript.toLowerCase();
    const isOptOut = OPT_OUT_PHRASES.some(p => transcriptLower.includes(p));
    if (isOptOut) disposition = 'opted-out';

    console.log(`[end-of-call] callId=${callId} campaign=${campaignId} phone=${contactPhone} disposition=${disposition} duration=${duration}s transcript=${transcript.length}chars`);

    // 1. Write calls.jsonl to campaign results folder
    if (campaignId) {
      const resultsDir = path.join(CAMPAIGNS_DIR, campaignId, 'results');
      try {
        fs.mkdirSync(resultsDir, { recursive: true });
        const record = {
          callId, campaignId, contactPhone, disposition,
          duration, transcript: transcript.substring(0, 5000),
          endedReason, isOptOut, timestamp: new Date().toISOString()
        };
        fs.appendFileSync(
          path.join(resultsDir, 'calls.jsonl'),
          JSON.stringify(record) + '\n',
          'utf8'
        );
      } catch (fsErr) {
        console.error('[end-of-call] Failed to write calls.jsonl:', fsErr.message);
      }
    }

    // 2a. Ensure campaign exists (auto-creates stub if missing — never throws)
    await ensureCampaignExists(campaignId, supabase);

    // 2. UPSERT to Supabase voice_call_log
    // IMPORTANT: must be UPSERT not INSERT — status-update handler creates the row first
    // and a plain INSERT would fail silently on the UNIQUE conflict, losing the transcript.
    if (supabase) {
      const { error: logError } = await supabase
        .from('voice_call_log')
        .upsert(
          {
            vapi_call_id: callId,
            campaign_id: campaignId,
            contact_phone: contactPhone,
            disposition,
            duration_seconds: duration,
            transcript_text: transcript ? transcript.substring(0, 10000) : null,
            raw_event: message,
            updated_at: new Date().toISOString()
          },
          { onConflict: 'vapi_call_id', ignoreDuplicates: false }
        );

      if (logError) {
        console.error('[end-of-call] Supabase upsert error:', logError.message);
      } else {
        console.log(`[end-of-call] ✅ Supabase voice_call_log upserted for callId=${callId}`);
      }
    }

    // 3. Update voice_campaign_contacts with final status
    if (supabase && campaignId && contactPhone) {
      const newStatus = isOptOut ? 'opted-out' : disposition;
      const { error: updateError } = await supabase
        .from('voice_campaign_contacts')
        .update({
          status: newStatus,
          last_called_at: new Date().toISOString(),
          outcome: endedReason
        })
        .eq('campaign_id', campaignId)
        .eq('phone', contactPhone);

      if (updateError) {
        console.error('[end-of-call] Contact update error:', updateError.message);
      }
    }

    // 4. Opt-out: append to DNC list and campaign opt-outs file
    if (isOptOut && contactPhone) {
      try {
        const today = new Date().toISOString().split('T')[0];
        const name = call.customer?.name || 'Unknown';
        fs.appendFileSync(DNC_FILE, `${contactPhone},${name},opted-out during call,${today}\n`, 'utf8');
        console.log(`[end-of-call] Added ${contactPhone} to DNC list`);

        if (campaignId) {
          const optOutFile = path.join(CAMPAIGNS_DIR, campaignId, 'results', 'opt-outs.csv');
          if (!fs.existsSync(optOutFile)) {
            fs.writeFileSync(optOutFile, 'phone,name,reason,date\n', 'utf8');
          }
          fs.appendFileSync(optOutFile, `${contactPhone},${name},opted-out during call,${today}\n`, 'utf8');
        }
      } catch (dncErr) {
        console.error('[end-of-call] Failed to write DNC file:', dncErr.message);
      }
    }

    console.log(`[end-of-call] ✅ Complete for callId=${callId}`);

  } catch (err) {
    console.error('[end-of-call] FATAL error:', err.message, err.stack);
  }
}

module.exports = endOfCallHandler;
