import { expect, test } from '../../fixtures';

test.describe('Admin access', () => {
  test('ADM-01 > a customer cannot open the admin area', async ({ shop, customer }) => {
    await shop.adminPage.openOrders();

    await expect(shop.adminPage.notAllowed).toBeVisible();
    await expect(customer.api.stats()).rejects.toThrow('answered 403');
  });

  test('ADM-02 > a guest is sent to sign in', async ({ shop }) => {
    await shop.adminPage.openOrders();

    await expect(shop.login.heading).toBeVisible();
  });
});
