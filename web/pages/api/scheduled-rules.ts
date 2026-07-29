import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '../../lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    const { conversationId, phoneNumber, contactName, sendTime, theme } = req.body;
    let convId = conversationId;

    if (!convId && phoneNumber) {
      const { data: existing } = await supabaseAdmin
        .from('conversations').select('id')
        .eq('channel', 'sms').eq('contact_identifier', phoneNumber).maybeSingle();

      if (existing) {
        convId = existing.id;
      } else {
        const { data: created, error: convError } = await supabaseAdmin
          .from('conversations')
          .insert({ channel: 'sms', contact_identifier: phoneNumber, contact_name: contactName || null, trusted: true })
          .select('id').single();
        if (convError || !created) return res.status(400).json({ error: convError?.message || 'Failed to create conversation' });
        convId = created.id;
      }
    }

    if (!convId) return res.status(400).json({ error: 'Provide either conversationId or phoneNumber' });

    const { data, error } = await supabaseAdmin
      .from('scheduled_rules')
      .insert({ conversation_id: convId, send_time: sendTime, theme })
      .select('*, conversations(contact_name, contact_identifier)').single();
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'DELETE') {
    const { id } = req.body;
    await supabaseAdmin.from('scheduled_rules').delete().eq('id', id);
    return res.status(200).json({ ok: true });
  }

  res.status(405).end();
}
