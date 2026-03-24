/**
 * Backfill transcripts + summaries into campaign_call_attempts
 * from VAPI API for the Ram Navami 2026 campaign.
 * 
 * Run AFTER migration 006 is applied.
 * Usage: VAPI_KEY=xxx SUPABASE_KEY=xxx node scripts/backfill-transcripts-ram-navami-2026.js
 * 
 * Author: Brahma — 2026-03-24
 */

const { createClient } = require('@supabase/supabase-js');
const https = require('https');

const VAPI_KEY       = process.env.VAPI_KEY       || '9ac87c96-91dd-419c-9b5a-565ca443bd0e';
const SUPABASE_URL   = process.env.SUPABASE_URL   || 'https://wzmznkipskvjgzzagzap.supabase.co';
const SUPABASE_KEY   = process.env.SUPABASE_KEY   || process.env.SUPABASE_SERVICE_ROLE_KEY;
const CAMPAIGN_ID    = 'ram-navami-2026-0323';

if (!SUPABASE_KEY) { console.error('SUPABASE_KEY required'); process.exit(1); }

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

function vapiGet(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.vapi.ai',
      path,
      method: 'GET',
      headers: { Authorization: `Bearer ${VAPI_KEY}` }
    };
    const req = https.request(options, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve(JSON.parse(body)));
    });
    req.on('error', reject);
    req.end();
  });
}

async function run() {
  // Get all rows for this campaign that need transcripts
  const { data: rows, error } = await sb
    .from('campaign_call_attempts')
    .select('id, vapi_call_id, transcript')
    .eq('campaign_id', CAMPAIGN_ID)
    .is('transcript', null);

  if (error) { console.error('Supabase error:', error.message); return; }
  console.log(`Rows needing transcript backfill: ${rows.length}`);

  let updated = 0, failed = 0;
  for (const row of rows) {
    try {
      const call = await vapiGet(`/call/${row.vapi_call_id}`);
      const transcript = call.transcript || null;
      const summary    = call.summary    || null;

      if (!transcript && !summary) { failed++; continue; }

      const { error: ue } = await sb
        .from('campaign_call_attempts')
        .update({ transcript, summary })
        .eq('id', row.id);

      if (ue) { console.error(`Update error for ${row.vapi_call_id}:`, ue.message); failed++; }
      else { updated++; process.stdout.write('.'); }

      // Rate limit: 10 req/s
      await new Promise(r => setTimeout(r, 120));
    } catch (e) {
      console.error(`Error for ${row.vapi_call_id}:`, e.message);
      failed++;
    }
  }

  console.log(`\nDone. Updated: ${updated}, Failed/empty: ${failed}`);
}

run().catch(console.error);
