import { CARDS, goodCard } from '../../data/cards';
import { PLANS } from '../../data/catalog';
import { expect, test } from '../../fixtures';

const { explorer, enthusiast } = PLANS;

test.describe('Choosing a plan', () => {
  test('SUB-01 > the plans page shows monthly prices and the free trial', async ({ shop }) => {
    await shop.plans.open();

    await expect(shop.plans.price(explorer.name)).toHaveText('$18.00 a month');
    await expect(shop.plans.price(enthusiast.name)).toHaveText('$32.00 a month');
    await expect(shop.plans.plan(enthusiast.name)).toContainText('14-day free trial');
    await expect(shop.plans.plan(explorer.name)).not.toContainText('free trial');
  });

  test('SUB-02 > annual billing charges ten months for twelve', async ({ shop }) => {
    await shop.plans.open();
    await shop.plans.showAnnualPrices();

    await expect(shop.plans.price(explorer.name)).toHaveText('$180.00 a year');
    await expect(shop.plans.plan(explorer.name)).toContainText('Two months free');
    await expect(shop.plans.plan(enthusiast.name)).not.toContainText('free trial');
  });

  test('SUB-03 > a guest is asked to sign in before subscribing', async ({ shop }) => {
    await shop.plans.open();
    await shop.plans.choose(explorer.name);

    await expect(shop.login.heading).toBeVisible();
  });
});

test.describe('Starting a subscription', () => {
  test('SUB-04 > a monthly plan charges the first month today', { tag: '@smoke' }, async ({ shop, customer }) => {
    await shop.plans.open();
    await shop.plans.choose(explorer.name);
    await expect(shop.subscribe.summary).toHaveText('$18.00 a month, billed today.');

    await shop.subscribe.pay(goodCard());

    await expect(shop.subscription.status).toHaveText('Active');
    await expect(shop.subscription.planName).toHaveText(explorer.name);
    await expect(shop.subscription.nextCharge).toHaveText('$18.00');
    await expect(shop.subscription.cardOnFile).toHaveText('Ending 4242');
    await expect(shop.subscription.invoiceRows).toHaveCount(1);
    await expect(shop.subscription.invoiceRows.first()).toContainText('$18.00');

    expect((await customer.api.subscription())?.billing).toBe('monthly');
  });

  test('SUB-05 > an annual plan charges the whole year today', async ({ shop, customer }) => {
    await shop.subscribe.open(explorer.id, 'annual');
    await expect(shop.subscribe.summary).toHaveText('$180.00 a year, billed today.');

    await shop.subscribe.pay(goodCard());

    await expect(shop.subscription.nextCharge).toHaveText('$180.00');
    await expect(shop.subscription.invoiceRows.first()).toContainText('$180.00');
    expect((await customer.api.subscription())?.billing).toBe('annual');
  });

  test('SUB-06 > a free trial charges nothing up front', async ({ shop, customer }) => {
    await shop.subscribe.open(enthusiast.id);
    await expect(shop.subscribe.summary).toHaveText('Free for 14 days, then $32.00 a month.');

    await shop.subscribe.pay(goodCard());

    await expect(shop.subscription.status).toHaveText('Trialing');
    await expect(shop.subscription.nextCharge).toHaveText('$32.00');
    await expect(shop.subscription.noInvoices).toBeVisible();
    expect((await customer.api.subscription())?.invoices).toEqual([]);
  });

  test('SUB-07 > a declined card starts no subscription', async ({ shop, customer }) => {
    await shop.subscribe.open(explorer.id);

    await shop.subscribe.pay(goodCard(CARDS.declined));

    await expect(shop.subscribe.error).toHaveText('Your card was declined.');
    expect(await customer.api.subscription()).toBeNull();
  });

  test('SUB-08 > a customer can only hold one subscription', async ({ shop, customer }) => {
    await customer.api.subscribe(explorer.id);

    await shop.subscribe.open(enthusiast.id);
    await expect(shop.subscribe.alreadySubscribed).toBeVisible();

    const res = await customer.api.http.post('/api/subscriptions', {
      data: { planId: enthusiast.id, billing: 'monthly', card: goodCard() },
    });
    expect(res.status()).toBe(409);
  });
});
