import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Value } from 'typebox/value';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const extensionPath = resolve(repoRoot, 'extensions/pi-simple-permissions/index.ts');

async function loadBashTool() {
  const { loadExtensions } = await import(
    '../node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/loader.js'
  );
  const result = await loadExtensions([extensionPath], repoRoot);
  assert.deepEqual(result.errors, []);

  const registration = result.extensions[0]?.tools.get('bash');
  assert.ok(registration, 'pi-simple-permissions did not register bash');
  const tool = registration.definition;
  assert.equal(typeof tool.prepareArguments, 'function');
  return { result, tool };
}

test('normalizes null-like bash permission arguments to the sandbox', async () => {
  const { result, tool } = await loadBashTool();
  try {
    for (const sandboxPermissions of [undefined, null, '', 'null']) {
      const input = {
        command: 'git status --short',
        timeout: 'null',
        sandbox_permissions: sandboxPermissions,
        escalation_reason: 'null',
      };
      const prepared = tool.prepareArguments(input);

      assert.notStrictEqual(prepared, input);
      assert.equal(prepared.sandbox_permissions, 'use_sandbox');
      assert.equal('timeout' in prepared, false);
      assert.equal('escalation_reason' in prepared, false);
      assert.equal(Value.Check(tool.parameters, prepared), true);
    }
  } finally {
    result.runtime.invalidate();
  }
});

test('preserves explicit escalation and rejects unknown permission values', async () => {
  const { result, tool } = await loadBashTool();
  try {
    const escalated = tool.prepareArguments({
      command: 'touch ~/.config/example',
      sandbox_permissions: 'require_escalated',
      escalation_reason: 'Write the requested user configuration',
    });
    assert.equal(escalated.sandbox_permissions, 'require_escalated');
    assert.equal(Value.Check(tool.parameters, escalated), true);

    const invalid = tool.prepareArguments({
      command: 'true',
      sandbox_permissions: 'yes',
    });
    assert.equal(invalid.sandbox_permissions, 'yes');
    assert.equal(Value.Check(tool.parameters, invalid), false);
  } finally {
    result.runtime.invalidate();
  }
});
