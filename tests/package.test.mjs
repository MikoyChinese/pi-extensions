import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const agentDir = mkdtempSync(join(tmpdir(), 'pi-collection-load-'));
process.env.PI_CODING_AGENT_DIR = agentDir;
after(() => rmSync(agentDir, { recursive: true, force: true }));

test('pi loads all nine extension entries with no duplicate tool owners', async () => {
  const { loadExtensions } = await import('../node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/loader.js');
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  for (const path of [...manifest.pi.extensions, ...manifest.pi.themes, ...manifest.pi.skills]) {
    assert.ok(existsSync(resolve(path)), `Missing pi resource: ${path}`);
  }
  const result = await loadExtensions(manifest.pi.extensions.map(p => resolve(p)), process.cwd());
  assert.deepEqual(result.errors, []);
  assert.equal(result.extensions.length, 9);
  const owners = new Map();
  for (const extension of result.extensions) {
    for (const name of extension.tools.keys()) {
      assert.ok(!owners.has(name), `${name} registered by ${owners.get(name)} and ${extension.path}`);
      owners.set(name, extension.path);
    }
  }
  assert.match(owners.get('bash'), /pi-simple-permissions/);
  assert.match(owners.get('remote_bash'), /pi-ssh-remote/);
  result.runtime.invalidate();
});
