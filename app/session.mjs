// Password hashing and cookie sessions. A session always exists, so a guest can hold a cart.
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function hashPassword(password, salt = randomBytes(8).toString('hex')) {
  return `${salt}:${scryptSync(password, salt, 32).toString('hex')}`;
}

export function checkPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const given = scryptSync(password, salt, 32);
  return timingSafeEqual(given, Buffer.from(hash, 'hex'));
}

const sessions = new Map();

export function sessionFor(req, res) {
  const sid = /(?:^|;\s*)sid=([a-f0-9]+)/.exec(req.headers.cookie ?? '')?.[1];
  const known = sid && sessions.get(sid);
  if (known) return known;
  const id = randomBytes(16).toString('hex');
  const session = { id, userId: null, cart: newCart() };
  sessions.set(id, session);
  res.setHeader('Set-Cookie', `sid=${id}; HttpOnly; SameSite=Lax; Path=/`);
  return session;
}

export const newCart = () => ({ lines: [], coupon: null, couponUses: 0, shipping: 'standard' });

export const dropSessionsOf = (userId) => {
  for (const [id, session] of sessions) if (session.userId === userId) sessions.delete(id);
};
