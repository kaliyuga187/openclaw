import Anthropic from '@anthropic-ai/sdk';

export class MissingApiKeyError extends Error {
  constructor() {
    super('Anthropic API key not configured');
    this.name = 'MissingApiKeyError';
  }
}

export type ModelChoice = 'claude-opus-4-7' | 'claude-sonnet-4-6' | 'claude-haiku-4-5';

export const DEFAULT_MODEL: ModelChoice = 'claude-opus-4-7';

export const MODEL_LABELS: Record<ModelChoice, string> = {
  'claude-opus-4-7': 'Opus 4.7 (default, highest quality)',
  'claude-sonnet-4-6': 'Sonnet 4.6 (balanced)',
  'claude-haiku-4-5': 'Haiku 4.5 (fastest, cheapest)',
};

export function makeClient(apiKey: string | null): Anthropic {
  if (!apiKey) throw new MissingApiKeyError();
  return new Anthropic({
    apiKey,
    // React Native runs in a non-Node environment that the SDK detects as browser-like.
    // The user supplies their own key, stored in device secure storage; no shared key is bundled.
    dangerouslyAllowBrowser: true,
  });
}
