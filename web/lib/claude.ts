// Server-side only — this is the one place the real Anthropic API key lives.
// Using Haiku: fast, cheap, more than capable for classify/draft work.

export async function callClaude(prompt: string, maxTokens: number): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Claude API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const block = (data.content || []).find((b: any) => b.type === 'text');
  return block ? block.text : '';
}

export function stripJsonFences(raw: string): string {
  return raw.trim().replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
}
