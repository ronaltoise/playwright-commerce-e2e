import type { Address } from '../api/types';

export const testAddress: Address = {
  name: 'Sam Tester',
  line1: '12 Test Street',
  city: 'Portland',
  postcode: '97201',
  country: 'United States',
};

/** Used for accounts the tests create. Nothing here is a real person's or a real secret. */
export const TEST_PASSWORD = 'e2e-demo-password';

let counter = 0;

/** Unique across workers and runs, so parallel tests never share an account. */
export function uniqueEmail(label: string, workerIndex: number): string {
  return `${label}.${Date.now().toString(36)}.${workerIndex}.${++counter}@roastery.test`;
}
