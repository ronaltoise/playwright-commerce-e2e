// The store's state and rules: catalogue, carts, coupons, checkout, orders, refunds.
import { bug } from './bugs.mjs';
import { PaymentError, charge, tokenize } from './gateway.mjs';
import { seedCoupons, seedProducts, seedUsers } from './seed.mjs';
import { newCart } from './session.mjs';

export class ApiError extends Error {
  constructor(status, code, message, field) {
    super(message);
    Object.assign(this, { status, code, field });
  }
}

export const db = {
  users: seedUsers(),
  products: seedProducts(),
  coupons: seedCoupons(),
  giftCards: [{ code: 'GIFT-25-DEMO', balance: 2500 }],
  orders: [],
  challenges: new Map(),
  subscriptions: [],
  userCarts: new Map(),
};

const SHIPPING = { standard: 495, express: 995 };
const FREE_SHIPPING_FROM = 5000;
const TAX_RATE = 0.08;
export const PAGE_SIZE = 8;

// ---- Catalogue ------------------------------------------------------------------------------

const SORTS = {
  price_asc: (a, b) => a.price - b.price,
  price_desc: (a, b) => b.price - a.price,
  name_asc: (a, b) => a.name.localeCompare(b.name),
};

// BUG-10: compares prices as text, so $129.00 ("12900") sorts before $15.00 ("1500").
const textPriceSort = (a, b) => String(a.price).localeCompare(String(b.price));

export function listProducts({ q = '', category = '', sort = 'name_asc', page = 1 }) {
  const term = bug('BUG-14') ? q.trim() : q.trim().toLowerCase();
  const name = (p) => (bug('BUG-14') ? p.name : p.name.toLowerCase());
  const matches = db.products
    .filter((p) => !term || name(p).includes(term))
    .filter((p) => !category || p.category === category)
    .sort(sort === 'price_asc' && bug('BUG-10') ? textPriceSort : (SORTS[sort] ?? SORTS.name_asc));
  const current = Math.max(1, Number(page) || 1);
  const start = (current - 1) * PAGE_SIZE;
  return {
    items: matches.slice(start, start + PAGE_SIZE),
    total: matches.length,
    page: current,
    pageSize: PAGE_SIZE,
  };
}

export function productBySlug(slug) {
  const found = db.products.find((p) => p.slug === slug);
  if (!found) throw new ApiError(404, 'not_found', 'We could not find that product.');
  return found;
}

// ---- Cart -----------------------------------------------------------------------------------

export const cartOf = (session) => {
  if (!session.userId) return session.cart;
  if (!db.userCarts.has(session.userId)) db.userCarts.set(session.userId, newCart());
  return db.userCarts.get(session.userId);
};

/** A guest's cart joins the customer's own when they sign in. */
export function mergeGuestCart(session) {
  const cart = cartOf(session);
  for (const line of session.cart.lines) {
    const existing = cart.lines.find((l) => l.productId === line.productId);
    if (existing) existing.qty += line.qty;
    else cart.lines.push(line);
  }
  session.cart = newCart();
}

const requireProduct = (productId) => {
  const found = db.products.find((p) => p.id === productId);
  if (!found) throw new ApiError(404, 'not_found', 'We could not find that product.');
  return found;
};

const checkStock = (product, qty) => {
  if (!Number.isInteger(qty) || qty < 1) {
    throw new ApiError(400, 'invalid_quantity', 'Quantity must be at least 1.', 'qty');
  }
  if (qty > product.stock && !bug('BUG-04')) {
    throw new ApiError(409, 'out_of_stock', `Only ${product.stock} of ${product.name} left in stock.`, 'qty');
  }
};

export function addToCart(cart, productId, qty = 1) {
  const product = requireProduct(productId);
  const line = cart.lines.find((l) => l.productId === productId);
  checkStock(product, (line?.qty ?? 0) + qty);
  if (line) line.qty += qty;
  else cart.lines.push({ productId, qty });
}

export function setQuantity(cart, productId, qty) {
  const line = cart.lines.find((l) => l.productId === productId);
  if (!line) throw new ApiError(404, 'not_found', 'That item is not in your cart.');
  checkStock(requireProduct(productId), qty);
  line.qty = qty;
}

export function removeFromCart(cart, productId) {
  cart.lines = cart.lines.filter((l) => l.productId !== productId);
}

export function applyCoupon(cart, rawCode) {
  const code = String(rawCode ?? '')
    .trim()
    .toUpperCase();
  const coupon = db.coupons.find((c) => c.code === code);
  if (!coupon) throw new ApiError(404, 'invalid_coupon', 'That coupon code is not valid.', 'code');
  if (coupon.expiresAt && coupon.expiresAt < Date.now() && !bug('BUG-05')) {
    throw new ApiError(400, 'expired_coupon', 'That coupon has expired.', 'code');
  }
  const subtotal = subtotalOf(cart);
  if (subtotal < coupon.minSpend) {
    const needed = (coupon.minSpend / 100).toFixed(2);
    throw new ApiError(400, 'min_spend', `That coupon needs a subtotal of at least $${needed}.`, 'code');
  }
  cart.couponUses = cart.coupon === code ? cart.couponUses + 1 : 1;
  cart.coupon = code;
}

export function removeCoupon(cart) {
  cart.coupon = null;
  cart.couponUses = 0;
}

export function setShipping(cart, method) {
  if (!SHIPPING[method]) throw new ApiError(400, 'invalid_shipping', 'Choose a shipping method.', 'method');
  cart.shipping = method;
}

const subtotalOf = (cart) => cart.lines.reduce((sum, line) => sum + requireProduct(line.productId).price * line.qty, 0);

function totalsOf(cart) {
  const subtotal = subtotalOf(cart);
  const coupon = db.coupons.find((c) => c.code === cart.coupon);
  let discount = 0;
  if (coupon?.kind === 'percent') discount = Math.round((subtotal * coupon.value) / 100);
  if (coupon?.kind === 'fixed') discount = Math.min(coupon.value, subtotal);
  if (bug('BUG-02')) discount = Math.min(discount * cart.couponUses, subtotal);

  const goods = subtotal - discount;
  const qualifies = bug('BUG-03') ? goods > FREE_SHIPPING_FROM : goods >= FREE_SHIPPING_FROM;
  const free = cart.shipping === 'standard' && (qualifies || coupon?.kind === 'shipping');
  const shipping = cart.lines.length === 0 || free ? 0 : SHIPPING[cart.shipping];
  const tax = Math.round(goods * TAX_RATE);
  return { subtotal, discount, shipping, tax, total: goods + shipping + tax };
}

export function cartView(cart) {
  const lines = cart.lines.map((line) => {
    const product = requireProduct(line.productId);
    return {
      productId: line.productId,
      slug: product.slug,
      name: product.name,
      unitPrice: product.price,
      qty: line.qty,
      lineTotal: product.price * line.qty,
    };
  });
  return {
    lines,
    count: lines.reduce((sum, line) => sum + line.qty, 0),
    coupon: cart.coupon,
    shipping: cart.shipping,
    totals: totalsOf(cart),
  };
}

// ---- Checkout -------------------------------------------------------------------------------

const REQUIRED_ADDRESS = ['name', 'line1', 'city', 'postcode', 'country'];

function checkAddress(address) {
  for (const field of REQUIRED_ADDRESS) {
    if (!String(address?.[field] ?? '').trim()) {
      throw new ApiError(400, 'invalid_address', `Enter your ${field === 'line1' ? 'address' : field}.`, field);
    }
  }
}

let nextOrder = 10000;

function createOrder(user, cart, address, payment) {
  const view = cartView(cart);
  const order = {
    id: `R-${++nextOrder}`,
    userId: user.id,
    email: user.email,
    createdAt: new Date().toISOString(),
    lines: view.lines,
    coupon: view.coupon,
    shippingMethod: view.shipping,
    totals: view.totals,
    address,
    payment,
    status: payment.method === 'bank_transfer' ? 'awaiting_payment' : 'paid',
    refunded: 0,
  };
  for (const line of view.lines) requireProduct(line.productId).stock -= line.qty;
  db.orders.push(order);
  Object.assign(cart, newCart());
  return order;
}

const card = (token) => ({ method: 'card', last4: token.last4 });

export function checkout(user, cart, { address, payment }) {
  if (cart.lines.length === 0) throw new ApiError(400, 'empty_cart', 'Your cart is empty.');
  for (const line of cart.lines) checkStock(requireProduct(line.productId), line.qty);
  checkAddress(address);
  const { total } = totalsOf(cart);

  if (payment?.method === 'gift_card') {
    const code = String(payment.code ?? '')
      .trim()
      .toUpperCase();
    const gift = db.giftCards.find((g) => g.code === code);
    if (!gift) throw new ApiError(404, 'invalid_gift_card', 'That gift card code is not valid.', 'code');
    if (gift.balance < total) {
      const left = (gift.balance / 100).toFixed(2);
      throw new ApiError(402, 'insufficient_gift_balance', `This gift card only has $${left} left.`, 'code');
    }
    gift.balance -= total;
    return { order: createOrder(user, cart, address, { method: 'gift_card', code }) };
  }

  if (payment?.method === 'bank_transfer') {
    return { order: createOrder(user, cart, address, { method: 'bank_transfer' }) };
  }

  if (payment?.method !== 'card') {
    throw new ApiError(400, 'invalid_payment', 'Choose a payment method.', 'method');
  }

  const token = tokenize(payment.card);
  try {
    const result = charge(token, total);
    if (result.status === 'requires_action') {
      const id = `ch3ds_${db.challenges.size + 1}`;
      db.challenges.set(id, { id, userId: user.id, token, address, total });
      return { challenge: { id, total } };
    }
  } catch (error) {
    if (bug('BUG-01') && error instanceof PaymentError) createOrder(user, cart, address, card(token));
    throw error;
  }
  return { order: createOrder(user, cart, address, card(token)) };
}

export function answerChallenge(user, id, approve) {
  const challenge = db.challenges.get(id);
  if (!challenge || challenge.userId !== user.id) {
    throw new ApiError(404, 'not_found', 'That payment confirmation has expired.');
  }
  db.challenges.delete(id);
  if (!approve) throw new PaymentError('authentication_failed', 'Your bank could not confirm this payment.');
  charge(challenge.token, challenge.total, { challengePassed: true });
  return createOrder(user, cartOf({ userId: user.id }), challenge.address, card(challenge.token));
}

// ---- Orders ---------------------------------------------------------------------------------

export const ordersOf = (userId) => db.orders.filter((o) => o.userId === userId).reverse();

export function orderFor(user, id) {
  const order = db.orders.find((o) => o.id === id);
  const allowed = user.role === 'admin' || order?.userId === user.id || bug('BUG-09');
  if (!order || !allowed) throw new ApiError(404, 'not_found', 'We could not find that order.');
  return order;
}

export function refund(order, amount) {
  const left = order.totals.total - order.refunded;
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new ApiError(400, 'invalid_amount', 'Enter a refund amount above zero.', 'amount');
  }
  if (amount > left && !bug('BUG-13')) {
    throw new ApiError(400, 'refund_too_large', `Only $${(left / 100).toFixed(2)} can still be refunded.`, 'amount');
  }
  order.refunded += amount;
  order.status = order.refunded >= order.totals.total ? 'refunded' : 'partially_refunded';
  return order;
}
