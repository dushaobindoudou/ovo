/**
 * P0.12 / 反模式 6: 把 raw error.message 翻成「为什么发生 + 我能做什么」。
 *
 * 失败的错误体验是世界级和业余产品的最隐蔽分水岭。raw 报错对用户毫无价值，
 * 只会增加挫败感。这里集中维护 "raw → 用户友好文案" 的映射。
 *
 * 接入方式：
 *   - electron 端：catch (e) { const u = translateError(e); errorLogger.alert(...) }
 *   - renderer 端：通过 IPC 拿到 error 后调用 translateError 显示给用户
 *
 * 设计原则：
 *   1. 文案永远以用户为中心——告诉他「发生了什么 + 怎么办」
 *   2. 保留原 error.message 供 debug，仅 UI 展示翻译后的版本
 *   3. 未命中时降级展示 raw + 通用引导
 */

export interface TranslatedError {
  /** 给用户看的标题（一句话） */
  title: string;
  /** 给用户看的详细描述 + 怎么办 */
  detail: string;
  /** 建议的修复动作（用户视角） */
  action?: {
    label: string;
    /** 触发什么——交给上层处理（打开设置 / 重试 / 反馈） */
    type: "open-settings" | "open-permissions" | "retry" | "open-feedback" | "external-link";
    target?: string;
  };
  /** 原始 error message，调试用 */
  raw: string;
  /** 命中的规则名，用于 metrics */
  category: string;
}

interface Rule {
  category: string;
  pattern: RegExp;
  title: string;
  detail: string;
  action?: TranslatedError["action"];
}

const RULES: Rule[] = [
  // === macOS 权限类 ===
  {
    category: "permission.applescript",
    pattern: /not authorized|not allowed|-1743|automation permission/i,
    title: "需要「自动化」权限",
    detail: "Ovo 想用 macOS 自动化功能帮你做事，但系统还没授权。请到「系统设置 → 隐私与安全性 → 自动化」里把 Ovo 打开。",
    action: { label: "打开系统设置", type: "open-permissions", target: "automation" }
  },
  {
    category: "permission.screen-recording",
    pattern: /screen.*permission|TCC.*ScreenCapture|kTCCService.*Screen|屏幕录制权限/i,
    title: "需要「屏幕录制」权限",
    detail: "Ovo 看不到你的屏幕——这是它工作的基础。请到「系统设置 → 隐私与安全性 → 屏幕录制」里勾上 Ovo。",
    action: { label: "打开系统设置", type: "open-permissions", target: "screen" }
  },
  {
    category: "permission.accessibility",
    pattern: /accessibility|TCC.*Accessibility|kTCCService.*Accessibility|辅助功能/i,
    title: "需要「辅助功能」权限",
    detail: "Ovo 需要「辅助功能」权限才能准确识别当前活动窗口。请到「系统设置 → 隐私与安全性 → 辅助功能」勾上 Ovo。",
    action: { label: "打开系统设置", type: "open-permissions", target: "accessibility" }
  },

  // === 文件 / 磁盘 ===
  {
    category: "fs.not-found",
    pattern: /ENOENT|no such file/i,
    title: "找不到那个文件",
    detail: "文件可能被移动、重命名或删除了。检查路径，或者让 Ovo 重新扫描。",
  },
  {
    category: "fs.permission",
    pattern: /EACCES|EPERM|permission denied/i,
    title: "没有文件访问权限",
    detail: "Ovo 不能读写那个位置。如果是用户目录外的路径，可能需要授权完整磁盘访问。",
    action: { label: "打开磁盘权限设置", type: "open-permissions", target: "full-disk" }
  },
  {
    category: "fs.disk-full",
    pattern: /ENOSPC|disk full|no space left/i,
    title: "磁盘空间满了",
    detail: "本机磁盘空间不足，Ovo 无法保存截图和数据库。腾出几 GB 空间后重试。"
  },
  {
    category: "fs.readonly",
    pattern: /EROFS|read-only file system/i,
    title: "文件系统只读",
    detail: "存储位置变成只读了。重启 Mac 试试，或检查磁盘健康状态。"
  },

  // === 网络 / API ===
  {
    category: "net.offline",
    pattern: /ENETDOWN|ENETUNREACH|getaddrinfo ENOTFOUND|EAI_AGAIN|fetch failed/i,
    title: "网络连不通",
    detail: "Ovo 没法访问云端 AI 服务。检查网络连接，或切换到本地 AI 后端（Hermes / Claude Code）。",
    action: { label: "打开 AI 后端设置", type: "open-settings", target: "ai-backend" }
  },
  {
    category: "net.timeout",
    pattern: /ETIMEDOUT|request timeout|AbortError|signal is aborted|TimeoutError/i,
    title: "AI 调用超时了",
    detail: "云端 AI 服务响应太慢。可能是临时拥塞，再试一次；如果持续，换个后端。",
    action: { label: "重试", type: "retry" }
  },
  {
    category: "api.unauthorized",
    pattern: /401|unauthorized|invalid api key|invalid token/i,
    title: "API key 失效或错误",
    detail: "云端 AI 服务说你的 key 不对。可能过期、被吊销，或者粘贴时少了字符。重新填一遍。",
    action: { label: "打开 API 设置", type: "open-settings", target: "api-key" }
  },
  {
    category: "api.rate-limit",
    pattern: /429|rate limit|too many requests/i,
    title: "API 调用太密集被限速",
    detail: "短时间请求太多，云服务暂时限流。等 1-2 分钟自动恢复，或在设置里降低 AI 触发频率。",
    action: { label: "打开 AI 设置", type: "open-settings", target: "ai-backend" }
  },
  {
    category: "api.quota",
    pattern: /quota.*exceed|insufficient.*credit|account.*balance/i,
    title: "API 配额用光了",
    detail: "云端 AI 服务的余额或免费额度用完。切换到本地后端（Hermes / Claude Code），或去服务商充值。",
    action: { label: "打开 AI 后端设置", type: "open-settings", target: "ai-backend" }
  },
  {
    category: "api.server",
    pattern: /50[0-9]|bad gateway|service unavailable|internal server error/i,
    title: "AI 服务端临时故障",
    detail: "云端 AI 自己出问题了，跟你无关。稍等几分钟再试；如果一直不行，切换后端。",
    action: { label: "重试", type: "retry" }
  },

  // === SQLite / KG ===
  {
    category: "db.busy",
    pattern: /SQLITE_BUSY|database is locked/i,
    title: "数据库忙",
    detail: "另一个动作正在写数据库，Ovo 在等。通常稍后自己恢复，无需操作。"
  },
  {
    category: "db.constraint",
    pattern: /UNIQUE constraint|FOREIGN KEY constraint|CHECK constraint/i,
    title: "记忆存储冲突",
    detail: "Ovo 想存的东西和已有数据冲突。已自动跳过，不影响后续。如经常出现请告诉我们。"
  },
  {
    category: "db.corrupt",
    pattern: /database disk image is malformed|SQLITE_CORRUPT/i,
    title: "数据库损坏",
    detail: "Ovo 的记忆库文件出问题了——可能是磁盘故障或异常退出。尝试重启 Ovo；如不行，可在设置里导出/重置。"
  },

  // === Action / 系统集成 ===
  {
    category: "action.script-rejected",
    pattern: /osascript.*含危险|脚本.*已拒绝/i,
    title: "Ovo 拒绝执行该脚本",
    detail: "出于安全原因，Ovo 拒绝了一个看起来有危险的系统命令。这是预期行为——如果你认为是误判，告诉我们。"
  },
  {
    category: "action.invalid-url",
    pattern: /open.*URL 无法解析|不是合法 URL|拒绝.*scheme|open URL 缺少/i,
    title: "拒绝打开这个链接",
    detail: "Ovo 只放行 https / http / mailto 链接，本地文件路径和私有协议不允许。"
  },
  {
    category: "action.not-registered",
    pattern: /动作不存在或已过期/i,
    title: "动作已过期",
    detail: "这个待确认动作可能等太久或 Ovo 重启过。回主控台重新触发一次。"
  },

  // === OCR / 截图 ===
  {
    category: "ocr.failed",
    pattern: /OCR.*失败|vision.*failed|tesseract.*error/i,
    title: "图像识别失败",
    detail: "Ovo 这一帧没看清屏幕上的文字。继续观察下一帧，通常自动恢复。"
  },

  // === Vision OCR native module ===
  {
    category: "vision.unavailable",
    pattern: /vision.*unavailable|MacOCR.*not available|recognizeFromBuffer.*not/i,
    title: "Vision OCR 不可用",
    detail: "Ovo 自动降级到 Tesseract——速度稍慢但能用。可能是 macOS 版本太老或 native module 安装失败。"
  }
];

/**
 * 翻译一个 error 为用户可读的形式。
 * 永不抛——失败时返回通用 fallback。
 */
export function translateError(error: unknown): TranslatedError {
  let raw = "";
  if (error instanceof Error) raw = error.message;
  else if (typeof error === "string") raw = error;
  else if (error && typeof error === "object") {
    raw = (error as { message?: string }).message ?? JSON.stringify(error).slice(0, 500);
  } else {
    raw = String(error ?? "");
  }

  for (const rule of RULES) {
    if (rule.pattern.test(raw)) {
      return {
        title: rule.title,
        detail: rule.detail,
        action: rule.action,
        raw,
        category: rule.category
      };
    }
  }

  // 通用 fallback——比 raw error 友好但仍允许 power user 看到底层信息
  return {
    title: "Ovo 遇到了一个问题",
    detail: raw.length > 0
      ? `具体原因：${raw.slice(0, 300)}${raw.length > 300 ? "…" : ""}\n\n如果这个问题反复出现，把它告诉我们。`
      : "没拿到详细错误信息。如果反复出现，把它告诉我们。",
    action: { label: "反馈这个错误", type: "open-feedback" },
    raw,
    category: "unknown"
  };
}

/**
 * 同步版——给主进程 console.error 之类的简单地方用。
 * 渲染端建议用 translateError 拿完整 action。
 */
export function humanizeError(error: unknown): string {
  const t = translateError(error);
  return `${t.title}：${t.detail}`;
}
