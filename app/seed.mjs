// The shop's starting data. Everything lives in memory, so restarting the server resets the shop.
// All money is in integer cents.
import { hashPassword } from './session.mjs';

const product = (id, slug, name, category, price, stock, description) => ({
  id,
  slug,
  name,
  category,
  price,
  stock,
  description,
});

export const seedProducts = () => [
  product(
    'p01',
    'ethiopia-yirgacheffe',
    'Ethiopia Yirgacheffe',
    'Beans',
    1800,
    40,
    'Bright and floral, with bergamot and lemon.'
  ),
  product(
    'p02',
    'colombia-huila',
    'Colombia Huila',
    'Beans',
    1650,
    40,
    'Caramel sweetness with a clean red-apple finish.'
  ),
  product(
    'p03',
    'sumatra-mandheling',
    'Sumatra Mandheling',
    'Beans',
    1700,
    40,
    'Earthy and full-bodied, with dark chocolate.'
  ),
  product('p04', 'house-espresso', 'House Espresso', 'Beans', 1500, 60, 'Our everyday blend, built for milk drinks.'),
  product('p05', 'swiss-water-decaf', 'Swiss Water Decaf', 'Beans', 1600, 30, 'All the flavour, none of the caffeine.'),
  product('p06', 'kenya-nyeri', 'Kenya Nyeri', 'Beans', 1900, 25, 'Blackcurrant and grapefruit, with a juicy body.'),
  product('p07', 'pour-over-dripper', 'Pour-Over Dripper', 'Gear', 3200, 20, 'A ceramic dripper for one to four cups.'),
  product('p08', 'burr-grinder', 'Burr Grinder', 'Gear', 12900, 8, 'Stepless conical burrs for every brew method.'),
  product(
    'p09',
    'gooseneck-kettle',
    'Gooseneck Kettle',
    'Gear',
    6900,
    12,
    'Precise pouring with a 0.9 litre capacity.'
  ),
  product('p10', 'digital-scale', 'Digital Scale', 'Gear', 4500, 3, 'Weighs to 0.1 g, with a built-in timer.'),
  product('p11', 'paper-filters', 'Paper Filters (100)', 'Gear', 800, 100, 'Oxygen-bleached filters for the dripper.'),
  product('p12', 'ceramic-mug-set', 'Ceramic Mug Set', 'Gifts', 2500, 30, 'Two hand-glazed mugs in a gift box.'),
  product(
    'p13',
    'tasting-gift-box',
    'Tasting Gift Box',
    'Gifts',
    4900,
    15,
    'Four 100 g samples from around the world.'
  ),
  product('p14', 'geisha-reserve', 'Geisha Reserve', 'Gifts', 5900, 0, 'Our rarest lot. Sold out until next harvest.'),
];

export const plans = [
  { id: 'explorer', name: 'Explorer', bags: 1, monthly: 1800, annual: 18000, trialDays: 0 },
  { id: 'enthusiast', name: 'Enthusiast', bags: 2, monthly: 3200, annual: 32000, trialDays: 14 },
  { id: 'roasters-club', name: "Roaster's Club", bags: 4, monthly: 5800, annual: 58000, trialDays: 0 },
];

const day = 86_400_000;

export const seedCoupons = (now = Date.now()) => [
  { code: 'WELCOME10', kind: 'percent', value: 10, minSpend: 0, expiresAt: null },
  { code: 'SAVE5', kind: 'fixed', value: 500, minSpend: 3000, expiresAt: null },
  { code: 'FREESHIP', kind: 'shipping', value: 0, minSpend: 0, expiresAt: null },
  { code: 'SUMMER23', kind: 'percent', value: 25, minSpend: 0, expiresAt: now - 30 * day },
];

export const seedUsers = () => [
  {
    id: 'u_admin',
    name: 'Rae Admin',
    email: 'admin@roastery.test',
    password: hashPassword('admin-demo-pass'),
    role: 'admin',
  },
  {
    id: 'u_ava',
    name: 'Ava Customer',
    email: 'ava@roastery.test',
    password: hashPassword('customer-demo-pass'),
    role: 'customer',
  },
];
