import type { Locator, Page } from '@playwright/test';

export class Header {
  constructor(private readonly page: Page) {}

  get nav(): Locator {
    return this.page.getByRole('navigation', { name: 'Main' });
  }

  get cartCount(): Locator {
    return this.page.getByTestId('cart-count');
  }

  async signOut(): Promise<void> {
    await this.nav.getByRole('button', { name: 'Sign out' }).click();
  }

  link(name: string): Locator {
    return this.nav.getByRole('link', { name, exact: true });
  }
}
