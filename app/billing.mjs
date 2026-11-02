// Subscription billing: plans, trials, renewals, failed payments, plan changes, pause and cancel.
import { bug } from './bugs.mjs';
import { PaymentError, charge, tokenize } from './gateway.mjs';
import { plans } from './seed.mjs';
import { ApiError, db } from './shop.mjs';

const DAY = 86_400_000;
const PERIOD_DAYS = { monthly: 30, annual: 365 };
const MAX_FAILED_RENEWALS = 3;

const planById = (id) => {
  const plan = plans.find((p) => p.id === id);
  if (!plan) throw new ApiError(404, 'not_found', 'We could not find that plan.');
  return plan;
};

const priceOf = (planId, billing) => planById(planId)[billing];

let nextSubscription = 500;
let nextInvoice = 7000;

function addInvoice(sub, kind, amount, status) {
  const invoice = {
    id: `INV-${++nextInvoice}`,
    kind,
    amount,
    status,
    createdAt: new Date().toISOString(),
  };
  sub.invoices.unshift(invoice);
  return invoice;
}

const startPeriod = (sub, days) => {
  sub.periodStart = Date.now();
  sub.periodEnd = sub.periodStart + days * DAY;
};

export function subscriptionView(sub) {
  const plan = planById(sub.planId);
  const pending = sub.pendingPlanId ? planById(sub.pendingPlanId) : null;
  const nextPlan = sub.pendingPlanId ?? sub.planId;
  const ending = sub.cancelAtPeriodEnd || sub.status === 'canceled' || sub.status === 'paused';
  return {
    id: sub.id,
    userId: sub.userId,
    planId: sub.planId,
    planName: plan.name,
    billing: sub.billing,
    status: sub.status,
    price: priceOf(sub.planId, sub.billing),
    periodEnd: new Date(sub.periodEnd).toISOString(),
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    pendingPlanName: pending?.name ?? null,
    nextCharge: ending ? null : priceOf(nextPlan, sub.billing),
    card: { last4: sub.card.last4 },
    failedRenewals: sub.failedRenewals,
    invoices: sub.invoices,
  };
}

export const currentSubscription = (userId) =>
  db.subscriptions.findLast((s) => s.userId === userId && s.status !== 'canceled') ??
  db.subscriptions.findLast((s) => s.userId === userId) ??
  null;

export function subscriptionFor(user, id) {
  const sub = db.subscriptions.find((s) => s.id === id);
  if (!sub || (sub.userId !== user.id && user.role !== 'admin')) {
    throw new ApiError(404, 'not_found', 'We could not find that subscription.');
  }
  return sub;
}

export function subscribe(user, { planId, billing, card }) {
  const plan = planById(planId);
  if (!PERIOD_DAYS[billing]) throw new ApiError(400, 'invalid_billing', 'Choose monthly or annual billing.', 'billing');
  if (currentSubscription(user.id) && currentSubscription(user.id).status !== 'canceled') {
    throw new ApiError(409, 'already_subscribed', 'You already have a subscription. Change its plan instead.');
  }
  const token = tokenize(card);
  const trial = billing === 'monthly' && plan.trialDays > 0;
  const sub = {
    id: `sub_${++nextSubscription}`,
    userId: user.id,
    planId,
    billing,
    status: trial ? 'trialing' : 'active',
    card: token,
    cancelAtPeriodEnd: false,
    pendingPlanId: null,
    failedRenewals: 0,
    invoices: [],
  };
  if (trial) {
    // A trial costs nothing today, but a card that can't pay shouldn't start one.
    if (token.outcome === 'declined' || token.outcome === 'insufficient_funds') charge(token, 0);
    startPeriod(sub, plan.trialDays);
  } else {
    // The customer is present for the first charge. This demo has no challenge screen for
    // subscriptions, so a 3-D Secure card counts as confirmed here.
    charge(token, plan[billing], { challengePassed: true });
    startPeriod(sub, PERIOD_DAYS[billing]);
    addInvoice(sub, 'subscription', plan[billing], 'paid');
  }
  db.subscriptions.push(sub);
  return sub;
}

export function changePlan(sub, planId) {
  if (sub.status === 'canceled') throw new ApiError(409, 'canceled', 'This subscription has ended.');
  if (planId === sub.planId) throw new ApiError(400, 'same_plan', 'You are already on that plan.', 'planId');
  const oldPrice = priceOf(sub.planId, sub.billing);
  const newPrice = priceOf(planId, sub.billing);
  sub.pendingPlanId = null;

  if (sub.status === 'trialing') {
    sub.planId = planId;
    return sub;
  }
  if (newPrice < oldPrice) {
    sub.pendingPlanId = planId;
    return sub;
  }
  const periodDays = PERIOD_DAYS[sub.billing];
  const daysLeft = Math.min(periodDays, Math.ceil((sub.periodEnd - Date.now()) / DAY));
  const prorated = Math.round(((newPrice - oldPrice) * daysLeft) / periodDays);
  const amount = bug('BUG-08') ? newPrice : prorated;
  charge(sub.card, amount, { saved: true });
  addInvoice(sub, 'upgrade', amount, 'paid');
  sub.planId = planId;
  return sub;
}

export function cancel(sub) {
  if (sub.status === 'canceled') throw new ApiError(409, 'canceled', 'This subscription has ended.');
  sub.cancelAtPeriodEnd = true;
  if (bug('BUG-07') || sub.status === 'past_due') sub.status = 'canceled';
  return sub;
}

export function keep(sub) {
  if (sub.status === 'canceled') throw new ApiError(409, 'canceled', 'This subscription has ended.');
  sub.cancelAtPeriodEnd = false;
  return sub;
}

export function pause(sub) {
  if (sub.status !== 'active') throw new ApiError(409, 'not_active', 'Only an active subscription can be paused.');
  sub.status = 'paused';
  return sub;
}

export function resume(sub) {
  if (sub.status !== 'paused') throw new ApiError(409, 'not_paused', 'This subscription is not paused.');
  sub.status = 'active';
  return sub;
}

export function updateCard(sub, card) {
  sub.card = tokenize(card);
  return sub;
}

function collect(sub) {
  const price = priceOf(sub.planId, sub.billing);
  charge(sub.card, price, { saved: true });
  sub.failedRenewals = 0;
  sub.status = 'active';
  startPeriod(sub, PERIOD_DAYS[sub.billing]);
  return addInvoice(sub, 'renewal', price, 'paid');
}

/** The customer pays the overdue renewal after fixing their card. */
export function retryPayment(sub) {
  if (sub.status !== 'past_due') throw new ApiError(409, 'not_past_due', 'Nothing is overdue on this subscription.');
  collect(sub);
  for (const invoice of sub.invoices) if (invoice.status === 'open') invoice.status = 'void';
  return sub;
}

/** What happens when a billing period ends. The app has no scheduler; a test hook calls this. */
export function renew(sub) {
  if (sub.status === 'canceled') return sub;
  if (sub.status === 'paused') {
    startPeriod(sub, PERIOD_DAYS[sub.billing]);
    return sub;
  }
  if (sub.cancelAtPeriodEnd) {
    sub.status = 'canceled';
    return sub;
  }
  if (sub.pendingPlanId) {
    sub.planId = sub.pendingPlanId;
    sub.pendingPlanId = null;
  }
  try {
    collect(sub);
  } catch (error) {
    if (!(error instanceof PaymentError)) throw error;
    if (bug('BUG-06')) return sub;
    sub.failedRenewals += 1;
    addInvoice(sub, 'renewal', priceOf(sub.planId, sub.billing), 'open');
    sub.status = sub.failedRenewals >= MAX_FAILED_RENEWALS ? 'canceled' : 'past_due';
  }
  return sub;
}

export const monthlyRecurringRevenue = () =>
  db.subscriptions
    .filter((s) => s.status === 'active' || s.status === 'past_due')
    .reduce((sum, s) => {
      const price = priceOf(s.planId, s.billing);
      return sum + (s.billing === 'annual' ? Math.round(price / 12) : price);
    }, 0);
