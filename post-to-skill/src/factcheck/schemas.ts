import { z } from 'zod';

export const ClaimsSchema = z.object({
  claims: z
    .array(
      z.object({
        text: z.string().min(1).describe('A single discrete factual claim made in the post'),
      }),
    )
    .describe(
      'Discrete factual claims. Skip opinions, jokes, rhetorical questions, and self-promotion.',
    ),
});

export const VerdictsSchema = z.object({
  verdicts: z
    .array(
      z.object({
        claim: z.string().describe('The claim being assessed, copied verbatim from the input list'),
        label: z
          .enum(['true', 'false', 'uncertain'])
          .describe(
            'Use uncertain when the claim is unverifiable from training knowledge, post-cutoff, or genuinely contested.',
          ),
        confidence: z
          .enum(['low', 'medium', 'high'])
          .describe('How confident the model is in the label.'),
        reasoning: z
          .string()
          .min(1)
          .describe('1-3 sentences explaining the verdict using only training knowledge.'),
      }),
    )
    .describe('One entry per input claim, in the same order.'),
});

export type ClaimsPayload = z.infer<typeof ClaimsSchema>;
export type VerdictsPayload = z.infer<typeof VerdictsSchema>;
