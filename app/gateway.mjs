// A mock payment gateway. Nothing leaves this process: the card number alone decides the outcome,
// the way a real provider's test mode does. Only these numbers are accepted, so a real card can
// never be charged and is refused as unknown.
export const TEST_CARDS = {
  '4242424242424242': { label: 'Approved', outcome: 'approved' },
  '4000000000000002': { label: 'Declined', outcome: 'declined' },
  '4000000000009995': { label: 'Insufficient funds', outcome: 'insufficient_funds' },
  '4000000000003220': { label: '3-D Secure challenge', outcome: 'requires_action' },
  '4000000000000341': { label: 'Saves, then fails on renewal', outcome: 'fails_later' },
};

export class PaymentError extends Error {
  constructor(code, message, status = 402, field) {
    super(message);
    Object.assign(this, { code, status, field });
  }
}

const passesLuhn = (digits) => {
  let sum = 0;
  [...digits].reverse().forEach((d, i) => {
    const n = Number(d) * (i % 2 ? 2 : 1);
    sum += n > 9 ? n - 9 : n;
  });
  return digits.length >= 12 && sum % 10 === 0;
};

/** Checks a submitted card and returns the safe form the shop keeps. The full number is never stored. */
export function tokenize(card) {
  const number = String(card?.number ?? '').replace(/[\s-]/g, '');
  const month = Number(card?.expMonth);
  const year = Number(card?.expYear);
  if (!/^\d+$/.test(number) || !passesLuhn(number)) {
    throw new PaymentError('invalid_number', 'That card number is not valid.', 400, 'number');
  }
  if (!(month >= 1 && month <= 12) || !year) {
    throw new PaymentError('invalid_expiry', 'Enter a valid expiry date.', 400, 'expiry');
  }
  const now = new Date();
  if (year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1)) {
    throw new PaymentError('expired_card', 'This card has expired.', 402, 'expiry');
  }
  if (!/^\d{3,4}$/.test(String(card?.cvc ?? ''))) {
    throw new PaymentError('invalid_cvc', 'Enter the security code from the card.', 400, 'cvc');
  }
  const known = TEST_CARDS[number];
  if (!known) {
    throw new PaymentError('unknown_test_card', 'Use one of the demo test cards.', 400, 'number');
  }
  return { last4: number.slice(-4), expMonth: month, expYear: year, outcome: known.outcome };
}

const refusals = {
  declined: ['card_declined', 'Your card was declined.'],
  insufficient_funds: ['insufficient_funds', 'Your card has insufficient funds.'],
};

let nextCharge = 1000;

/**
 * Charges a tokenized card. `saved` means the customer isn't present, as on a renewal: that's when
 * a `fails_later` card fails, and a challenge can't be answered, so a 3-D Secure card is declined.
 */
export function charge(token, amount, { saved = false, challengePassed = false } = {}) {
  const outcome = token.outcome;
  if (outcome === 'requires_action' && !challengePassed) {
    if (!saved) return { status: 'requires_action' };
    throw new PaymentError(...refusals.declined);
  }
  if (outcome === 'fails_later' && saved) throw new PaymentError(...refusals.declined);
  if (refusals[outcome]) throw new PaymentError(...refusals[outcome]);
  return { status: 'approved', id: `ch_${++nextCharge}`, amount };
}
