#!/usr/bin/env node
'use strict';

/**
 * validate-contacts.js
 * Usage: node scripts/validate-contacts.js <input.csv> [output.csv]
 * 
 * Validates, normalizes, and deduplicates a contact CSV file.
 * Checks against the DNC list and outputs a clean file ready for campaigns.
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const DNC_FILE = path.join(ROOT_DIR, 'contacts', 'do-not-call.csv');

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const inputFile = process.argv[2];
  if (!inputFile) {
    console.error('Usage: node scripts/validate-contacts.js <input.csv> [output.csv]');
    console.error('Example: node scripts/validate-contacts.js my-list.csv');
    process.exit(1);
  }

  if (!fs.existsSync(inputFile)) {
    console.error(`❌ File not found: ${inputFile}`);
    process.exit(1);
  }

  // Default output file
  const ext = path.extname(inputFile);
  const base = path.basename(inputFile, ext);
  const dir = path.dirname(inputFile);
  const outputFile = process.argv[3] || path.join(dir, `${base}-cleaned${ext}`);

  console.log(`\n🪷 Temple Voice — Contact Validator`);
  console.log('─'.repeat(50));
  console.log(`   Input:  ${inputFile}`);
  console.log(`   Output: ${outputFile}`);

  // Load DNC list
  const dncPhones = new Set();
  if (fs.existsSync(DNC_FILE)) {
    const dncRows = parseCSV(fs.readFileSync(DNC_FILE, 'utf8'));
    for (const row of dncRows) {
      const phone = normalizePhone(row.phone);
      if (phone) dncPhones.add(phone);
    }
  }
  console.log(`   DNC entries: ${dncPhones.size}`);

  // Parse input
  const raw = parseCSV(fs.readFileSync(inputFile, 'utf8'));
  console.log(`\n📋 Raw contacts: ${raw.length}`);

  const stats = {
    total: raw.length,
    valid: 0,
    invalid: 0,
    duplicates: 0,
    dncFiltered: 0
  };

  const seen = new Set();
  const cleaned = [];
  const invalid = [];

  for (const row of raw) {
    const phone = normalizePhone(row.phone);

    if (!phone) {
      stats.invalid++;
      invalid.push({ ...row, _reason: 'invalid phone' });
      continue;
    }

    // Deduplicate
    if (seen.has(phone)) {
      stats.duplicates++;
      continue;
    }
    seen.add(phone);

    // DNC check
    if (dncPhones.has(phone)) {
      stats.dncFiltered++;
      console.log(`   🚫 DNC: ${row.name || 'Unknown'} (${phone})`);
      continue;
    }

    stats.valid++;
    cleaned.push({
      name: (row.name || '').trim(),
      phone,
      language: (row.language || 'English').trim(),
      notes: (row.notes || '').trim()
    });
  }

  // Write output
  const header = 'name,phone,language,notes';
  const rows = cleaned.map(r =>
    `${csvEscape(r.name)},${r.phone},${csvEscape(r.language)},${csvEscape(r.notes)}`
  );
  fs.writeFileSync(outputFile, [header, ...rows].join('\n') + '\n', 'utf8');

  // Report invalid
  if (invalid.length > 0) {
    console.log(`\n⚠️  Invalid rows (${invalid.length}):`);
    for (const row of invalid) {
      console.log(`   - ${row.name || '(no name)'}: phone="${row.phone}" — ${row._reason}`);
    }
  }

  // Summary
  console.log('\n' + '═'.repeat(50));
  console.log('📊 VALIDATION SUMMARY');
  console.log('═'.repeat(50));
  console.log(`   Total input:       ${stats.total}`);
  console.log(`   Valid contacts:    ${stats.valid}`);
  console.log(`   Invalid phones:    ${stats.invalid}`);
  console.log(`   Duplicates removed:${stats.duplicates}`);
  console.log(`   DNC filtered:      ${stats.dncFiltered}`);
  console.log(`   Output file:       ${outputFile}`);
  console.log('═'.repeat(50));
  console.log(`\n✅ Clean file ready: ${outputFile}`);
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
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length > 10) return `+${digits}`;
  return null; // too short — invalid
}

function csvEscape(value) {
  if (!value) return '';
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

main();
