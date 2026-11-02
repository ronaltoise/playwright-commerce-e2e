import type { Card } from '../api/types';

/** The mock gateway's test cards. The number alone decides what happens (see app/gateway.mjs). */
export const CARDS = {
  approved: '4242 4242 4242 4242',
  declined: '4000 0000 0000 0002',
  insufficientFunds: '4000 0000 0000 9995',
  challenge: '4000 0000 0000 3220',
  failsOnRenewal: '4000 0000 0000 0341',
  /** Fails the card-number checksum, so the gateway never sees it. */
  mistyped: '4242 4242 4242 4241',
} as const;

const nextYear = new Date().getFullYear() + 1;

export const goodCard = (number: string = CARDS.approved): Card => ({
  number,
  expMonth: 12,
  expYear: nextYear,
  cvc: '123',
});

export const expiredCard: Card = { ...goodCard(), expMonth: 1, expYear: 2020 };
