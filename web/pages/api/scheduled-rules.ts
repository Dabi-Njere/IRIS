import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '../../lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    const { conversationId, sendTime, theme } = req.body;
    const { data, error } = await supabaseAdmin
      .from('scheduled_rules')
      .insert({ conversation_id: conversationId, send_time: sendTime, theme })
      .select('*').single();
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
