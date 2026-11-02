import { goodCard } from '../../data/cards';
import { PRODUCTS } from '../../data/catalog';
import { expect, test } from '../../fixtures';

test.describe('API contract', () => {
  test('API-01 > the health endpoint answers', async ({ guestApi }) => {
    const res = await guestApi.http.get('/api/health');

    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  test('API-02 > the product list has the agreed shape', async ({ guestApi }) => {
    const page = await guestApi.products({ page: 1 });

    expect(page).toMatchObject({ page: 1, pageSize: 8 });
    expect(page.total).toBeGreaterThanOrEqual(14);
    for (const product of page.items) {
      expect(product).toEqual({
        id: expect.any(String),
        slug: expect.any(String),
        name: expect.any(String),
        category: expect.any(String),
        price: expect.any(Number),
        stock: expect.any(Number),
        description: expect.any(String),
      });
    }
  });

  test('API-03 > a guest can build a cart without an account', async ({ guestApi }) => {
    const cart = await guestApi.addToCart(PRODUCTS.yirgacheffe.id, 2);

    expect(cart.count).toBe(2);
    expect(cart.totals).toEqual({ subtotal: 3600, discount: 0, shipping: 495, tax: 288, total: 4383 });
  });

  test('API-04 > a zero quantity is refused', async ({ guestApi }) => {
    const res = await guestApi.http.post('/api/cart/items', { data: { productId: PRODUCTS.yirgacheffe.id, qty: 0 } });

    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatchObject({ code: 'invalid_quantity', field: 'qty' });
  });

  for (const [id, method, path] of [
    ['API-05', 'get', '/api/orders'],
    ['API-06', 'get', '/api/subscription'],
    ['API-07', 'post', '/api/checkout'],
    ['API-08', 'get', '/api/admin/stats'],
  ] as const) {
    test(`${id} > ${method.toUpperCase()} ${path} needs a signed-in user`, async ({ guestApi }) => {
      const res = await guestApi.http[method](path);

      expect(res.status()).toBe(401);
      expect((await res.json()).error.code).toBe('unauthenticated');
    });
  }

  for (const [id, method, path] of [
    ['API-09', 'get', '/api/admin/orders'],
    ['API-10', 'post', '/api/admin/gift-cards'],
    ['API-11', 'delete', '/api/admin/users/u_ava'],
  ] as const) {
    test(`${id} > ${method.toUpperCase()} ${path} is staff only`, async ({ customer }) => {
      const res = await customer.api.http[method](path);

      expect(res.status()).toBe(403);
    });
  }

  test("API-12 > a customer cannot touch someone else's subscription", async ({ customer, newCustomer }) => {
    const someoneElse = await newCustomer('other');
    const subscription = await someoneElse.api.subscribe('explorer');

    const res = await customer.api.http.post(`/api/subscriptions/${subscription.id}/cancel`);

    expect(res.status()).toBe(404);
    expect((await someoneElse.api.subscription())?.cancelAtPeriodEnd).toBe(false);
  });

  test('API-13 > a malformed request body is refused cleanly', async ({ guestApi }) => {
    const res = await guestApi.http.post('/api/cart/items', {
      headers: { 'Content-Type': 'application/json' },
      // A Buffer goes out as is. Playwright would quietly JSON-encode a plain string.
      data: Buffer.from('{not json'),
    });

    expect(res.status()).toBe(400);
    expect((await res.json()).error.code).toBe('invalid_json');
  });

  test('API-14 > an unknown endpoint answers a clean 404', async ({ guestApi }) => {
    const res = await guestApi.http.get('/api/nothing-here');

    expect(res.status()).toBe(404);
    expect((await res.json()).error.code).toBe('not_found');
  });

  test('API-15 > card numbers never come back from the server', async ({ customer }) => {
    const card = goodCard();
    const order = await customer.api.buy(PRODUCTS.yirgacheffe.id);
    const subscription = await customer.api.subscribe('explorer', 'monthly', card);

    const payload = JSON.stringify({ order, subscription });

    expect(payload).toContain('4242');
    expect(payload).not.toContain(card.number.replaceAll(' ', ''));
    expect(payload).not.toContain('cvc');
  });
});
