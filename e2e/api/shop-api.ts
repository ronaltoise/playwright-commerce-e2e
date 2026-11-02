import type { APIRequestContext, APIResponse } from '@playwright/test';
import { goodCard } from '../data/cards';
import { testAddress } from '../data/people';
import type {
  Address,
  Billing,
  Card,
  Cart,
  Coupon,
  GiftCard,
  Order,
  Plan,
  Product,
  ProductPage,
  Stats,
  Subscription,
  User,
} from './types';

/**
 * The shop's API, typed. Tests use it to set up state quickly, so that a checkout test spends its
 * time on checkout rather than clicking through the catalogue first, and to check results the UI
 * doesn't show. Each method throws on an unexpected status, so a broken setup step fails loudly
 * and names the call. Negative tests use `http` directly, because for them a refusal is the point.
 */
export class ShopApi {
  constructor(readonly http: APIRequestContext) {}

  private async json<T>(res: APIResponse, expected = 200): Promise<T> {
    if (res.status() !== expected) {
      throw new Error(`${res.url()} answered ${res.status()}, expected ${expected}: ${await res.text()}`);
    }
    return (await res.json()) as T;
  }

  private async done(res: APIResponse, expected = 204): Promise<void> {
    if (res.status() !== expected) {
      throw new Error(`${res.url()} answered ${res.status()}, expected ${expected}: ${await res.text()}`);
    }
  }

  // ---- Accounts ----

  async register(data: { name: string; email: string; password: string }): Promise<User> {
    return (await this.json<{ user: User }>(await this.http.post('/api/auth/register', { data }), 201)).user;
  }

  async login(email: string, password: string): Promise<User> {
    const res = await this.http.post('/api/auth/login', { data: { email, password } });
    return (await this.json<{ user: User }>(res)).user;
  }

  async me(): Promise<User | null> {
    return (await this.json<{ user: User | null }>(await this.http.get('/api/me'))).user;
  }

  // ---- Catalogue ----

  async products(params: Record<string, string | number> = {}): Promise<ProductPage> {
    return this.json(await this.http.get('/api/products', { params }));
  }

  async product(slug: string): Promise<Product> {
    return this.json(await this.http.get(`/api/products/${slug}`));
  }

  async plans(): Promise<Plan[]> {
    return (await this.json<{ plans: Plan[] }>(await this.http.get('/api/plans'))).plans;
  }

  // ---- Cart and checkout ----

  async cart(): Promise<Cart> {
    return this.json(await this.http.get('/api/cart'));
  }

  async addToCart(productId: string, qty = 1): Promise<Cart> {
    return this.json(await this.http.post('/api/cart/items', { data: { productId, qty } }));
  }

  async applyCoupon(code: string): Promise<Cart> {
    return this.json(await this.http.post('/api/cart/coupon', { data: { code } }));
  }

  async checkout(payment: unknown, address: Address = testAddress): Promise<{ order: Order }> {
    return this.json(await this.http.post('/api/checkout', { data: { address, payment } }), 201);
  }

  /** Puts the items in the cart and pays by card: the shortest way to "this customer has an order". */
  async buy(productId: string, qty = 1): Promise<Order> {
    await this.addToCart(productId, qty);
    return (await this.checkout({ method: 'card', card: goodCard() })).order;
  }

  async orders(): Promise<Order[]> {
    return (await this.json<{ orders: Order[] }>(await this.http.get('/api/orders'))).orders;
  }

  async order(id: string): Promise<Order> {
    return this.json(await this.http.get(`/api/orders/${id}`));
  }

  // ---- Subscriptions ----

  async subscribe(planId: string, billing: Billing = 'monthly', card: Card = goodCard()): Promise<Subscription> {
    return this.json(await this.http.post('/api/subscriptions', { data: { planId, billing, card } }), 201);
  }

  async subscription(): Promise<Subscription | null> {
    const body = await this.json<{ subscription: Subscription | null }>(await this.http.get('/api/subscription'));
    return body.subscription;
  }

  async cancelSubscription(id: string): Promise<Subscription> {
    return this.json(await this.http.post(`/api/subscriptions/${id}/cancel`));
  }

  async pauseSubscription(id: string): Promise<Subscription> {
    return this.json(await this.http.post(`/api/subscriptions/${id}/pause`));
  }

  /** Runs what the end of the billing period would run. Only exists on a server with TEST_HOOKS=1. */
  async renewNow(id: string): Promise<Subscription> {
    return this.json(await this.http.post(`/api/test/subscriptions/${id}/renew`));
  }

  // ---- Admin ----

  async stats(): Promise<Stats> {
    return this.json(await this.http.get('/api/admin/stats'));
  }

  async createProduct(data: { name: string; category: string; price: number; stock: number }): Promise<Product> {
    return this.json(await this.http.post('/api/admin/products', { data }), 201);
  }

  async deleteProduct(id: string): Promise<void> {
    await this.done(await this.http.delete(`/api/admin/products/${id}`));
  }

  async adminProducts(): Promise<Product[]> {
    return (await this.json<{ products: Product[] }>(await this.http.get('/api/admin/products'))).products;
  }

  async createCoupon(data: Partial<Coupon> & Pick<Coupon, 'code' | 'kind'>): Promise<Coupon> {
    return this.json(await this.http.post('/api/admin/coupons', { data }), 201);
  }

  async deleteCoupon(code: string): Promise<void> {
    await this.done(await this.http.delete(`/api/admin/coupons/${code}`));
  }

  async createGiftCard(balance: number): Promise<GiftCard> {
    return this.json(await this.http.post('/api/admin/gift-cards', { data: { balance } }), 201);
  }

  async markPaid(orderId: string): Promise<Order> {
    return this.json(await this.http.post(`/api/admin/orders/${orderId}/mark-paid`));
  }

  async deleteUser(id: string): Promise<void> {
    await this.done(await this.http.delete(`/api/admin/users/${id}`));
  }
}
