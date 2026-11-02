import type { Locator, Page } from '@playwright/test';

export class CartPage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto('/#/cart');
  }

  get emptyMessage(): Locator {
    return this.page.getByText('Your cart is empty.');
  }

  get lines(): Locator {
    return this.page.getByRole('main').locator('tbody tr');
  }

  get error(): Locator {
    return this.page.locator('#cart-error');
  }

  get couponError(): Locator {
    return this.page.locator('form[data-form="coupon"]').getByRole('alert');
  }

  get appliedCoupon(): Locator {
    return this.page.getByTestId('applied-coupon');
  }

  get subtotal(): Locator {
    return this.page.getByTestId('subtotal');
  }

  get discount(): Locator {
    return this.page.getByTestId('discount');
  }

  get shipping(): Locator {
    return this.page.getByTestId('shipping');
  }

  get tax(): Locator {
    return this.page.getByTestId('tax');
  }

  get total(): Locator {
    return this.page.getByTestId('total');
  }

  line(name: string): Locator {
    return this.lines.filter({ hasText: name });
  }

  async setQuantity(name: string, quantity: number): Promise<void> {
    const input = this.page.getByLabel(`Quantity for ${name}`);
    await input.fill(String(quantity));
    await input.blur();
  }

  async remove(name: string): Promise<void> {
    await this.page.getByRole('button', { name: `Remove ${name}` }).click();
  }

  async applyCoupon(code: string): Promise<void> {
    await this.page.getByLabel('Coupon code').fill(code);
    await this.page.getByRole('button', { name: 'Apply coupon' }).click();
  }

  async removeCoupon(): Promise<void> {
    await this.page.getByRole('button', { name: 'Remove coupon' }).click();
  }

  async chooseExpress(): Promise<void> {
    await this.page.getByRole('radio', { name: /Express/ }).check();
  }

  async goToCheckout(): Promise<void> {
    await this.page.getByRole('link', { name: 'Checkout' }).click();
  }
}
