# Pi 扩展兼容性集合

这个仓库维护一组经过联合加载和工具重名测试的 pi 插件。六个上游插件直接从各自的 npm 包安装；本仓库发布自有的 statusline，以及 fork 后修改的 pi-ssh-remote 和 pi-simple-permissions。一个 Git 仓库通过 npm workspaces 维护这三个独立包。

## 安装

需要 Node.js 22+ 和已安装的 pi。逐个安装时不指定版本，pi 会使用 npm 的最新版本，并允许 `pi update --extensions` 后续更新：

```bash
pi install npm:@juicesharp/rpiv-ask-user-question
pi install npm:@tintinweb/pi-tasks
pi install npm:pi-cc-extensions
pi install npm:pi-mcp-adapter
pi install npm:pi-smart-fetch
pi install npm:pi-smart-web-search
pi install npm:@mikoychinese/pi-statusline
pi install npm:@mikoychinese/pi-ssh-remote
pi install npm:@mikoychinese/pi-simple-permissions
```

安装后重启 pi 或执行 `/reload`。每个插件都是独立的 package source，因此 `pi list` 会分别显示九项，也可以通过 `pi config` 单独启用或禁用。

更新所有插件：

```bash
pi update --extensions
```

如果之前安装过本仓库的聚合 Git/local package，或在 `~/.pi/agent/extensions/statusline.ts` 放置过状态栏，请先移除或禁用旧入口，避免重复加载。

## 兼容性基线

仓库测试通过 `package-lock.json` 固定一组可复现的联合测试版本；用户的无版本安装命令则跟随 npm latest。当前测试基线如下：

| 插件 | 测试版本 | 发布来源 |
| --- | --- | --- |
| @juicesharp/rpiv-ask-user-question | 2.10.1 | 上游 npm |
| @tintinweb/pi-tasks | 0.9.0 | 上游 npm |
| pi-cc-extensions | 0.8.71 | 上游 npm |
| pi-mcp-adapter | 2.33.0 | 上游 npm |
| pi-smart-fetch | 0.3.17 | 上游 npm |
| pi-smart-web-search | 0.4.0 | 上游 npm |
| @mikoychinese/pi-statusline | 0.1.0 | 本仓库 |
| @mikoychinese/pi-ssh-remote | 0.1.0 | 本仓库 |
| @mikoychinese/pi-simple-permissions | 0.1.1 | 本仓库（fork 自上游 pi-simple-permissions 1.0.3） |

上游包发生冲突时，可以只把受影响的插件适配并发布到 `@mikoychinese` scope，然后替换对应安装源；其他插件继续直接跟随上游。

## SSH 使用方式

```text
/remote ssh user@server.example.com -p 22
/remote cd /srv/project
/remote upload ./build/app.tar.gz releases/app.tar.gz
/remote download logs/service.log ./downloads/service.log
/remote status
```

连接后模型显式选择工具：

| 目标 | 工具 |
| --- | --- |
| 本地文件 / 命令 | `read`、`write`、`edit`、`bash`，以及用户 `!` / `!!` |
| 远程文件 / 命令 | `remote_read`、`remote_write`、`remote_edit`、`remote_bash` |
| SSH 连接、目录、端口转发等管理 | `remote`，以及用户 `/remote` |

远程相对路径基于远程 cwd，绝对路径原样指向远端；`remote_*` 不会回退到本地。文件复制直接走 SFTP，不经过模型上下文。用 `/remote off` 断开连接。

修改版保留上游主机密钥确认、凭据缓存、会话恢复、服务器记忆、输出限额和端口转发。`pi-simple-permissions` 的本地沙箱和审批不会自动覆盖 `remote_*` 或 `remote` 的 exec 操作，需要远程审批时应配置识别这些工具的独立策略。

## 维护

安装依赖并运行九插件联合测试：

```bash
npm ci
npm test
npm run pack:check
```

维护约定：

- 根 package 是私有兼容性测试工程，不作为 Pi Package 发布。
- 六个上游包位于根 `devDependencies`，精确版本和传递依赖记录在 `package-lock.json`。
- `extensions/statusline`、`extensions/pi-ssh-remote` 与 `extensions/pi-simple-permissions` 是可独立发布的 npm workspaces，各自拥有 `package.json` 和 `pi` manifest。
- 升级兼容性基线时更新依赖和锁文件，检查上游资源入口，再运行 `npm test`。
- SSH 上游提交和本地差异见 [UPSTREAM.md](extensions/pi-ssh-remote/UPSTREAM.md)。同步时保留显式工具语义，并运行远程回归测试。
- 权限插件的上游基准与 Git 判定差异见 [UPSTREAM.md](extensions/pi-simple-permissions/UPSTREAM.md)。它用 shell 词法器加参数级白名单替换上游的正则判定，修误报时不要退回正则。
- SSH 测试使用内存传输模拟，不需要服务器凭据；真实服务器的认证、SFTP 和端口转发仍需按实际环境验证。
- 发布前通过 `npm run pack:check` 检查三个 tarball 的文件清单、依赖和体积。

## 许可

本仓库自有代码采用 [MIT](LICENSE)。各上游 npm 包保留自己的许可证；SSH 上游 MIT 版权声明保存在 [extensions/pi-ssh-remote/LICENSE](extensions/pi-ssh-remote/LICENSE)。
