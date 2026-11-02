import type { Locator, Page } from '@playwright/test';

export class LoginPage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto('/#/login');
  }

  get heading(): Locator {
    return this.page.getByRole('heading', { name: 'Sign in' });
  }

  get error(): Locator {
    return this.page.getByRole('alert');
  }

  async signIn(email: string, password: string): Promise<void> {
    await this.page.getByLabel('Email').fill(email);
    await this.page.getByLabel('Password').fill(password);
    await this.page.getByRole('button', { name: 'Sign in' }).click();
  }
}

export class RegisterPage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto('/#/register');
  }

  get error(): Locator {
    return this.page.getByRole('alert');
  }

  async createAccount(details: { name: string; email: string; password: string }): Promise<void> {
    await this.page.getByLabel('Name').fill(details.name);
    await this.page.getByLabel('Email').fill(details.email);
    await this.page.getByLabel('Password').fill(details.password);
    await this.page.getByRole('button', { name: 'Create account' }).click();
  }
}

export class AccountPage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto('/#/account');
  }

  get greeting(): Locator {
    return this.page.getByRole('heading', { level: 1 });
  }

  get orderRows(): Locator {
    return this.page.getByRole('table', { name: 'Your orders' }).locator('tbody tr');
  }

  async openOrder(id: string): Promise<void> {
    await this.page.getByRole('link', { name: id, exact: true }).click();
  }
}
