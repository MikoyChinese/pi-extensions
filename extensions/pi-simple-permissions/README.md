# Pi Simple Permissions（修改版）

[English](#english) | [中文](#中文)

<a name="english"></a>
## English

A fork of [pi-simple-permissions](https://github.com/Lytherion/pi-simple-permissions) that replaces the Git approval heuristic with a shell-lexer plus parameter-level allowlist and hardens bash permission arguments against null-like model output.

Upstream decided whether a Git command needed approval by running one regular expression over the whole command string. That produced heavy false positives: replaying 227 real commands from local sessions, upstream prompted 134 times, 103 of which were pure reads or had nothing to do with Git (23% precision).

This fork changes the Git approval decision and adds defensive normalization for bash permission arguments. The three permission modes, the `bwrap` sandbox, `write`/`edit` path checks, `/permission`, `Alt+M`, and session persistence otherwise retain the upstream behavior.

### What changed

- Deleted upstream `READ_ONLY_GIT`, `gitSubcommands`, `mutatesGit`.
- Added `git-policy.ts`, exporting a signature-compatible `mutatesGit(command)`.
- `index.ts` imports `mutatesGit` from `./git-policy.ts` and states the Git red lines explicitly in its prompt.
- Added an explicit `use_sandbox` bash permission value and a `prepareArguments()` compatibility shim. Missing, `null`, `"null"`, and empty permission values safely normalize to `use_sandbox`; unknown values still fail schema validation.

`git-policy.ts` does two things:

- **Lexing** — a single-pass shell lexer separates WORD from OP, strips quotes and heredoc bodies, and only recognizes `git` at command position when the token is exactly `git`. It skips Git's global option table and `VAR=val` / `env` / `sudo` / `timeout N` prefixes, and it recurses into `sh -c`, `-lc`, `eval`, and anything after a wrapper's `--`.
- **Policy** — a parameter-level read-only allowlist. Unconditionally read-only subcommands (`status`, `log`, `diff`, …) pass. Parameter-sensitive subcommands (`branch`, `tag`, `stash`, `config`, `clean`, …) pass only for their read-only argument forms. **Everything unlisted requires approval**, including `add`, `commit`, `push`, `fetch`, `clone`, `reset`, `merge`, `rebase`, `checkout` and `rm`.

### Result

Same 227 commands: prompts drop from 134 to 33, with zero false positives and zero misses.

### Installation

```bash
pi install npm:@mikoychinese/pi-simple-permissions
```

Requires `bubblewrap` (`bwrap`) for Auto mode. See [UPSTREAM.md](UPSTREAM.md) for the upstream baseline and the exact diff.

---

<a name="中文"></a>
## 中文

这是 [pi-simple-permissions](https://github.com/Lytherion/pi-simple-permissions) 的修改版：用「shell 词法器 + 参数级白名单」替换 Git 审批启发式规则，并增强 bash 权限参数对模型空值输出的兼容性。

上游用一条正则扫描整条命令字符串来判断 Git 操作是否需要审批，误报率很高：回放本地会话里 227 条真实命令，上游弹框 134 次，其中 103 次是纯只读或与 Git 无关的命令（精确率 23%）。

本版修改 Git 审批判定，并为 bash 权限参数增加防御性归一化。三档权限模式、`bwrap` 沙箱、`write`/`edit` 路径检查、`/permission` 命令、`Alt+M` 快捷键和会话状态持久化仍保留上游行为。

### 改动内容

- 删除上游的 `READ_ONLY_GIT`、`gitSubcommands`、`mutatesGit`。
- 新增 `git-policy.ts`，导出签名完全兼容的 `mutatesGit(command)`。
- `index.ts` 从 `./git-policy.ts` 导入 `mutatesGit`，并在提示词中显式列出 Git 红线。
- 新增明确的 `use_sandbox` bash 权限值和 `prepareArguments()` 兼容层。缺省、`null`、`"null"` 和空权限值会安全归一化为 `use_sandbox`，其他未知值仍无法通过 schema 校验。

`git-policy.ts` 做两件事：

- **词法层**：单遍 shell 词法器区分 WORD / OP，剥离引号与 heredoc 正文；只在命令位、且词元恰好等于 `git` 时才识别；跳过 Git 全局选项表与 `VAR=val` / `env` / `sudo` / `timeout N` 等前缀；递归处理 `sh -c`、`-lc`、`eval` 以及包装器 `--` 之后的内容。
- **策略层**：参数级只读白名单。无条件只读子命令（`status`、`log`、`diff` 等）直接放行；参数敏感的子命令（`branch`、`tag`、`stash`、`config`、`clean` 等）仅在其只读参数形式下放行；**未列举的一律审批**，包括 `add`、`commit`、`push`、`fetch`、`clone`、`reset`、`merge`、`rebase`、`checkout`、`rm` 等。

### 结果

同样 227 条命令：弹框从 134 次降到 33 次，误报 0、漏报 0。

### 安装

```bash
pi install npm:@mikoychinese/pi-simple-permissions
```

Auto 模式需要 `bubblewrap`（`bwrap`）。上游基准与完整差异见 [UPSTREAM.md](UPSTREAM.md)。
