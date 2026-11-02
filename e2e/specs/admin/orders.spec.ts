import { PRODUCTS } from '../../data/catalog';
import { asAdmin, expect, test } from '../../fixtures';

test.use(asAdmin);

const dollars = (cents: number) => (cents / 100).toFixed(2);

test.describe('Refunds', () => {
  test('ADM-03 > a full refund marks the order refunded', { tag: '@smoke' }, async ({ shop, newCustomer }) => {
    const customer = await newCustomer();
    const order = await customer.api.buy(PRODUCTS.yirgacheffe.id);

    await shop.adminPage.openOrders();
    await shop.adminPage.refund(order.id, dollars(order.totals.total));

    await expect(shop.adminPage.orderStatus(order.id)).toHaveText('Refunded');
    expect((await customer.api.order(order.id)).refunded).toBe(order.totals.total);
  });

  test('ADM-04 > a partial refund leaves the rest refundable', async ({ shop, newCustomer }) => {
    const customer = await newCustomer();
    const order = await customer.api.buy(PRODUCTS.yirgacheffe.id);

    await shop.adminPage.openOrders();
    await shop.adminPage.refund(order.id, '5.00');
    await expect(shop.adminPage.orderStatus(order.id)).toHaveText('Partially refunded');

    await shop.adminPage.refund(order.id, dollars(order.totals.total - 500));
    await expect(shop.adminPage.orderStatus(order.id)).toHaveText('Refunded');
  });

  test('ADM-05 > a refund cannot exceed what the customer paid', async ({ shop, newCustomer }) => {
    const customer = await newCustomer();
    const order = await customer.api.buy(PRODUCTS.yirgacheffe.id);

    await shop.adminPage.openOrders();
    await shop.adminPage.refund(order.id, dollars(order.totals.total + 100));

    await expect(shop.adminPage.refundError(order.id)).toHaveText(
      `Only $${dollars(order.totals.total)} can still be refunded.`
    );
    expect((await customer.api.order(order.id)).refunded).toBe(0);
  });
});

test.describe('Payments the shop confirms by hand', () => {
  test('ADM-06 > staff can mark a bank transfer order as paid', async ({ shop, newCustomer }) => {
    const customer = await newCustomer();
    await customer.api.addToCart(PRODUCTS.yirgacheffe.id);
    const { order } = await customer.api.checkout({ method: 'bank_transfer' });

    await shop.adminPage.openOrders();
    await shop.adminPage.markPaid(order.id);

    await expect(shop.adminPage.orderStatus(order.id)).toHaveText('Paid');
  });
});

test.describe('Subscriptions overview', () => {
  test('ADM-07 > staff can see who subscribes to what', async ({ shop, newCustomer }) => {
    const customer = await newCustomer();
    await customer.api.subscribe('explorer');

    await shop.adminPage.openSubscriptions();

    const row = shop.adminPage.row(customer.email);
    await expect(row).toContainText('Explorer');
    await expect(row).toContainText('Active');
  });
});
