import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '../../lib/supabase';
import { callClaude } from '../../lib/claude';
import { buildHistory, styleGuidanceBlock } from '../../lib/pipeline';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.query.deviceSecret !== process.env.DEVICE_SHARED_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const nowTotalMins = now.getHours() * 60 + now.getMinutes();

  // 20-minute window — Android polls every ~15 min so an exact match
  // would randomly miss sends depending on poll timing
  const windowMinutes = 20;

  const { data: allRules } = await supabaseAdmin
    .from('scheduled_rules')
    .select('*, conversations(channel, contact_identifier, contact_name)')
    .or(`last_sent_date.is.null,last_sent_date.neq.${today}`);

  const results: Array<{ ruleId: string; phoneNumber: string; text: string }> = [];

  for (const rule of allRules || []) {
    const conv = rule.conversations;
    if (!conv || conv.channel !== 'sms') continue;

    const [scheduledHour, scheduledMin] = rule.send_time.split(':').map(Number);
    const scheduledTotalMins = scheduledHour * 60 + scheduledMin;
    const diff = Math.abs(nowTotalMins - scheduledTotalMins);
    if (diff > windowMinutes) continue;

    const { data: recentMessages } = await supabaseAdmin
      .from('messages').select('direction, body')
      .eq('conversation_id', rule.conversation_id)
      .order('created_at', { ascending: true }).limit(20);

    const { data: styleExamples } = await supabaseAdmin
      .from('style_examples').select('original, edited')
      .order('created_at', { ascending: false }).limit(5);

    const { data: ownerProfile } = await supabaseAdmin
      .from('owner_profile').select('*').eq('id', 1).maybeSingle();

    const ownerContext = ownerProfile
      ? `Owner: ${ownerProfile.name}, ${ownerProfile.age}, ${ownerProfile.occupation} at ${ownerProfile.employer}.`
      : '';

    const history = buildHistory(
      recentMessages || [], null, conv.contact_name || undefined
    );

    const prompt = `Write a short, warm, natural-sounding text message for this recurring scenario: "${rule.theme}".
${styleGuidanceBlock(styleExamples || [])}
${ownerContext ? `\nContext: ${ownerContext}` : ''}

Vary the wording naturally each time — never use a stock phrase. Keep it genuine.
Recent conversation for tone/context:
${history}

Reply with ONLY the message text — no quotes, no preamble.`;

    const text = (await callClaude(prompt, 150)).trim();

    await supabaseAdmin.from('messages').insert({
      conversation_id: rule.conversation_id,
      direction: 'outgoing', body: text, status: 'sent', auto_sent: true,
    });

    await supabaseAdmin.from('scheduled_rules')
      .update({ last_sent_date: today }).eq('id', rule.id);

    results.push({ ruleId: rule.id, phoneNumber: conv.contact_identifier, text });
  }

  res.status(200).json({ due: results });
}
