// The shop's API responses. All money is in integer cents.

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'customer' | 'admin';
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  description: string;
}

export interface ProductPage {
  items: Product[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Totals {
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
}

export interface CartLine {
  productId: string;
  slug: string;
  name: string;
  unitPrice: number;
  qty: number;
  lineTotal: number;
}

export interface Cart {
  lines: CartLine[];
  count: number;
  coupon: string | null;
  shipping: 'standard' | 'express';
  totals: Totals;
}

export type OrderStatus = 'paid' | 'awaiting_payment' | 'partially_refunded' | 'refunded';

export interface Order {
  id: string;
  userId: string;
  email: string;
  createdAt: string;
  lines: CartLine[];
  coupon: string | null;
  totals: Totals;
  payment: { method: string; last4?: string; code?: string };
  status: OrderStatus;
  refunded: number;
}

export interface Address {
  name: string;
  line1: string;
  city: string;
  postcode: string;
  country: string;
}

export interface Card {
  number: string;
  expMonth: number;
  expYear: number;
  cvc: string;
}

export type Billing = 'monthly' | 'annual';
export type SubscriptionStatus = 'active' | 'trialing' | 'paused' | 'past_due' | 'canceled';

export interface Invoice {
  id: string;
  kind: 'subscription' | 'renewal' | 'upgrade';
  amount: number;
  status: 'paid' | 'open' | 'void';
  createdAt: string;
}

export interface Subscription {
  id: string;
  userId: string;
  planId: string;
  planName: string;
  billing: Billing;
  status: SubscriptionStatus;
  price: number;
  periodEnd: string;
  cancelAtPeriodEnd: boolean;
  pendingPlanName: string | null;
  nextCharge: number | null;
  card: { last4: string };
  failedRenewals: number;
  invoices: Invoice[];
}

export interface Plan {
  id: string;
  name: string;
  bags: number;
  monthly: number;
  annual: number;
  trialDays: number;
}

export interface Coupon {
  code: string;
  kind: 'percent' | 'fixed' | 'shipping';
  value: number;
  minSpend: number;
  expiresAt: number | null;
}

export interface GiftCard {
  code: string;
  balance: number;
}

export interface Stats {
  orders: number;
  revenue: number;
  mrr: number;
  activeSubscriptions: number;
}

export interface ApiFailure {
  error: { code: string; message: string; field?: string };
}
