/**
 * statusline.ts — pi 版 "Claude Code statusline"
 *
 * 用自定义 footer 替换 pi 内置 footer，在输入框下方显示两段内容：
 *
 *   第 1 行：Claude Code statusline 风格的上下文状态行
 *     MODEL ⚡ EFFORT ┃ ▮▮▮▮▮▯▯▯▯ PCT% (USAGE/SIZE) ┃ 📁DIR❯🌿BRANCH +N ~N ?N
 *   第 2 行起：其他扩展通过 ctx.ui.setStatus() 设置的状态（各占一行），
 *     例如 pi-claude-permissions 的 "⏵⏵⏵⏵ Bypass Permissions"。
 *
 * 原脚本是 bash + jq，从 stdin 读 Claude Code 的 statusline JSON；pi 没有
 * 这条 JSON 管道，因此本插件改用 pi 扩展 API 的等价数据源：
 *
 *   .model.display_name                -> ctx.model.name / ctx.model.id
 *   .effort.level                      -> ctx.thinkingLevel（off 映射为 none）
 *   .cwd                               -> ctx.cwd
 *   .context_window.current_usage.*    -> ctx.getContextUsage().tokens
 *   .context_window.context_window_size-> ctx.getContextUsage().contextWindow
 *   .context_window.remaining_percentage -> ctx.getContextUsage().percent
 *
 * git 部分与原脚本逐条一致（git -C <cwd> ...），并监听 .git 变化实时刷新。
 *
 * 发布包：@mikoychinese/pi-statusline（通过 pi package manifest 加载）
 * 配色/分段/格式化均与原脚本的 ANSI 256 色序列一一对应。
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, watch, type FSWatcher } from "node:fs";
import { basename, isAbsolute, join } from "node:path";

const execFileAsync = promisify(execFile);

/** 与原脚本转义序列一一对应的 ANSI 256 色辅助 */
const A = {
  bold: "\u001b[1m",
  dim: "\u001b[2m",
  reset: "\u001b[0m",
  fg: (n: number): string => `\u001b[38;5;${n}m`,
};

// ---------------------------------------------------------------------------
// git：与原脚本命令逐条一致
// ---------------------------------------------------------------------------

/** 执行 git 命令（-C cwd + --no-optional-locks），失败返回空串 */
async function git(cwd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["-C", cwd, "--no-optional-locks", ...args],
      { timeout: 5000, maxBuffer: 4 * 1024 * 1024, windowsHide: true },
    );
    return stdout;
  } catch {
    return "";
  }
}

/** 与 `... | wc -l` 等价：按行数计数，空输出为 0 */
function countLines(out: string): number {
  const trimmed = out.trim();
  return trimmed ? trimmed.split("\n").length : 0;
}

interface GitState {
  branch: string;
  staged: number;
  unstaged: number;
  untracked: number;
}

/** 非仓库返回 null；在仓库内恒返回（含 0 计数），分支名为空时显示 no-git */
async function getGitState(cwd: string): Promise<GitState | null> {
  const gitDir = await git(cwd, ["rev-parse", "--git-dir"]);
  if (!gitDir.trim()) return null;

  let branch = (
    await git(cwd, ["-c", "core.useBuiltinFSMonitor=false", "branch", "--show-current"])
  ).trim();
  if (!branch) branch = "no-git";

  const staged = countLines(await git(cwd, ["diff", "--cached", "--name-only"]));
  const unstaged = countLines(await git(cwd, ["diff", "--name-only"]));
  const untracked = countLines(await git(cwd, ["ls-files", "--others", "--exclude-standard"]));
  return { branch, staged, unstaged, untracked };
}

// ---------------------------------------------------------------------------
// 格式化：与原脚本的 awk 版 fmt 行为一致（>=1M -> "x.xM"，>=1K -> "x.xK"，去掉 .0）
// ---------------------------------------------------------------------------

function stripZero(s: string): string {
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${stripZero((n / 1_000_000).toFixed(1))}M`;
  if (n >= 1_000) return `${stripZero((n / 1_000).toFixed(1))}K`;
  return String(n);
}

// ---------------------------------------------------------------------------
// 状态行渲染：布局与配色逐字符对齐原脚本
// ---------------------------------------------------------------------------

function buildStatus(opts: {
  model: string;
  effort: string;
  pct: number;
  usage: number;
  ctxSize: number;
  dir: string;
  git: GitState | null;
}): string {
  const { model, effort, pct, usage, ctxSize, dir, git } = opts;

  // 10 格进度条：FILLED=(PCT+5)/10（整数除法），超过 80% 红、超过 50% 黄、否则绿
  const filled = Math.min(10, Math.max(0, Math.floor((pct + 5) / 10)));
  const barClr = pct > 80 ? 196 : pct > 50 ? 220 : 78;
  let bar = "";
  for (let i = 0; i < filled; i++) bar += `${A.fg(barClr)}•`;
  for (let i = 0; i < 10 - filled; i++) bar += `${A.fg(240)}·`;
  bar += A.reset;

  const ctxClr = pct > 80 ? 196 : pct > 50 ? 220 : 78;

  // git 段：仓库内恒显示 +N ~N ?N（+ 绿 78、~ 红 196、? 黄 220）
  let gitState = "";
  if (git) {
    gitState =
      ` ${A.fg(78)}+${git.staged}${A.reset}` +
      ` ${A.fg(196)}~${git.unstaged}${A.reset}` +
      ` ${A.fg(220)}?${git.untracked}${A.reset}`;
  }

  return (
    // 模型段：与原脚本一致用合并序列 \033[38;5;111;1m（颜色 111 + 加粗）
    `\u001b[38;5;111;1m${model}${A.reset}` +
    ` ${A.fg(141)}⚡ ${effort}${A.reset}` + //   \033[38;5;141m⚡ $EFFORT\033[0m
    ` ${A.dim}${A.fg(240)}┃${A.reset}` + //     \033[2m\033[38;5;240m┃\033[0m
    ` ${bar}` + //                              $BAR（已含尾部 reset）
    ` ${A.fg(ctxClr)}${A.bold}${pct}%${A.reset}` + // ${CTX_CLR}\033[1m$PCT%\033[0m
    ` ${A.fg(ctxClr)}(${fmt(usage)}/${fmt(ctxSize)})${A.reset}` + // ${CTX_CLR}(...)\033[0m
    ` ${A.dim}${A.fg(240)}┃${A.reset}` + //     \033[2m\033[38;5;240m┃\033[0m
    ` ${A.fg(111)}📁${dir}${A.reset}` + //      \033[38;5;111m📁$DIR\033[0m
    `${A.dim}${A.fg(240)}❯${A.reset}` + //      \033[2m\033[38;5;240m❯\033[0m
    `${A.fg(117)}🌿${git?.branch ?? "no-git"}${A.reset}` + // \033[38;5;117m🌿$BRANCH\033[0m
    gitState
  );
}

/** 与内置 footer 相同的清理：去掉换行/制表符并折叠连续空格 */
function sanitize(text: string): string {
  return text.replace(/[\r\n\t]/g, " ").replace(/ +/g, " ").trim();
}

// ---------------------------------------------------------------------------
// 主逻辑
// ---------------------------------------------------------------------------

/** 只用到 requestRender 的 TUI 最小结构类型 */
interface TuiLike {
  requestRender(force?: boolean): void;
}

export default function (pi: ExtensionAPI): void {
  let lastLine = "";
  let refreshing = false;
  let refreshPending = false;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let refreshInterval: ReturnType<typeof setInterval> | null = null;
  let watchers: FSWatcher[] = [];
  let currentCtx: ExtensionContext | undefined;
  let tuiRef: TuiLike | undefined;

  function teardownWatchers(): void {
    for (const w of watchers) {
      try {
        w.close();
      } catch {
        /* ignore */
      }
    }
    watchers = [];
  }

  /** 计算状态行（含 git），仅在内容变化时更新并请求重绘 */
  async function refresh(ctx: ExtensionContext): Promise<void> {
    if (refreshing) {
      refreshPending = true;
      return;
    }
    refreshing = true;
    try {
      const line = await computeLine(ctx);
      if (line !== lastLine) {
        lastLine = line;
        tuiRef?.requestRender();
      }
    } catch {
      // 状态行渲染失败不影响 pi 主流程
    } finally {
      refreshing = false;
      if (refreshPending) {
        refreshPending = false;
        void refresh(ctx);
      }
    }
  }

  /** 事件突发（turn_end + agent_settled 等）合并为一次刷新 */
  function scheduleRefresh(ctx: ExtensionContext): void {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void refresh(ctx);
    }, 150);
  }

  /** 监听 .git 变化（分支切换/文件增删/提交），让计数实时更新 */
  async function setupGitWatcher(ctx: ExtensionContext): Promise<void> {
    teardownWatchers();
    try {
      const raw = (await git(ctx.cwd, ["rev-parse", "--git-dir"])).trim();
      if (!raw) return;
      const gitDir = isAbsolute(raw) ? raw : join(ctx.cwd, raw);

      const onEvent = () => scheduleRefresh(ctx);
      const tryWatch = (target: string): void => {
        try {
          if (existsSync(target)) {
            watchers.push(watch(target, { persistent: false }, onEvent));
          }
        } catch {
          /* 平台不支持等，忽略 */
        }
      };

      tryWatch(join(gitDir, "HEAD"));
      tryWatch(join(gitDir, "index"));
      tryWatch(join(gitDir, "packed-refs"));
      try {
        if (existsSync(join(gitDir, "refs"))) {
          try {
            // 优先递归监听 refs/（分支引用变化），不支持则退回 refs/heads
            watchers.push(
              watch(join(gitDir, "refs"), { persistent: false, recursive: true }, onEvent),
            );
          } catch {
            tryWatch(join(gitDir, "refs", "heads"));
          }
        }
      } catch {
        /* ignore */
      }
    } catch {
      /* git 不可用时跳过监听 */
    }
  }

  /** 组装状态行：把 pi 上下文映射到原脚本的字段 */
  async function computeLine(ctx: ExtensionContext): Promise<string> {
    const model = ctx.model?.name || ctx.model?.id || "Claude";

    // pi 的 thinking 级别 off/minimal/low/medium/high/xhigh/max；
    // 与原脚本 effort.level（none/low/medium/high）对齐：off -> none
    const rawEffort = ctx.thinkingLevel ?? "off";
    const effort = rawEffort === "off" ? "none" : rawEffort;

    const usage = ctx.getContextUsage();
    const tokens = usage?.tokens ?? 0;
    const ctxSize = usage?.contextWindow ?? ctx.model?.contextWindow ?? 200_000;

    // 与原脚本相同的两分支：
    //   有 remaining_percentage 时：PCT = 100 - floor(remaining)
    //     （Claude Code 上报的 remaining 是整数，等效于对占用百分比向上取整）
    //   否则按 (usage/size*100) 向下取整
    let pct: number;
    if (usage?.percent != null) {
      pct = 100 - Math.floor(100 - usage.percent);
    } else if (ctxSize > 0) {
      pct = Math.floor((tokens * 100) / ctxSize);
    } else {
      pct = 0;
    }
    pct = Math.min(100, Math.max(0, pct));

    const dir = basename(ctx.cwd) || ctx.cwd || "~";
    const gitState = await getGitState(ctx.cwd);

    return buildStatus({ model, effort, pct, usage: tokens, ctxSize, dir, git: gitState });
  }

  // ---- 事件绑定 ----

  pi.on("session_start", async (_event, ctx) => {
    currentCtx = ctx;
    teardownWatchers();
    void setupGitWatcher(ctx);
    void refresh(ctx);

    // 兜底定时刷新（fs.watch 漏报时保证最终一致）
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(() => {
      if (currentCtx) void refresh(currentCtx);
    }, 30_000);
    refreshInterval.unref?.();

    // 用自定义 footer 替换内置 footer（输入框正下方）：
    //   第 1 行 = 本插件的状态行
    //   其余行 = 其他扩展 setStatus 的状态，各占一行（如 "⏵⏵⏵⏵ Bypass Permissions"）
    if (ctx.hasUI) {
      ctx.ui.setFooter((tui, theme, footerData) => {
        tuiRef = tui;
        const ellipsis = theme.fg("dim", "...");
        return {
          render(width: number): string[] {
            const lines: string[] = [truncateToWidth(lastLine || " ", width, ellipsis)];
            const others = Array.from(footerData.getExtensionStatuses().entries())
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([, text]) => truncateToWidth(sanitize(text), width, ellipsis));
            for (const line of others) lines.push(line);
            return lines;
          },
          invalidate() {
            tuiRef?.requestRender();
          },
          dispose() {
            // 会话切换时由 pi 调用；session_shutdown 处理器也会兜底清理
          },
        };
      });
    }
  });

  // 每轮对话结束后刷新上下文占用（usage 只有在响应后才会更新）
  pi.on("turn_end", (_event, ctx) => {
    currentCtx = ctx;
    scheduleRefresh(ctx);
  });

  // 代理整体安定后刷新一次（含自动重试/自动压缩后的最终状态）
  pi.on("agent_settled", (_event, ctx) => {
    currentCtx = ctx;
    scheduleRefresh(ctx);
  });

  // 模型切换
  pi.on("model_select", (_event, ctx) => {
    currentCtx = ctx;
    scheduleRefresh(ctx);
  });

  // thinking 级别切换
  pi.on("thinking_level_select", (_event, ctx) => {
    currentCtx = ctx;
    scheduleRefresh(ctx);
  });

  // 会话结束/切换：清理 watcher 与定时器
  pi.on("session_shutdown", () => {
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = null;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = null;
    teardownWatchers();
    currentCtx = undefined;
    tuiRef = undefined;
    lastLine = "";
  });
}
