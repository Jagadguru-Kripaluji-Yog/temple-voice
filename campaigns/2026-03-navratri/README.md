# Campaign: Chaitra Navratri + Ram Navami 2026

**Status:** 🟢 READY  
**Created:** 2026-03-17 by Brahma 🪷

---

## Purpose

Outreach calls to the RKT Dallas community inviting them to three consecutive spring celebrations:

1. **Ugadi & Gudi Padwa** — Hindu New Year (Telugu/Kannada/Marathi)  
   - Session 1: Thursday, March 19 at 7:00 PM  
   - Session 2: Saturday, March 21 at 10:00 AM

2. **Chaitra Navratri** — Nine Sacred Nights of Goddess Durga  
   - Daily: March 19–29, 6:00 PM to 8:00 PM

3. **Ram Navami** — Lord Ram's Birthday  
   - Main celebration: March 26–29  
   - Ram Navami (actual birthday): March 29

All events at Radha Krishna Temple of Dallas, 1450 N. Watters Rd, Allen, TX 75013. **FREE.**

---

## Voice Agent

- **Agent:** Arjun
- **Assistant ID:** `11325470-888c-48dd-a76e-eaeb5522bb7d`
- **Calling from:** +14697951551

---

## Calling Window

| Setting | Value |
|---------|-------|
| Timezone | America/Chicago (CST) |
| Days | Tue, Wed, Thu, Fri, Sat |
| Hours | 11:00 AM – 7:00 PM |
| Max attempts | 2 |
| Retry after | 24 hours (no-answer or busy only) |

---

## How to Add Contacts

1. Prepare a CSV with columns: `name,phone,language,notes`
2. Validate it first:
   ```bash
   node scripts/validate-contacts.js my-list.csv
   ```
3. Copy the cleaned output to this campaign:
   ```bash
   cp my-list-cleaned.csv campaigns/2026-03-navratri/contacts.csv
   ```
4. Launch:
   ```bash
   node scripts/launch-campaign.js 2026-03-navratri
   ```

---

## Results

- **Call logs:** `results/calls.jsonl` — one JSON record per completed call
- **Opt-outs:** `results/opt-outs.csv` — auto-populated by webhook server
- **Summary:** `results/summary.md` — run `node scripts/report.js 2026-03-navratri`

---

## Contact

Questions about this campaign? Contact:
- **Sivram Sahu** — Confer Solutions (campaign technical lead)
- **Temple office** — RadhaKrishnaTemple.net
