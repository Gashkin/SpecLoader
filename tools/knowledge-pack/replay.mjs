import { createHash, randomUUID } from 'node:crypto';
import { readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

function requireThat(condition, message) {
  if (!condition) throw new Error(message);
}

function requiredText(value, label) {
  requireThat(typeof value === 'string' && value.trim().length > 0, 'Missing ' + label);
}

function records(items, label) {
  requireThat(Array.isArray(items) && items.length, 'Expected nonempty ' + label);
  const result = new Map();
  for (const item of items) {
    requireThat(item && typeof item.id === 'string' && /^[a-z][a-z0-9-]*$/.test(item.id),
      'Invalid ID in ' + label);
    requireThat(!result.has(item.id), 'Duplicate ID ' + item.id);
    result.set(item.id, item);
  }
  return result;
}

function inside(root, filename) {
  const relative = path.relative(root, filename);
  return relative !== '' && !path.isAbsolute(relative) && relative !== '..' &&
    !relative.startsWith('..' + path.sep);
}

function encodeParentheses(value) {
  return value.replace(/[()]/g, char => '%' + char.charCodeAt(0).toString(16));
}

function checkSuccessors(claim, claims) {
  const seen = new Set();
  let current = claim;
  while (current.state === 'superseded') {
    requireThat(!seen.has(current.id), 'Cyclic supersession at ' + current.id);
    seen.add(current.id);
    current = claims.get(current.supersededBy);
    requireThat(current, 'Missing superseding claim');
  }
  requireThat(current.state === 'decision', 'Supersession must reach a decision');
}

async function render(seedFile, outputFile) {
  const seedPath = await realpath(seedFile);
  const root = path.dirname(seedPath);
  const output = path.join(await realpath(path.dirname(outputFile)), path.basename(outputFile));
  const inputs = new Set([seedPath]);
  const seed = JSON.parse(await readFile(seedPath, 'utf8'));
  requireThat(seed.format === 1, 'Unsupported seed format');
  for (const key of ['title', 'version', 'captured', 'reviewedBy', 'reviewedOn']) {
    requiredText(seed[key], key);
  }
  const sources = records(seed.sources, 'sources');
  const claims = records(seed.claims, 'claims');
  const evidence = [];
  for (const source of sources.values()) {
    for (const key of ['locator', 'revision', 'url']) requiredText(source[key], key);
    requireThat(['complete', 'partial', 'unavailable'].includes(source.coverage), 'Invalid coverage');
    requireThat(/^https?:$/.test(new URL(source.url).protocol), 'Invalid source URL');
    let link = '';
    if (source.coverage !== 'unavailable') {
      requiredText(source.file, 'capture file');
      requireThat(!path.isAbsolute(source.file), 'Expected relative capture path');
      const location = await realpath(path.resolve(root, source.file));
      requireThat(inside(root, location), 'Capture outside pack');
      const bytes = await readFile(location);
      requireThat(createHash('sha256').update(bytes).digest('hex') === source.sha256,
        'Capture digest mismatch for ' + source.id);
      inputs.add(location);
      const relative = path.relative(path.dirname(output), location).split(path.sep);
      link = ' · [captured excerpt](' + relative.map(part => encodeParentheses(encodeURIComponent(part))).join('/') + ')';
    } else {
      requireThat(source.file === undefined && source.sha256 === undefined, 'Unavailable capture declares bytes');
    }
    if (source.coverage !== 'complete') requiredText(source.limitation, 'coverage limitation');
    const label = source.locator.replace(/[\\\[\]]/g, '\\$&');
    const destination = encodeParentheses(new URL(source.url).href);
    evidence.push('- **' + source.id + '** · [' + label + '](' + destination + ')' + link +
      ' · ' + source.revision + ' · ' + source.coverage + (source.limitation ? ' · ' + source.limitation : ''));
  }

  const lines = ['# ' + seed.title, '', 'Derived briefing · ' + seed.version + ' · captured ' +
    seed.captured, '', 'Seed reviewed by ' + seed.reviewedBy + ' on ' + seed.reviewedOn + '.', ''];
  for (const claim of claims.values()) {
    requiredText(claim.text, 'claim text');
    requireThat(['decision', 'proposal', 'observed', 'unknown', 'superseded', 'inference'].includes(claim.state),
      'Invalid claim state');
    requireThat(Array.isArray(claim.sources) && claim.sources.length, 'Claim lacks evidence');
    const refs = claim.sources.map(id => {
      requireThat(sources.has(id), 'Unknown source ' + id);
      return sources.get(id);
    });
    if (refs.some(ref => ref.coverage !== 'complete')) requiredText(claim.qualification, 'claim qualification');
    if (refs.every(ref => ref.coverage === 'unavailable')) requireThat(claim.state === 'unknown', 'Missing evidence');
    if (claim.state === 'superseded') {
      checkSuccessors(claim, claims);
    } else {
      requireThat(claim.supersededBy === undefined, 'Unexpected supersession');
    }
    lines.push('- **' + claim.id + ' (' + claim.state + ')** ' + claim.text +
      (claim.qualification ? ' ' + claim.qualification : '') +
      (claim.supersededBy ? ' Superseded by ' + claim.supersededBy + '.' : '') +
      ' [' + claim.sources.join(', ') + ']');
  }
  lines.push('', '## Evidence', '', ...evidence, '');
  requireThat(inside(root, output) && !inputs.has(output), 'Output must be separate from inputs inside pack');
  // Rename replaces a destination symlink itself. Reject aliases to protected inputs too.
  let existing;
  try { existing = await realpath(output); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  requireThat(!inputs.has(existing), 'Output aliases an input');
  const temp = output + '.' + randomUUID() + '.tmp';
  try {
    await writeFile(temp, lines.join('\n'), { flag: 'wx', mode: 0o600 });
    await rename(temp, output);
  } finally {
    await rm(temp, { force: true });
  }
}

try {
  const [seedFlag, seed, outFlag, out, ...rest] = process.argv.slice(2);
  requireThat(seedFlag === '--seed' && seed && outFlag === '--out' && out && !rest.length,
    'Usage: node replay.mjs --seed <seed.json> --out <briefing.md>');
  await render(seed, out);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
