import type { Locator, Page } from '@playwright/test';
import type { Card } from '../api/types';
import { fillCard } from './checkout';

export class PlansPage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto('/#/plans');
  }

  plan(name: string): Locator {
    return this.page.getByRole('article', { name });
  }

  price(name: string): Locator {
    return this.plan(name).getByTestId('plan-price');
  }

  async showAnnualPrices(): Promise<void> {
    await this.page.getByRole('radio', { name: 'Annual' }).check();
  }

  async choose(name: string): Promise<void> {
    await this.page.getByRole('link', { name: `Choose ${name}` }).click();
  }
}

export class SubscribePage {
  constructor(private readonly page: Page) {}

  get summary(): Locator {
    return this.page.getByTestId('subscribe-summary');
  }

  get error(): Locator {
    return this.page.getByRole('alert');
  }

  get alreadySubscribed(): Locator {
    return this.page.getByRole('heading', { name: "You're already subscribed" });
  }

  async open(planId: string, billing: 'monthly' | 'annual' = 'monthly'): Promise<void> {
    await this.page.goto(`/#/subscribe/${planId}?billing=${billing}`);
  }

  async pay(card: Card): Promise<void> {
    await fillCard(this.page, card);
    await this.page.getByRole('button', { name: /Start (subscription|free trial)/ }).click();
  }
}

export class SubscriptionPage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto('/#/subscription');
  }

  /** Shows a change that happened behind the page's back, such as a renewal. */
  async refresh(): Promise<void> {
    await this.page.reload();
  }

  get status(): Locator {
    return this.page.getByTestId('status').first();
  }

  get planName(): Locator {
    return this.page.getByTestId('plan-name');
  }

  get nextCharge(): Locator {
    return this.page.getByTestId('next-charge');
  }

  get cardOnFile(): Locator {
    return this.page.getByTestId('card-on-file');
  }

  get endingNotice(): Locator {
    return this.page.getByTestId('ending');
  }

  get pendingPlanNotice(): Locator {
    return this.page.getByTestId('pending-plan');
  }

  get pastDueNotice(): Locator {
    return this.page.getByText('Your last payment failed.');
  }

  get invoiceRows(): Locator {
    return this.page.getByRole('table', { name: 'Invoices' }).locator('tbody tr');
  }

  get noInvoices(): Locator {
    return this.page.getByTestId('no-invoices');
  }

  get endedMessage(): Locator {
    return this.page.getByText(/subscription has ended/);
  }

  async changePlan(planId: string): Promise<void> {
    await this.page.getByLabel('Change plan').selectOption(planId);
    await this.page.getByRole('button', { name: 'Change plan' }).click();
  }

  async pause(): Promise<void> {
    await this.page.getByRole('button', { name: 'Pause subscription' }).click();
  }

  async resume(): Promise<void> {
    await this.page.getByRole('button', { name: 'Resume subscription' }).click();
  }

  async cancel(): Promise<void> {
    await this.page.getByRole('button', { name: 'Cancel subscription' }).click();
  }

  async keep(): Promise<void> {
    await this.page.getByRole('button', { name: 'Keep subscription' }).click();
  }

  async updateCard(card: Card): Promise<void> {
    const form = this.page.locator('form[data-form="update-card"]');
    await fillCard(form, card);
    await form.getByRole('button', { name: 'Save card' }).click();
  }

  async retryPayment(): Promise<void> {
    await this.page.getByRole('button', { name: 'Retry payment' }).click();
  }
}
