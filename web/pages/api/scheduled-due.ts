import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '../../lib/supabase';
import { callClaude } from '../../lib/claude';
import { buildHistory, styleGuidanceBlock } from '../../lib/pipeline';

// Android calls this every ~15-30 min via WorkManager. Only SMS rules are
// returned — WhatsApp's reply-only mechanism (see WhatsAppNotificationListener)
// has no way to send a brand-new outbound message, only reply to an existing
// notification. A WhatsApp "scheduled good morning" isn't possible under
// Option 1 at all; that limitation lives here, not as an oversight.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.query.deviceSecret !== process.env.DEVICE_SHARED_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const nowTime = `${hh}:${mm}`;
  const today = now.toISOString().slice(0, 10);

  const { data: dueRules } = await supabaseAdmin
    .from('scheduled_rules')
    .select('*, conversations(channel, contact_identifier, contact_name)')
    .eq('send_time', nowTime)
    .or(`last_sent_date.is.null,last_sent_date.neq.${today}`);

  const results: Array<{ ruleId: string; phoneNumber: string; text: string }> = [];

  for (const rule of dueRules || []) {
    const conv = rule.conversations;
    if (!conv || conv.channel !== 'sms') continue; // see comment above

    const { data: recentMessages } = await supabaseAdmin
      .from('messages').select('direction, body').eq('conversation_id', rule.conversation_id)
      .order('created_at', { ascending: true });

    const { data: styleExamples } = await supabaseAdmin
      .from('style_examples').select('original, edited').order('created_at', { ascending: false }).limit(5);

    const history = buildHistory(recentMessages || [], null);
    const prompt = `Write a short, warm, natural-sounding text message for this recurring scenario: "${rule.theme}".${styleGuidanceBlock(styleExamples || [])}
It should feel personal, not generic or repetitive — vary the wording naturally each time rather than using a stock phrase.

Recent conversation for tone/context:
${history}

Reply with ONLY the message text — no quotes, no preamble.`;

    const text = (await callClaude(prompt, 150)).trim();

    await supabaseAdmin.from('messages').insert({
      conversation_id: rule.conversation_id, direction: 'outgoing', body: text, status: 'sent', auto_sent: true,
    });
    await supabaseAdmin.from('scheduled_rules').update({ last_sent_date: today }).eq('id', rule.id);

    results.push({ ruleId: rule.id, phoneNumber: conv.contact_identifier, text });
  }

  // Android sends each of these via SmsManager, then we're done — no
  // confirmation callback needed since we already marked it sent above.
  res.status(200).json({ due: results });
}
