import { callClaude, stripJsonFences } from '../../lib/claude';
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
  const recent = messages.slice(-60);
  if (summary && messages.length > 60) {
    return `Summary of earlier conversation: ${summary}\n\nLast 60 messages:\n${asLines(recent)}`;
  }
  return asLines(recent);
}

export async function classifyMessage(
  history: string,
  message: string,
  contactName?: string,
  ownerContext?: string
): Promise<ClassificationResult> {
  const whoTheyAre = contactName
    ? `This message is from "${contactName}" — a saved contact. Do NOT ask who they are.`
    : 'This message is from an unknown number.';

  const ownerBlock = ownerContext ? `\nContext about the phone owner:\n${ownerContext}\n` : '';

  const prompt = `You are the classification layer for a personal SMS receptionist app. Read the NEW message in context and output ONLY this JSON, no markdown fences, no commentary:
{
  "category": "RENTAL_INQUIRY" | "GENERAL_CONVERSATION" | "SPAM" | "WORK" | "PERSONAL" | "OTHER",
  "intent": "short_tag_or_null",
  "extracted_info": { }
}

${whoTheyAre}
${ownerBlock}
IMPORTANT — context awareness:
The owner may be LOOKING FOR a place to rent, not just renting one out. Read the conversation carefully before classifying as RENTAL_INQUIRY — only use that category if someone is inquiring about a place the OWNER is renting out. If the context suggests the owner is the one looking for housing, classify as PERSONAL or GENERAL_CONVERSATION instead.

Conversation so far:
${history}

New message from them:
"${message}"

Emoji/short reply handling — if conversation is a rental screening Q&A:
- 👍 ✅ "yep" "yeah" = yes/true for whatever was just asked
- 👎 ❌ "nope" "nah" "no" = no/false for whatever was just asked

If RENTAL_INQUIRY, extract into extracted_info: moveInDate, occupants, employmentStatus, hasPets, petDetails, smoker, creditCheckOk, incomeVerificationOk, viewingRequestedTime, name. Use real JSON booleans. Omit keys not mentioned. intent can be null.`;

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
  ownerContext?: string;
}): Promise<string> {
  if (opts.category === 'SPAM') return '';

  const nameContext = opts.contactName ? `You are replying to ${opts.contactName}. ` : '';
  const ownerBlock = opts.ownerContext ? `\n${opts.ownerContext}` : '';

  let instructions: string;
  if (opts.category === 'RENTAL_INQUIRY') {
    instructions = opts.nextQuestion
      ? `${nameContext}You're replying on behalf of a landlord to a rental inquiry. Briefly acknowledge what they said, then ask exactly this — in natural phrasing — and only this: "${opts.nextQuestion}". One question only, nothing else.`
      : `${nameContext}You're replying on behalf of a landlord. Every required field has been collected — do NOT ask anything further. Let them know you'll follow up shortly. Don't invent times or addresses.`;
  } else {
    instructions = `${nameContext}You're replying on behalf of the phone's owner. Reply naturally and conversationally, SMS length — like a real person texting back, not a formal response. Read the full conversation before replying so you understand the context. Never ask who the person is. If they sent media with no text, acknowledge it warmly. If asked about the owner's personal details, use the owner context below — never guess or make things up.`;
  }

  const prompt = `${instructions}${ownerBlock}${opts.styleGuidance}

Conversation so far (read ALL of this — understand what's been discussed, agreed, and what's still open before writing anything):
${opts.history}

Their latest message:
"${opts.message}"

Before replying, think about:
- What is this conversation actually about?
- What has already been said or agreed — don't repeat or contradict it
- What does this message actually need — an answer, an acknowledgment, a question?
- Does the owner profile apply to anything being asked?

Reply with ONLY the SMS text — no quotes, no preamble, no markdown. Natural and brief.`;

  const raw = await callClaude(prompt, 350);
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
  return `\n\nThe owner has edited past drafts like this — match their tone/style but don't copy verbatim:\n` +
    examples.map(e => `- Was: "${e.original}"\n  Changed to: "${e.edited}"`).join('\n');
}
