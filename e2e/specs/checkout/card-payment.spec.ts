import { CARDS, expiredCard, goodCard } from '../../data/cards';
import { PRODUCTS } from '../../data/catalog';
import { testAddress } from '../../data/people';
import { expect, test } from '../../fixtures';

const { yirgacheffe } = PRODUCTS;

test.describe('Card payment', () => {
  test.beforeEach(async ({ customer }) => {
    await customer.api.addToCart(yirgacheffe.id);
  });

  test('PAY-01 > an approved card places the order', { tag: '@smoke' }, async ({ shop, customer }) => {
    await shop.checkout.open();
    await shop.checkout.payByCard(goodCard());

    await expect(shop.order.heading).toHaveText(/^Order R-\d+$/);
    await expect(shop.order.status).toHaveText('Paid');
    await expect(shop.order.total).toHaveText('$24.39');
    await expect(shop.order.paidBy).toHaveText('Card ending 4242');
    await expect(shop.header.cartCount).toHaveText('0');

    expect(await customer.api.orders()).toHaveLength(1);
  });

  test('PAY-02 > a declined card books nothing and keeps the cart', async ({ shop, customer }) => {
    await shop.checkout.open();
    await shop.checkout.payByCard(goodCard(CARDS.declined));

    await expect(shop.checkout.error).toHaveText('Your card was declined.');
    expect(await customer.api.orders()).toHaveLength(0);
    expect((await customer.api.cart()).count).toBe(1);
  });

  test('PAY-03 > a card without enough funds is refused', async ({ shop, customer }) => {
    await shop.checkout.open();
    await shop.checkout.payByCard(goodCard(CARDS.insufficientFunds));

    await expect(shop.checkout.error).toHaveText('Your card has insufficient funds.');
    expect(await customer.api.orders()).toHaveLength(0);
  });

  test('PAY-04 > a mistyped card number is caught before charging', async ({ shop, customer }) => {
    await shop.checkout.open();
    await shop.checkout.payByCard(goodCard(CARDS.mistyped));

    await expect(shop.checkout.error).toHaveText('That card number is not valid.');
    expect(await customer.api.orders()).toHaveLength(0);
  });

  test('PAY-05 > an expired card is refused', async ({ shop, customer }) => {
    await shop.checkout.open();
    await shop.checkout.payByCard(expiredCard);

    await expect(shop.checkout.error).toHaveText('This card has expired.');
    expect(await customer.api.orders()).toHaveLength(0);
  });

  test('PAY-06 > a 3-D Secure card pays once the bank confirms', async ({ shop }) => {
    await shop.checkout.open();
    await shop.checkout.payByCard(goodCard(CARDS.challenge));
    await expect(shop.challenge.heading).toBeVisible();

    await shop.challenge.approve();

    await expect(shop.order.status).toHaveText('Paid');
    await expect(shop.order.paidBy).toHaveText('Card ending 3220');
  });

  test('PAY-07 > a failed 3-D Secure check books nothing', async ({ shop, customer }) => {
    await shop.checkout.open();
    await shop.checkout.payByCard(goodCard(CARDS.challenge));
    await expect(shop.challenge.heading).toBeVisible();

    await shop.challenge.decline();

    await expect(shop.challenge.error).toHaveText('Your bank could not confirm this payment.');
    expect(await customer.api.orders()).toHaveLength(0);
    expect((await customer.api.cart()).count).toBe(1);
  });

  test('PAY-08 > checkout asks for a missing address field', async ({ shop, customer }) => {
    await shop.checkout.open();
    await shop.checkout.payByCard(goodCard(), { ...testAddress, city: '' });

    await expect(shop.checkout.error).toHaveText('Enter your city.');
    expect(await customer.api.orders()).toHaveLength(0);
  });
});

test.describe('Stock and sign-in', () => {
  test('PAY-09 > a guest signs in at checkout and carries on', async ({ shop, newCustomer }) => {
    const customer = await newCustomer();
    await shop.catalog.open();
    await shop.catalog.addToCart(PRODUCTS.mugSet.name);
    await expect(shop.header.cartCount).toHaveText('1');

    await shop.checkout.open();
    await expect(shop.login.heading).toBeVisible();
    await shop.login.signIn(customer.email, customer.password);

    await expect(shop.checkout.heading).toBeVisible();
  });

  test('PAY-10 > buying a product reduces its stock', async ({ shop, customer, newProduct }) => {
    const product = await newProduct({ stock: 6 });

    await customer.api.buy(product.id, 2);

    await shop.product.open(product.slug);
    await expect(shop.product.stock).toHaveText('Only 4 left');
  });
});
