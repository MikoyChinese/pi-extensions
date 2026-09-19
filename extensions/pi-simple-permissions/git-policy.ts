// ============================================================
// Git 命令权限判定：shell 词法器 + 参数级白名单
// 无类型注解，既是合法 TS 也是合法 JS
// ============================================================

// ---------- 1) shell 词法器：区分 WORD / OP，剥离引号 ----------
function lexGitTokens(src) {
  const out = [];
  let i = 0, cur = "", has = false;
  const flush = () => { if (has) out.push({ t: "w", v: cur }); cur = ""; has = false; };
  while (i < src.length) {
    const c = src[i];
    if (c === "\\") {
      if (src[i + 1] === "\n") { i += 2; continue; }
      cur += src[i + 1] ?? ""; has = true; i += 2; continue;
    }
    if (c === "'") { has = true; i++; while (i < src.length && src[i] !== "'") cur += src[i++]; i++; continue; }
    if (c === '"') {
      has = true; i++;
      while (i < src.length && src[i] !== '"') {
        if (src[i] === "\\" && '"\\$`'.includes(src[i + 1])) { cur += src[i + 1]; i += 2; }
        else cur += src[i++];
      }
      i++; continue;
    }
    if (c === "\n") { flush(); out.push({ t: "op", v: "\n" }); i++; continue; }
    if (/\s/.test(c)) { flush(); i++; continue; }
    const two = src.slice(i, i + 2);
    if (["&&", "||", ">>", "<<", "&>", "2>", "2>&"].includes(two)) {
      flush(); out.push({ t: "op", v: two }); i += 2; continue;
    }
    if (";|&><(){}".includes(c)) { flush(); out.push({ t: "op", v: c }); i++; continue; }
    cur += c; has = true; i++;
  }
  flush();
  return out;
}

// ---------- 2) 剥离 heredoc 正文（正文是数据，不是命令）----------
function stripGitHeredoc(cmd) {
  const out = [];
  let end = null, loose = false;
  for (const line of cmd.split("\n")) {
    if (end !== null) { if (line.trim() === end) end = null; continue; }
    const m = line.match(/<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/);
    out.push(line);
    if (m) { end = m[2]; if (!m[1]) loose = true; }
  }
  return { text: out.join("\n"), loose };
}

// ---------- 3) git 全局选项表 ----------
const GIT_OPT_VALUE = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path", "--config-env"]);
const GIT_OPT_FLAG = new Set([
  "--no-pager", "-p", "-P", "--paginate", "--bare", "--no-replace-objects",
  "--literal-pathspecs", "--glob-pathspecs", "--noglob-pathspecs", "--icase-pathspecs",
  "--no-optional-locks", "--html-path", "--man-path", "--info-path",
]);
const GIT_WRAPPER = new Set(["env", "sudo", "command", "nohup", "time", "nice", "ionice", "setsid", "stdbuf", "doas", "timeout"]);
const GIT_ASSIGN = /^[A-Za-z_][A-Za-z0-9_]*=/;
const GIT_SHELL = new Set(["sh", "bash", "zsh", "dash", "ksh"]);
const GIT_SEP = new Set([";", "&&", "||", "|", "\n", "&", "(", ")", "{", "}"]);

// ---------- 4) 词元流扫描 → 真实 git 调用 ----------
function scanGitTokens(input, depth, loose) {
  if (depth > 4) return [];
  const toks = input.map((v) => (typeof v === "string" ? { t: "w", v } : v));

  const segs = [];
  let cur = [];
  for (const tk of toks) {
    if (tk.t === "op" && GIT_SEP.has(tk.v)) { if (cur.length) segs.push(cur); cur = []; }
    else if (tk.t === "w") cur.push(tk.v);
  }
  if (cur.length) segs.push(cur);

  const found = [];
  for (const seg of segs) {
    let p = 0;
    while (p < seg.length && (GIT_ASSIGN.test(seg[p]) || GIT_WRAPPER.has(seg[p]) || /^\d+[smhd]?$/.test(seg[p]))) p++;
    if (p >= seg.length) continue;

    // shell -c / -lc / -ec …：参数是命令字符串，重新词法化
    const si = seg.findIndex((x, k) => GIT_SHELL.has(x) && /^-[a-z]*c[a-z]*$/.test(seg[k + 1] ?? ""));
    if (si >= 0 && seg[si + 2] !== undefined) {
      found.push(...collectGitCalls(seg.slice(si + 2).join(" "), depth + 1)); continue;
    }
    const ei = seg.indexOf("eval");
    if (ei >= 0 && seg[ei + 1] !== undefined) {
      found.push(...collectGitCalls(seg.slice(ei + 1).join(" "), depth + 1)); continue;
    }
    // 包装器 `--` 之后仍是词元序列：并集追加，不丢弃正常解析
    const dd = seg.indexOf("--");
    if (dd >= 0 && dd + 1 < seg.length) found.push(...scanGitTokens(seg.slice(dd + 1), depth + 1, loose));

    if (seg[p] !== "git") continue;              // 词元必须恰好等于 "git"
    let j = p + 1;
    while (j < seg.length) {
      if (GIT_OPT_VALUE.has(seg[j])) { j += 2; continue; }
      if ([...GIT_OPT_VALUE].some((g) => seg[j].startsWith(g + "="))) { j++; continue; }
      if (GIT_OPT_FLAG.has(seg[j])) { j++; continue; }
      break;
    }
    if (j < seg.length && !seg[j].startsWith("-")) {
      found.push({ sub: seg[j], args: seg.slice(j + 1), loose });
    }
  }
  return found;
}

function collectGitCalls(cmd, depth = 0) {
  if (depth > 4) return [];
  const { text, loose } = stripGitHeredoc(cmd);
  return scanGitTokens(lexGitTokens(text), depth, loose);
}

// ---------- 5) 策略：参数级白名单 ----------
// 无条件只读
const GIT_READ_ONLY = new Set([
  "status", "log", "diff", "show", "grep", "ls-files", "ls-tree", "rev-parse", "describe", "blame",
  "shortlog", "rev-list", "merge-base", "show-ref", "for-each-ref", "symbolic-ref",
  "cat-file", "ls-remote", "check-ignore", "count-objects", "diff-tree", "diff-index", "diff-files",
  "name-rev", "cherry", "var", "annotate", "version", "help", "whatchanged", "verify-commit",
  "verify-tag", "get-tar-commit-id", "--version", "--help",
]);

// 条件只读：子命令本身可能改变状态，仅当参数匹配时才是"纯读取"
const GIT_READ_ONLY_WHEN = [
  // 列表/查看模式：无参数默认只列不写
  [/^branch$/, (a) => a.length === 0 || a.every((x) => /^(--show-current|-a|--all|-r|--remotes|-v|--verbose|-l|--list|--contains|--merged|--no-merged|--points-at|--format=|--sort=|--color)/.test(x))],
  [/^tag$/, (a) => a.length === 0 || a.every((x) => /^(-l|--list|-n\d*|--contains|--points-at|--format=|--sort=|--color)/.test(x))],
  [/^remote$/, (a) => a.length === 0 || a.every((x) => /^(-v|--verbose|show|get-url)/.test(x))],
  [/^stash$/, (a) => a.length === 0 || a[0] === "list" || a[0] === "show"],
  [/^config$/, (a) => a.some((x) => /^(--get|--get-all|--get-regexp|--list|-l|--get-urlmatch|--get-color)$/.test(x))],
  [/^worktree$/, (a) => a.length === 0 || a[0] === "list"],
  [/^notes$/, (a) => a.length === 0 || a[0] === "list" || a[0] === "show"],
  [/^submodule$/, (a) => a[0] === "status" || a[0] === "summary"],
  [/^reflog$/, (a) => !/^(expire|delete)$/.test(a[0] ?? "")],
  [/^update-ref$/, (a) => a.length === 0],          // 无参 = 查询
  [/^clean$/, (a) => a.some((x) => /^(-n|--dry-run)$/.test(x))],   // 仅 dry-run
  [/^fsck$/, () => true],
];
// 注意：commit / checkout / gc / add / fetch / push / merge / rebase 等
// 即使有"温和"用法，也会改变状态，因此一律落入"未列举" → 审批。

function isReadOnlyGitCall(call) {
  if (GIT_READ_ONLY.has(call.sub)) return true;
  for (const [re, ok] of GIT_READ_ONLY_WHEN) if (re.test(call.sub)) return ok(call.args);
  return false;                        // 未列举 → 需审批
}

export function mutatesGit(command) {
  return collectGitCalls(command).some((call) => !isReadOnlyGitCall(call));
}
