// The report decides what people act on, so it has tests of its own. They run with Node's built-in
// test runner (`npm run test:report`), against a fake GitHub on localhost, so nothing leaves the machine.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const script = fileURLToPath(new URL('./exec-report.mjs', import.meta.url));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exec-report-'));
after(() => fs.rmSync(dir, { recursive: true, force: true }));

const test = (id, status, { tags = [], title = 'does something' } = {}) => ({
  title: `${id} > ${title}`,
  file: 'specs/cart/cart.spec.ts',
  line: 1,
  tags,
  tests: [
    {
      projectName: 'stable',
      status,
      results: [{ duration: 100, error: status === 'unexpected' ? { message: 'Error: it broke' } : undefined }],
    },
  ],
});

const results = (specs) => ({ suites: [{ specs }], stats: { duration: 1000 } });

async function report(specs, { known, flags = [], env = {} } = {}) {
  const file = path.join(dir, 'results.json');
  fs.writeFileSync(file, JSON.stringify(results(specs)));
  const args = [script, '--results', file, '--build', 'stable', '--out', path.join(dir, 'index.html'), ...flags];
  if (known) {
    const knownFile = path.join(dir, 'known.json');
    fs.writeFileSync(knownFile, JSON.stringify(known));
    args.push('--known', knownFile);
  }
  const clean = { PATH: process.env.PATH };
  const { stdout } = await run(process.execPath, args, { env: { ...clean, ...env } });
  return JSON.parse(stdout.trim().split('\n').at(-1));
}

const page = () => fs.readFileSync(path.join(dir, 'index.html'), 'utf8');

describe('the signal', () => {
  it('is HEALTHY when everything passes', async () => {
    const out = await report([test('CART-01', 'expected')]);
    assert.equal(out.signal, 'HEALTHY');
  });

  it('is HEALTHY when every failure is a known defect', async () => {
    const out = await report([test('CART-01', 'unexpected')], { known: { 'CART-01': { id: 'BUG-1', cause: 'x' } } });
    assert.equal(out.signal, 'HEALTHY');
    assert.equal(out.unexplained, 0);
  });

  it('is DEGRADED when a failure has no known cause', async () => {
    const out = await report([test('CART-01', 'unexpected'), test('CART-02', 'expected')]);
    assert.equal(out.signal, 'DEGRADED');
    assert.equal(out.unexplained, 1);
  });

  it('is BLOCKED when a smoke test fails with no known cause', async () => {
    const out = await report([test('CART-01', 'unexpected', { tags: ['smoke'] }), test('CART-02', 'expected')]);
    assert.equal(out.signal, 'BLOCKED');
  });

  it('is BLOCKED when nothing ran', async () => {
    const out = await report([]);
    assert.equal(out.signal, 'BLOCKED');
  });

  it('is BLOCKED when most of the suite did not run', async () => {
    const out = await report([test('CART-01', 'skipped'), test('CART-02', 'skipped'), test('CART-03', 'expected')]);
    assert.equal(out.signal, 'BLOCKED');
  });

  it('counts a test that passed on retry as flaky, not failed', async () => {
    const out = await report([test('CART-01', 'flaky')]);
    assert.equal(out.signal, 'HEALTHY');
    assert.equal(out.flaky, 1);
    assert.equal(out.failed, 0);
  });
});

describe('known defects', () => {
  it('points out a known defect that no longer fails', async () => {
    await report([test('CART-01', 'expected')], { known: { 'CART-01': { id: 'BUG-1', cause: 'x' } } });
    assert.match(page(), /Known defects that did not fail tonight/);
    assert.match(page(), /CART-01/);
  });
});

describe('with an issue tracker', () => {
  let server;
  let requests;
  let issues;
  let down;
  let env;

  before(async () => {
    server = createServer(async (req, res) => {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      requests.push({ method: req.method, url: req.url, auth: req.headers.authorization });
      res.setHeader('Content-Type', 'application/json');
      if (down) {
        res.statusCode = 503;
        return res.end('{}');
      }
      if (req.url.startsWith('/search/issues')) {
        const query = decodeURIComponent(req.url);
        const items = issues.filter((issue) => query.includes(issue.signature));
        return res.end(JSON.stringify({ items }));
      }
      const body = JSON.parse(raw);
      const signature = /e2esig[a-f0-9]+/.exec(body.body)[0];
      const issue = {
        number: issues.length + 1,
        state: 'open',
        title: body.title,
        html_url: 'http://issue',
        signature,
      };
      issues.push(issue);
      res.statusCode = 201;
      res.end(JSON.stringify(issue));
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    env = {
      GITHUB_TOKEN: 'fake-token',
      GITHUB_REPOSITORY: 'someone/shop',
      GITHUB_API_URL: `http://127.0.0.1:${server.address().port}`,
    };
  });

  after(() => server.close());

  beforeEach(() => {
    requests = [];
    issues = [];
    down = false;
  });

  it('files one issue, and the next run finds it instead of filing again', async () => {
    const failing = [test('CART-01', 'unexpected'), test('CART-02', 'expected')];

    const first = await report(failing, { flags: ['--file-issues'], env });
    assert.equal(first.filed, 1);
    assert.equal(first.signal, 'DEGRADED');

    const second = await report(failing, { flags: ['--file-issues'], env });
    assert.equal(second.filed, 0);
    assert.equal(second.signal, 'HEALTHY');
    assert.equal(issues.length, 1);
  });

  it('files nothing unless asked to', async () => {
    const out = await report([test('CART-01', 'unexpected')], { env });
    assert.equal(out.filed, 0);
    assert.equal(issues.length, 0);
  });

  it('does not reopen a closed issue, but calls the failure a regression', async () => {
    await report([test('CART-01', 'unexpected')], { flags: ['--file-issues'], env });
    issues[0].state = 'closed';

    const out = await report([test('CART-01', 'unexpected')], { flags: ['--file-issues'], env });

    assert.equal(out.filed, 0);
    assert.equal(out.signal, 'DEGRADED');
    assert.match(page(), /Regression/);
  });

  it('files nothing when a run has more failures than the limit', async () => {
    const many = Array.from({ length: 6 }, (_, i) => test(`CART-0${i + 1}`, 'unexpected'));

    const out = await report(many, { flags: ['--file-issues'], env });

    assert.equal(out.filed, 0);
    assert.equal(issues.length, 0);
    assert.match(page(), /over the limit of 5/);
  });

  it('files nothing when the tracker cannot be reached, rather than risk a duplicate', async () => {
    down = true;

    const out = await report([test('CART-01', 'unexpected')], { flags: ['--file-issues'], env });

    assert.equal(out.filed, 0);
    assert.equal(requests.filter((r) => r.method === 'POST').length, 0);
    assert.match(page(), /could not be reached/);
  });

  it('does not ask the tracker about a failure that is already a known defect', async () => {
    await report([test('CART-01', 'unexpected')], { known: { 'CART-01': { id: 'BUG-1', cause: 'x' } }, env });

    assert.equal(requests.length, 0);
  });

  it('contacts nothing at all without a token', async () => {
    const { GITHUB_API_URL } = env;

    await report([test('CART-01', 'unexpected')], { flags: ['--file-issues'], env: { GITHUB_API_URL } });

    assert.equal(requests.length, 0);
  });
});
