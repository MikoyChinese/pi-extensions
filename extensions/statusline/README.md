# statusline.ts

这个 pi 扩展使用自定义 footer 显示模型、思考级别、上下文使用量、目录、Git 分支及暂存 / 未暂存 / 未追踪文件计数。

其他扩展通过 `ctx.ui.setStatus()` 设置的状态会继续逐行显示。Git 状态通过文件监听、会话事件和定时刷新更新。

通过 `pi install npm:@mikoychinese/pi-statusline` 安装。安装前请禁用原来全局单文件入口，避免两个 footer 实例重复工作。其他扩展若也使用 `setFooter()`，仍可能互相替换；pi 的 footer 是单一槽位。
