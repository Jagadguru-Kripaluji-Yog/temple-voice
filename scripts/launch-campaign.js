#!/usr/bin/env node
'use strict';

/**
 * launch-campaign.js
 * Usage: node scripts/launch-campaign.js <campaign-id>
 * 
 * Loads contacts into Supabase and fires outbound calls via VAPI.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../webhooks/.env') });
const fs = require('fs');
const path = require('path');
const https = require('https');
const { createClient } = require('@supabase/supabase-js');

// ─── Config ──────────────────────────────────────────────────────────────────

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ROOT_DIR = path.join(__dirname, '..');

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const campaignId = process.argv[2];
  if (!campaignId) {
    console.error('Usage: node scripts/launch-campaign.js <campaign-id>');
    console.error('Example: node scripts/launch-campaign.js 2026-03-navratri');
    process.exit(1);
  }

  console.log(`\n🪷 Temple Voice — Launching Campaign: ${campaignId}`);
  console.log('─'.repeat(50));

  // Load campaign config
  const campaignFile = path.join(ROOT_DIR, 'campaigns', campaignId, 'campaign.json');
  if (!fs.existsSync(campaignFile)) {
    console.error(`❌ Campaign not found: ${campaignFile}`);
    process.exit(1);
  }
  const campaign = JSON.parse(fs.readFileSync(campaignFile, 'utf8'));
  console.log(`✅ Campaign: ${campaign.name}`);
  console.log(`   Status: ${campaign.status}`);
  console.log(`   Assistant: ${campaign.assistant_id}`);
  console.log(`   Phone: ${campaign.phone_number}`);

  if (campaign.status !== 'READY' && campaign.status !== 'ACTIVE') {
    console.error(`❌ Campaign status is "${campaign.status}" — must be READY or ACTIVE to launch`);
    process.exit(1);
  }

  // Check calling window
  const withinWindow = isWithinCallingWindow(campaign.calling_window);
  if (!withinWindow) {
    const window = campaign.calling_window;
    console.warn(`⚠️  Outside calling window (${window.days.join('/')} ${window.start_time}–${window.end_time} ${window.timezone})`);
    console.warn('   Use --force to override (not recommended)');
    if (!process.argv.includes('--force')) {
      process.exit(1);
    }
  } else {
    console.log(`✅ Within calling window`);
  }

  // Load contacts CSV
  const contactsFile = path.join(ROOT_DIR, 'campaigns', campaignId, 'contacts.csv');
  if (!fs.existsSync(contactsFile)) {
    console.error(`❌ Contacts file not found: ${contactsFile}`);
    process.exit(1);
  }

  const rawContacts = parseCSV(fs.readFileSync(contactsFile, 'utf8'));
  console.log(`\n📋 Contacts loaded: ${rawContacts.length}`);

  // Load DNC list
  const dncFile = path.join(ROOT_DIR, 'contacts', 'do-not-call.csv');
  const dncPhones = new Set();
  if (fs.existsSync(dncFile)) {
    const dncRows = parseCSV(fs.readFileSync(dncFile, 'utf8'));
    for (const row of dncRows) {
      if (row.phone) dncPhones.add(normalizePhone(row.phone));
    }
  }
  console.log(`🚫 DNC list entries: ${dncPhones.size}`);

  // Filter out DNC contacts
  const eligibleContacts = rawContacts.filter(c => {
    const phone = normalizePhone(c.phone);
    if (!phone) return false;
    if (dncPhones.has(phone)) {
      console.log(`   DNC filtered: ${c.name || 'Unknown'} (${c.phone})`);
      return false;
    }
    return true;
  });

  const dncFiltered = rawContacts.length - eligibleContacts.length;
  console.log(`✅ Eligible contacts: ${eligibleContacts.length} (${dncFiltered} DNC filtered)`);

  if (eligibleContacts.length === 0) {
    console.log('\n✅ No contacts to call. Done.');
    process.exit(0);
  }

  // Load into Supabase
  let supabase = null;
  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    console.log('\n📊 Loading contacts into Supabase...');

    const records = eligibleContacts.map(c => ({
      campaign_id: campaignId,
      phone: normalizePhone(c.phone),
      name: c.name || null,
      language: c.language || 'English',
      notes: c.notes || null,
      status: 'pending'
    }));

    // Upsert in batches of 100
    let upserted = 0;
    for (let i = 0; i < records.length; i += 100) {
      const batch = records.slice(i, i + 100);
      const { error } = await supabase
        .from('voice_campaign_contacts')
        .upsert(batch, { onConflict: 'campaign_id,phone', ignoreDuplicates: true });
      if (error) {
        console.error(`   ❌ Supabase upsert error: ${error.message}`);
      } else {
        upserted += batch.length;
      }
    }
    console.log(`   ✅ Upserted ${upserted} contacts to Supabase`);
  } else {
    console.warn('   ⚠️  Supabase not configured — skipping DB load');
  }

  // Fire VAPI calls
  if (!VAPI_API_KEY) {
    console.error('\n❌ VAPI_API_KEY not set in environment. Cannot fire calls.');
    console.log('   Set VAPI_API_KEY in webhooks/.env or export it directly.');
    process.exit(1);
  }

  console.log(`\n📞 Firing calls via VAPI...`);

  // Build customers array for batch call
  const customers = eligibleContacts.map(c => ({
    number: normalizePhone(c.phone),
    name: c.name || undefined
  })).filter(c => c.number);

  // VAPI supports batch calls
  const callPayload = {
    assistantId: campaign.assistant_id,
    phoneNumberId: campaign.phone_number_id,
    customers,
    assistantOverrides: {
      metadata: { campaignId }
    }
  };

  try {
    const response = await vapiPost('/call', callPayload);
    const callCount = Array.isArray(response) ? response.length : 1;
    console.log(`   ✅ ${callCount} calls fired successfully`);

    // Print summary
    console.log('\n' + '═'.repeat(50));
    console.log('📊 LAUNCH SUMMARY');
    console.log('═'.repeat(50));
    console.log(`   Campaign:          ${campaign.name}`);
    console.log(`   Contacts loaded:   ${rawContacts.length}`);
    console.log(`   DNC filtered:      ${dncFiltered}`);
    console.log(`   Calls fired:       ${customers.length}`);
    console.log(`   VAPI response:     ${callCount} call(s) queued`);
    console.log('═'.repeat(50));
    console.log('\n✅ Campaign launched! Monitor at:');
    console.log(`   curl http://localhost:3200/campaign/${campaignId}/status`);

  } catch (err) {
    console.error(`\n❌ VAPI call failed: ${err.message}`);
    process.exit(1);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseCSV(content) {
  const lines = content.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = line.split(',').map(v => v.trim());
    const row = {};
    headers.forEach((h, idx) => { row[h] = values[idx] || ''; });
    rows.push(row);
  }

  return rows;
}

function normalizePhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length > 7) return `+${digits}`;
  return null;
}

function isWithinCallingWindow(window) {
  const now = new Date();
  const options = { timeZone: window.timezone || 'America/Chicago', hour12: false };
  const dayName = now.toLocaleDateString('en-US', { ...options, weekday: 'long' });
  const timeStr = now.toLocaleTimeString('en-US', { ...options, hour: '2-digit', minute: '2-digit' });
  const [hour, minute] = timeStr.split(':').map(Number);
  const currentMinutes = hour * 60 + minute;

  const [startH, startM] = window.start_time.split(':').map(Number);
  const [endH, endM] = window.end_time.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  const dayOk = (window.days || []).includes(dayName);
  const timeOk = currentMinutes >= startMinutes && currentMinutes <= endMinutes;

  return dayOk && timeOk;
}

function vapiPost(endpoint, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const options = {
      hostname: 'api.vapi.ai',
      path: endpoint,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${VAPI_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(`VAPI API error ${res.statusCode}: ${JSON.stringify(parsed)}`));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error(`Failed to parse VAPI response: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
