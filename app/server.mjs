// Roastery: the demo shop the tests run against. No dependencies: `node app/server.mjs`.
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as billing from './billing.mjs';
import { activeBugs } from './bugs.mjs';
import { PaymentError, TEST_CARDS } from './gateway.mjs';
import { plans } from './seed.mjs';
import { checkPassword, dropSessionsOf, hashPassword, sessionFor } from './session.mjs';
import * as shop from './shop.mjs';

const { ApiError, db } = shop;
const PORT = Number(process.env.PORT ?? 3000);
const TEST_HOOKS = process.env.TEST_HOOKS === '1';
const PUBLIC_DIR = fileURLToPath(new URL('./public/', import.meta.url));
const MAX_LOGIN_ATTEMPTS = 5;

const failedLogins = new Map();
const routes = [];
const route = (method, path, handler, { auth = 'none' } = {}) => {
  const pattern = new RegExp(`^${path.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`);
  routes.push({ method, pattern, handler, auth });
};
const customer = { auth: 'user' };
const admin = { auth: 'admin' };

const publicUser = (u) => u && { id: u.id, name: u.name, email: u.email, role: u.role };
const userOf = (session) => db.users.find((u) => u.id === session.userId) ?? null;

// ---- Accounts -------------------------------------------------------------------------------

route('GET', '/api/health', () => ({ status: 'ok' }));
route('GET', '/api/config', () => ({ testCards: TEST_CARDS, bugs: activeBugs() }));
route('GET', '/api/me', ({ user }) => ({ user: publicUser(user) }));

route('POST', '/api/auth/register', ({ body, session }) => {
  const name = String(body.name ?? '').trim();
  const email = String(body.email ?? '')
    .trim()
    .toLowerCase();
  const password = String(body.password ?? '');
  if (!name) throw new ApiError(400, 'invalid_name', 'Enter your name.', 'name');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new ApiError(400, 'invalid_email', 'Enter a valid email address.', 'email');
  }
  if (password.length < 8) {
    throw new ApiError(400, 'weak_password', 'Use at least 8 characters.', 'password');
  }
  if (db.users.some((u) => u.email === email)) {
    throw new ApiError(409, 'email_taken', 'An account with that email already exists.', 'email');
  }
  const user = { id: `u_${randomUUID().slice(0, 8)}`, name, email, password: hashPassword(password), role: 'customer' };
  db.users.push(user);
  session.userId = user.id;
  shop.mergeGuestCart(session);
  return { status: 201, body: { user: publicUser(user) } };
});

route('POST', '/api/auth/login', ({ body, session }) => {
  const email = String(body.email ?? '')
    .trim()
    .toLowerCase();
  if ((failedLogins.get(email) ?? 0) >= MAX_LOGIN_ATTEMPTS) {
    throw new ApiError(429, 'locked', 'Too many failed attempts. This account is locked.');
  }
  const user = db.users.find((u) => u.email === email);
  if (!user || !checkPassword(String(body.password ?? ''), user.password)) {
    failedLogins.set(email, (failedLogins.get(email) ?? 0) + 1);
    throw new ApiError(401, 'invalid_login', 'That email and password do not match.');
  }
  failedLogins.delete(email);
  session.userId = user.id;
  shop.mergeGuestCart(session);
  return { user: publicUser(user) };
});

route('POST', '/api/auth/logout', ({ session }) => {
  session.userId = null;
  return { status: 204 };
});

// ---- Catalogue ------------------------------------------------------------------------------

route('GET', '/api/products', ({ query }) => shop.listProducts(query));
route('GET', '/api/products/:slug', ({ params }) => shop.productBySlug(params.slug));
route('GET', '/api/plans', () => ({ plans }));

// ---- Cart and checkout ----------------------------------------------------------------------

const withCart = (handler) => (ctx) => {
  const cart = shop.cartOf(ctx.session);
  handler(cart, ctx);
  return shop.cartView(cart);
};

route(
  'GET',
  '/api/cart',
  withCart(() => {})
);
route(
  'POST',
  '/api/cart/items',
  withCart((cart, { body }) => shop.addToCart(cart, body.productId, body.qty ?? 1))
);
route(
  'PATCH',
  '/api/cart/items/:id',
  withCart((cart, { body, params }) => shop.setQuantity(cart, params.id, body.qty))
);
route(
  'DELETE',
  '/api/cart/items/:id',
  withCart((cart, { params }) => shop.removeFromCart(cart, params.id))
);
route(
  'POST',
  '/api/cart/coupon',
  withCart((cart, { body }) => shop.applyCoupon(cart, body.code))
);
route(
  'DELETE',
  '/api/cart/coupon',
  withCart((cart) => shop.removeCoupon(cart))
);
route(
  'PUT',
  '/api/cart/shipping',
  withCart((cart, { body }) => shop.setShipping(cart, body.method))
);

route(
  'POST',
  '/api/checkout',
  ({ user, session, body }) => {
    const result = shop.checkout(user, shop.cartOf(session), body);
    return result.challenge ? { status: 202, body: result } : { status: 201, body: result };
  },
  customer
);

route(
  'POST',
  '/api/checkout/challenge/:id',
  ({ user, params, body }) => ({
    status: 201,
    body: { order: shop.answerChallenge(user, params.id, body.approve === true) },
  }),
  customer
);

route('GET', '/api/orders', ({ user }) => ({ orders: shop.ordersOf(user.id) }), customer);
route('GET', '/api/orders/:id', ({ user, params }) => shop.orderFor(user, params.id), customer);

// ---- Subscriptions --------------------------------------------------------------------------

const onSubscription = (action) => (ctx) => {
  const sub = billing.subscriptionFor(ctx.user, ctx.params.id);
  action(sub, ctx);
  return billing.subscriptionView(sub);
};

route(
  'GET',
  '/api/subscription',
  ({ user }) => {
    const sub = billing.currentSubscription(user.id);
    return { subscription: sub && billing.subscriptionView(sub) };
  },
  customer
);

route(
  'POST',
  '/api/subscriptions',
  ({ user, body }) => ({
    status: 201,
    body: billing.subscriptionView(billing.subscribe(user, body)),
  }),
  customer
);

route(
  'POST',
  '/api/subscriptions/:id/change-plan',
  onSubscription((sub, { body }) => billing.changePlan(sub, body.planId)),
  customer
);
route(
  'POST',
  '/api/subscriptions/:id/cancel',
  onSubscription((sub) => billing.cancel(sub)),
  customer
);
route(
  'POST',
  '/api/subscriptions/:id/keep',
  onSubscription((sub) => billing.keep(sub)),
  customer
);
route(
  'POST',
  '/api/subscriptions/:id/pause',
  onSubscription((sub) => billing.pause(sub)),
  customer
);
route(
  'POST',
  '/api/subscriptions/:id/resume',
  onSubscription((sub) => billing.resume(sub)),
  customer
);
route(
  'PUT',
  '/api/subscriptions/:id/card',
  onSubscription((sub, { body }) => billing.updateCard(sub, body.card)),
  customer
);
route(
  'POST',
  '/api/subscriptions/:id/retry',
  onSubscription((sub) => billing.retryPayment(sub)),
  customer
);

// ---- Admin ----------------------------------------------------------------------------------

const orderById = (id) => {
  const order = db.orders.find((o) => o.id === id);
  if (!order) throw new ApiError(404, 'not_found', 'We could not find that order.');
  return order;
};

const productById = (id) => {
  const product = db.products.find((p) => p.id === id);
  if (!product) throw new ApiError(404, 'not_found', 'We could not find that product.');
  return product;
};

function checkProduct({ name, category, price, stock }) {
  if (!String(name ?? '').trim()) throw new ApiError(400, 'invalid_name', 'Enter a name.', 'name');
  if (!String(category ?? '').trim()) throw new ApiError(400, 'invalid_category', 'Choose a category.', 'category');
  if (!Number.isInteger(price) || price <= 0)
    throw new ApiError(400, 'invalid_price', 'Enter a price above zero.', 'price');
  if (!Number.isInteger(stock) || stock < 0)
    throw new ApiError(400, 'invalid_stock', 'Stock cannot be negative.', 'stock');
}

route(
  'GET',
  '/api/admin/stats',
  () => ({
    orders: db.orders.length,
    revenue: db.orders
      .filter((o) => o.status !== 'awaiting_payment')
      .reduce((sum, o) => sum + o.totals.total - o.refunded, 0),
    mrr: billing.monthlyRecurringRevenue(),
    activeSubscriptions: db.subscriptions.filter((s) => s.status === 'active').length,
  }),
  admin
);

route('GET', '/api/admin/orders', () => ({ orders: [...db.orders].reverse() }), admin);
route(
  'POST',
  '/api/admin/orders/:id/mark-paid',
  ({ params }) => {
    const order = orderById(params.id);
    if (order.status !== 'awaiting_payment')
      throw new ApiError(409, 'not_awaiting', 'This order is not awaiting payment.');
    order.status = 'paid';
    return order;
  },
  admin
);
route(
  'POST',
  '/api/admin/orders/:id/refund',
  ({ params, body }) => shop.refund(orderById(params.id), body.amount),
  admin
);

route('GET', '/api/admin/products', () => ({ products: db.products }), admin);
route(
  'POST',
  '/api/admin/products',
  ({ body }) => {
    checkProduct(body);
    const name = String(body.name).trim();
    const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${randomUUID().slice(0, 4)}`;
    const product = {
      id: `p_${randomUUID().slice(0, 8)}`,
      slug,
      name,
      description: body.description ?? '',
      ...pick(body),
    };
    db.products.push(product);
    return { status: 201, body: product };
  },
  admin
);
route(
  'PATCH',
  '/api/admin/products/:id',
  ({ params, body }) => {
    const product = productById(params.id);
    const next = { ...product, ...pick(body), name: body.name ?? product.name };
    checkProduct(next);
    return Object.assign(product, next);
  },
  admin
);
route(
  'DELETE',
  '/api/admin/products/:id',
  ({ params }) => {
    productById(params.id);
    db.products = db.products.filter((p) => p.id !== params.id);
    return { status: 204 };
  },
  admin
);

function pick({ category, price, stock }) {
  return Object.fromEntries(Object.entries({ category, price, stock }).filter(([, v]) => v !== undefined));
}

route('GET', '/api/admin/coupons', () => ({ coupons: db.coupons }), admin);
route(
  'POST',
  '/api/admin/coupons',
  ({ body }) => {
    const code = String(body.code ?? '')
      .trim()
      .toUpperCase();
    if (!code) throw new ApiError(400, 'invalid_code', 'Enter a code.', 'code');
    if (db.coupons.some((c) => c.code === code))
      throw new ApiError(409, 'code_taken', 'That code already exists.', 'code');
    if (!['percent', 'fixed', 'shipping'].includes(body.kind))
      throw new ApiError(400, 'invalid_kind', 'Choose a coupon type.', 'kind');
    const coupon = {
      code,
      kind: body.kind,
      value: body.value ?? 0,
      minSpend: body.minSpend ?? 0,
      expiresAt: body.expiresAt ?? null,
    };
    db.coupons.push(coupon);
    return { status: 201, body: coupon };
  },
  admin
);
route(
  'DELETE',
  '/api/admin/coupons/:code',
  ({ params }) => {
    db.coupons = db.coupons.filter((c) => c.code !== params.code);
    return { status: 204 };
  },
  admin
);

route(
  'POST',
  '/api/admin/gift-cards',
  ({ body }) => {
    if (!Number.isInteger(body.balance) || body.balance <= 0)
      throw new ApiError(400, 'invalid_balance', 'Enter a balance above zero.', 'balance');
    const giftCard = { code: `GIFT-${randomUUID().slice(0, 8).toUpperCase()}`, balance: body.balance };
    db.giftCards.push(giftCard);
    return { status: 201, body: giftCard };
  },
  admin
);

route(
  'GET',
  '/api/admin/subscriptions',
  () => ({
    subscriptions: [...db.subscriptions].reverse().map((s) => ({
      ...billing.subscriptionView(s),
      email: db.users.find((u) => u.id === s.userId)?.email ?? 'deleted',
    })),
  }),
  admin
);

route(
  'DELETE',
  '/api/admin/users/:id',
  ({ params }) => {
    if (params.id === 'u_admin') throw new ApiError(409, 'protected', 'The admin account cannot be deleted.');
    db.users = db.users.filter((u) => u.id !== params.id);
    db.orders = db.orders.filter((o) => o.userId !== params.id);
    db.subscriptions = db.subscriptions.filter((s) => s.userId !== params.id);
    db.userCarts.delete(params.id);
    dropSessionsOf(params.id);
    return { status: 204 };
  },
  admin
);

// A billing period can't pass during a test, so this hook runs what the period's end would run.
if (TEST_HOOKS) {
  route(
    'POST',
    '/api/test/subscriptions/:id/renew',
    (ctx) => billing.subscriptionView(billing.renew(billing.subscriptionFor(ctx.user, ctx.params.id))),
    customer
  );
}

// ---- HTTP -----------------------------------------------------------------------------------

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

async function serveStatic(pathname, res) {
  const relative = normalize(pathname === '/' ? 'index.html' : pathname.slice(1));
  if (relative.startsWith('..')) return send(res, 403, { error: { code: 'forbidden', message: 'Forbidden' } });
  try {
    const file = await readFile(join(PUBLIC_DIR, relative));
    res.writeHead(200, { 'Content-Type': `${MIME[extname(relative)] ?? 'application/octet-stream'}; charset=utf-8` });
    res.end(file);
  } catch {
    send(res, 404, { error: { code: 'not_found', message: 'Not found' } });
  }
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body === undefined ? undefined : JSON.stringify(body));
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new ApiError(400, 'invalid_json', 'The request body is not valid JSON.');
  }
}

async function handleApi(req, res, url) {
  const session = sessionFor(req, res);
  const matched = routes
    .map((r) => ({ r, m: r.method === req.method && r.pattern.exec(url.pathname) }))
    .find(({ m }) => m);
  if (!matched) throw new ApiError(404, 'not_found', 'No such endpoint.');

  const user = userOf(session);
  const { auth, handler } = matched.r;
  if (auth !== 'none' && !user) throw new ApiError(401, 'unauthenticated', 'Please sign in.');
  if (auth === 'admin' && user.role !== 'admin') throw new ApiError(403, 'forbidden', 'Admins only.');

  const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readJson(req) : {};
  const result = await handler({
    session,
    user,
    body,
    params: matched.m.groups ?? {},
    query: Object.fromEntries(url.searchParams),
  });
  if (result?.status && (result.body !== undefined || result.status === 204)) send(res, result.status, result.body);
  else send(res, 200, result);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/api/')) return serveStatic(url.pathname, res);
  try {
    await handleApi(req, res, url);
  } catch (error) {
    if (error instanceof ApiError || error instanceof PaymentError) {
      return send(res, error.status, { error: { code: error.code, message: error.message, field: error.field } });
    }
    console.error(error);
    send(res, 500, { error: { code: 'server_error', message: 'Something went wrong.' } });
  }
});

server.listen(PORT, () => {
  const bugs = activeBugs();
  console.log(`Roastery running on http://localhost:${PORT}${bugs.length ? ` with ${bugs.length} seeded bugs` : ''}`);
});
