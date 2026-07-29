import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '../../lib/supabase';
import {
  classifyMessage, draftReply, mergeApplicant, computeScore, isApplicantComplete,
  nextMissingQuestion, OPENER_QUESTION, buildHistory, pickSlot, MOCK_SLOTS,
  styleGuidanceBlock, summarizeConversation,
} from '../../lib/pipeline';
import { Applicant } from '../../lib/types';

interface ProcessRequest {
  deviceSecret: string;
  channel: 'sms' | 'whatsapp';
  contactIdentifier: string;
  contactName?: string;
  trusted: boolean;
  body: string;
}

interface ProcessResponse {
  conversationId: string;
  messageId: string;
  category: string;
  autoSendText: string | null;
  needsApproval: boolean;
  draftText: string | null;
  decisionCreated: 'qualify' | 'viewing' | null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const body: ProcessRequest = req.body;
  if (body.deviceSecret !== process.env.DEVICE_SHARED_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const OWNER_NUMBERS = ['4162712651', '6136979883'];
  const cleanId = body.contactIdentifier.replace(/\D/g, '');
  if (OWNER_NUMBERS.some(n => cleanId === n || cleanId.endsWith(n))) {
    return res.status(200).json({ conversationId: '', messageId: '', category: 'OTHER',
      autoSendText: null, needsApproval: false, draftText: null, decisionCreated: null });
  }

  const bodyLower = body.body.trim().toLowerCase();
  if (bodyLower.startsWith('you:') || bodyLower.startsWith('you :')) {
    return res.status(200).json({ conversationId: '', messageId: '', category: 'OTHER',
      autoSendText: null, needsApproval: false, draftText: null, decisionCreated: null });
  }

  const effectiveBody = body.body.trim() || '[sent a photo or media — no text]';

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

  const { data: incomingMsg, error: insertError } = await supabaseAdmin
    .from('messages')
    .insert({ conversation_id: conv.id, direction: 'incoming', body: effectiveBody, status: 'received' })
    .select('*')
    .single();

  if (insertError || !incomingMsg) {
    console.error('Failed to insert message:', insertError);
    return res.status(500).json({ error: 'Failed to save message', detail: insertError?.message });
  }

  const { data: priorMessages } = await supabaseAdmin
    .from('messages')
    .select('direction, body')
    .eq('conversation_id', conv.id)
    .order('created_at', { ascending: true })
    .limit(61);

  const contactName = conv.contact_name || body.contactName || undefined;
  const history = buildHistory((priorMessages || []).slice(0, -1), conv.summary, contactName);

  const { data: applicantRow } = await supabaseAdmin
    .from('applicants').select('*').eq('conversation_id', conv.id).maybeSingle();

  const applicant: Applicant = applicantRow ? {
    name: applicantRow.name,
    moveInDate: applicantRow.move_in_date,
    occupants: applicantRow.occupants,
    hasPets: applicantRow.has_pets,
    petDetails: applicantRow.pet_details,
    smoker: applicantRow.smoker,
    employmentStatus: applicantRow.employment_status,
    incomeVerificationOk: applicantRow.income_verification_ok,
    creditCheckOk: applicantRow.credit_check_ok,
    viewingRequestedTime: applicantRow.viewing_requested_time,
    qualificationScore: applicantRow.qualification_score,
  } : {};

  const { data: styleExamples } = await supabaseAdmin
    .from('style_examples').select('original, edited')
    .order('created_at', { ascending: false }).limit(5);

  const { data: ownerProfile } = await supabaseAdmin
    .from('owner_profile').select('*').eq('id', 1).maybeSingle();

  const ownerContext = ownerProfile ? [
    ownerProfile.name && `Name: ${ownerProfile.name}`,
    ownerProfile.age && `Age: ${ownerProfile.age}`,
    ownerProfile.occupation && `Occupation: ${ownerProfile.occupation}${ownerProfile.employer ? ` at ${ownerProfile.employer}` : ''}`,
    ownerProfile.location && `Location: ${ownerProfile.location}`,
    ownerProfile.physical_description && `Physical: ${ownerProfile.physical_description}`,
    ownerProfile.other_context && `Other: ${ownerProfile.other_context}`,
  ].filter(Boolean).join(', ') : undefined;

  const response: ProcessResponse = {
    conversationId: conv.id,
    messageId: incomingMsg.id,
    category: 'OTHER',
    autoSendText: null,
    needsApproval: false,
    draftText: null,
    decisionCreated: null,
  };

  if (conv.viewing_slots_offered && !conv.viewing_confirmed) {
    const slot = await pickSlot(effectiveBody, MOCK_SLOTS);
    if (slot) {
      const { data: existingDecision } = await supabaseAdmin
        .from('decisions').select('id')
        .eq('conversation_id', conv.id)
        .eq('type', 'viewing')
        .eq('status', 'pending')
        .maybeSingle();
      if (!existingDecision) {
        response.autoSendText = "Got it — let me confirm that and get right back to you!";
        await supabaseAdmin.from('decisions').insert({
          conversation_id: conv.id,
          type: 'viewing',
          slot,
          status: 'pending',
          draft_message: `Great, ${slot} works perfectly — see you then! I'll send the address closer to the time.`,
        });
        response.decisionCreated = 'viewing';
      } else {
        response.autoSendText = "Just confirming with the owner — one moment!";
      }
    } else {
      response.autoSendText = `No worries — would any of these work? ${MOCK_SLOTS.join(', ')}`;
    }
  } else {
    const classification = await classifyMessage(history, effectiveBody, contactName, ownerContext);
    response.category = classification.category;

    await supabaseAdmin.from('messages')
      .update({ category: classification.category, intent: classification.intent })
      .eq('id', incomingMsg.id);

    const isRentalAutoPilot = classification.category === 'RENTAL_INQUIRY' && !body.trusted;
    const isSmsAutoReply = body.channel === 'sms' &&
      ['PERSONAL', 'GENERAL_CONVERSATION', 'WORK', 'OTHER'].includes(classification.category);

    if (isRentalAutoPilot) {
      const merged = mergeApplicant(applicant, classification.extracted_info || {});
      merged.qualificationScore = computeScore(merged);
      const complete = isApplicantComplete(merged);
      const nextQ = complete
        ? null
        : (conv.opener_asked ? nextMissingQuestion(merged) : OPENER_QUESTION);

      const draft = await draftReply({
        category: classification.category,
        history,
        message: effectiveBody,
        nextQuestion: nextQ,
        styleGuidance: styleGuidanceBlock(styleExamples || []),
        contactName,
        ownerContext,
      });
      response.autoSendText = draft;

      await supabaseAdmin.from('applicants').upsert({
        conversation_id: conv.id,
        name: merged.name,
        move_in_date: merged.moveInDate,
        occupants: merged.occupants,
        has_pets: merged.hasPets,
        pet_details: merged.petDetails,
        smoker: merged.smoker,
        employment_status: merged.employmentStatus,
        income_verification_ok: merged.incomeVerificationOk,
        credit_check_ok: merged.creditCheckOk,
        viewing_requested_time: merged.viewingRequestedTime,
        qualification_score: merged.qualificationScore,
      });

      await supabaseAdmin.from('conversations')
        .update({ opener_asked: true })
        .eq('id', conv.id);

      if (complete && !conv.decision_pending && conv.decision_made === null) {
        await supabaseAdmin.from('decisions').insert({
          conversation_id: conv.id,
          type: 'qualify',
          status: 'pending',
        });
        await supabaseAdmin.from('conversations')
          .update({ decision_pending: true })
          .eq('id', conv.id);
        response.decisionCreated = 'qualify';
      }
    } else if (classification.category === 'SPAM') {
      // Silently dropped — no reply, no notification
    } else if (isSmsAutoReply) {
      const draft = await draftReply({
        category: classification.category,
        history,
        message: effectiveBody,
        nextQuestion: null,
        styleGuidance: styleGuidanceBlock(styleExamples || []),
        contactName,
        ownerContext,
      });
      if (draft) response.autoSendText = draft;
    } else {
      const draft = await draftReply({
        category: classification.category,
        history,
        message: effectiveBody,
        nextQuestion: null,
        styleGuidance: styleGuidanceBlock(styleExamples || []),
        contactName,
        ownerContext,
      });
      if (draft) {
        response.needsApproval = true;
        response.draftText = draft;
        await supabaseAdmin.from('messages').insert({
          conversation_id: conv.id,
          direction: 'outgoing',
          body: draft,
          status: 'drafted',
        });
      }
    }
  }

  if (response.autoSendText) {
    await supabaseAdmin.from('messages').insert({
      conversation_id: conv.id,
      direction: 'outgoing',
      body: response.autoSendText,
      status: 'sent',
      auto_sent: true,
    });
  }

  const newCount = (priorMessages?.length || 0) + 1 + (response.autoSendText ? 1 : 0);
  if (newCount - conv.last_summarized_at >= 10) {
    const { data: allMsgs } = await supabaseAdmin
      .from('messages')
      .select('direction, body')
      .eq('conversation_id', conv.id)
      .order('created_at');
    const fullText = (allMsgs || [])
      .map(m => (m.direction === 'incoming' ? 'Them: ' : 'You: ') + m.body)
      .join('\n');
    const summary = await summarizeConversation(fullText);
    await supabaseAdmin.from('conversations')
      .update({ summary, last_summarized_at: newCount })
      .eq('id', conv.id);
  }

  res.status(200).json(response);
}
