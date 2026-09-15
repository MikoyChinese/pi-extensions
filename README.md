# Mikoy 的 pi 扩展合集

一次安装常用 pi 插件，每个插件一个目录。npm 插件使用固定版本依赖和薄入口，保留上游源码、资源和模块解析位置；`statusline.ts` 与修改版 `pi-ssh-remote` 直接收录在仓库中。

## 安装

需要 Node.js 22+ 和已安装的 pi。合集测试使用 pi `0.84.1`，生产依赖安装后也已通过 pi `0.85.1` 的九插件加载检查；部分上游插件声明了较窄的 pi peer 版本范围，升级时请一起验证。

```bash
pi install https://github.com/MikoyChinese/pi-extensions.git
```

安装后重启 pi 或执行 `/reload`。Git 安装会自动执行 npm 安装依赖，无需逐个安装插件，也无需手动构建 TypeScript。

仅安装到当前项目：

```bash
pi install -l https://github.com/MikoyChinese/pi-extensions.git
```

从本地检出安装：

```bash
npm ci
pi install .
```

更新合集：

```bash
pi update git:github.com/MikoyChinese/pi-extensions
```

禁用某个插件可使用 `pi config`。如果之前已单独安装这些插件，请先通过 `pi remove <原安装源>` 或 `pi config` 禁用重复项，再启用合集；尤其是原版 `pi-ssh-remote` 和全局 `~/.pi/agent/extensions/statusline.ts`。pi 不会把合集内的入口和独立安装的同一个插件自动视为同一个资源。

## 插件列表

| 插件 | 版本 | 简短说明 | 目录 |
| --- | --- | --- | --- |
| [@juicesharp/rpiv-ask-user-question](https://www.npmjs.com/package/@juicesharp/rpiv-ask-user-question) | 2.10.1 | 结构化问答，支持选项、多选和自定义回答。 | [rpiv-ask-user-question](extensions/rpiv-ask-user-question/) |
| [@tintinweb/pi-tasks](https://www.npmjs.com/package/@tintinweb/pi-tasks) | 0.9.0 | 任务创建、状态追踪、依赖管理及子代理协调；使用 `src/index.ts`。 | [pi-tasks](extensions/pi-tasks/) |
| [pi-cc-extensions](https://github.com/minuque/pi-cc-extensions) | 0.8.71 | Claude Code 风格界面、上下文查看、会话及代理引用；包含深浅主题。 | [pi-cc-extensions](extensions/pi-cc-extensions/) |
| [pi-mcp-adapter](https://github.com/nicobailon/pi-mcp-adapter) | 2.33.0 | MCP 服务器连接、工具发现和调用；包含上游 MCP 技能。 | [pi-mcp-adapter](extensions/pi-mcp-adapter/) |
| [pi-simple-permissions](https://www.npmjs.com/package/pi-simple-permissions) | 1.0.3 | 本地 bash 沙箱与文件写入权限确认。 | [pi-simple-permissions](extensions/pi-simple-permissions/) |
| [pi-smart-fetch](https://github.com/Thinkscape/agent-smart-fetch) | 0.3.17 | 浏览器 TLS 指纹模拟和网页正文提取；使用 `dist/index.js`。 | [pi-smart-fetch](extensions/pi-smart-fetch/) |
| [pi-smart-web-search](https://github.com/joematthews/pi-smart-web-search) | 0.4.0 | 批量网页搜索，输出适合后续抓取的结果。 | [pi-smart-web-search](extensions/pi-smart-web-search/) |
| statusline.ts | 本地收录 | 展示模型、思考级别、上下文占用、目录和 Git 状态，并保留其他扩展状态。 | [statusline](extensions/statusline/) |
| [pi-ssh-remote（修改版）](extensions/pi-ssh-remote/README.md) | 基于 0.1.12 | 显式 `remote_*` SSH 工具、持久远程目录、重连与端口转发，不覆盖本地工具。 | [pi-ssh-remote](extensions/pi-ssh-remote/) |

清单中的 `:src` 和 `:dist` 表示上游资源目录，不是 npm 包名的一部分；合集已在入口中明确选择对应文件。插件的原有配置方式保持不变，例如 MCP 服务器配置仍由 `pi-mcp-adapter` 管理。

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

例如告诉 pi：“用 `remote_read` 查看远端 README，再用 `remote_bash` 运行测试”。远程相对路径基于远程 cwd，绝对路径原样指向远端；`remote_*` 不会回退到本地。文件复制使用 `/remote upload LOCAL_PATH REMOTE_PATH` 和 `/remote download REMOTE_PATH LOCAL_PATH`，数据直接走 SFTP，不经过模型上下文。用 `/remote off` 断开连接。

修改版保留上游主机密钥确认、凭据缓存、会话恢复、服务器记忆、输出限额和端口转发。**`pi-simple-permissions` 的本地沙箱和审批不会自动覆盖 `remote_*` 或 `remote` 的 exec 操作。** 需要远程审批时，应使用识别这些名称及 `remote.action` 的独立策略。SSH 不再争用原生工具名，但任意第三方扩展之间的其他命令、界面或策略冲突仍需分别验证。

## 维护

```bash
npm ci
npm test
npm pack --dry-run
```

- 根 `package.json` 的 `pi` 清单声明九个扩展入口、CC 主题与 MCP 技能。
- npm 插件的确切版本记录在 `dependencies`，传递依赖记录在 `package-lock.json`。Git 安装由 pi 执行 `npm install`；维护时用 `npm ci` 复现锁定依赖。
- `bundledDependencies` 使 npm 打包包含上游 pi 包及其资源。SSH 依赖 `ssh2` 在根目录声明。
- 升级上游 npm 插件时，更新版本、锁文件、目录 README 和本表，检查入口及资源路径后运行测试。
- SSH 上游提交和本地差异见 [UPSTREAM.md](extensions/pi-ssh-remote/UPSTREAM.md)。同步上游时保留显式工具语义，并运行回归测试。
- 测试使用真实 pi 加载器检查合集入口与工具重名；SSH 回归测试使用内存传输模拟，验证工具行为，不需要服务器凭据。真实服务器的认证、SFTP 和端口转发仍需按实际环境验证。
- 已验证隔离配置下 `pi install <本地仓库路径>`、干净目录 `npm ci --omit=dev` 和 `npm pack --dry-run`。GitHub URL 安装需要先将本仓库内容推送到目标仓库。
- npm 打包包含上游依赖，当前干跑估计约 73 MB 压缩体积。GitHub 安装仍通过 npm 获取依赖；合集不宣称离线安装或所有操作系统都已验证。

## 许可

合集自有代码采用 [MIT](LICENSE)。各 npm 依赖保留自己的许可证；SSH 上游 MIT 版权声明保存在 [extensions/pi-ssh-remote/LICENSE](extensions/pi-ssh-remote/LICENSE)。
