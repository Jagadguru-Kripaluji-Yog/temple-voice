'use strict';

const fs = require('fs');
const path = require('path');

const CAMPAIGNS_DIR = process.env.CAMPAIGNS_DIR
  ? path.resolve(__dirname, '..', process.env.CAMPAIGNS_DIR)
  : path.resolve(__dirname, '../../campaigns');

const CONTACTS_DIR = process.env.CONTACTS_DIR
  ? path.resolve(__dirname, '..', process.env.CONTACTS_DIR)
  : path.resolve(__dirname, '../../contacts');

const DNC_FILE = path.join(CONTACTS_DIR, 'do-not-call.csv');

// Phrases that trigger opt-out
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
 * @param {object} message - VAPI message payload
 * @param {object} supabase - Supabase client
 */
async function endOfCallHandler(message, supabase) {
  try {
    const call = message.call || {};
    const artifact = message.artifact || {};
    const analysis = message.analysis || {};

    const callId = call.id || message.callId;
    const campaignId = call.metadata?.campaignId || null;
    const contactPhone = call.customer?.number || null;
    const duration = Math.round((message.durationSeconds || call.endedAt
      ? (new Date(call.endedAt) - new Date(call.startedAt)) / 1000
      : 0));
    const transcript = artifact.transcript || message.transcript || '';
    const endedReason = message.endedReason || call.endedReason || 'unknown';
    
    // Determine disposition
    let disposition = 'completed';
    if (endedReason === 'voicemail') disposition = 'voicemail';
    else if (endedReason === 'no-answer') disposition = 'no-answer';
    else if (endedReason === 'busy') disposition = 'busy';
    else if (endedReason === 'failed') disposition = 'failed';
    else if (endedReason === 'customer-ended-call' || endedReason === 'assistant-ended-call') {
      disposition = 'answered';
    }

    // Detect opt-out from transcript
    const transcriptLower = (transcript || '').toLowerCase();
    const isOptOut = OPT_OUT_PHRASES.some(phrase => transcriptLower.includes(phrase));

    if (isOptOut) {
      disposition = 'opted-out';
    }

    console.log(`[end-of-call] callId=${callId} campaign=${campaignId} phone=${contactPhone} disposition=${disposition} optOut=${isOptOut}`);

    // 1. Append to calls.jsonl
    if (campaignId) {
      const resultsDir = path.join(CAMPAIGNS_DIR, campaignId, 'results');
      try {
        fs.mkdirSync(resultsDir, { recursive: true });
        const record = {
          callId,
          campaignId,
          contactPhone,
          disposition,
          duration,
          transcript: transcript.substring(0, 5000), // cap size
          endedReason,
          isOptOut,
          timestamp: new Date().toISOString()
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

    // 2. Insert to Supabase voice_call_log
    if (supabase) {
      const { error: logError } = await supabase
        .from('voice_call_log')
        .insert({
          vapi_call_id: callId,
          campaign_id: campaignId,
          contact_phone: contactPhone,
          disposition,
          duration_seconds: duration,
          transcript_text: transcript ? transcript.substring(0, 10000) : null,
          raw_event: message
        });

      if (logError) {
        console.error('[end-of-call] Supabase voice_call_log insert error:', logError.message);
      }
    }

    // 3. Update voice_campaign_contacts status
    if (supabase && campaignId && contactPhone) {
      const newStatus = isOptOut ? 'opted-out' : disposition;
      const { error: updateError } = await supabase
        .from('voice_campaign_contacts')
        .update({
          status: newStatus,
          last_called_at: new Date().toISOString(),
          outcome: endedReason,
          call_attempts: supabase.rpc ? undefined : undefined // incremented via DB trigger ideally
        })
        .eq('campaign_id', campaignId)
        .eq('phone', contactPhone);

      if (updateError) {
        console.error('[end-of-call] Supabase contact update error:', updateError.message);
      }

      // Also increment call_attempts
      await supabase.rpc('increment_call_attempts', {
        p_campaign_id: campaignId,
        p_phone: contactPhone
      }).catch(() => {
        // RPC may not exist — that's fine, just log
        console.log('[end-of-call] increment_call_attempts RPC not available');
      });
    }

    // 4. If opted out: append to DNC list
    if (isOptOut && contactPhone) {
      try {
        const today = new Date().toISOString().split('T')[0];
        const name = call.customer?.name || 'Unknown';
        const dncLine = `${contactPhone},${name},opted-out during call,${today}\n`;
        fs.appendFileSync(DNC_FILE, dncLine, 'utf8');
        console.log(`[end-of-call] Added ${contactPhone} to DNC list`);

        // Also update opt-outs CSV for the campaign
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

    console.log(`[end-of-call] ✅ Processed callId=${callId}`);

  } catch (err) {
    console.error('[end-of-call] FATAL error:', err.message, err.stack);
  }
}

module.exports = endOfCallHandler;
