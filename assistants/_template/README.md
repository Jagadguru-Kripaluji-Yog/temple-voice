# How to Create a New Voice Assistant

Follow these steps to add a new voice agent to the Temple Voice Platform.

---

## Step 1: Copy the Template

```bash
cp -r assistants/_template assistants/yourname
cd assistants/yourname
```

---

## Step 2: Write the System Prompt

Create `system-prompt.md` with the full persona, event details, call flow, and Q&A for your agent.  
Think of this as the "script + coaching" document for the voice.

Key sections to include:
- **Personality** — tone, style, warmth level
- **Organization context** — what to say about RKT/JKYog
- **Event details** — dates, times, location, cost, highlights
- **Call flow** — greeting → invitation → engagement → close
- **Q&A** — common questions and approved answers
- **Guidelines** — what NOT to do (pushy, guilt, etc.)

---

## Step 3: Edit config.json

Fill in real values:
- `name` → e.g., `"Priya - RKT Diwali Reminder"`
- `firstMessage` → the exact opening line (under 30 words)
- `voicemailMessage` → if no answer (20-30 seconds spoken aloud)
- `model.messages[0].content` → paste full system prompt text here
- Remove `_instructions` and `_note` fields before creating

---

## Step 4: Create via VAPI API

```bash
source /root/.secrets/jkyog-credentials.env

# Create the assistant
curl -s -X POST https://api.vapi.ai/assistant \
  -H "Authorization: Bearer $VAPI_API_KEY" \
  -H "Content-Type: application/json" \
  -d @assistants/yourname/config.json > /tmp/created-assistant.json

# Check the response
cat /tmp/created-assistant.json | python3 -m json.tool | head -20

# Extract the ID
ASSISTANT_ID=$(cat /tmp/created-assistant.json | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
echo "Assistant ID: $ASSISTANT_ID"
```

---

## Step 5: Update config.json with the Returned ID

```bash
# Add the ID to your config.json (edit manually or use jq)
# The VAPI response includes the full object — you can overwrite config.json with it:
cp /tmp/created-assistant.json assistants/yourname/config.json
```

---

## Step 6: Assign to a Phone Number

```bash
# Get available phone numbers
curl -s https://api.vapi.ai/phone-number \
  -H "Authorization: Bearer $VAPI_API_KEY" | python3 -m json.tool

# Assign assistant to a number
curl -s -X PATCH https://api.vapi.ai/phone-number/PHONE_NUMBER_ID \
  -H "Authorization: Bearer $VAPI_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"assistantId\": \"$ASSISTANT_ID\"}"
```

Current production numbers:
| Number | ID | Current Assistant |
|--------|----|------------------|
| +14697951551 | `9bbf1477-f0ca-4903-89bd-1101df90d511` | Arjun |
| +14693136988 | _(test)_ | Rohan variant |
| +14693136992 | _(test)_ | Neil variant |

---

## Step 7: Create CHANGELOG.md

Document what you built:

```markdown
# YourName — Change Log

## YYYY-MM-DD — Initial Creation (Your Name)
- Voice: [voice name] ([description], VAPI provider)
- Events: [what events this covers]
- Assigned to: [phone number] (ID: [phone ID])
- [Any other notable decisions]
```

---

## Step 8: Commit Everything

```bash
cd /root/repos/temple-voice
git add assistants/yourname/
git commit -m "feat: add [name] assistant for [event/purpose]"
git push origin main
```

---

## Tips

- Keep `firstMessage` under 30 words — first impressions matter
- Test with a personal number before launching to community
- VAPI dashboard: https://dashboard.vapi.ai/assistants
- If unsure about voice choice: Sagar = professional, Rohan = energetic, Neil = clear
- Always include opt-out language in system prompt: "If someone asks to not be called, respect that immediately"
