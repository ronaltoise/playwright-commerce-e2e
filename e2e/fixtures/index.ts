import {
  test as base,
  expect,
  request as playwrightRequest,
  type BrowserContext,
  type TestInfo,
} from '@playwright/test';
import { ShopApi } from '../api/shop-api';
import type { Coupon, Product, User } from '../api/types';
import { TEST_PASSWORD, uniqueEmail } from '../data/people';
import { Shop } from '../pages/shop';
import { isExpectedError } from './expected-errors';
import { adminStatePath } from './paths';

export interface Customer extends User {
  password: string;
  /** Signed in as this customer. It shares a server session with nothing but this object. */
  api: ShopApi;
}

interface Fixtures {
  /** Every page object, bound to the test's page. */
  shop: Shop;
  /** The API with no session: a guest. */
  guestApi: ShopApi;
  /** The API signed in as the seeded admin. */
  admin: ShopApi;
  /** Creates customers on demand. All of them are deleted when the test ends. */
  newCustomer: (label?: string) => Promise<Customer>;
  /** A brand-new customer of this test's own. Asking for it also signs the browser in as them. */
  customer: Customer;
  /** Creates products the test may change freely. They are deleted when the test ends. */
  newProduct: (overrides?: Partial<Pick<Product, 'name' | 'category' | 'price' | 'stock'>>) => Promise<Product>;
  /** Creates coupons. They are deleted when the test ends. */
  newCoupon: (coupon: Partial<Coupon> & Pick<Coupon, 'kind'>) => Promise<Coupon>;
  /** Fails any test that hit a script error or a server error, even if the page looked fine. */
  consoleGuard: void;
}

// Playwright hands a file's `storageState` to every API context it creates. Under `test.use(asAdmin)`
// a new customer would then register on the shared admin session and take it over, so guests and
// customers always start from nothing.
const NO_SESSION = { cookies: [], origins: [] };

const signBrowserIn = async (context: BrowserContext, customer: Customer): Promise<void> => {
  const { cookies } = await customer.api.http.storageState();
  await context.addCookies(cookies);
};

export const test = base.extend<Fixtures>({
  shop: async ({ page }, use) => {
    await use(new Shop(page));
  },

  guestApi: async ({ baseURL }, use) => {
    const http = await playwrightRequest.newContext({ baseURL, storageState: NO_SESSION });
    await use(new ShopApi(http));
    await http.dispose();
  },

  admin: async ({ baseURL }, use, testInfo) => {
    const http = await playwrightRequest.newContext({
      baseURL,
      storageState: adminStatePath(testInfo.project.name),
    });
    await use(new ShopApi(http));
    await http.dispose();
  },

  newCustomer: async ({ baseURL, admin }, use, testInfo) => {
    const created: Customer[] = [];
    await use(async (label = 'customer') => {
      const http = await playwrightRequest.newContext({ baseURL, storageState: NO_SESSION });
      const api = new ShopApi(http);
      const email = uniqueEmail(label, testInfo.workerIndex);
      const user = await api.register({ name: 'Sam Tester', email, password: TEST_PASSWORD });
      const customer = { ...user, password: TEST_PASSWORD, api };
      created.push(customer);
      return customer;
    });
    for (const customer of created) {
      await admin.deleteUser(customer.id);
      await customer.api.http.dispose();
    }
  },

  customer: async ({ newCustomer, context }, use) => {
    const customer = await newCustomer();
    await signBrowserIn(context, customer);
    await use(customer);
  },

  newProduct: async ({ admin }, use, testInfo) => {
    const created: Product[] = [];
    await use(async (overrides = {}) => {
      const name = `E2E Product ${testInfo.workerIndex}-${Date.now().toString(36)}-${created.length}`;
      const product = await admin.createProduct({ name, category: 'Beans', price: 1000, stock: 10, ...overrides });
      created.push(product);
      return product;
    });
    for (const product of created) await admin.deleteProduct(product.id);
  },

  newCoupon: async ({ admin }, use, testInfo) => {
    const created: Coupon[] = [];
    await use(async (coupon) => {
      const code = coupon.code ?? `E2E${testInfo.workerIndex}${Date.now().toString(36)}${created.length}`.toUpperCase();
      const made = await admin.createCoupon({ ...coupon, code });
      created.push(made);
      return made;
    });
    for (const coupon of created) await admin.deleteCoupon(coupon.code);
  },

  consoleGuard: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on('pageerror', (error) => problems.push(`Script error: ${error.message}`));
      page.on('console', (message) => {
        if (message.type() === 'error') problems.push(`Console error: ${message.text()}`);
      });
      page.on('response', (response) => {
        if (response.status() >= 500) problems.push(`Server error ${response.status()}: ${response.url()}`);
      });
      await use();
      const unexpected = problems.filter((problem) => !isExpectedError(problem));
      expect(unexpected, 'The page reported errors a user would never see').toEqual([]);
    },
    { auto: true },
  ],
});

/** `test.use(asAdmin)` opens every page in the file signed in as the seeded admin. */
export const asAdmin = {
  // Playwright reads the fixtures a function needs from its first argument, so this has to be `{}`.
  storageState: async ({}, use: (path: string) => Promise<void>, testInfo: TestInfo) => {
    await use(adminStatePath(testInfo.project.name));
  },
};

export { expect };
