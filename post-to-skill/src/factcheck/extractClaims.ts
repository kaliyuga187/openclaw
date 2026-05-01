import type Anthropic from '@anthropic-ai/sdk';
import { ClaimsSchema, type ClaimsPayload } from './schemas';
import { EXTRACT_SYSTEM } from './prompt';
import type { Claim } from './types';
import type { ModelChoice } from '../anthropic/client';

export async function extractClaims(
  client: Anthropic,
  model: ModelChoice,
  postText: string,
): Promise<Claim[]> {
  const response = await client.messages.create({
    model,
    max_tokens: 2048,
    system: [
      {
        type: 'text',
        text: EXTRACT_SYSTEM,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: `Post:\n"""\n${postText}\n"""` }],
      },
    ],
    tools: [
      {
        name: 'record_claims',
        description: 'Record the factual claims extracted from the post.',
        input_schema: {
          type: 'object',
          properties: {
            claims: {
              type: 'array',
              items: {
                type: 'object',
                properties: { text: { type: 'string' } },
                required: ['text'],
              },
            },
          },
          required: ['claims'],
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'record_claims' },
  });

  const toolUse = response.content.find((b) => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('Model did not return a record_claims tool call');
  }
  const parsed: ClaimsPayload = ClaimsSchema.parse(toolUse.input);
  return parsed.claims;
}
