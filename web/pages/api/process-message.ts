import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '../../lib/supabase';
import {
  classifyMessage, draftReply, mergeApplicant, computeScore, isApplicantComplete,
  nextMissingQuestion, OPENER_QUESTION, buildHistory, pickSlot, MOCK_SLOTS,
  styleGuidanceBlock, summarizeConversation,
} from '../../lib/pipeline';
import { Applicant } from '../../lib/types';

// What Android sends for every incoming SMS/WhatsApp message.
interface ProcessRequest {
  deviceSecret: string;
  channel: 'sms' | 'whatsapp';
  contactIdentifier: string; // phone number (SMS) or WhatsApp display name
  contactName?: string;
  trusted: boolean;          // Android determined this via ContactsContract.PhoneLookup (SMS) or a contacts cross-check (WhatsApp)
  body: string;
}

// What Android gets back — enough to decide what to actually DO on-device.
interface ProcessResponse {
  conversationId: string;
  messageId: string;
  category: string;
  autoSendText: string | null;   // if set, Android should send this immediately (no approval needed)
  needsApproval: boolean;        // if true, show a notification and wait for the owner
  draftText: string | null;      // the draft to show if needsApproval
  decisionCreated: 'qualify' | 'viewing' | null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const body: ProcessRequest = req.body;
  if (body.deviceSecret !== process.env.DEVICE_SHARED_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  // Safety net: if somehow a "You:" message slips through the Android
  // listener, drop it here rather than process and reply to our own message.
  const bodyLower = body.body.trim().toLowerCase();
  if (bodyLower.startsWith('you:') || bodyLower.startsWith('you :')) {
    return res.status(200).json({ conversationId: '', messageId: '', category: 'OTHER',
      autoSendText: null, needsApproval: false, draftText: null, decisionCreated: null });
  }

  // 1) Find or create the conversation.
  let { data: conv } = await supabaseAdmin
    .from('conversations')
    .select('*')
    .eq('channel', body.channel)
    .eq('contact_identifier', body.contactIdentifier)
    .maybeSingle();

  if (!conv) {
    const { data: created, error: convError } = await supabaseAdmin
      .from('conversations')
      .insert({
        channel: body.channel,
        contact_identifier: body.contactIdentifier,
        contact_name: body.contactName ?? null,
        trusted: body.trusted,
      })
      .select('*')
      .single();
    if (convError || !created) {
      console.error('Failed to create conversation:', convError);
      return res.status(500).json({ error: 'Failed to create conversation', detail: convError?.message });
    }
    conv = created;
  }

  // 2) Insert the incoming message.
  const { data: incomingMsg, error: insertError } = await supabaseAdmin
    .from('messages')
    .insert({ conversation_id: conv.id, direction: 'incoming', body: body.body, status: 'received' })
    .select('*')
    .single();

  if (insertError || !incomingMsg) {
    console.error('Failed to insert message:', insertError);
    return res.status(500).json({ error: 'Failed to save message', detail: insertError?.message });
  }

  // 3) Build history + fetch applicant.
  const { data: priorMessages } = await supabaseAdmin
    .from('messages')
    .select('direction, body')
    .eq('conversation_id', conv.id)
    .order('created_at', { ascending: true });

  const history = buildHistory((priorMessages || []).slice(0, -1), conv.summary);

  const { data: applicantRow } = await supabaseAdmin
    .from('applicants')
    .select('*')
    .eq('conversation_id', conv.id)
    .maybeSingle();

  const applicant: Applicant = applicantRow ? {
    name: applicantRow.name, moveInDate: applicantRow.move_in_date, occupants: applicantRow.occupants,
    hasPets: applicantRow.has_pets, petDetails: applicantRow.pet_details, smoker: applicantRow.smoker,
    employmentStatus: applicantRow.employment_status, incomeVerificationOk: applicantRow.income_verification_ok,
    creditCheckOk: applicantRow.credit_check_ok, viewingRequestedTime: applicantRow.viewing_requested_time,
    qualificationScore: applicantRow.qualification_score,
  } : {};

  const { data: styleExamples } = await supabaseAdmin
    .from('style_examples')
    .select('original, edited')
    .order('created_at', { ascending: false })
    .limit(5);

  const response: ProcessResponse = {
    conversationId: conv.id, messageId: incomingMsg.id, category: 'OTHER',
    autoSendText: null, needsApproval: false, draftText: null, decisionCreated: null,
  };

  // --- Viewing slot picking sub-flow (only reachable after a qualify decision was approved) ---
  if (conv.viewing_slots_offered && !conv.viewing_confirmed) {
    const slot = await pickSlot(body.body, MOCK_SLOTS);
    if (slot) {
      const { data: existingDecision } = await supabaseAdmin
        .from('decisions').select('id').eq('conversation_id', conv.id).eq('type', 'viewing').eq('status', 'pending').maybeSingle();
      if (!existingDecision) {
        response.autoSendText = "Got it — let me just confirm that and get right back to you!";
        await supabaseAdmin.from('decisions').insert({
          conversation_id: conv.id, type: 'viewing', slot, status: 'pending',
          draft_message: `Great, ${slot} works perfectly — see you then! I'll send the address closer to the time.`,
        });
        response.decisionCreated = 'viewing';
      } else {
        response.autoSendText = "Just confirming with the owner now — one moment!";
      }
    } else {
      response.autoSendText = `No worries — would any of these work instead? ${MOCK_SLOTS.join(', ')}`;
    }
  } else {
    // --- Normal classify step ---
    const classification = await classifyMessage(history, body.body);
    response.category = classification.category;
    await supabaseAdmin.from('messages').update({ category: classification.category, intent: classification.intent }).eq('id', incomingMsg.id);

    const isAutoPilotEligible = classification.category === 'RENTAL_INQUIRY' && !body.trusted;

    if (isAutoPilotEligible) {
      const mergedApplicant = mergeApplicant(applicant, classification.extracted_info || {});
      mergedApplicant.qualificationScore = computeScore(mergedApplicant);
      const complete = isApplicantComplete(mergedApplicant);
      const nextQ = complete ? null : (conv.opener_asked ? nextMissingQuestion(mergedApplicant) : OPENER_QUESTION);

      const draft = await draftReply({
        category: classification.category, history, message: body.body,
        nextQuestion: nextQ, styleGuidance: styleGuidanceBlock(styleExamples || []),
      });

      response.autoSendText = draft;

      await supabaseAdmin.from('applicants').upsert({
        conversation_id: conv.id, name: mergedApplicant.name, move_in_date: mergedApplicant.moveInDate,
        occupants: mergedApplicant.occupants, has_pets: mergedApplicant.hasPets, pet_details: mergedApplicant.petDetails,
        smoker: mergedApplicant.smoker, employment_status: mergedApplicant.employmentStatus,
        income_verification_ok: mergedApplicant.incomeVerificationOk, credit_check_ok: mergedApplicant.creditCheckOk,
        viewing_requested_time: mergedApplicant.viewingRequestedTime, qualification_score: mergedApplicant.qualificationScore,
      });

      await supabaseAdmin.from('conversations').update({ opener_asked: true }).eq('id', conv.id);

      if (complete && !conv.decision_pending && conv.decision_made === null) {
        await supabaseAdmin.from('decisions').insert({ conversation_id: conv.id, type: 'qualify', status: 'pending' });
        await supabaseAdmin.from('conversations').update({ decision_pending: true }).eq('id', conv.id);
        response.decisionCreated = 'qualify';
      }
    } else if (classification.category === 'SPAM') {
      // Silently dropped — no draft, no approval needed, nothing sent.
    } else {
      // Trusted contact (even if classified RENTAL_INQUIRY), or any non-rental
      // category for an unknown number — always draft-and-wait.
      const draft = await draftReply({
        category: classification.category, history, message: body.body,
        nextQuestion: null, styleGuidance: styleGuidanceBlock(styleExamples || []),
      });
      if (draft) {
        response.needsApproval = true;
        response.draftText = draft;
        await supabaseAdmin.from('messages').insert({
          conversation_id: conv.id, direction: 'outgoing', body: draft, status: 'drafted',
        });
      }
    }
  }

  if (response.autoSendText) {
    await supabaseAdmin.from('messages').insert({
      conversation_id: conv.id, direction: 'outgoing', body: response.autoSendText, status: 'sent', auto_sent: true,
    });
  }

  // Background-ish summarization check (kept inline for simplicity; fine at
  // personal-app volume — move to a queue if this ever needs to scale).
  const newCount = (priorMessages?.length || 0) + 1 + (response.autoSendText ? 1 : 0);
  if (newCount - conv.last_summarized_at >= 10) {
    const { data: allMsgs } = await supabaseAdmin.from('messages').select('direction, body').eq('conversation_id', conv.id).order('created_at');
    const fullText = (allMsgs || []).map(m => (m.direction === 'incoming' ? 'Them: ' : 'You: ') + m.body).join('\n');
    const summary = await summarizeConversation(fullText);
    await supabaseAdmin.from('conversations').update({ summary, last_summarized_at: newCount }).eq('id', conv.id);
  }

  res.status(200).json(response);
}
