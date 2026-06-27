import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '../../lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { data: decisions } = await supabaseAdmin
    .from('decisions')
    .select('*, conversations(contact_name, contact_identifier, channel)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  const { data: queue } = await supabaseAdmin
    .from('messages')
    .select('*, conversations(contact_name, contact_identifier, channel)')
    .eq('status', 'drafted')
    .order('created_at', { ascending: true });

  const { data: conversations } = await supabaseAdmin
    .from('conversations')
    .select('*, messages(body, direction, created_at)')
    .order('created_at', { ascending: false })
    .limit(20);

  const { data: applicants } = await supabaseAdmin
    .from('applicants')
    .select('*, conversations(contact_name, contact_identifier)')
    .gte('qualification_score', 6)
    .order('qualification_score', { ascending: false });

  const { data: scheduledRules } = await supabaseAdmin
    .from('scheduled_rules')
    .select('*, conversations(contact_name, contact_identifier)');

  res.status(200).json({ decisions, queue, conversations, applicants, scheduledRules });
}
