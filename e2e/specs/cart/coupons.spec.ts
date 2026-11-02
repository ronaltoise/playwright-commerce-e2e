import { PRODUCTS } from '../../data/catalog';
import { expect, test } from '../../fixtures';

const { yirgacheffe } = PRODUCTS;

test.describe('Coupons', () => {
  test('CPN-01 > a percentage coupon takes that share off', async ({ shop, customer }) => {
    await customer.api.addToCart(yirgacheffe.id, 2);
    await shop.cart.open();

    await shop.cart.applyCoupon('WELCOME10');

    await expect(shop.cart.appliedCoupon).toHaveText('WELCOME10');
    await expect(shop.cart.discount).toHaveText('-$3.60');
  });

  test('CPN-02 > a fixed coupon takes its amount off', async ({ shop, customer }) => {
    await customer.api.addToCart(yirgacheffe.id, 2);
    await shop.cart.open();

    await shop.cart.applyCoupon('SAVE5');

    await expect(shop.cart.discount).toHaveText('-$5.00');
  });

  test('CPN-03 > a coupon with a minimum spend is refused below it', async ({ shop, customer }) => {
    await customer.api.addToCart(yirgacheffe.id);
    await shop.cart.open();

    await shop.cart.applyCoupon('SAVE5');

    await expect(shop.cart.couponError).toHaveText('That coupon needs a subtotal of at least $30.00.');
    await expect(shop.cart.discount).toHaveText('-$0.00');
  });

  test('CPN-04 > an expired coupon is refused', async ({ shop, customer }) => {
    await customer.api.addToCart(yirgacheffe.id);
    await shop.cart.open();

    await shop.cart.applyCoupon('SUMMER23');

    await expect(shop.cart.couponError).toHaveText('That coupon has expired.');
    await expect(shop.cart.discount).toHaveText('-$0.00');
  });

  test('CPN-05 > an unknown coupon is refused', async ({ shop, customer }) => {
    await customer.api.addToCart(yirgacheffe.id);
    await shop.cart.open();

    await shop.cart.applyCoupon('NOT-A-CODE');

    await expect(shop.cart.couponError).toHaveText('That coupon code is not valid.');
  });

  test('CPN-06 > applying the same coupon twice only counts once', async ({ shop, customer }) => {
    await customer.api.addToCart(yirgacheffe.id, 2);
    await shop.cart.open();

    await shop.cart.applyCoupon('WELCOME10');
    await expect(shop.cart.discount).toHaveText('-$3.60');
    await shop.cart.applyCoupon('WELCOME10');
    await expect(shop.cart.appliedCoupon).toHaveText('WELCOME10');

    // The second click must have finished before this can prove anything.
    await expect.poll(async () => (await customer.api.cart()).totals.discount).toBe(360);
    await expect(shop.cart.discount).toHaveText('-$3.60');
  });

  test('CPN-07 > a free-shipping coupon removes the shipping charge', async ({ shop, customer }) => {
    await customer.api.addToCart(yirgacheffe.id);
    await shop.cart.open();
    await expect(shop.cart.shipping).toHaveText('$4.95');

    await shop.cart.applyCoupon('FREESHIP');

    await expect(shop.cart.shipping).toHaveText('Free');
  });

  test('CPN-08 > removing a coupon restores the full price', async ({ shop, customer }) => {
    await customer.api.addToCart(yirgacheffe.id, 2);
    await customer.api.applyCoupon('WELCOME10');
    await shop.cart.open();
    await expect(shop.cart.discount).toHaveText('-$3.60');

    await shop.cart.removeCoupon();

    await expect(shop.cart.discount).toHaveText('-$0.00');
    await expect(shop.cart.appliedCoupon).toBeHidden();
  });
});
