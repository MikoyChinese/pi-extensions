// In-memory SSH transport: actual pi tool factories still handle schemas and edits.
const { EventEmitter } = require('node:events');
const { readFile, writeFile } = require('node:fs');
const state = { files: new Map(), commands: [], cwd: '/srv/project', output: 'remote output\n' };
class Client extends EventEmitter {
  connect(options) {
    queueMicrotask(() => {
      if (options.hostVerifier('ab'.repeat(32))) this.emit('ready');
    });
  }
  end() { this.emit('close'); }
  exec(command, callback) {
    state.commands.push(command);
    const stream = new EventEmitter();
    stream.stderr = new EventEmitter();
    stream.close = () => stream.emit('close', 0);
    callback(null, stream);
    setImmediate(() => {
      let output = state.output;
      if (command.includes('pwd -P')) output = state.cwd + '\n';
      else if (command.includes('file --mime-type')) output = 'text/plain\n';
      else if (command.includes('mkdir -p')) output = '';
      else if (command.includes('sed -n')) output = 'remote text\n';
      stream.emit('data', Buffer.from(output));
      stream.emit('close', 0);
    });
  }
  sftp(callback) {
    callback(null, {
      stat(path, cb) {
        const content = state.files.get(path);
        cb(content === undefined ? new Error(`Missing remote file: ${path}`) : null, {
          size: content === undefined ? 0 : Buffer.byteLength(content),
        });
      },
      readFile(path, cb) { cb(null, Buffer.from(state.files.get(path) ?? '')); },
      writeFile(path, content, cb) { state.files.set(path, content.toString()); cb(null); },
      fastPut(localPath, remotePath, _options, cb) {
        readFile(localPath, (error, content) => {
          if (!error) state.files.set(remotePath, content);
          cb(error);
        });
      },
      fastGet(remotePath, localPath, _options, cb) {
        const content = state.files.get(remotePath);
        if (content === undefined) return cb(new Error(`Missing remote file: ${remotePath}`));
        writeFile(localPath, Buffer.from(content), cb);
      },
      end() {},
    });
  }
}
module.exports = { Client, utils: {}, state };
