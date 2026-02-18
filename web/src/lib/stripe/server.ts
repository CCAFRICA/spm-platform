/**
 * Stripe Server Client — Singleton Instance
 *
 * Server-side only. Never import this file in client components.
 * Uses STRIPE_SECRET_KEY from environment.
 */

import Stripe from 'stripe';
import { STRIPE_CONFIG } from './config';

let stripeInstance: Stripe | null = null;

/**
 * Returns a configured Stripe client singleton.
 * Throws if STRIPE_SECRET_KEY is not set.
 */
export function getStripe(): Stripe {
  if (stripeInstance) return stripeInstance;

  if (!STRIPE_CONFIG.secretKey) {
    throw new Error(
      'STRIPE_SECRET_KEY is not configured. Set it in your environment variables.'
    );
  }

  stripeInstance = new Stripe(STRIPE_CONFIG.secretKey, {
    apiVersion: '2026-01-28.clover',
    typescript: true,
  });

  return stripeInstance;
}
