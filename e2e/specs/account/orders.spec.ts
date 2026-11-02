import { PRODUCTS } from '../../data/catalog';
import { expect, test } from '../../fixtures';

test.describe('Order history', () => {
  test('ACC-01 > a customer sees their orders, newest first', async ({ shop, customer }) => {
    const first = await customer.api.buy(PRODUCTS.yirgacheffe.id);
    const second = await customer.api.buy(PRODUCTS.espresso.id);

    await shop.account.open();

    await expect(shop.account.orderRows).toHaveCount(2);
    await expect(shop.account.orderRows.first()).toContainText(second.id);
    await expect(shop.account.orderRows.last()).toContainText(first.id);
  });

  test('ACC-02 > an order opens from the history with its details', async ({ shop, customer }) => {
    const order = await customer.api.buy(PRODUCTS.yirgacheffe.id, 2);

    await shop.account.open();
    await shop.account.openOrder(order.id);

    await expect(shop.order.heading).toHaveText(`Order ${order.id}`);
    await expect(shop.page.getByRole('main')).toContainText(PRODUCTS.yirgacheffe.name);
    await expect(shop.order.total).toHaveText('$43.83');
  });

  test('ACC-03 > a customer with no orders is told so', async ({ shop, customer }) => {
    await shop.account.open();

    await expect(shop.account.greeting).toContainText(customer.name);
    await expect(shop.page.getByText('You have no orders yet.')).toBeVisible();
  });

  test("ACC-04 > a customer cannot open someone else's order", async ({ shop, customer, newCustomer }) => {
    const someoneElse = await newCustomer('other');
    const order = await someoneElse.api.buy(PRODUCTS.yirgacheffe.id);

    const res = await customer.api.http.get(`/api/orders/${order.id}`);
    expect(res.status()).toBe(404);

    await shop.order.open(order.id);
    await expect(shop.order.heading).toHaveText('Not found');
  });
});
