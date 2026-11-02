import { PRODUCTS } from '../../data/catalog';
import { expect, test } from '../../fixtures';

const { yirgacheffe, espresso, mugSet } = PRODUCTS;

test.describe('Cart contents', () => {
  test('CART-01 > adding from the shop updates the cart', { tag: '@smoke' }, async ({ shop }) => {
    await shop.catalog.open();
    await shop.catalog.addToCart(mugSet.name);
    await expect(shop.header.cartCount).toHaveText('1');

    await shop.cart.open();
    await expect(shop.cart.line(mugSet.name)).toContainText('$25.00');
    await expect(shop.cart.subtotal).toHaveText('$25.00');
  });

  test('CART-02 > adding from a product page takes the chosen quantity', async ({ shop }) => {
    await shop.product.open(yirgacheffe.slug);
    await shop.product.addToCart(3);

    await expect(shop.header.cartCount).toHaveText('3');
  });

  test('CART-03 > changing a quantity updates the line and the totals', async ({ shop, customer }) => {
    await customer.api.addToCart(yirgacheffe.id);
    await shop.cart.open();

    await shop.cart.setQuantity(yirgacheffe.name, 3);

    await expect(shop.cart.line(yirgacheffe.name)).toContainText('$54.00');
    await expect(shop.cart.subtotal).toHaveText('$54.00');
    await expect(shop.header.cartCount).toHaveText('3');
  });

  test('CART-04 > removing a line updates the cart and its badge', async ({ shop, customer }) => {
    await customer.api.addToCart(yirgacheffe.id, 2);
    await customer.api.addToCart(espresso.id);
    await shop.cart.open();
    await expect(shop.header.cartCount).toHaveText('3');

    await shop.cart.remove(yirgacheffe.name);

    await expect(shop.cart.lines).toHaveCount(1);
    await expect(shop.header.cartCount).toHaveText('1');
  });

  test('CART-05 > the cart will not take more than is in stock', async ({ shop, newProduct }) => {
    const product = await newProduct({ stock: 2 });
    await shop.product.open(product.slug);

    await shop.product.addToCart(3);

    await expect(shop.product.error).toHaveText(`Only 2 of ${product.name} left in stock.`);
    await expect(shop.header.cartCount).toHaveText('0');
  });

  test('CART-06 > an empty cart says so', async ({ shop }) => {
    await shop.cart.open();

    await expect(shop.cart.emptyMessage).toBeVisible();
  });

  test('CART-07 > a guest cart carries over when they sign in', async ({ shop, newCustomer }) => {
    const customer = await newCustomer();
    await shop.catalog.open();
    await shop.catalog.addToCart(mugSet.name);
    await expect(shop.header.cartCount).toHaveText('1');

    await shop.login.open();
    await shop.login.signIn(customer.email, customer.password);
    await expect(shop.header.link('Account')).toBeVisible();

    await shop.cart.open();
    await expect(shop.cart.line(mugSet.name)).toBeVisible();
  });
});

test.describe('Shipping and tax', () => {
  test('CART-08 > an order under $50 pays standard shipping', async ({ shop, customer }) => {
    await customer.api.addToCart(yirgacheffe.id);
    await shop.cart.open();

    await expect(shop.cart.shipping).toHaveText('$4.95');
  });

  test('CART-09 > an order of exactly $50.00 ships free', async ({ shop, customer }) => {
    await customer.api.addToCart(mugSet.id, 2);
    await shop.cart.open();

    await expect(shop.cart.subtotal).toHaveText('$50.00');
    await expect(shop.cart.shipping).toHaveText('Free');
  });

  test('CART-10 > express shipping is charged even above the free threshold', async ({ shop, customer }) => {
    await customer.api.addToCart(mugSet.id, 3);
    await shop.cart.open();

    await shop.cart.chooseExpress();

    await expect(shop.cart.shipping).toHaveText('$9.95');
  });

  test('CART-11 > tax is 8% of the goods after any discount', async ({ shop, customer }) => {
    await customer.api.addToCart(mugSet.id, 2);
    await customer.api.applyCoupon('WELCOME10');
    await shop.cart.open();

    await expect(shop.cart.discount).toHaveText('-$5.00');
    await expect(shop.cart.tax).toHaveText('$3.60');
    await expect(shop.cart.total).toHaveText('$53.55');
  });
});
