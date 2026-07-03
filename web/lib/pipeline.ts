import { callClaude, stripJsonFences } from './claude';
import { Applicant, Category, ClassificationResult } from './types';

export const MOCK_SLOTS = ['Friday 6 PM', 'Saturday 11 AM', 'Sunday 2 PM'];

export const OPENER_QUESTION =
  "What are you looking for, and tell me a bit about your situation (move-in timing, household, etc.)?";

const RENTAL_QUESTIONS: Array<[keyof Applicant, string]> = [
  ['moveInDate', 'When are you hoping to move in?'],
  ['occupants', 'How many people will be living there?'],
  ['employmentStatus', 'Could you share your current employment status?'],
  ['hasPets', 'Do you have any pets?'],
  ['smoker', 'Just to check — do you smoke?'],
  ['creditCheckOk', 'Would you be okay with a credit check as part of the application?'],
  ['incomeVerificationOk', 'Would you be able to provide income verification (pay stubs, offer letter, etc.)?'],
];

export function nextMissingQuestion(a: Applicant): string | null {
  for (const [field, question] of RENTAL_QUESTIONS) {
    if (a[field] === undefined) return question;
  }
  return null;
}

export function isApplicantComplete(a: Applicant): boolean {
  return RENTAL_QUESTIONS.every(([field]) => a[field] !== undefined);
}

export function computeScore(a: Applicant): number {
  let score = 0;
  if (a.moveInDate) score += 1;
  if (a.occupants !== undefined) score += 1;
  if (a.employmentStatus) score += 2;
  if (a.incomeVerificationOk === true) score += 2;
  if (a.creditCheckOk === true) score += 2;
  if (a.hasPets === false) score += 1;
  if (a.smoker === false) score += 1;
  return Math.min(score, 10);
}

// Same fix as the demo: parse natural-language yes/no, and NEVER overwrite a
// known value with undefined just because this turn's answer didn't parse.
function parseBool(v: any): boolean | undefined {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (['true', 'yes', 'y', 'yeah', 'yep'].includes(s)) return true;
    if (['false', 'no', 'n', 'nope', 'none', 'nah'].includes(s)) return false;
  }
  return undefined;
}

export function mergeApplicant(existing: Applicant, info: Record<string, any>): Applicant {
  const a: Applicant = { ...existing };
  const setBool = (key: keyof Applicant) => {
    if (info[key] !== undefined) {
      const parsed = parseBool(info[key]);
      if (parsed !== undefined) (a as any)[key] = parsed;
    }
  };
  if (info.moveInDate) a.moveInDate = info.moveInDate;
  if (info.occupants !== undefined) {
    const n = parseInt(info.occupants, 10);
    a.occupants = isNaN(n) ? info.occupants : n;
  }
  setBool('hasPets');
  if (info.petDetails) a.petDetails = info.petDetails;
  setBool('smoker');
  if (info.employmentStatus) a.employmentStatus = info.employmentStatus;
  setBool('incomeVerificationOk');
  setBool('creditCheckOk');
  if (info.viewingRequestedTime) a.viewingRequestedTime = info.viewingRequestedTime;
  if (info.name) a.name = info.name;
  return a;
}

export function buildHistory(
  messages: Array<{ direction: string; body: string }>,
  summary: string | null,
  contactName?: string
): string {
  if (messages.length === 0) return '(none)';
  const label = contactName && contactName.trim() ? contactName.trim() : 'Them';
  const asLines = (arr: typeof messages) =>
    arr.map(m => (m.direction === 'incoming' ? `${label}: ` : 'You: ') + m.body).join('\n');
  // Read up to 60 real messages — gives full context for ongoing conversations
  // so IRIS never asks "who is this?" to a saved contact it's been talking to.
  const recent = messages.slice(-60);
  if (summary && messages.length > 60) {
    return `Summary of earlier conversation: ${summary}\n\nLast 60 messages:\n${asLines(recent)}`;
  }
  return asLines(recent);
}

export async function classifyMessage(history: string, message: string, contactName?: string): Promise<ClassificationResult> {
  const whoTheyAre = contactName
    ? `This message is from "${contactName}" — a saved contact. Do NOT ask who they are.`
    : 'This message is from an unknown number.';

  const prompt = `You are the classification layer for a personal SMS/WhatsApp receptionist app. Read the NEW message in context and output ONLY this JSON, no markdown fences, no commentary:
{
  "category": "RENTAL_INQUIRY" | "GENERAL_CONVERSATION" | "SPAM" | "WORK" | "PERSONAL" | "OTHER",
  "intent": "short_tag_or_null",
  "extracted_info": { }
}

${whoTheyAre}

Conversation so far:
${history}

New message from them:
"${message}"

IMPORTANT — emoji and short replies:
If the conversation so far is a rental screening Q&A, classify continuations as RENTAL_INQUIRY even if the new message is just an emoji or very short reply. Interpret emoji responses to yes/no questions using context:
- 👍 🙌 ✅ 👌 "yep" "yeah" "sure" "ok" = yes/true for whatever was just asked
- 👎 🚫 ❌ "nope" "nah" "no" = no/false for whatever was just asked
- ❤️ 😊 🥰 after a warm reply = positive acknowledgment, no field to extract

If category is RENTAL_INQUIRY, extract anything mentioned into extracted_info using these exact keys when applicable: moveInDate, occupants, employmentStatus, hasPets, petDetails, smoker, creditCheckOk, incomeVerificationOk, viewingRequestedTime, name.
For hasPets, smoker, creditCheckOk, incomeVerificationOk: use real JSON booleans (true/false). A 👍 answering "do you smoke?" = smoker: false. A 👎 answering "do you have pets?" = hasPets: false. Use the conversation context to determine which field an emoji is answering.
Omit any key not mentioned. intent can be null.`;

  let raw = await callClaude(prompt, 400);
  raw = stripJsonFences(raw);
  try {
    return JSON.parse(raw);
  } catch {
    return { category: 'OTHER', intent: null, extracted_info: {} };
  }
}

export async function draftReply(opts: {
  category: Category;
  history: string;
  message: string;
  nextQuestion: string | null;
  styleGuidance: string;
  contactName?: string;
}): Promise<string> {
  if (opts.category === 'SPAM') return '';

  const nameContext = opts.contactName ? `You are replying to ${opts.contactName}. ` : '';

  let instructions: string;
  if (opts.category === 'RENTAL_INQUIRY') {
    instructions = opts.nextQuestion
      ? `${nameContext}You're replying on behalf of a landlord to a rental inquiry. Briefly acknowledge/answer what they just said (don't re-ask anything they already told you, here or earlier), then ask — in your own natural phrasing — exactly this and only this: "${opts.nextQuestion}". One question only.`
      : `${nameContext}You're replying on behalf of a landlord to a rental inquiry. Every required field has been collected — do NOT ask anything further. Just acknowledge what they said and let them know you'll follow up shortly with next steps. Don't invent viewing times or addresses.`;
  } else {
    instructions = `${nameContext}You're replying on behalf of the phone's owner. Reply naturally and conversationally, SMS length. Use the conversation history to understand context — never ask who the person is or what they were talking about if it's already in the history. If they sent a photo or media with no text, acknowledge it warmly and briefly.`;
  }

  const prompt = `${instructions}${opts.styleGuidance}

Conversation so far:
${opts.history}

Their new message:
"${opts.message}"

Reply with ONLY the SMS text to send — no quotes, no preamble, no markdown.`;

  const raw = await callClaude(prompt, 200);
  return raw.trim();
}

export async function pickSlot(message: string, offeredSlots: string[]): Promise<string | null> {
  const prompt = `A tenant was offered these viewing time slots: ${offeredSlots.join(', ')}.
They just replied: "${message}"

Did they clearly pick one of the offered slots? Respond with ONLY this JSON, no markdown:
{ "slot": "<one of the exact offered slot strings, or null if unclear>" }`;

  let raw = await callClaude(prompt, 150);
  raw = stripJsonFences(raw);
  try {
    const parsed = JSON.parse(raw);
    return offeredSlots.includes(parsed.slot) ? parsed.slot : null;
  } catch {
    return null;
  }
}

export async function summarizeConversation(fullText: string): Promise<string> {
  const prompt = `Summarize this conversation in 2-3 short sentences — key facts, decisions, and context that would matter for replying going forward. No preamble, just the summary.

${fullText}`;
  const raw = await callClaude(prompt, 150);
  return raw.trim();
}

export function styleGuidanceBlock(examples: Array<{ original: string; edited: string }>): string {
  if (examples.length === 0) return '';
  return `\n\nThe owner has edited past drafts like this before — match their tone/phrasing style, but don't copy these verbatim:\n` +
    examples.map(e => `- Was: "${e.original}"\n  Owner changed it to: "${e.edited}"`).join('\n');
}
