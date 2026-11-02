// The seeded products and plans the tests rely on (see app/seed.mjs). Tests that change stock or
// prices create their own product through the `products` fixture and leave these alone.

export const PRODUCTS = {
  yirgacheffe: { id: 'p01', slug: 'ethiopia-yirgacheffe', name: 'Ethiopia Yirgacheffe', price: 1800 },
  espresso: { id: 'p04', slug: 'house-espresso', name: 'House Espresso', price: 1500 },
  grinder: { id: 'p08', slug: 'burr-grinder', name: 'Burr Grinder', price: 12900 },
  scale: { id: 'p10', slug: 'digital-scale', name: 'Digital Scale', price: 4500 },
  /** Two of these come to exactly $50.00, the free-shipping threshold. */
  mugSet: { id: 'p12', slug: 'ceramic-mug-set', name: 'Ceramic Mug Set', price: 2500 },
  soldOut: { id: 'p14', slug: 'geisha-reserve', name: 'Geisha Reserve', price: 5900 },
} as const;

export const PLANS = {
  explorer: { id: 'explorer', name: 'Explorer', monthly: 1800, annual: 18000 },
  /** The only plan with a free trial, and only on monthly billing. */
  enthusiast: { id: 'enthusiast', name: 'Enthusiast', monthly: 3200, annual: 32000 },
  club: { id: 'roasters-club', name: "Roaster's Club", monthly: 5800, annual: 58000 },
} as const;
