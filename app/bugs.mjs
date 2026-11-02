// Planted defects. Each one exists only when the server starts with SEEDED_BUGS set, so the same
// test suite can run against a clean build and a broken one. `SEEDED_BUGS=all` turns them all on;
// `SEEDED_BUGS=BUG-03,BUG-07` turns on just those. docs/SEEDED-BUGS.md lists what catches each.
export const BUGS = {
  'BUG-01': 'A declined card still books the order',
  'BUG-02': 'Applying the same coupon twice doubles the discount',
  'BUG-03': 'An order of exactly $50.00 misses free shipping',
  'BUG-04': 'The cart accepts more units than are in stock',
  'BUG-05': 'An expired coupon is accepted',
  'BUG-06': 'A failed renewal leaves the subscription active',
  'BUG-07': 'Cancelling at period end cancels straight away',
  'BUG-08': 'An upgrade charges the full new price instead of the prorated difference',
  'BUG-09': "A customer can read another customer's order",
  'BUG-10': 'Sort by price compares prices as text',
  'BUG-11': 'The cart badge keeps its old count after a line is removed',
  'BUG-12': 'Gear product pages throw a script error behind a working page',
  'BUG-13': 'A refund can exceed what the customer paid',
  'BUG-14': 'Product search is case-sensitive',
};

const raw = process.env.SEEDED_BUGS ?? '';
const active = new Set(
  raw === 'all'
    ? Object.keys(BUGS)
    : raw
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
);

for (const id of active) {
  if (!BUGS[id]) throw new Error(`SEEDED_BUGS names an unknown bug: ${id}`);
}

export const bug = (id) => active.has(id);
export const activeBugs = () => [...active].sort();
