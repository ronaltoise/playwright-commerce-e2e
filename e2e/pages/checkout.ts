import type { Locator, Page } from '@playwright/test';
import type { Address, Card } from '../api/types';
import { testAddress } from '../data/people';

/** The card form is the same on the checkout, subscribe and update-card screens. */
export async function fillCard(scope: Page | Locator, card: Card): Promise<void> {
  await scope.getByLabel('Card number').fill(card.number);
  await scope.getByLabel('Expiry month').fill(String(card.expMonth));
  await scope.getByLabel('Expiry year').fill(String(card.expYear));
  await scope.getByLabel('Security code').fill(card.cvc);
}

export class CheckoutPage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto('/#/checkout');
  }

  get heading(): Locator {
    return this.page.getByRole('heading', { name: 'Checkout' });
  }

  get error(): Locator {
    return this.page.getByRole('alert');
  }

  private get payButton(): Locator {
    return this.page.getByRole('button', { name: /^(Pay|Place order)/ });
  }

  async fillAddress(address: Address = testAddress): Promise<void> {
    await this.page.getByLabel('Full name').fill(address.name);
    await this.page.getByLabel('Address').fill(address.line1);
    await this.page.getByLabel('City').fill(address.city);
    await this.page.getByLabel('Postcode').fill(address.postcode);
    await this.page.getByLabel('Country').fill(address.country);
  }

  async payByCard(card: Card, address?: Address): Promise<void> {
    await this.fillAddress(address);
    await fillCard(this.page, card);
    await this.payButton.click();
  }

  async payByGiftCard(code: string): Promise<void> {
    await this.fillAddress();
    await this.page.getByRole('radio', { name: 'Gift card' }).check();
    await this.page.getByLabel('Gift card code').fill(code);
    await this.payButton.click();
  }

  async payByBankTransfer(): Promise<void> {
    await this.fillAddress();
    await this.page.getByRole('radio', { name: 'Bank transfer' }).check();
    await this.payButton.click();
  }
}

export class ChallengePage {
  constructor(private readonly page: Page) {}

  get heading(): Locator {
    return this.page.getByRole('heading', { name: 'Confirm your payment' });
  }

  get error(): Locator {
    return this.page.getByRole('alert');
  }

  async approve(): Promise<void> {
    await this.page.getByRole('button', { name: 'Approve' }).click();
  }

  async decline(): Promise<void> {
    await this.page.getByRole('button', { name: 'Decline' }).click();
  }
}

export class OrderPage {
  constructor(private readonly page: Page) {}

  async open(id: string): Promise<void> {
    await this.page.goto(`/#/order/${id}`);
  }

  get heading(): Locator {
    return this.page.getByRole('heading', { level: 1 });
  }

  get status(): Locator {
    return this.page.getByTestId('status');
  }

  get total(): Locator {
    return this.page.getByTestId('total');
  }

  get paidBy(): Locator {
    return this.page.getByTestId('paid-by');
  }

  get refunded(): Locator {
    return this.page.getByTestId('refunded');
  }

  get bankInstructions(): Locator {
    return this.page.getByText(/Send \$[\d.]+ to Roastery Ltd/);
  }
}
