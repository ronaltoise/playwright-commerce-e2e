import { PRODUCTS } from '../../data/catalog';
import { expect, test } from '../../fixtures';

test.describe('Gift cards and bank transfer', () => {
  test.beforeEach(async ({ customer }) => {
    await customer.api.addToCart(PRODUCTS.yirgacheffe.id);
  });

  test('PAY-11 > a gift card with enough balance pays for the order', async ({ shop, admin }) => {
    const giftCard = await admin.createGiftCard(10_000);

    await shop.checkout.open();
    await shop.checkout.payByGiftCard(giftCard.code);

    await expect(shop.order.status).toHaveText('Paid');
    await expect(shop.order.paidBy).toHaveText(`Gift card ${giftCard.code}`);
  });

  test('PAY-12 > a gift card spends down, and is refused once it runs short', async ({ shop, admin, customer }) => {
    const giftCard = await admin.createGiftCard(3000);
    await customer.api.checkout({ method: 'gift_card', code: giftCard.code });
    await customer.api.addToCart(PRODUCTS.yirgacheffe.id);

    await shop.checkout.open();
    await shop.checkout.payByGiftCard(giftCard.code);

    await expect(shop.checkout.error).toHaveText('This gift card only has $5.61 left.');
    expect(await customer.api.orders()).toHaveLength(1);
  });

  test('PAY-13 > an unknown gift card is refused', async ({ shop, customer }) => {
    await shop.checkout.open();
    await shop.checkout.payByGiftCard('GIFT-NOPE');

    await expect(shop.checkout.error).toHaveText('That gift card code is not valid.');
    expect(await customer.api.orders()).toHaveLength(0);
  });

  test('PAY-14 > a bank transfer order waits until the shop marks it paid', async ({ shop, page, admin, customer }) => {
    await shop.checkout.open();
    await shop.checkout.payByBankTransfer();

    await expect(shop.order.status).toHaveText('Awaiting payment');
    await expect(shop.order.bankInstructions).toBeVisible();

    const [order] = await customer.api.orders();
    await admin.markPaid(order.id);
    await page.reload();

    await expect(shop.order.status).toHaveText('Paid');
    await expect(shop.order.bankInstructions).toBeHidden();
  });
});
