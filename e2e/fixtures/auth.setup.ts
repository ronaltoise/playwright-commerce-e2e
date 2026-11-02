import { test as setup, expect } from '@playwright/test';
import { adminStatePath } from './paths';

// Signs in as the seeded admin once per build. Tests reuse the saved session, so a run makes one
// admin login rather than one per test.
setup('sign in as the shop admin', async ({ request }, testInfo) => {
  const res = await request.post('/api/auth/login', {
    data: { email: 'admin@roastery.test', password: 'admin-demo-pass' },
  });
  expect(res.ok(), `admin login answered ${res.status()}`).toBe(true);
  await request.storageState({ path: adminStatePath(testInfo.project.name) });
});
