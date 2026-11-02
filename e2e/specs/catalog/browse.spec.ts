import { PRODUCTS } from '../../data/catalog';
import { expect, test } from '../../fixtures';

test.describe('Browsing', () => {
  test('CAT-01 > the shop lists a page of products with their prices', { tag: '@smoke' }, async ({ shop }) => {
    await shop.catalog.open();

    await expect(shop.catalog.cards).toHaveCount(8);
    await expect(shop.catalog.card(PRODUCTS.mugSet.name)).toContainText('$25.00');
  });

  test('CAT-02 > paging through the shop shows each product once', async ({ shop }) => {
    await shop.catalog.open();
    await expect(shop.catalog.cards).toHaveCount(8);
    const firstPage = await shop.catalog.names.allTextContents();

    await shop.catalog.nextPage();
    await expect(shop.catalog.names.first()).not.toHaveText(firstPage[0]);
    const secondPage = await shop.catalog.names.allTextContents();

    expect(secondPage.length).toBeGreaterThan(0);
    expect(secondPage.filter((name) => firstPage.includes(name))).toEqual([]);
  });

  test('CAT-03 > a category filter shows only that category', async ({ shop }) => {
    await shop.catalog.open();
    await shop.catalog.filterBy('Gear');

    await expect(shop.catalog.resultCount).toHaveText('5 products');
    await expect(shop.catalog.cards.getByText('Gear', { exact: true })).toHaveCount(5);
  });

  test('CAT-04 > sorting by price runs from cheapest to dearest', async ({ shop }) => {
    await shop.catalog.open();
    await shop.catalog.sortBy('Price: low to high');
    await expect(shop.catalog.card('Paper Filters (100)')).toBeVisible();

    const prices = await shop.catalog.prices();
    expect(prices).toEqual(prices.toSorted((a, b) => a - b));
  });

  test('CAT-05 > sorting by price can run from dearest to cheapest', async ({ shop }) => {
    await shop.catalog.open();
    await shop.catalog.sortBy('Price: high to low');
    await expect(shop.catalog.names.first()).toHaveText(PRODUCTS.grinder.name);

    const prices = await shop.catalog.prices();
    expect(prices).toEqual(prices.toSorted((a, b) => b - a));
  });
});

test.describe('Search', () => {
  test('CAT-06 > search finds a product by name', async ({ shop }) => {
    await shop.catalog.open();
    await shop.catalog.search('Yirgacheffe');

    await expect(shop.catalog.names).toHaveText([PRODUCTS.yirgacheffe.name]);
  });

  test('CAT-07 > search ignores upper and lower case', async ({ shop }) => {
    await shop.catalog.open();
    await shop.catalog.search('yirgacheffe');

    await expect(shop.catalog.names).toHaveText([PRODUCTS.yirgacheffe.name]);
  });

  test('CAT-08 > a search with no matches says so', async ({ shop }) => {
    await shop.catalog.open();
    await shop.catalog.search('no such coffee');

    await expect(shop.catalog.emptyMessage).toBeVisible();
    await expect(shop.catalog.cards).toHaveCount(0);
  });
});

test.describe('Product page', () => {
  test('CAT-09 > a product page shows its price and availability', async ({ shop }) => {
    await shop.product.open(PRODUCTS.yirgacheffe.slug);

    await expect(shop.product.heading).toHaveText(PRODUCTS.yirgacheffe.name);
    await expect(shop.product.price).toHaveText('$18.00');
    await expect(shop.product.stock).toHaveText('In stock');
  });

  test('CAT-10 > a gear product page loads with no script errors', async ({ shop }) => {
    // The visible page is fine even with the bug. What catches it is the console guard in the
    // fixtures, which fails the test when the page hits a script error nobody can see.
    await shop.product.open(PRODUCTS.grinder.slug);

    await expect(shop.product.heading).toHaveText(PRODUCTS.grinder.name);
    await expect(shop.product.addButton).toBeEnabled();
  });

  test('CAT-11 > a product running low says how many are left', async ({ shop }) => {
    await shop.product.open(PRODUCTS.scale.slug);

    await expect(shop.product.stock).toHaveText('Only 3 left');
  });

  test('CAT-12 > a sold-out product cannot be bought', async ({ shop, guestApi }) => {
    await shop.product.open(PRODUCTS.soldOut.slug);

    await expect(shop.product.stock).toHaveText('Sold out');
    await expect(shop.product.addButton).toBeDisabled();

    const res = await guestApi.http.post('/api/cart/items', { data: { productId: PRODUCTS.soldOut.id, qty: 1 } });
    expect(res.status()).toBe(409);
  });
});
