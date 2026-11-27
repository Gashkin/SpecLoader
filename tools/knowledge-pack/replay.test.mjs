import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

test('offline replay, failure preservation and manual cross-source refresh', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'pack-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const v1 = path.join(root, 'original');
  const v2 = path.join(root, 'revised');
  await cp(path.join(here, 'example'), v1, { recursive: true });
  function replay(dir, success = true) {
    const result = spawnSync(process.execPath, [path.join(here, 'replay.mjs'),
      '--seed', path.join(dir, 'seed.json'), '--out', path.join(dir, 'briefing.md')], { encoding: 'utf8' });
    assert.equal(result.status, success ? 0 : 1, result.stderr);
  }
  const output = dir => readFile(path.join(dir, 'briefing.md'), 'utf8');
  replay(v1);
  const original = await output(v1);
  replay(v1);
  assert.equal(await output(v1), original);

  await cp(v1, v2, { recursive: true });
  const seedPath = path.join(v2, 'seed.json');
  const seed = JSON.parse(await readFile(seedPath, 'utf8'));
  const save = () => writeFile(seedPath, JSON.stringify(seed));
  seed.version = '2';
  const change = 'Synthetic decision: release monthly beginning November.';
  await writeFile(path.join(v2, 'change.txt'), change);
  seed.sources.push({ ...seed.sources[0], id: 'change', locator: 'Later decision',
    url: 'https://example.org/atlas/change', revision: 'fixture v2', file: 'change.txt', sha256: digest(change) });
  seed.claims[0].state = 'superseded';
  seed.claims[0].supersededBy = 'monthly';
  seed.claims.push({ id: 'monthly', state: 'decision', text: change, sources: ['change'] });
  await save();
  replay(v2);
  assert.match(await output(v2), /Superseded by monthly/);
  assert.equal(digest(await readFile(path.join(v2, 'decision.txt'))), seed.sources[0].sha256);
  replay(v1);
  assert.equal(await output(v1), original);

  seed.sources.push({ id: 'audit', locator: 'Synthetic audit', url: 'https://example.org/audit',
    revision: 'attempt v2', coverage: 'unavailable', limitation: 'Owner could not supply the record.' });
  seed.claims.push({ id: 'audited', state: 'unknown', sources: ['audit'], text: 'Audit outcome is unknown.',
    qualification: 'The audit record was unavailable.' });
  await save();
  replay(v2);
  assert.match(await output(v2), /audit record was unavailable/);
  const partial = seed.sources[1];
  partial.coverage = 'partial';
  partial.limitation = 'Effective date omitted from excerpt.';
  seed.claims[1].qualification = 'Exact effective date is unverified.';
  await save();
  replay(v2);
  const good = await output(v2);
  assert.match(good, /Exact effective date is unverified/);
  for (const bad of ['absent', '']) {
    seed.claims[1].sources = [bad];
    await save();
    replay(v2, false);
    assert.equal(await output(v2), good);
  }
  seed.claims[1].sources = ['change'];
  await save();
  await writeFile(path.join(v2, 'change.txt'), 'altered');
  replay(v2, false);
  assert.equal(await output(v2), good);
  await rm(path.join(v2, 'change.txt'));
  replay(v2, false);
  assert.equal(await output(v2), good);
});
