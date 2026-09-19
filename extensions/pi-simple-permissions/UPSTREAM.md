# 上游来源

- 仓库：https://github.com/Lytherion/pi-simple-permissions
- 上游版本：1.0.3
- 基准提交：[`924a52aff77d850deabce5c859327b5ed38a5316`](https://github.com/Lytherion/pi-simple-permissions/commit/924a52aff77d850deabce5c859327b5ed38a5316)
- 原作者：lvyiqiang
- 许可：上游仓库未附 LICENSE 文件，`package.json` 声明 MIT；本目录 LICENSE 保留上游版权署名。

`index.ts` 基于该提交修改；`UPSTREAM-README.md` 是该提交的未修改参考快照，不是本目录的行为文档。

## 本地修改

上游用一条正则扫描整条命令字符串来判断 Git 操作是否需要审批，误报率很高：实测 227 条真实历史命令中，上游弹框 134 次，其中 103 次是纯只读或与 Git 无关的命令（精确率 23%）。本地实现只替换这一个判定环节，其余行为完全保留。

改动共三处：

1. 删除上游的 `READ_ONLY_GIT`、`gitSubcommands`、`mutatesGit` 三个定义。
2. 新增 `git-policy.ts`，导出签名完全兼容的 `mutatesGit(command)`。
3. `index.ts` 从 `./git-policy.ts` 导入 `mutatesGit`，并把提示词中「Mutating Git commands」一句改为显式列出红线。

`git-policy.ts` 内部：

- **词法层**：单遍 shell 词法器区分 WORD/OP，剥离引号与 heredoc 正文，只在命令位、且词元恰好等于 `git` 时识别；跳过 `git` 全局选项表与 `VAR=val`/`env`/`sudo`/`timeout N` 等前缀；递归处理 `sh -c`/`-lc`/`eval` 及包装器 `--` 之后的内容。
- **策略层**：参数级只读白名单。无条件只读子命令（`status`、`log`、`diff` 等）直接放行；`branch`、`tag`、`stash`、`config`、`clean` 等子命令需参数匹配才放行；**未列举的一律审批**（`add`、`commit`、`push`、`fetch`、`clone`、`reset`、`merge`、`rebase`、`checkout`、`rm` 等）。

结果：同样的 227 条历史命令，弹框降到 33 次，误报 0、漏报 0。

## 同步流程

下载新的上游提交到临时目录，将上游变更与当前修改比较，更新本目录源码、`UPSTREAM-README.md` 快照及本文件基准提交，保留 LICENSE，运行根目录 `npm test`。不要直接用上游 `index.ts` 覆盖本地实现，否则会退回正则判定。
