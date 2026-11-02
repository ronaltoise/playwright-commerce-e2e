import { TEST_PASSWORD, uniqueEmail } from '../../data/people';
import { expect, test } from '../../fixtures';

test.describe('Sign up', () => {
  // This account comes from the sign-up form, so no fixture knows to delete it.
  test.afterEach(async ({ page, admin }) => {
    const { user } = await (await page.request.get('/api/me')).json();
    if (user) await admin.deleteUser(user.id);
  });

  test('AUTH-01 > a visitor can create an account', { tag: '@smoke' }, async ({ shop }, testInfo) => {
    await shop.register.open();
    await shop.register.createAccount({
      name: 'Nia Newcomer',
      email: uniqueEmail('signup', testInfo.workerIndex),
      password: TEST_PASSWORD,
    });

    await expect(shop.account.greeting).toHaveText('Hello, Nia Newcomer');
    await expect(shop.header.link('Account')).toBeVisible();
  });
});

test.describe('Sign in', () => {
  test('AUTH-02 > an email that is already registered is refused', async ({ shop, newCustomer }) => {
    const existing = await newCustomer();

    await shop.register.open();
    await shop.register.createAccount({ name: 'Copycat', email: existing.email, password: TEST_PASSWORD });

    await expect(shop.register.error).toHaveText('An account with that email already exists.');
  });

  test('AUTH-03 > a password under eight characters is refused', async ({ shop }, testInfo) => {
    await shop.register.open();
    await shop.register.createAccount({
      name: 'Short Pass',
      email: uniqueEmail('weak', testInfo.workerIndex),
      password: 'short',
    });

    await expect(shop.register.error).toHaveText('Use at least 8 characters.');
  });

  test('AUTH-04 > signing in returns the customer to the page they wanted', async ({ shop, newCustomer }) => {
    const customer = await newCustomer();

    await shop.account.open();
    await expect(shop.login.heading).toBeVisible();
    await shop.login.signIn(customer.email, customer.password);

    await expect(shop.account.greeting).toHaveText('Hello, Sam Tester');
  });

  test('AUTH-05 > a wrong password shows an error and stays signed out', async ({ shop, newCustomer }) => {
    const customer = await newCustomer();

    await shop.login.open();
    await shop.login.signIn(customer.email, 'not-the-password');

    await expect(shop.login.error).toHaveText('That email and password do not match.');
    await expect(shop.header.link('Sign in')).toBeVisible();
  });

  test('AUTH-06 > five wrong passwords lock the account', async ({ shop, guestApi, newCustomer }) => {
    const customer = await newCustomer();
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await guestApi.http.post('/api/auth/login', { data: { email: customer.email, password: 'wrong' } });
      expect(res.status()).toBe(401);
    }

    await shop.login.open();
    await shop.login.signIn(customer.email, customer.password);

    await expect(shop.login.error).toHaveText('Too many failed attempts. This account is locked.');
  });

  test('AUTH-07 > signing out ends the session', async ({ shop, customer }) => {
    await shop.account.open();
    await expect(shop.account.greeting).toContainText(customer.name);

    await shop.header.signOut();
    await expect(shop.header.link('Sign in')).toBeVisible();

    await shop.account.open();
    await expect(shop.login.heading).toBeVisible();
  });
});
