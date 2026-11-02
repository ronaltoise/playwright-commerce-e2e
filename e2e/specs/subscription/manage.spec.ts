import { PLANS } from '../../data/catalog';
import { expect, test } from '../../fixtures';

const { explorer, enthusiast, club } = PLANS;

test.describe('Changing plan', () => {
  test('SUB-09 > an upgrade charges only the difference for the time left', async ({ shop, customer }) => {
    await customer.api.subscribe(explorer.id);
    await shop.subscription.open();

    await shop.subscription.changePlan(enthusiast.id);

    await expect(shop.subscription.planName).toHaveText(enthusiast.name);
    await expect(shop.subscription.invoiceRows).toHaveCount(2);
    // $32.00 less the $18.00 already paid, with the whole month still to run.
    await expect(shop.subscription.invoiceRows.first()).toContainText('Upgrade');
    await expect(shop.subscription.invoiceRows.first()).toContainText('$14.00');
  });

  test('SUB-10 > a downgrade waits for the next renewal', async ({ shop, customer }) => {
    const subscription = await customer.api.subscribe(club.id);
    await shop.subscription.open();

    await shop.subscription.changePlan(explorer.id);

    await expect(shop.subscription.planName).toHaveText(club.name);
    await expect(shop.subscription.pendingPlanNotice).toHaveText(`Changes to ${explorer.name} at your next renewal.`);
    await expect(shop.subscription.nextCharge).toHaveText('$18.00');

    await customer.api.renewNow(subscription.id);
    await shop.subscription.refresh();

    await expect(shop.subscription.planName).toHaveText(explorer.name);
    await expect(shop.subscription.pendingPlanNotice).toBeHidden();
  });
});

test.describe('Cancelling', () => {
  test('SUB-11 > cancelling keeps the subscription until the period ends', async ({ shop, customer }) => {
    await customer.api.subscribe(explorer.id);
    await shop.subscription.open();

    await shop.subscription.cancel();

    await expect(shop.subscription.endingNotice).toContainText('Your deliveries continue until then.');
    await expect(shop.subscription.status).toHaveText('Active');
    await expect(shop.subscription.nextCharge).toHaveText('None');
  });

  test('SUB-12 > a customer can change their mind before the period ends', async ({ shop, customer }) => {
    const subscription = await customer.api.subscribe(explorer.id);
    await customer.api.cancelSubscription(subscription.id);
    await shop.subscription.open();

    await shop.subscription.keep();

    await expect(shop.subscription.endingNotice).toBeHidden();
    await expect(shop.subscription.nextCharge).toHaveText('$18.00');
  });

  test('SUB-13 > a cancelled subscription ends at renewal with no charge', async ({ shop, customer }) => {
    const subscription = await customer.api.subscribe(explorer.id);
    await customer.api.cancelSubscription(subscription.id);

    const ended = await customer.api.renewNow(subscription.id);

    expect(ended.status).toBe('canceled');
    expect(ended.invoices).toHaveLength(1);
    await shop.subscription.open();
    await expect(shop.subscription.endedMessage).toBeVisible();
  });
});

test.describe('Pausing', () => {
  test('SUB-14 > a subscription can be paused and resumed', async ({ shop, customer }) => {
    await customer.api.subscribe(explorer.id);
    await shop.subscription.open();

    await shop.subscription.pause();
    await expect(shop.subscription.status).toHaveText('Paused');
    await expect(shop.subscription.nextCharge).toHaveText('None');

    await shop.subscription.resume();
    await expect(shop.subscription.status).toHaveText('Active');
    await expect(shop.subscription.nextCharge).toHaveText('$18.00');
  });

  test('SUB-15 > a paused subscription is not charged at renewal', async ({ customer }) => {
    const subscription = await customer.api.subscribe(explorer.id);
    await customer.api.pauseSubscription(subscription.id);

    const renewed = await customer.api.renewNow(subscription.id);

    expect(renewed.status).toBe('paused');
    expect(renewed.invoices).toHaveLength(1);
  });
});
