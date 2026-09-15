# 上游来源

- 仓库：https://github.com/petrichor20211/pi-ssh-remote
- 上游版本：0.1.12
- 基准提交：[`a72d628a04e10c50534712254c0661782b387d1c`](https://github.com/petrichor20211/pi-ssh-remote/commit/a72d628a04e10c50534712254c0661782b387d1c)
- 原作者：Yutong Bian
- 许可：MIT，见本目录 LICENSE。

`index.ts` 基于该提交修改；`UPSTREAM-README.md` 和 `UPSTREAM-CHANGELOG.md` 是该提交的未修改参考快照，不是合集的行为文档。

本地修改：原生工具改为显式 `remote_*`；移除本地执行回退、用户 shell 拦截、本地路径映射及隐式路由状态；追加远程提示而不替换本地 cwd；转发期间仍可用远程工具；状态输出标注显式远端目标；远程 edit 文本输出计入预算。

同步流程：下载新的上游提交到临时目录，将上游变更与当前修改比较，更新本目录源码、快照及本文件基准提交，保留 LICENSE，运行根目录 `npm test` 并检查实际 SSH 连接。不要直接用上游 index.ts 覆盖本地实现，否则会重新引入原生工具冲突。
