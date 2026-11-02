import { PRODUCTS } from '../../data/catalog';
import { asAdmin, expect, test } from '../../fixtures';

test.use(asAdmin);

test.describe('Managing products', () => {
  let name = '';

  // Made through the admin form, so no fixture knows to delete it.
  test.afterEach(async ({ admin }) => {
    const left = (await admin.adminProducts()).find((product) => product.name === name);
    if (left) await admin.deleteProduct(left.id);
  });

  test('ADM-08 > a product added by staff appears in the shop until deleted', async ({ shop, guestApi }, testInfo) => {
    name = `E2E Added ${testInfo.workerIndex}-${Date.now().toString(36)}`;

    await shop.adminPage.openProducts();
    await shop.adminPage.addProduct({ name, category: 'Gifts', price: '12.50', stock: '7' });
    await expect(shop.adminPage.row(name)).toBeVisible();

    await expect.poll(async () => (await guestApi.products({ q: name })).items.map((p) => p.price)).toEqual([1250]);

    await shop.adminPage.deleteProduct(name);
    await expect(shop.adminPage.row(name)).toBeHidden();
    expect((await guestApi.products({ q: name })).total).toBe(0);
  });

  test('ADM-09 > a price and stock change reaches the shop', async ({ shop, newProduct }) => {
    const product = await newProduct({ price: 1000, stock: 10 });

    await shop.adminPage.openProducts();
    await shop.adminPage.editProduct(product.name, { price: '11.25', stock: '4' });
    await expect(shop.page.getByRole('status')).toHaveText('Product saved');

    await shop.product.open(product.slug);
    await expect(shop.product.price).toHaveText('$11.25');
    await expect(shop.product.stock).toHaveText('Only 4 left');
  });

  test('ADM-10 > a product form with no name is refused', async ({ shop }) => {
    await shop.adminPage.openProducts();
    await shop.adminPage.addProduct({ name: ' ', category: 'Gifts', price: '12.50', stock: '7' });

    await expect(shop.page.locator('form[data-form="new-product"]').getByRole('alert')).toHaveText('Enter a name.');
  });
});

test.describe('Managing coupons', () => {
  test('ADM-11 > a coupon added by staff works until deleted', async ({ shop, newCustomer }, testInfo) => {
    const code = `E2ESTAFF${testInfo.workerIndex}${Date.now().toString(36)}`.toUpperCase();
    const customer = await newCustomer();
    await customer.api.addToCart(PRODUCTS.yirgacheffe.id, 2);

    await shop.adminPage.openCoupons();
    await shop.adminPage.addCoupon({ code, type: 'Percent off', value: '50' });
    await expect(shop.adminPage.row(code)).toContainText('50% off');

    const discounted = await customer.api.applyCoupon(code);
    expect(discounted.totals.discount).toBe(1800);

    await shop.adminPage.deleteCoupon(code);
    await expect(shop.adminPage.row(code)).toBeHidden();
    await expect(customer.api.applyCoupon(code)).rejects.toThrow('answered 404');
  });
});
