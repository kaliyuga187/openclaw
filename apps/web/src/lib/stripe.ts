import Stripe from 'stripe';
import { env, features } from './env';

let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (!features.stripe) {
    throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY.');
  }
  client ??= new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: '2024-06-20',
    typescript: true,
    appInfo: { name: 'OpenClaw', version: '1.0.0' },
  });
  return client;
}

export const stripeConfigured = () => features.stripe;
export const stripeWebhookConfigured = () => features.stripeWebhook;
