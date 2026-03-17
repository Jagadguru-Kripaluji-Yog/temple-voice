# Do-Not-Call List

**File:** `contacts/do-not-call.csv`

---

## Rules (STRICT)

1. **NEVER delete entries** — this list is append-only
2. **NEVER call anyone on this list** — the launch script filters them automatically
3. **Entries are permanent** — once added, someone stays off our call lists forever unless they explicitly request removal

---

## How It Works

The DNC list is checked automatically:
- By `scripts/launch-campaign.js` before firing any calls
- By `scripts/validate-contacts.js` when cleaning contact lists
- By `webhooks/handlers/end-of-call.js` when someone opts out during a call

When someone says "please remove me", "stop calling", "do not call", or similar phrases during a call, the webhook handler **automatically appends them to this file** and updates their status in Supabase to `opted-out`.

---

## How to Manually Add Someone

Append a new row to `contacts/do-not-call.csv`:

```csv
+12145551234,Jane Smith,requested removal,2026-03-17
```

Fields:
| Field | Description |
|-------|-------------|
| `phone` | E.164 format (+1XXXXXXXXXX) |
| `name` | Person's name (or "Unknown") |
| `reason` | Why they're on the list |
| `added_date` | Date added (YYYY-MM-DD) |

Then commit:
```bash
git add contacts/do-not-call.csv
git commit -m "chore: add [name] to DNC list"
git push origin main
```

---

## Legal Note

Maintaining this list helps us comply with the Telephone Consumer Protection Act (TCPA) and respect our community members' wishes. When in doubt, add someone to this list.
