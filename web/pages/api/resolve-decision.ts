import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '../../lib/supabase';
import { MOCK_SLOTS } from '../../lib/pipeline';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  const { decisionId, outcome, editedMessage } = req.body as {
    decisionId: string; outcome: 'approved' | 'declined'; editedMessage?: string;
  };

  const { data: decision } = await supabaseAdmin
    .from('decisions').select('*').eq('id', decisionId).single();
  if (!decision) return res.status(404).json({ error: 'not found' });

  const defaultMessage = decision.type === 'viewing'
    ? (outcome === 'approved'
        ? `Great, ${decision.slot} works perfectly — see you then! I'll send the address closer to the time.`
        : `Thanks for that — that slot doesn't work on my end. Could any of these work instead? ${MOCK_SLOTS.join(', ')}?`)
    : (outcome === 'approved'
        ? `Great news — I'd like to move forward with you! Here are a few times to view the place:\n${MOCK_SLOTS.map(s => '- ' + s).join('\n')}\nLet me know what works best.`
        : `Thanks so much for your interest — I've decided to go with another applicant at this time. Wishing you all the best with your search!`);

  const finalText = (editedMessage || defaultMessage).trim();

  if (editedMessage && editedMessage.trim() !== defaultMessage.trim()) {
    await supabaseAdmin.from('style_examples')
      .insert({ original: defaultMessage.trim(), edited: editedMessage.trim() });
  }

  await supabaseAdmin.from('messages').insert({
    conversation_id: decision.conversation_id,
    direction: 'outgoing', body: finalText, status: 'approved',
  });

  await supabaseAdmin.from('decisions')
    .update({ status: 'resolved', outcome, draft_message: finalText })
    .eq('id', decisionId);

  if (decision.type === 'qualify') {
    await supabaseAdmin.from('conversations').update({
      decision_made: outcome, decision_pending: false,
      viewing_slots_offered: outcome === 'approved',
    }).eq('id', decision.conversation_id);
  } else if (decision.type === 'viewing' && outcome === 'approved') {
    await supabaseAdmin.from('conversations')
      .update({ viewing_confirmed: true }).eq('id', decision.conversation_id);
  }

  res.status(200).json({ sentText: finalText });
}
