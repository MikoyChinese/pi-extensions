# pi-ssh-remote：显式远程工具版

基于 [petrichor20211/pi-ssh-remote](https://github.com/petrichor20211/pi-ssh-remote) 修改。随根目录合集安装；此目录的运行依赖由根 `package.json` 管理。

仅注册 `remote`、`remote_read`、`remote_write`、`remote_edit`、`remote_bash` 五个工具和 `/remote` 命令。

## 操作示例

```text
/remote ssh user@example.com -p 22
/remote cd /srv/project
/remote status
/remote exec --timeout 60 git status
/remote upload ./build/app.tar.gz releases/app.tar.gz
/remote download logs/service.log ./downloads/service.log
/remote config forward 7860:127.0.0.1:7860
/remote forward
/remote unforward
/remote off
```

模型调用示例：

```json
{"action":"connect","command":"ssh user@example.com -p 22","cwd":"/srv/project"}
```

以上参数用于 `remote`。随后使用 `remote_read({"path":"README.md"})`、`remote_bash({"command":"git status"})` 等远程工具。`remote_edit` 的参数随宿主 pi 的 edit schema 提供；在验证版本中使用 `edits: [{oldText, newText}]`。

本地与远端之间复制文件时，使用 `/remote upload LOCAL_PATH REMOTE_PATH`、`/remote download REMOTE_PATH LOCAL_PATH`，或让模型调用：

```json
{"action":"upload","localPath":"./build/app.tar.gz","remotePath":"releases/app.tar.gz"}
{"action":"download","remotePath":"logs/service.log","localPath":"./downloads/service.log"}
```

文件直接通过 SFTP 传输，不进入模型上下文，支持二进制和大文件。`localPath` 的相对路径基于 pi 启动时的本地 cwd，`remotePath` 的相对路径基于远端 cwd；两者都支持绝对路径。路径含空格时，`/remote` 命令中需要加引号。当前只复制单个文件，不递归复制目录。

## 与原版的差异

- 不覆盖 `read/write/edit/bash`，不拦截 `!` / `!!`，不修改本地工具激活列表。
- `before_agent_start` 追加远程端点和工具说明，保留原系统提示及本地 cwd。
- `remote_*` 必须已有连接；断线时不会调用本地工具。连接中掉线保留上游自动重连逻辑。
- 相对路径基于远端 cwd；绝对路径不再从本地工作区映射到远端工作区。`~` / `~/...` 参数会要求改用远端绝对路径或相对路径，避免被 pi 在本地展开。
- 开启转发后远程工具仍指向远端；状态栏同时显示远端目标和转发端口。
- `remote` 的 `upload/download` action 通过 SFTP 在本地与远端之间直接复制单个文件，保留原始字节。
- 服务器记忆 JSON 和超限输出临时文件保存在本地，用本地 `read/edit/write` 管理；向 `remote_*` 传入相同路径也只会操作远端。
- 忽略旧会话的隐式路由字段，保留端点、目录和转发恢复。

## 输出与权限

保留上游默认限额：文本读取 400 行 / 16 KB，命令输出末尾 200 行 / 8 KB，每轮远端文本输出预算 32 KB。`remote_edit` 返回的文本也纳入读取限额。远程命令默认超时 30 秒，可以通过参数指定。命令超限完整输出保存在本地临时文件，使用本地 `read` 查看。

远程命令通过 SSH 执行，不经过本地 bash 权限包装器。`pi-simple-permissions` 不会自动审批 `remote_*`，也不会审批 `remote` 的 `exec` action。需要远程权限控制时，应为五个工具及命令入口配置对应策略；仅重命名工具并不构成远程沙箱。

远端需要 Bash、SFTP 与 GNU `timeout`。上游目前不读取 `~/.ssh/config` 或 ProxyJump，请显式传入主机、端口及 `-i` 密钥路径。认证和配置功能细节可参考 [上游文档快照](UPSTREAM-README.md)，其中关于原生工具路由的描述不适用于本修改版。
