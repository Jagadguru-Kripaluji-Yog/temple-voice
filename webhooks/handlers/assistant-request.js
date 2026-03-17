'use strict';

const DEFAULT_ASSISTANT_ID = process.env.DEFAULT_ASSISTANT_ID || '11325470-888c-48dd-a76e-eaeb5522bb7d';

/**
 * Handle VAPI assistant-request events for inbound calls.
 * 
 * This is called when someone calls our prod number and VAPI needs to know
 * which assistant to use. Currently returns Arjun by default.
 * 
 * Future expansion:
 * - Language detection from caller's phone number country code
 * - Look up active campaign to pick the right assistant
 * - Time-of-day routing (different agents for different shifts)
 * - VIP caller routing
 * 
 * @param {object} message - VAPI assistant-request message
 * @param {object} supabase - Supabase client (for future lookups)
 * @returns {object} VAPI assistant response
 */
async function assistantRequestHandler(message, supabase) {
  const call = message.call || {};
  const callerPhone = call.customer?.number || null;
  const phoneNumberId = call.phoneNumber?.id || null;

  console.log(`[assistant-request] Inbound call from ${callerPhone} to phoneNumberId=${phoneNumberId}`);

  // Future: Look up active campaign for this phone number
  // Future: Detect language from caller profile
  // Future: Route to specialized assistant based on time or caller history

  // For now: always route to Arjun (the festival outreach agent)
  const assistantId = await resolveAssistant(callerPhone, phoneNumberId, supabase);

  console.log(`[assistant-request] Routing to assistantId=${assistantId}`);

  return {
    assistantId,
    // Optionally override parts of the assistant config:
    // assistantOverrides: {
    //   firstMessage: `Radhey Radhey! Thanks for calling Radha Krishna Temple.`,
    // }
  };
}

/**
 * Determine which assistant to use for an inbound call.
 * Currently always returns the default (Arjun).
 * 
 * @param {string|null} callerPhone
 * @param {string|null} phoneNumberId
 * @param {object} supabase
 * @returns {string} VAPI assistant ID
 */
async function resolveAssistant(callerPhone, phoneNumberId, supabase) {
  // Phase 2: Check if there's an active campaign with a preferred assistant
  // if (supabase && phoneNumberId) {
  //   const { data } = await supabase
  //     .from('voice_campaigns')
  //     .select('assistant_id')
  //     .eq('phone_number_id', phoneNumberId)
  //     .eq('status', 'ACTIVE')
  //     .single();
  //   if (data?.assistant_id) return data.assistant_id;
  // }

  return DEFAULT_ASSISTANT_ID;
}

module.exports = assistantRequestHandler;
