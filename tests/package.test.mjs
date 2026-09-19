import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const agentDir = mkdtempSync(join(tmpdir(), 'pi-collection-load-'));
process.env.PI_CODING_AGENT_DIR = agentDir;
after(() => rmSync(agentDir, { recursive: true, force: true }));

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageManifests = [
  'node_modules/@juicesharp/rpiv-ask-user-question/package.json',
  'node_modules/@tintinweb/pi-tasks/package.json',
  'node_modules/pi-cc-extensions/package.json',
  'node_modules/pi-mcp-adapter/package.json',
  'node_modules/pi-smart-fetch/package.json',
  'node_modules/pi-smart-web-search/package.json',
  'extensions/statusline/package.json',
  'extensions/pi-ssh-remote/package.json',
  'extensions/pi-simple-permissions/package.json',
];

function readPiPackage(relativeManifest) {
  const manifestPath = resolve(repoRoot, relativeManifest);
  const root = dirname(manifestPath);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.ok(manifest.pi, `${manifest.name} has no pi manifest`);
  return { root, manifest };
}

test('all nine independently installable packages expose existing resources', () => {
  assert.equal(packageManifests.length, 9);
  for (const { root, manifest } of packageManifests.map(readPiPackage)) {
    for (const type of ['extensions', 'themes', 'skills', 'prompts']) {
      for (const resource of manifest.pi[type] ?? []) {
        assert.ok(existsSync(resolve(root, resource)), `Missing ${manifest.name} resource: ${resource}`);
      }
    }
  }
});

test('pi loads the nine package entries with no duplicate tool owners', async () => {
  const { loadExtensions } = await import('../node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/loader.js');
  const extensionPaths = packageManifests.flatMap(relativeManifest => {
    const { root, manifest } = readPiPackage(relativeManifest);
    return (manifest.pi.extensions ?? []).map(resource => resolve(root, resource));
  });

  const result = await loadExtensions(extensionPaths, repoRoot);
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
