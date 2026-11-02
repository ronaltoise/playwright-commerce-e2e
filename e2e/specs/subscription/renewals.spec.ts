import { CARDS, goodCard } from '../../data/cards';
import { PLANS } from '../../data/catalog';
import { expect, test } from '../../fixtures';

const { explorer, enthusiast } = PLANS;
const failsLater = goodCard(CARDS.failsOnRenewal);

test.describe('Renewals', () => {
  test('SUB-16 > a renewal charges the saved card and adds an invoice', async ({ shop, customer }) => {
    const subscription = await customer.api.subscribe(explorer.id);

    await customer.api.renewNow(subscription.id);

    await shop.subscription.open();
    await expect(shop.subscription.status).toHaveText('Active');
    await expect(shop.subscription.invoiceRows).toHaveCount(2);
    await expect(shop.subscription.invoiceRows.first()).toContainText('Renewal');
    await expect(shop.subscription.invoiceRows.first()).toContainText('$18.00');
  });

  test('SUB-17 > a free trial turns into a paid plan when it ends', async ({ shop, customer }) => {
    const subscription = await customer.api.subscribe(enthusiast.id);
    expect(subscription.status).toBe('trialing');

    await customer.api.renewNow(subscription.id);

    await shop.subscription.open();
    await expect(shop.subscription.status).toHaveText('Active');
    await expect(shop.subscription.invoiceRows.first()).toContainText('$32.00');
  });
});

test.describe('Failed renewals', () => {
  test('SUB-18 > a failed renewal marks the subscription past due', async ({ shop, customer }) => {
    const subscription = await customer.api.subscribe(explorer.id, 'monthly', failsLater);

    await customer.api.renewNow(subscription.id);

    await shop.subscription.open();
    await expect(shop.subscription.status).toHaveText('Past due');
    await expect(shop.subscription.pastDueNotice).toBeVisible();
    await expect(shop.subscription.invoiceRows.first()).toContainText('Open');
  });

  test('SUB-19 > a new card and a retry bring the subscription back', async ({ shop, customer }) => {
    const subscription = await customer.api.subscribe(explorer.id, 'monthly', failsLater);
    await customer.api.renewNow(subscription.id);
    await shop.subscription.open();

    await shop.subscription.updateCard(goodCard());
    await expect(shop.subscription.cardOnFile).toHaveText('Ending 4242');
    await shop.subscription.retryPayment();

    await expect(shop.subscription.status).toHaveText('Active');
    await expect(shop.subscription.pastDueNotice).toBeHidden();
    await expect(shop.subscription.invoiceRows.first()).toContainText('Paid');
  });

  test('SUB-20 > a retry on the same bad card stays past due', async ({ shop, customer }) => {
    const subscription = await customer.api.subscribe(explorer.id, 'monthly', failsLater);
    await customer.api.renewNow(subscription.id);
    await shop.subscription.open();

    await shop.subscription.retryPayment();

    await expect(shop.page.locator('#sub-error')).toHaveText('Your card was declined.');
    await expect(shop.subscription.status).toHaveText('Past due');
  });

  test('SUB-21 > three failed renewals end the subscription', async ({ shop, customer }) => {
    const { id } = await customer.api.subscribe(explorer.id, 'monthly', failsLater);

    await customer.api.renewNow(id);
    await customer.api.renewNow(id);
    const ended = await customer.api.renewNow(id);

    expect(ended.status).toBe('canceled');
    await shop.subscription.open();
    await expect(shop.subscription.endedMessage).toBeVisible();
  });
});
