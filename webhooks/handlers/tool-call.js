'use strict';

/**
 * Handle VAPI tool-call events.
 * 
 * Supported tools:
 * - lookup_contact(phone): Returns name, language, notes for a contact
 * - confirm_attendance(phone, event): Marks contact as confirmed for an event
 * 
 * @param {object} message - VAPI tool-calls message
 * @param {object} supabase - Supabase client
 * @returns {Array} Array of {toolCallId, result} objects
 */
async function toolCallHandler(message, supabase) {
  const toolCallList = message.toolCallList || message.toolCalls || [];
  const results = [];

  for (const toolCall of toolCallList) {
    const toolCallId = toolCall.id;
    const functionName = toolCall.function?.name;
    const args = toolCall.function?.arguments || {};

    // Parse args if they come as a JSON string
    const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;

    console.log(`[tool-call] Calling ${functionName} with args:`, parsedArgs);

    try {
      let result;

      switch (functionName) {
        case 'lookup_contact':
          result = await lookupContact(parsedArgs.phone, supabase);
          break;

        case 'confirm_attendance':
          result = await confirmAttendance(parsedArgs.phone, parsedArgs.event, supabase);
          break;

        default:
          result = { error: `Unknown tool: ${functionName}` };
      }

      results.push({
        toolCallId,
        result: typeof result === 'string' ? result : JSON.stringify(result)
      });

    } catch (err) {
      console.error(`[tool-call] Error in ${functionName}:`, err.message);
      results.push({
        toolCallId,
        result: JSON.stringify({ error: err.message })
      });
    }
  }

  return results;
}

/**
 * Look up a contact by phone number.
 * Returns name, language, and notes from voice_campaign_contacts.
 */
async function lookupContact(phone, supabase) {
  if (!phone) return { error: 'phone is required' };
  if (!supabase) return { error: 'Database not available' };

  const { data, error } = await supabase
    .from('voice_campaign_contacts')
    .select('name, language, notes, campaign_id, status')
    .eq('phone', phone)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    console.warn('[tool-call] lookup_contact error:', error.message);
    return { found: false, message: 'Contact not found in database' };
  }

  return {
    found: true,
    name: data.name || null,
    language: data.language || 'English',
    notes: data.notes || null,
    campaign_id: data.campaign_id,
    status: data.status
  };
}

/**
 * Confirm a contact's attendance for an event.
 * Updates their status to 'confirmed' in voice_campaign_contacts.
 */
async function confirmAttendance(phone, event, supabase) {
  if (!phone) return { error: 'phone is required' };
  if (!supabase) return { error: 'Database not available' };

  // Update all active campaign entries for this phone to 'confirmed'
  const { data, error } = await supabase
    .from('voice_campaign_contacts')
    .update({
      status: 'confirmed',
      outcome: event ? `confirmed for: ${event}` : 'confirmed attendance',
      last_called_at: new Date().toISOString()
    })
    .eq('phone', phone)
    .in('status', ['pending', 'called', 'answered', 'voicemail'])
    .select('campaign_id, name');

  if (error) {
    console.error('[tool-call] confirm_attendance error:', error.message);
    return { success: false, error: error.message };
  }

  const count = data?.length || 0;
  console.log(`[tool-call] ✅ Confirmed attendance for ${phone} (${count} records updated)`);

  return {
    success: true,
    message: `Attendance confirmed${event ? ` for ${event}` : ''}`,
    records_updated: count
  };
}

module.exports = toolCallHandler;
