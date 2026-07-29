import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '../../lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.query.deviceSecret !== process.env.DEVICE_SHARED_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const { data } = await supabaseAdmin
    .from('messages')
    .select('id, body, conversation_id, conversations(channel, contact_identifier)')
    .eq('status', 'approved')
    .order('created_at', { ascending: true });

  res.status(200).json({ pending: data || [] });
}
