import type Anthropic from '@anthropic-ai/sdk';
import { extractClaims } from './extractClaims';
import { verifyClaims } from './verifyClaims';
import type { FactCheckResult } from './types';
import type { ModelChoice } from '../anthropic/client';

export async function factCheckPost(
  client: Anthropic,
  model: ModelChoice,
  postText: string,
): Promise<FactCheckResult> {
  const claims = await extractClaims(client, model, postText);
  const verdicts = await verifyClaims(client, model, claims);
  return { claims, verdicts };
}

export * from './types';
