import type { Locator, Page } from '@playwright/test';

export class AdminPage {
  constructor(private readonly page: Page) {}

  async openOrders(): Promise<void> {
    await this.page.goto('/#/admin/orders');
  }

  async openProducts(): Promise<void> {
    await this.page.goto('/#/admin/products');
  }

  async openCoupons(): Promise<void> {
    await this.page.goto('/#/admin/coupons');
  }

  async openSubscriptions(): Promise<void> {
    await this.page.goto('/#/admin/subscriptions');
  }

  get notAllowed(): Locator {
    return this.page.getByRole('heading', { name: 'Not allowed' });
  }

  get monthlyRecurring(): Locator {
    return this.page.getByTestId('stat-mrr');
  }

  row(name: string): Locator {
    return this.page.getByRole('row', { name });
  }

  // ---- Orders ----

  async refund(orderId: string, amount: string): Promise<void> {
    await this.page.getByLabel(`Refund amount for ${orderId}`).fill(amount);
    await this.row(orderId).getByRole('button', { name: 'Refund' }).click();
  }

  refundError(orderId: string): Locator {
    return this.row(orderId).getByRole('alert');
  }

  orderStatus(orderId: string): Locator {
    return this.row(orderId).getByTestId('status');
  }

  async markPaid(orderId: string): Promise<void> {
    await this.row(orderId).getByRole('button', { name: 'Mark as paid' }).click();
  }

  // ---- Products ----

  async addProduct(details: { name: string; category: string; price: string; stock: string }): Promise<void> {
    await this.page.getByLabel('Name').fill(details.name);
    await this.page.getByLabel('Category').selectOption(details.category);
    await this.page.getByLabel('Price', { exact: true }).fill(details.price);
    await this.page.getByLabel('Stock', { exact: true }).fill(details.stock);
    await this.page.getByRole('button', { name: 'Add product' }).click();
  }

  async editProduct(name: string, changes: { price: string; stock: string }): Promise<void> {
    await this.page.getByLabel(`Price for ${name}`).fill(changes.price);
    await this.page.getByLabel(`Stock for ${name}`).fill(changes.stock);
    await this.page.getByRole('button', { name: `Save ${name}` }).click();
  }

  async deleteProduct(name: string): Promise<void> {
    await this.page.getByRole('button', { name: `Delete ${name}` }).click();
  }

  // ---- Coupons ----

  async addCoupon(details: { code: string; type: string; value: string }): Promise<void> {
    await this.page.getByLabel('Code').fill(details.code);
    await this.page.getByLabel('Type').selectOption({ label: details.type });
    await this.page.getByLabel('Value').fill(details.value);
    await this.page.getByRole('button', { name: 'Add coupon' }).click();
  }

  async deleteCoupon(code: string): Promise<void> {
    await this.page.getByRole('button', { name: `Delete ${code}` }).click();
  }
}
