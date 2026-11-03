#!/usr/bin/env node
// `npm run app:bugs`: the shop with every seeded bug, on port 3001. The settings are made here
// rather than as `SEEDED_BUGS=all node ...` in package.json, which Windows shells don't understand.
process.env.SEEDED_BUGS = 'all';
process.env.PORT = '3001';
await import('../app/server.mjs');
