import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createServer } from 'node:net';
import { createJiti } from 'jiti';
import transport from './fixtures/ssh2.cjs';

const agentDir = mkdtempSync(join(tmpdir(), 'pi-remote-test-'));
process.env.PI_CODING_AGENT_DIR = agentDir;
after(() => rmSync(agentDir, { recursive: true, force: true }));
const jiti = createJiti(import.meta.url, {
  moduleCache: false,
  alias: { ssh2: resolve('tests/fixtures/ssh2.cjs') },
});
const factory = await jiti.import(resolve('extensions/pi-ssh-remote/index.ts'), { default: true });

function harness() {
  const tools = new Map();
  const handlers = new Map();
  const commands = new Map();
  factory({
    registerTool: t => tools.set(t.name, t),
    registerCommand: (n, c) => commands.set(n, c),
    on: (n, h) => handlers.set(n, h),
    appendEntry() {},
  });
  const notifications = [];
  const ctx = {
    ui: { confirm: async () => true, notify: (message, level) => notifications.push({ message, level }), setStatus() {}, theme: { fg: (_, s) => s } },
    sessionManager: { getBranch: () => [] },
  };
  const call = (name, params) => tools.get(name).execute('test', params, undefined, undefined, ctx);
  return { tools, handlers, commands, notifications, ctx, call };
}

test('register only explicit remote tools; do not intercept local shell or tool events', () => {
  const h = harness();
  assert.deepEqual([...h.tools.keys()].sort(), ['remote', 'remote_bash', 'remote_edit', 'remote_read', 'remote_write']);
  assert.deepEqual([...h.commands.keys()], ['remote']);
  for (const name of ['user_bash', 'tool_call', 'tool_result']) assert.equal(h.handlers.has(name), false);
});

test('disconnected remote tools never fall back to local files or commands', async () => {
  const h = harness();
  const path = join(agentDir, 'local-sentinel');
  writeFileSync(path, 'unchanged');
  for (const [name, params] of [
    ['remote_read', { path }], ['remote_write', { path, content: 'changed' }],
    ['remote_edit', { path, edits: [{ oldText: 'unchanged', newText: 'changed' }] }],
    ['remote_bash', { command: 'echo should-not-execute' }],
    ['remote', { action: 'upload', localPath: path, remotePath: 'sentinel' }],
    ['remote', { action: 'download', localPath: path, remotePath: 'sentinel' }],
  ]) await assert.rejects(async () => h.call(name, params), /disconnected|No SSH endpoint configured/);
  assert.equal(readFileSync(path, 'utf8'), 'unchanged');
});

test('connected tools use remote paths; forwarding and disconnect preserve explicit targeting', async () => {
  const h = harness();
  await h.call('remote', { action: 'connect', command: 'ssh tester@example.test', cwd: '/srv/project' });
  try {
    await h.call('remote_write', { path: 'file.txt', content: 'before' });
    assert.equal(transport.state.files.get('/srv/project/file.txt'), 'before');
    await h.call('remote_edit', { path: 'file.txt', edits: [{ oldText: 'before', newText: 'after' }] });
    assert.equal(transport.state.files.get('/srv/project/file.txt'), 'after');
    const absolute = resolve('absolute-remote.txt');
    await h.call('remote_write', { path: absolute, content: 'absolute' });
    assert.equal(transport.state.files.get(absolute), 'absolute');
    const memory = await h.call('remote', { action: 'memory' });
    const localBefore = readFileSync(memory.details.path, 'utf8');
    await h.call('remote_write', { path: memory.details.path, content: 'remote copy' });
    assert.equal(readFileSync(memory.details.path, 'utf8'), localBefore);
    assert.equal(transport.state.files.get(memory.details.path), 'remote copy');
    const read = await h.call('remote_read', { path: 'file.txt' });
    assert.match(read.content[0].text, /remote text/);
    await h.call('remote_bash', { command: 'pwd' });
    assert.match(transport.state.commands.at(-1), /cd -- '\/srv\/project'/);

    const binary = Buffer.from([0x00, 0xff, 0x41, 0x0a]);
    const uploadPath = join(agentDir, 'upload source.bin');
    const downloadPath = join(agentDir, 'nested download', 'result.bin');
    writeFileSync(uploadPath, binary);
    const uploaded = await h.call('remote', { action: 'upload', localPath: uploadPath, remotePath: 'artifacts/blob.bin' });
    assert.deepEqual(transport.state.files.get('/srv/project/artifacts/blob.bin'), binary);
    assert.equal(uploaded.details.bytes, binary.length);
    const downloaded = await h.call('remote', { action: 'download', remotePath: 'artifacts/blob.bin', localPath: downloadPath });
    assert.deepEqual(readFileSync(downloadPath), binary);
    assert.equal(downloaded.details.bytes, binary.length);

    const commandUploadPath = join(agentDir, 'command source.bin');
    const commandDownloadPath = join(agentDir, 'command result.bin');
    writeFileSync(commandUploadPath, binary);
    await h.commands.get('remote').handler(`upload "${commandUploadPath}" "command files/blob.bin"`, h.ctx);
    assert.deepEqual(transport.state.files.get('/srv/project/command files/blob.bin'), binary);
    await h.commands.get('remote').handler(`download "command files/blob.bin" "${commandDownloadPath}"`, h.ctx);
    assert.deepEqual(readFileSync(commandDownloadPath), binary);
    assert.match(h.notifications.at(-1).message, /Downloaded 4B/);
    const prompt = `Original instructions\nCurrent working directory: ${process.cwd()}`;
    assert.ok(h.handlers.get('before_agent_start')({ systemPrompt: prompt }).systemPrompt.startsWith(prompt));
    await assert.rejects(async () => h.call('remote_write', { path: '~/file', content: '' }), /absolute remote path/);
    // Forwarding with an unused local port toggled upstream routing; it must not disable remote tools.
    const probe = createServer();
    await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
    const port = probe.address().port;
    await new Promise(resolve => probe.close(resolve));
    await h.call('remote', { action: 'forward', forwards: `${port}:127.0.0.1:8000` });
    await h.call('remote_write', { path: 'tunnel.txt', content: 'remote' });
    assert.equal(transport.state.files.get('/srv/project/tunnel.txt'), 'remote');
    assert.match(h.handlers.get('before_agent_start')({ systemPrompt: prompt }).systemPrompt, /remote_bash/);
    await h.call('remote', { action: 'unforward' });
    transport.state.output = 'x'.repeat(20000);
    h.handlers.get('turn_start')();
    const bounded = await h.call('remote_bash', { command: 'large-output' });
    assert.ok(Buffer.byteLength(bounded.content[0].text) <= 8192);
    assert.ok(bounded.details.fullOutputPath);
    rmSync(bounded.details.fullOutputPath, { force: true });
  } finally {
    transport.state.output = 'remote output\n';
    await h.call('remote', { action: 'disconnect' });
  }
  await assert.rejects(async () => h.call('remote_bash', { command: 'pwd' }), /disconnected/);
});
