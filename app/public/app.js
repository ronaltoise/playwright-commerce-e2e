// The storefront: a small single-page app with hash routes and no framework.
const app = document.getElementById('app');
const header = document.getElementById('site-header');
const toastBox = document.getElementById('toast');
const state = { user: null, count: 0, config: { testCards: {}, bugs: [] } };

const hasBug = (id) => state.config.bugs.includes(id);
const money = (cents) => `$${(cents / 100).toFixed(2)}`;
const date = (iso) => new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
const label = (value) => value.replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase());
const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
const status = (value) => `<span class="status ${esc(value)}" data-testid="status">${esc(label(value))}</span>`;

class ApiFailure extends Error {
  constructor(status, error) {
    super(error?.message ?? 'Something went wrong.');
    this.status = status;
    this.code = error?.code;
  }
}

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw new ApiFailure(res.status, data.error);
  return data;
}

let toastTimer;
function toast(message) {
  toastBox.textContent = message;
  toastBox.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastBox.hidden = true), 3000);
}

const go = (hash) => {
  if (location.hash === hash) render();
  else location.hash = hash;
};

// ---- Header ---------------------------------------------------------------------------------

function renderHeader() {
  const { user, count } = state;
  header.innerHTML = `<nav class="bar" aria-label="Main">
    <a class="brand" href="#/">Roastery</a>
    <a href="#/">Shop</a>
    <a href="#/plans">Subscriptions</a>
    <a href="#/cart">Cart <span class="badge" data-testid="cart-count">${count}</span></a>
    ${user ? `<a href="#/account">Account</a>` : `<a href="#/login">Sign in</a>`}
    ${user?.role === 'admin' ? `<a href="#/admin/orders">Admin</a>` : ''}
    ${user ? `<button type="button" data-action="logout">Sign out</button>` : ''}
  </nav>`;
}

async function refreshCount() {
  state.count = (await api('/cart')).count;
  renderHeader();
}

// ---- Shop -----------------------------------------------------------------------------------

const TONES = { Beans: '#8a5a3b', Gear: '#51606b', Gifts: '#a0522d' };

function productCard(p) {
  const soldOut = p.stock === 0;
  return `<article class="card" aria-label="${esc(p.name)}">
    <div class="swatch" style="--tone:${TONES[p.category] ?? '#8a5a3b'}"></div>
    <h2><a href="#/product/${esc(p.slug)}">${esc(p.name)}</a></h2>
    <span class="muted small">${esc(p.category)}</span>
    <span class="price">${money(p.price)}</span>
    <button type="button" data-action="add-to-cart" data-id="${esc(p.id)}" ${soldOut ? 'disabled' : ''}>${soldOut ? 'Sold out' : 'Add to cart'}</button>
  </article>`;
}

async function shopView(_, query) {
  const params = new URLSearchParams({
    q: query.get('q') ?? '',
    category: query.get('category') ?? '',
    sort: query.get('sort') ?? 'name_asc',
    page: query.get('page') ?? '1',
  });
  const { items, total, page, pageSize } = await api(`/products?${params}`);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const link = (changes) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) next.set(key, value);
    return `#/?${next}`;
  };
  const category = params.get('category');
  const chips = ['', 'Beans', 'Gear', 'Gifts']
    .map(
      (c) =>
        `<a href="${link({ category: c, page: 1 })}" ${c === category ? 'aria-current="page"' : ''}>${c || 'All'}</a>`
    )
    .join('');
  const sorts = [
    ['name_asc', 'Name'],
    ['price_asc', 'Price: low to high'],
    ['price_desc', 'Price: high to low'],
  ]
    .map(
      ([value, text]) => `<option value="${value}" ${value === params.get('sort') ? 'selected' : ''}>${text}</option>`
    )
    .join('');
  return `<h1>Fresh coffee, roasted weekly</h1>
    <div class="toolbar">
      <form data-form="search" role="search">
        <input type="search" name="q" aria-label="Search products" placeholder="Search products" value="${esc(params.get('q'))}" />
        <button type="submit">Search</button>
      </form>
      <label class="choice">Sort by
        <select aria-label="Sort products" data-change="sort" data-base="${esc(link({ page: 1 }))}">${sorts}</select>
      </label>
    </div>
    <nav class="tabs" aria-label="Categories">${chips}</nav>
    <p class="muted small" data-testid="result-count">${total} ${total === 1 ? 'product' : 'products'}</p>
    ${items.length ? `<div class="grid">${items.map(productCard).join('')}</div>` : `<p>No products match your search.</p>`}
    ${
      pages > 1
        ? `<nav class="inline" aria-label="Pagination" style="margin-top:1rem">
            ${page > 1 ? `<a class="button" href="${link({ page: page - 1 })}">Previous</a>` : ''}
            <span>Page ${page} of ${pages}</span>
            ${page < pages ? `<a class="button" href="${link({ page: page + 1 })}">Next</a>` : ''}
          </nav>`
        : ''
    }`;
}

const stockText = (p) => {
  if (p.stock === 0) return 'Sold out';
  return p.stock <= 5 ? `Only ${p.stock} left` : 'In stock';
};

async function productView([slug]) {
  const p = await api(`/products/${slug}`);
  // Seeded BUG-12: a widget below the fold dies on gear pages, while the page itself still works.
  if (hasBug('BUG-12') && p.category === 'Gear') setTimeout(() => p.related.slice(0, 3));
  return `<div class="columns">
    <div class="swatch" style="height:280px;--tone:${TONES[p.category] ?? '#8a5a3b'}"></div>
    <div class="stack">
      <h1>${esc(p.name)}</h1>
      <p class="price" data-testid="product-price">${money(p.price)}</p>
      <p>${esc(p.description)}</p>
      <p class="muted" data-testid="stock">${stockText(p)}</p>
      <form data-form="add-product" data-id="${esc(p.id)}" class="inline">
        <label class="choice">Quantity <input name="qty" type="number" min="1" value="1" /></label>
        <button type="submit" ${p.stock === 0 ? 'disabled' : ''}>${p.stock === 0 ? 'Sold out' : 'Add to cart'}</button>
        <p role="alert"></p>
      </form>
    </div>
  </div>`;
}

// ---- Cart -----------------------------------------------------------------------------------

function totalsList(t) {
  return `<dl class="totals">
    <dt>Subtotal</dt><dd data-testid="subtotal">${money(t.subtotal)}</dd>
    <dt>Discount</dt><dd data-testid="discount">-${money(t.discount)}</dd>
    <dt>Shipping</dt><dd data-testid="shipping">${t.shipping ? money(t.shipping) : 'Free'}</dd>
    <dt>Tax</dt><dd data-testid="tax">${money(t.tax)}</dd>
    <dt class="grand">Total</dt><dd class="grand" data-testid="total">${money(t.total)}</dd>
  </dl>`;
}

async function cartView() {
  const cart = await api('/cart');
  if (!cart.lines.length) {
    return `<h1>Your cart</h1><p>Your cart is empty.</p><a class="button" href="#/">Browse the shop</a>`;
  }
  const rows = cart.lines
    .map(
      (l) => `<tr>
        <td><a href="#/product/${esc(l.slug)}">${esc(l.name)}</a></td>
        <td>${money(l.unitPrice)}</td>
        <td><input type="number" min="1" value="${l.qty}" aria-label="Quantity for ${esc(l.name)}" data-change="qty" data-id="${esc(l.productId)}" style="width:5rem" /></td>
        <td data-testid="line-total">${money(l.lineTotal)}</td>
        <td><button type="button" class="secondary" data-action="remove-line" data-id="${esc(l.productId)}" aria-label="Remove ${esc(l.name)}">Remove</button></td>
      </tr>`
    )
    .join('');
  return `<h1>Your cart</h1>
    <div class="columns">
      <div class="stack">
        <div class="card scroll">
          <table><thead><tr><th>Item</th><th>Price</th><th>Qty</th><th>Total</th><th><span hidden>Actions</span></th></tr></thead><tbody>${rows}</tbody></table>
          <p role="alert" id="cart-error"></p>
        </div>
        <form class="card" data-form="coupon">
          <label>Coupon code <input name="code" autocomplete="off" /></label>
          <div class="inline" style="margin-top:.5rem"><button type="submit" class="secondary">Apply coupon</button>
          ${cart.coupon ? `<span data-testid="applied-coupon">${esc(cart.coupon)}</span> <button type="button" class="secondary" data-action="remove-coupon">Remove coupon</button>` : ''}</div>
          <p role="alert"></p>
        </form>
      </div>
      <aside class="card stack">
        <fieldset><legend>Shipping</legend>
          <label class="choice"><input type="radio" name="shipping" value="standard" data-change="shipping" ${cart.shipping === 'standard' ? 'checked' : ''} /> Standard ($4.95, free over $50)</label>
          <label class="choice"><input type="radio" name="shipping" value="express" data-change="shipping" ${cart.shipping === 'express' ? 'checked' : ''} /> Express ($9.95)</label>
        </fieldset>
        ${totalsList(cart.totals)}
        <a class="button" href="#/checkout">Checkout</a>
      </aside>
    </div>`;
}

// ---- Checkout -------------------------------------------------------------------------------

function cardFields() {
  const year = new Date().getFullYear() + 3;
  const samples = Object.entries(state.config.testCards)
    .map(([number, card]) => `<tr><td>${number.replace(/(\d{4})/g, '$1 ').trim()}</td><td>${esc(card.label)}</td></tr>`)
    .join('');
  return `<div class="fields">
      <label>Card number <input name="number" inputmode="numeric" autocomplete="off" /></label>
      <label>Expiry month <input name="expMonth" inputmode="numeric" value="12" autocomplete="off" /></label>
      <label>Expiry year <input name="expYear" inputmode="numeric" value="${year}" autocomplete="off" /></label>
      <label>Security code <input name="cvc" inputmode="numeric" autocomplete="off" /></label>
    </div>
    <details class="small" style="margin-top:.5rem"><summary>Demo test cards</summary>
      <p class="muted">This shop uses a mock gateway. Any of these numbers works, and no real card is accepted.</p>
      <table>${samples}</table>
    </details>`;
}

const cardFrom = (data) => ({
  number: data.get('number'),
  expMonth: data.get('expMonth'),
  expYear: data.get('expYear'),
  cvc: data.get('cvc'),
});

async function checkoutView() {
  const cart = await api('/cart');
  if (!cart.lines.length) {
    return `<h1>Checkout</h1><p>Your cart is empty.</p><a class="button" href="#/">Browse the shop</a>`;
  }
  const items = cart.lines.map((l) => `<li>${l.qty} × ${esc(l.name)}</li>`).join('');
  return `<h1>Checkout</h1>
    <form class="columns" data-form="checkout">
      <div class="stack">
        <fieldset><legend>Delivery address</legend>
          <div class="fields">
            <label>Full name <input name="name" value="${esc(state.user.name)}" autocomplete="off" /></label>
            <label>Address <input name="line1" autocomplete="off" /></label>
            <label>City <input name="city" autocomplete="off" /></label>
            <label>Postcode <input name="postcode" autocomplete="off" /></label>
            <label>Country <input name="country" value="United States" autocomplete="off" /></label>
          </div>
        </fieldset>
        <fieldset><legend>Payment method</legend>
          <div class="inline" style="margin-bottom:.75rem">
            <label class="choice"><input type="radio" name="method" value="card" data-change="method" checked /> Card</label>
            <label class="choice"><input type="radio" name="method" value="gift_card" data-change="method" /> Gift card</label>
            <label class="choice"><input type="radio" name="method" value="bank_transfer" data-change="method" /> Bank transfer</label>
          </div>
          <div data-method="card">${cardFields()}</div>
          <div data-method="gift_card" hidden><label>Gift card code <input name="code" autocomplete="off" /></label></div>
          <p data-method="bank_transfer" class="muted" hidden>We hold your order until your transfer arrives.</p>
        </fieldset>
      </div>
      <aside class="card stack">
        <ul style="margin:0;padding-left:1.1rem">${items}</ul>
        ${totalsList(cart.totals)}
        <button type="submit" data-pay="${money(cart.totals.total)}">Pay ${money(cart.totals.total)}</button>
        <p role="alert"></p>
      </aside>
    </form>`;
}

async function challengeView([id]) {
  return `<div class="card stack" style="max-width:32rem">
    <h1>Confirm your payment</h1>
    <p>Your bank wants to confirm this payment. This page stands in for its 3-D Secure screen.</p>
    <div class="inline">
      <button type="button" data-action="challenge" data-id="${esc(id)}" data-approve="true">Approve</button>
      <button type="button" class="danger" data-action="challenge" data-id="${esc(id)}" data-approve="false">Decline</button>
    </div>
    <p role="alert"></p>
  </div>`;
}

const paidBy = (p) =>
  ({
    card: `Card ending ${esc(p.last4)}`,
    gift_card: `Gift card ${esc(p.code)}`,
    bank_transfer: 'Bank transfer',
  })[p.method];

async function orderView([id]) {
  const order = await api(`/orders/${id}`);
  const rows = order.lines
    .map((l) => `<tr><td>${esc(l.name)}</td><td>${l.qty}</td><td>${money(l.lineTotal)}</td></tr>`)
    .join('');
  return `<h1>Order ${esc(order.id)}</h1>
    <p>${status(order.status)}</p>
    ${order.status === 'awaiting_payment' ? `<p class="banner">Send ${money(order.totals.total)} to Roastery Ltd, reference ${esc(order.id)}. We ship once it arrives.</p>` : ''}
    <div class="columns">
      <div class="card scroll"><table><thead><tr><th>Item</th><th>Qty</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table></div>
      <aside class="card stack">
        ${totalsList(order.totals)}
        ${order.refunded ? `<p>Refunded: <span data-testid="refunded">${money(order.refunded)}</span></p>` : ''}
        <p class="muted small" data-testid="paid-by">${paidBy(order.payment)}</p>
      </aside>
    </div>`;
}

// ---- Account --------------------------------------------------------------------------------

function loginView() {
  return `<form class="card stack" data-form="login" style="max-width:24rem">
    <h1>Sign in</h1>
    <label>Email <input name="email" type="email" autocomplete="off" /></label>
    <label>Password <input name="password" type="password" autocomplete="off" /></label>
    <button type="submit">Sign in</button>
    <p role="alert"></p>
    <p class="small">New here? <a href="#/register">Create an account</a></p>
  </form>`;
}

function registerView() {
  return `<form class="card stack" data-form="register" style="max-width:24rem">
    <h1>Create your account</h1>
    <label>Name <input name="name" autocomplete="off" /></label>
    <label>Email <input name="email" type="email" autocomplete="off" /></label>
    <label>Password <input name="password" type="password" autocomplete="off" /></label>
    <button type="submit">Create account</button>
    <p role="alert"></p>
  </form>`;
}

async function accountView() {
  const { orders } = await api('/orders');
  const rows = orders
    .map(
      (o) => `<tr>
        <td><a href="#/order/${esc(o.id)}">${esc(o.id)}</a></td>
        <td>${date(o.createdAt)}</td><td>${status(o.status)}</td><td>${money(o.totals.total)}</td>
      </tr>`
    )
    .join('');
  return `<h1>Hello, ${esc(state.user.name)}</h1>
    <p class="muted">${esc(state.user.email)}</p>
    <p><a href="#/subscription">Manage your subscription</a></p>
    <h2>Your orders</h2>
    ${orders.length ? `<div class="card scroll"><table aria-label="Your orders"><thead><tr><th>Order</th><th>Date</th><th>Status</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<p>You have no orders yet.</p>`}`;
}

// ---- Subscriptions --------------------------------------------------------------------------

async function plansView(_, query) {
  const billing = query.get('billing') === 'annual' ? 'annual' : 'monthly';
  const { plans } = await api('/plans');
  const cards = plans
    .map(
      (p) => `<article class="card" aria-label="${esc(p.name)}">
        <h2>${esc(p.name)}</h2>
        <p class="muted">${p.bags} ${p.bags === 1 ? 'bag' : 'bags'} every month</p>
        <p class="price" data-testid="plan-price">${money(p[billing])} a ${billing === 'annual' ? 'year' : 'month'}</p>
        ${billing === 'monthly' && p.trialDays ? `<p class="small" data-testid="trial">${p.trialDays}-day free trial</p>` : ''}
        ${billing === 'annual' ? `<p class="small">Two months free</p>` : ''}
        <a class="button" href="#/subscribe/${esc(p.id)}?billing=${billing}">Choose ${esc(p.name)}</a>
      </article>`
    )
    .join('');
  return `<h1>Coffee on a schedule</h1>
    <p>Pause, change plan or cancel whenever you like.</p>
    <fieldset class="inline" style="margin-bottom:1rem"><legend>Billing</legend>
      <label class="choice"><input type="radio" name="billing" value="monthly" data-change="billing" ${billing === 'monthly' ? 'checked' : ''} /> Monthly</label>
      <label class="choice"><input type="radio" name="billing" value="annual" data-change="billing" ${billing === 'annual' ? 'checked' : ''} /> Annual</label>
    </fieldset>
    <div class="grid">${cards}</div>`;
}

async function subscribeView([planId], query) {
  const billing = query.get('billing') === 'annual' ? 'annual' : 'monthly';
  const { plans } = await api('/plans');
  const plan = plans.find((p) => p.id === planId);
  if (!plan) return `<h1>Plan not found</h1><a href="#/plans">See all plans</a>`;
  const { subscription } = await api('/subscription');
  if (subscription && subscription.status !== 'canceled') {
    return `<h1>You're already subscribed</h1><a class="button" href="#/subscription">Manage your subscription</a>`;
  }
  const period = billing === 'annual' ? 'year' : 'month';
  const trial = billing === 'monthly' ? plan.trialDays : 0;
  return `<h1>Subscribe to ${esc(plan.name)}</h1>
    <p data-testid="subscribe-summary">${trial ? `Free for ${trial} days, then ${money(plan[billing])} a ${period}.` : `${money(plan[billing])} a ${period}, billed today.`}</p>
    <form class="card stack" data-form="subscribe" data-plan="${esc(plan.id)}" data-billing="${billing}" style="max-width:36rem">
      ${cardFields()}
      <button type="submit">${trial ? 'Start free trial' : 'Start subscription'}</button>
      <p role="alert"></p>
    </form>`;
}

async function subscriptionView() {
  const { subscription: s } = await api('/subscription');
  if (!s) {
    return `<h1>Your subscription</h1><p>You don't have a subscription yet.</p><a class="button" href="#/plans">See plans</a>`;
  }
  if (s.status === 'canceled') {
    return `<h1>Your subscription</h1><p>${status(s.status)}</p><p>Your ${esc(s.planName)} subscription has ended.</p><a class="button" href="#/plans">Choose a plan</a>${invoiceTable(s)}`;
  }
  const { plans } = await api('/plans');
  const options = plans
    .filter((p) => p.id !== s.planId)
    .map((p) => `<option value="${esc(p.id)}">${esc(p.name)} (${money(p[s.billing])})</option>`)
    .join('');
  return `<h1>Your subscription</h1>
    <p>${status(s.status)}</p>
    <div class="stack">
      ${s.status === 'past_due' ? `<div class="banner stack"><p role="alert" style="margin:0">Your last payment failed. Update your card, then try again.</p><div><button type="button" data-action="sub" data-op="retry" data-id="${esc(s.id)}">Retry payment</button></div></div>` : ''}
      ${s.cancelAtPeriodEnd ? `<div class="banner inline"><span data-testid="ending">Ends on ${date(s.periodEnd)}. Your deliveries continue until then.</span><button type="button" data-action="sub" data-op="keep" data-id="${esc(s.id)}">Keep subscription</button></div>` : ''}
      ${s.pendingPlanName ? `<p class="banner" data-testid="pending-plan">Changes to ${esc(s.pendingPlanName)} at your next renewal.</p>` : ''}
      <div class="card">
        <dl class="facts">
          <dt>Plan</dt><dd data-testid="plan-name">${esc(s.planName)}</dd>
          <dt>Billing</dt><dd>${esc(label(s.billing))}</dd>
          <dt>Price</dt><dd data-testid="sub-price">${money(s.price)}</dd>
          <dt>Current period ends</dt><dd>${date(s.periodEnd)}</dd>
          <dt>Next charge</dt><dd data-testid="next-charge">${s.nextCharge === null ? 'None' : money(s.nextCharge)}</dd>
          <dt>Card</dt><dd data-testid="card-on-file">Ending ${esc(s.card.last4)}</dd>
        </dl>
      </div>
      <form class="card inline" data-form="change-plan" data-id="${esc(s.id)}">
        <label>Change plan <select name="planId">${options}</select></label>
        <button type="submit" class="secondary">Change plan</button>
        <p role="alert"></p>
      </form>
      <div class="inline">
        ${s.status === 'active' ? `<button type="button" class="secondary" data-action="sub" data-op="pause" data-id="${esc(s.id)}">Pause subscription</button>` : ''}
        ${s.status === 'paused' ? `<button type="button" data-action="sub" data-op="resume" data-id="${esc(s.id)}">Resume subscription</button>` : ''}
        ${s.cancelAtPeriodEnd ? '' : `<button type="button" class="danger" data-action="sub" data-op="cancel" data-id="${esc(s.id)}">Cancel subscription</button>`}
      </div>
      <p role="alert" id="sub-error"></p>
      <form class="card stack" data-form="update-card" data-id="${esc(s.id)}">
        <h2>Update your card</h2>
        ${cardFields()}
        <div><button type="submit" class="secondary">Save card</button></div>
        <p role="alert"></p>
      </form>
      ${invoiceTable(s)}
    </div>`;
}

function invoiceTable(s) {
  if (!s.invoices.length) return `<p class="muted" data-testid="no-invoices">No invoices yet.</p>`;
  const rows = s.invoices
    .map(
      (i) =>
        `<tr><td>${esc(i.id)}</td><td>${esc(label(i.kind))}</td><td>${money(i.amount)}</td><td>${status(i.status)}</td></tr>`
    )
    .join('');
  return `<div class="card scroll"><h2>Invoices</h2><table aria-label="Invoices"><thead><tr><th>Invoice</th><th>Type</th><th>Amount</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

// ---- Admin ----------------------------------------------------------------------------------

async function adminShell(active, body) {
  const stats = await api('/admin/stats');
  const tabs = ['orders', 'products', 'coupons', 'subscriptions']
    .map((t) => `<a href="#/admin/${t}" ${t === active ? 'aria-current="page"' : ''}>${label(t)}</a>`)
    .join('');
  return `<h1>Admin</h1>
    <div class="stats">
      <div><b data-testid="stat-orders">${stats.orders}</b>Orders</div>
      <div><b data-testid="stat-revenue">${money(stats.revenue)}</b>Revenue</div>
      <div><b data-testid="stat-mrr">${money(stats.mrr)}</b>Monthly recurring</div>
      <div><b>${stats.activeSubscriptions}</b>Active subscriptions</div>
    </div>
    <nav class="tabs" aria-label="Admin sections">${tabs}</nav>
    ${body}`;
}

async function adminOrders() {
  const { orders } = await api('/admin/orders');
  const rows = orders
    .map(
      (o) => `<tr aria-label="${esc(o.id)}">
        <td><a href="#/order/${esc(o.id)}">${esc(o.id)}</a></td>
        <td>${esc(o.email)}</td><td>${status(o.status)}</td><td>${money(o.totals.total)}</td>
        <td>
          ${o.status === 'awaiting_payment' ? `<button type="button" data-action="mark-paid" data-id="${esc(o.id)}">Mark as paid</button>` : ''}
          ${['paid', 'partially_refunded'].includes(o.status) ? `<form class="inline" data-form="refund" data-id="${esc(o.id)}"><input name="amount" aria-label="Refund amount for ${esc(o.id)}" inputmode="decimal" /><button type="submit" class="secondary">Refund</button><p role="alert"></p></form>` : ''}
        </td></tr>`
    )
    .join('');
  return adminShell(
    'orders',
    orders.length
      ? `<div class="card scroll"><table aria-label="Orders"><thead><tr><th>Order</th><th>Customer</th><th>Status</th><th>Total</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table></div>`
      : `<p>No orders yet.</p>`
  );
}

async function adminProducts() {
  const { products } = await api('/admin/products');
  const rows = products
    .map(
      (p) => `<tr aria-label="${esc(p.name)}">
        <td>${esc(p.name)}</td><td>${esc(p.category)}</td>
        <td><form class="inline" data-form="edit-product" data-id="${esc(p.id)}">
          <input name="price" aria-label="Price for ${esc(p.name)}" value="${(p.price / 100).toFixed(2)}" inputmode="decimal" />
          <input name="stock" aria-label="Stock for ${esc(p.name)}" value="${p.stock}" inputmode="numeric" />
          <button type="submit" class="secondary" aria-label="Save ${esc(p.name)}">Save</button>
          <p role="alert"></p>
        </form></td>
        <td><button type="button" class="danger" data-action="delete-product" data-id="${esc(p.id)}" aria-label="Delete ${esc(p.name)}">Delete</button></td>
      </tr>`
    )
    .join('');
  return adminShell(
    'products',
    `<form class="card stack" data-form="new-product" style="margin-bottom:1rem">
      <h2>Add a product</h2>
      <div class="fields">
        <label>Name <input name="name" autocomplete="off" /></label>
        <label>Category <select name="category"><option>Beans</option><option>Gear</option><option>Gifts</option></select></label>
        <label>Price <input name="price" inputmode="decimal" autocomplete="off" /></label>
        <label>Stock <input name="stock" inputmode="numeric" autocomplete="off" /></label>
      </div>
      <div><button type="submit">Add product</button></div>
      <p role="alert"></p>
    </form>
    <div class="card scroll"><table aria-label="Products"><thead><tr><th>Product</th><th>Category</th><th>Price and stock</th><th><span hidden>Actions</span></th></tr></thead><tbody>${rows}</tbody></table></div>`
  );
}

const couponValue = (c) => {
  if (c.kind === 'percent') return `${c.value}% off`;
  return c.kind === 'fixed' ? `${money(c.value)} off` : 'Free shipping';
};

async function adminCoupons() {
  const { coupons } = await api('/admin/coupons');
  const rows = coupons
    .map(
      (c) => `<tr aria-label="${esc(c.code)}">
        <td>${esc(c.code)}</td><td>${couponValue(c)}</td><td>${c.minSpend ? money(c.minSpend) : 'None'}</td>
        <td>${c.expiresAt ? date(new Date(c.expiresAt).toISOString()) : 'Never'}</td>
        <td><button type="button" class="danger" data-action="delete-coupon" data-id="${esc(c.code)}" aria-label="Delete ${esc(c.code)}">Delete</button></td>
      </tr>`
    )
    .join('');
  return adminShell(
    'coupons',
    `<form class="card stack" data-form="new-coupon" style="margin-bottom:1rem">
      <h2>Add a coupon</h2>
      <div class="fields">
        <label>Code <input name="code" autocomplete="off" /></label>
        <label>Type <select name="kind"><option value="percent">Percent off</option><option value="fixed">Amount off</option><option value="shipping">Free shipping</option></select></label>
        <label>Value <input name="value" inputmode="decimal" autocomplete="off" /></label>
      </div>
      <div><button type="submit">Add coupon</button></div>
      <p role="alert"></p>
    </form>
    <div class="card scroll"><table aria-label="Coupons"><thead><tr><th>Code</th><th>Value</th><th>Minimum spend</th><th>Expires</th><th><span hidden>Actions</span></th></tr></thead><tbody>${rows}</tbody></table></div>`
  );
}

async function adminSubscriptions() {
  const { subscriptions } = await api('/admin/subscriptions');
  const rows = subscriptions
    .map(
      (s) =>
        `<tr><td>${esc(s.email)}</td><td>${esc(s.planName)}</td><td>${esc(label(s.billing))}</td><td>${status(s.status)}</td><td>${money(s.price)}</td></tr>`
    )
    .join('');
  return adminShell(
    'subscriptions',
    subscriptions.length
      ? `<div class="card scroll"><table aria-label="Subscriptions"><thead><tr><th>Customer</th><th>Plan</th><th>Billing</th><th>Status</th><th>Price</th></tr></thead><tbody>${rows}</tbody></table></div>`
      : `<p>No subscriptions yet.</p>`
  );
}

// ---- Routing --------------------------------------------------------------------------------

const routes = [
  [/^\/$/, shopView],
  [/^\/product\/([^/]+)$/, productView],
  [/^\/cart$/, cartView],
  [/^\/checkout$/, checkoutView, 'user'],
  [/^\/challenge\/([^/]+)$/, challengeView, 'user'],
  [/^\/order\/([^/]+)$/, orderView, 'user'],
  [/^\/login$/, loginView],
  [/^\/register$/, registerView],
  [/^\/account$/, accountView, 'user'],
  [/^\/plans$/, plansView],
  [/^\/subscribe\/([^/]+)$/, subscribeView, 'user'],
  [/^\/subscription$/, subscriptionView, 'user'],
  [/^\/admin\/orders$/, adminOrders, 'admin'],
  [/^\/admin\/products$/, adminProducts, 'admin'],
  [/^\/admin\/coupons$/, adminCoupons, 'admin'],
  [/^\/admin\/subscriptions$/, adminSubscriptions, 'admin'],
];

let renderId = 0;

async function render() {
  const id = ++renderId;
  const hash = location.hash.slice(1) || '/';
  const [path, search] = hash.split('?');
  const matched = routes.map(([pattern, view, guard]) => ({ m: pattern.exec(path), view, guard })).find((r) => r.m);
  if (!matched) {
    app.innerHTML = `<h1>Page not found</h1><a href="#/">Back to the shop</a>`;
    return;
  }
  if (matched.guard && !state.user) {
    location.replace(`#/login?next=${encodeURIComponent(hash)}`);
    return;
  }
  if (matched.guard === 'admin' && state.user.role !== 'admin') {
    app.innerHTML = `<h1>Not allowed</h1><p>This area is for shop staff.</p>`;
    return;
  }
  let html;
  try {
    html = await matched.view(matched.m.slice(1), new URLSearchParams(search));
  } catch (error) {
    if (!(error instanceof ApiFailure)) throw error;
    html = `<h1>${error.status === 404 ? 'Not found' : 'Something went wrong'}</h1><p>${esc(error.message)}</p><a href="#/">Back to the shop</a>`;
  }
  if (id === renderId) {
    app.innerHTML = html;
    window.scrollTo(0, 0);
  }
}

// ---- Interactions ---------------------------------------------------------------------------

const nextAfterLogin = () => {
  const next = new URLSearchParams(location.hash.split('?')[1]).get('next');
  return next ? `#${next}` : '#/';
};

async function signedIn(user, target) {
  state.user = user;
  await refreshCount();
  go(target);
}

const dollars = (value) => Math.round(Number(value) * 100);

const forms = {
  async search(data) {
    go(`#/?${new URLSearchParams({ q: data.get('q') })}`);
  },
  async login(data) {
    const { user } = await api('/auth/login', { method: 'POST', body: Object.fromEntries(data) });
    await signedIn(user, nextAfterLogin());
  },
  async register(data) {
    const { user } = await api('/auth/register', { method: 'POST', body: Object.fromEntries(data) });
    await signedIn(user, '#/account');
  },
  async 'add-product'(data, form) {
    await api('/cart/items', { method: 'POST', body: { productId: form.dataset.id, qty: Number(data.get('qty')) } });
    await refreshCount();
    toast('Added to cart');
  },
  async coupon(data) {
    await api('/cart/coupon', { method: 'POST', body: { code: data.get('code') } });
    render();
  },
  async checkout(data) {
    const method = data.get('method');
    const payment = { method };
    if (method === 'card') payment.card = cardFrom(data);
    if (method === 'gift_card') payment.code = data.get('code');
    const address = Object.fromEntries(['name', 'line1', 'city', 'postcode', 'country'].map((k) => [k, data.get(k)]));
    const result = await api('/checkout', { method: 'POST', body: { address, payment } });
    if (result.challenge) return go(`#/challenge/${result.challenge.id}`);
    await refreshCount();
    go(`#/order/${result.order.id}`);
  },
  async subscribe(data, form) {
    const { plan: planId, billing } = form.dataset;
    await api('/subscriptions', { method: 'POST', body: { planId, billing, card: cardFrom(data) } });
    go('#/subscription');
  },
  async 'change-plan'(data, form) {
    await api(`/subscriptions/${form.dataset.id}/change-plan`, {
      method: 'POST',
      body: { planId: data.get('planId') },
    });
    render();
  },
  async 'update-card'(data, form) {
    await api(`/subscriptions/${form.dataset.id}/card`, { method: 'PUT', body: { card: cardFrom(data) } });
    toast('Card saved');
    render();
  },
  async refund(data, form) {
    await api(`/admin/orders/${form.dataset.id}/refund`, {
      method: 'POST',
      body: { amount: dollars(data.get('amount')) },
    });
    render();
  },
  async 'new-product'(data) {
    await api('/admin/products', {
      method: 'POST',
      body: {
        name: data.get('name'),
        category: data.get('category'),
        price: dollars(data.get('price')),
        stock: Number(data.get('stock')),
      },
    });
    render();
  },
  async 'edit-product'(data, form) {
    await api(`/admin/products/${form.dataset.id}`, {
      method: 'PATCH',
      body: { price: dollars(data.get('price')), stock: Number(data.get('stock')) },
    });
    toast('Product saved');
    render();
  },
  async 'new-coupon'(data) {
    const kind = data.get('kind');
    const raw = Number(data.get('value'));
    await api('/admin/coupons', {
      method: 'POST',
      body: { code: data.get('code'), kind, value: kind === 'fixed' ? Math.round(raw * 100) : raw },
    });
    render();
  },
};

const actions = {
  async logout() {
    await api('/auth/logout', { method: 'POST' });
    state.user = null;
    await refreshCount();
    go('#/');
  },
  async 'add-to-cart'(el) {
    await api('/cart/items', { method: 'POST', body: { productId: el.dataset.id, qty: 1 } });
    await refreshCount();
    toast('Added to cart');
  },
  async 'remove-line'(el) {
    const cart = await api(`/cart/items/${el.dataset.id}`, { method: 'DELETE' });
    // Seeded BUG-11: the line goes, but the badge in the header keeps its old count.
    if (!hasBug('BUG-11')) {
      state.count = cart.count;
      renderHeader();
    }
    render();
  },
  async 'remove-coupon'() {
    await api('/cart/coupon', { method: 'DELETE' });
    render();
  },
  async challenge(el) {
    try {
      const { order } = await api(`/checkout/challenge/${el.dataset.id}`, {
        method: 'POST',
        body: { approve: el.dataset.approve === 'true' },
      });
      await refreshCount();
      go(`#/order/${order.id}`);
    } catch (error) {
      el.closest('.card').querySelector('[role="alert"]').textContent = error.message;
      for (const button of el.closest('.card').querySelectorAll('button')) button.disabled = true;
    }
  },
  async sub(el) {
    try {
      await api(`/subscriptions/${el.dataset.id}/${el.dataset.op}`, { method: 'POST' });
      render();
    } catch (error) {
      document.getElementById('sub-error').textContent = error.message;
    }
  },
  async 'mark-paid'(el) {
    await api(`/admin/orders/${el.dataset.id}/mark-paid`, { method: 'POST' });
    render();
  },
  async 'delete-product'(el) {
    await api(`/admin/products/${el.dataset.id}`, { method: 'DELETE' });
    render();
  },
  async 'delete-coupon'(el) {
    await api(`/admin/coupons/${el.dataset.id}`, { method: 'DELETE' });
    render();
  },
};

const changes = {
  sort(el) {
    const next = new URLSearchParams(el.dataset.base.split('?')[1]);
    next.set('sort', el.value);
    go(`#/?${next}`);
  },
  async qty(el) {
    const error = document.getElementById('cart-error');
    try {
      await api(`/cart/items/${el.dataset.id}`, { method: 'PATCH', body: { qty: Number(el.value) } });
      await refreshCount();
      render();
    } catch (failure) {
      error.textContent = failure.message;
    }
  },
  async shipping(el) {
    await api('/cart/shipping', { method: 'PUT', body: { method: el.value } });
    render();
  },
  billing(el) {
    go(`#/plans?billing=${el.value}`);
  },
  method(el) {
    const form = el.closest('form');
    for (const part of form.querySelectorAll('[data-method]')) part.hidden = part.dataset.method !== el.value;
    const pay = form.querySelector('[data-pay]');
    pay.textContent = el.value === 'bank_transfer' ? 'Place order' : `Pay ${pay.dataset.pay}`;
  },
};

document.addEventListener('submit', async (event) => {
  const form = event.target.closest('[data-form]');
  if (!form) return;
  event.preventDefault();
  const alert = form.querySelector('[role="alert"]');
  if (alert) alert.textContent = '';
  try {
    await forms[form.dataset.form](new FormData(form), form);
  } catch (error) {
    if (!(error instanceof ApiFailure)) throw error;
    if (alert) alert.textContent = error.message;
    else toast(error.message);
  }
});

document.addEventListener('click', (event) => {
  const el = event.target.closest('[data-action]');
  if (el) actions[el.dataset.action](el);
});

document.addEventListener('change', (event) => {
  const el = event.target.closest('[data-change]');
  if (el) changes[el.dataset.change](el);
});

window.addEventListener('hashchange', render);

const [config, me] = await Promise.all([api('/config'), api('/me')]);
state.config = config;
state.user = me.user;
await refreshCount();
await render();
