import type { Locator, Page } from '@playwright/test';

export class CatalogPage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto('/#/');
  }

  get resultCount(): Locator {
    return this.page.getByTestId('result-count');
  }

  get cards(): Locator {
    return this.page.getByRole('main').getByRole('article');
  }

  get names(): Locator {
    return this.cards.getByRole('heading');
  }

  get emptyMessage(): Locator {
    return this.page.getByText('No products match your search.');
  }

  card(name: string): Locator {
    return this.page.getByRole('article', { name });
  }

  async search(term: string): Promise<void> {
    await this.page.getByRole('searchbox', { name: 'Search products' }).fill(term);
    await this.page.getByRole('button', { name: 'Search' }).click();
  }

  async filterBy(category: string): Promise<void> {
    await this.page.getByRole('navigation', { name: 'Categories' }).getByRole('link', { name: category }).click();
  }

  async sortBy(option: string): Promise<void> {
    await this.page.getByLabel('Sort products').selectOption({ label: option });
  }

  async nextPage(): Promise<void> {
    await this.page.getByRole('navigation', { name: 'Pagination' }).getByRole('link', { name: 'Next' }).click();
  }

  async addToCart(name: string): Promise<void> {
    await this.card(name).getByRole('button', { name: 'Add to cart' }).click();
  }

  /** Prices as cents, in the order they appear on the page. */
  async prices(): Promise<number[]> {
    const texts = await this.cards.locator('.price').allTextContents();
    return texts.map((text) => Math.round(Number(text.replace('$', '')) * 100));
  }
}

export class ProductPage {
  constructor(private readonly page: Page) {}

  async open(slug: string): Promise<void> {
    await this.page.goto(`/#/product/${slug}`);
  }

  get heading(): Locator {
    return this.page.getByRole('heading', { level: 1 });
  }

  get price(): Locator {
    return this.page.getByTestId('product-price');
  }

  get stock(): Locator {
    return this.page.getByTestId('stock');
  }

  get addButton(): Locator {
    return this.page.getByRole('main').getByRole('button', { name: /add to cart|sold out/i });
  }

  get error(): Locator {
    return this.page.getByRole('alert');
  }

  async addToCart(quantity: number): Promise<void> {
    await this.page.getByLabel('Quantity').fill(String(quantity));
    await this.addButton.click();
  }
}
