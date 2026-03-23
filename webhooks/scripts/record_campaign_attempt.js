#!/usr/bin/env node
/**
 * record_campaign_attempt.js
 *
 * Pull all call results from VAPI for a given campaign, classify each outcome,
 * write to campaign_call_attempts + campaign_summaries in Supabase.
 * Run after each attempt (initial + each retry).
 *
 * Usage:
 *   node record_campaign_attempt.js \
 *     --campaign ram-navami-2026-0323 \
 *     --attempt 1 \
 *     --label "Initial Run — 361 contacts" \
 *     --phones /path/to/contacts.csv
 *
 * Brahma 🪷 — 2026-03-23
 */

const https = require('https');
const fs = require('fs');

// ── Config ────────────────────────────────────────────────────────────────────
const VAPI_KEY          = process.env.VAPI_KEY || 'b2b95917-1609-47fb-976f-69516d0af836';
const SUPABASE_URL      = process.env.SUPABASE_URL || 'https://wzmznkipskvjgzzagzap.supabase.co';
const SUPABASE_KEY      = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6bXpua2lwc2t2amd6emFnemFwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcwNDIyMjI2MCwiZXhwIjoyMDE5Nzk4MjYwfQ.JzKNZSieQ-HAZ5KEvyHIv8bN5OFLxXblVk_Re7pbwGI';

// Parse CLI args
const args = process.argv.slice(2);
const get  = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i+1] : null; };
const CAMPAIGN_ID    = get('--campaign') || 'ram-navami-2026-0323';
const ATTEMPT_NUM    = parseInt(get('--attempt') || '1', 10);
const ATTEMPT_LABEL  = get('--label') || `Attempt ${ATTEMPT_NUM}`;
const PHONES_FILE    = get('--phones') || '/root/repos/temple-aiagents/deliverables/campaigns/ram-navami-2026/contacts-361.csv';

// ── VAPI end-reason → our status ─────────────────────────────────────────────
function classifyReason(endedReason, status) {
  if (!endedReason && status === 'in-progress') return 'submitted';
  if (!endedReason) return 'submitted';
  const r = endedReason.toLowerCase();
  if (r.includes('customer-ended-call') || r.includes('assistant-ended-call')) return 'answered';
  if (r.includes('silence-timed-out'))    return 'voicemail';
  if (r.includes('customer-did-not-answer')) return 'no-answer';
  if (r.includes('customer-busy'))        return 'busy';
  if (r.includes('failed') || r.includes('error') || r.includes('twilio')) return 'failed';
  return 'submitted';
}

function request(method, hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname, path, method,
      headers: { 'Content-Type': 'application/json', ...headers,
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}) }
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(d) }); } catch(e) { resolve({ status: res.statusCode, body: d }); } });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('timeout')); });
    if (payload) req.write(payload);
    req.end();
  });
}

async function fetchAllVapiCalls() {
  // Fetch up to 1000 calls (paginate if needed)
  let allCalls = [];
  let lastId = null;
  while (true) {
    const path = `/call?limit=100${lastId ? `&createdAtLt=${lastId}` : ''}&createdAtGt=2026-03-23T22:00:00.000Z`;
    const r = await request('GET', 'api.vapi.ai', path, { 'Authorization': `Bearer ${VAPI_KEY}` });
    const calls = Array.isArray(r.body) ? r.body : (r.body.results || r.body.data || []);
    if (!calls.length) break;
    allCalls = allCalls.concat(calls);
    if (calls.length < 100) break;
    lastId = calls[calls.length - 1].createdAt;
  }
  return allCalls;
}

async function supabaseUpsert(table, rows, onConflict) {
  const r = await request(
    'POST',
    new URL(SUPABASE_URL).hostname,
    `/rest/v1/${table}?on_conflict=${onConflict}`,
    {
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'apikey': SUPABASE_KEY,
      'Prefer': 'resolution=merge-duplicates,return=minimal'
    },
    rows
  );
  return r;
}

async function main() {
  console.log(`\n🪷 Recording campaign attempt`);
  console.log(`   Campaign:  ${CAMPAIGN_ID}`);
  console.log(`   Attempt:   ${ATTEMPT_NUM} — "${ATTEMPT_LABEL}"`);
  console.log(`   Phones:    ${PHONES_FILE}\n`);

  // Load submitted phones
  const lines = fs.readFileSync(PHONES_FILE, 'utf8').trim().split('\n');
  const phones = lines.slice(1).map(l => l.trim()).filter(Boolean);
  console.log(`📋 Phones in list: ${phones.length}`);

  // Fetch all VAPI calls
  console.log(`📡 Fetching VAPI call records...`);
  const vapiCalls = await fetchAllVapiCalls();
  console.log(`   Got ${vapiCalls.length} calls from VAPI`);

  // Build phone → call map
  const callByPhone = {};
  for (const c of vapiCalls) {
    const phone = c.customer?.number;
    if (phone) callByPhone[phone] = c;
  }

  // Build attempt rows
  const rows = phones.map(phone => {
    const call = callByPhone[phone];
    const status = call ? classifyReason(call.endedReason, call.status) : 'submitted';
    return {
      campaign_id:    CAMPAIGN_ID,
      phone,
      attempt_number: ATTEMPT_NUM,
      vapi_call_id:   call?.id || null,
      status,
      ended_reason:   call?.endedReason || null,
      duration_sec:   Math.round(call?.duration || call?.durationSeconds || 0),
      submitted_at:   call?.createdAt || new Date().toISOString(),
      ended_at:       call?.endedAt || null,
      notes:          ATTEMPT_LABEL
    };
  });

  // Tally
  const counts = rows.reduce((acc, r) => { acc[r.status] = (acc[r.status]||0)+1; return acc; }, {});
  console.log(`\n📊 Outcome breakdown:`);
  Object.entries(counts).sort((a,b)=>b[1]-a[1]).forEach(([k,v]) => console.log(`   ${k.padEnd(12)}: ${v}`));

  // Upsert attempt rows
  console.log(`\n💾 Writing ${rows.length} rows to campaign_call_attempts...`);
  const r1 = await supabaseUpsert('campaign_call_attempts', rows, 'campaign_id,phone,attempt_number');
  console.log(`   HTTP ${r1.status} ${r1.status < 300 ? '✅' : '❌'}`);
  if (r1.status >= 300) console.log('   Error:', JSON.stringify(r1.body).slice(0,200));

  // Upsert summary row
  const summary = {
    campaign_id:     CAMPAIGN_ID,
    attempt_number:  ATTEMPT_NUM,
    attempt_label:   ATTEMPT_LABEL,
    total_contacts:  phones.length,
    total_submitted: phones.length,
    total_answered:  counts['answered'] || 0,
    total_voicemail: counts['voicemail'] || 0,
    total_no_answer: (counts['no-answer'] || 0),
    total_busy:      counts['busy'] || 0,
    total_failed:    counts['failed'] || 0,
    started_at:      '2026-03-23T22:35:00.000Z',
    completed_at:    new Date().toISOString(),
    notes:           ATTEMPT_LABEL
  };

  console.log(`\n💾 Writing summary to campaign_summaries...`);
  const r2 = await supabaseUpsert('campaign_summaries', [summary], 'campaign_id,attempt_number');
  console.log(`   HTTP ${r2.status} ${r2.status < 300 ? '✅' : '❌'}`);
  if (r2.status >= 300) console.log('   Error:', JSON.stringify(r2.body).slice(0,200));

  // Save retry list
  const retryStatuses = ['voicemail', 'no-answer', 'busy', 'failed', 'submitted'];
  const retryPhones = rows.filter(r => retryStatuses.includes(r.status)).map(r => r.phone);
  const retryPath = `/root/repos/temple-aiagents/deliverables/campaigns/ram-navami-2026/retry-attempt-${ATTEMPT_NUM+1}.csv`;
  fs.writeFileSync(retryPath, 'phone\n' + retryPhones.join('\n') + '\n');
  console.log(`\n📄 Retry list (${retryPhones.length} numbers) saved to:`);
  console.log(`   ${retryPath}`);
  console.log(`\n✅ Done! Campaign attempt ${ATTEMPT_NUM} recorded.`);
}

main().catch(console.error);
