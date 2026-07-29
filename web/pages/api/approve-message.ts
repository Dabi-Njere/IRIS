import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '../../lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  const { messageId, action, editedText } = req.body as {
    messageId: string; action: 'approve' | 'decline'; editedText?: string;
  };

  if (action === 'decline') {
    await supabaseAdmin.from('messages').update({ status: 'rejected' }).eq('id', messageId);
    return res.status(200).json({ ok: true });
  }

  const { data: message } = await supabaseAdmin
    .from('messages').select('*').eq('id', messageId).single();
  if (!message) return res.status(404).json({ error: 'not found' });

  const finalText = (editedText || message.body).trim();
  if (editedText && editedText.trim() !== message.body.trim()) {
    await supabaseAdmin.from('style_examples')
      .insert({ original: message.body.trim(), edited: editedText.trim() });
  }

  await supabaseAdmin.from('messages')
    .update({ body: finalText, status: 'approved' }).eq('id', messageId);
  res.status(200).json({ ok: true, finalText });
}
