import type Anthropic from '@anthropic-ai/sdk';
import { VerdictsSchema, type VerdictsPayload } from './schemas';
import { VERIFY_SYSTEM } from './prompt';
import type { Claim, Verdict } from './types';
import type { ModelChoice } from '../anthropic/client';

export async function verifyClaims(
  client: Anthropic,
  model: ModelChoice,
  claims: Claim[],
): Promise<Verdict[]> {
  if (claims.length === 0) return [];

  const numbered = claims.map((c, i) => `${i + 1}. ${c.text}`).join('\n');

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    system: [
      {
        type: 'text',
        text: VERIFY_SYSTEM,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: `Assess these claims:\n${numbered}` }],
      },
    ],
    tools: [
      {
        name: 'record_verdicts',
        description: 'Record one verdict per input claim, in order.',
        input_schema: {
          type: 'object',
          properties: {
            verdicts: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  claim: { type: 'string' },
                  label: { type: 'string', enum: ['true', 'false', 'uncertain'] },
                  confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
                  reasoning: { type: 'string' },
                },
                required: ['claim', 'label', 'confidence', 'reasoning'],
              },
            },
          },
          required: ['verdicts'],
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'record_verdicts' },
  });

  const toolUse = response.content.find((b) => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('Model did not return a record_verdicts tool call');
  }
  const parsed: VerdictsPayload = VerdictsSchema.parse(toolUse.input);
  return parsed.verdicts;
}
