import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '../../lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  if (req.body.deviceSecret !== process.env.DEVICE_SHARED_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const { messageId, success } = req.body as { messageId: string; success: boolean };

  // 'send_failed' surfaces in the dashboard so the owner knows to reply
  // manually — this is the realistic outcome if, e.g., the app process was
  // killed and the WhatsApp reply action no longer exists in memory.
  await supabaseAdmin.from('messages').update({ status: success ? 'sent' : 'send_failed' }).eq('id', messageId);
  res.status(200).json({ ok: true });
}
