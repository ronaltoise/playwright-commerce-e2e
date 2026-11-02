import type { Page } from '@playwright/test';
import { AccountPage, LoginPage, RegisterPage } from './account';
import { AdminPage } from './admin';
import { CartPage } from './cart';
import { CatalogPage, ProductPage } from './catalog';
import { ChallengePage, CheckoutPage, OrderPage } from './checkout';
import { Header } from './header';
import { PlansPage, SubscribePage, SubscriptionPage } from './subscription';

/** Every page object for one browser page, so a test asks for `shop` and has them all. */
export class Shop {
  readonly header: Header;
  readonly login: LoginPage;
  readonly register: RegisterPage;
  readonly account: AccountPage;
  readonly catalog: CatalogPage;
  readonly product: ProductPage;
  readonly cart: CartPage;
  readonly checkout: CheckoutPage;
  readonly challenge: ChallengePage;
  readonly order: OrderPage;
  readonly plans: PlansPage;
  readonly subscribe: SubscribePage;
  readonly subscription: SubscriptionPage;
  readonly adminPage: AdminPage;

  constructor(readonly page: Page) {
    this.header = new Header(page);
    this.login = new LoginPage(page);
    this.register = new RegisterPage(page);
    this.account = new AccountPage(page);
    this.catalog = new CatalogPage(page);
    this.product = new ProductPage(page);
    this.cart = new CartPage(page);
    this.checkout = new CheckoutPage(page);
    this.challenge = new ChallengePage(page);
    this.order = new OrderPage(page);
    this.plans = new PlansPage(page);
    this.subscribe = new SubscribePage(page);
    this.subscription = new SubscriptionPage(page);
    this.adminPage = new AdminPage(page);
  }
}
