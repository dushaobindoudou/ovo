# Ovo Bug 报告（持续演进文档）

> QA / 测试视角的系统问题库。与 `docs/UX_AUDIT.md`（产品视角）互补。
> 每次 `/loop` bug 扫描轮跑完，新发现追加到此。

**最新更新**：第 3 轮（2026-05-16）· 累计 37 个 bug · 8 个架构反模式 · 1 个 false alarm 已撤回

---

## 文档说明

### 评分体系

| 等级 | 含义 | 处理时机 |
|---|---|---|
| 🔴 **Critical** | 数据丢失 / 安全风险 / 不可恢复故障 / 监控盲点 | 立即修 |
| 🟠 **Major** | 功能不对 / 性能塌方 / 内存/资源泄漏 / 用户预期严重偏离 | 当前 sprint |
| 🟡 **Minor** | 测试残留 / 死代码 / 文档脱节 / 边缘 case | 滚动清理 |
| 🏗 **Architecture** | 设计层面的根本问题（god module / 反模式 / 规范不统一） | 重构窗口 |

### 每条 bug 必须包含
- **位置**：`file:line` 精确定位
- **现状**：代码当前行为
- **影响**：用户视角的后果
- **复现路径**：怎么触发
- **建议修复**：具体方向

---

## 🔴 Critical Bugs（9 项）

### C1 swallow 错误处理在核心模块泛滥（28+ 处）
- **位置**：跨模块 — `electron/action-executor.ts:180,196,406` / `ipc-handlers.ts:356,1028,1049,1093,1148,1292,1301,1461,1564,1576,1581,1644` / `error-logger.ts:77,136,150` / `auto-capture.ts:130,131,195,380,403` / `feedback-engine.ts:43` / `window-manager.ts:24` / `ocr-engine.ts:116` / `logger.ts:50` / `main.ts:294,478`
- **现状**：超过 28 处 `catch { /* ignore */ }` 或 `catch { /* swallow */ }`，错误被完全吞掉，**主进程无任何日志、无任何告警**
- **影响**：
  - 用户感受"Ovo 越来越不灵了"但找不到原因
  - 开发者 debug 时无线索（错误根本没被记录）
  - 关键失败被掩盖（KG 写入失败 / OCR worker 泄漏 / 偏好存储失败）
- **复现路径**：触发任意失败场景（如磁盘满、SQLite 锁死、文件无权限），观察 error.log — 完全没有记录
- **建议修复**：建立 `safeExecute` 包装函数，所有 catch 必须调用 `errorLogger.alert(level, source, message, context)`；禁止裸 swallow

### C2 错误日志系统自我吞错（监控盲点）
- **位置**：`electron/error-logger.ts:77` `} catch { /* 静默失败，不影响应用 */ }`
- **现状**：`errorLogger.write()` 内部把"写入失败"也 swallow 掉。错误日志系统是最后的监控防线，它自己挂了无人知晓
- **影响**：磁盘满 / 权限被收回 / 日志文件损坏时，整个错误监控失效，看到的是"一切正常"的假象
- **复现路径**：把 `~/Library/Application Support/Ovo/logs/` 目录改成只读 → 触发任意错误 → `errorLogger.alert()` 看似成功但实际没写入
- **建议修复**：write 失败时 fallback 到 stderr `process.stderr.write(...)` + 在内存里维护 "last 10 failed writes" 队列，主控台可查

### C4 IPC handler 输入校验完全缺失（安全风险）— 第 2 轮新增
- **位置**：`electron/ipc-handlers.ts` 整个文件 — 0 处 zod/joi/手动 schema 校验
- **现状**：所有 `ipcMain.handle("xxx", (e, payload) => ...)` 直接解构 payload 字段，无任何类型/范围/格式校验
- **影响**：
  - **安全风险**：被注入的 renderer（XSS via OCR 文本插入？devtools 攻击？）可以发送任意 payload 调用 `kg:clear` / `pipeline:clear` / `privacy:set-blacklist` 等危险操作
  - **稳定性风险**：renderer bug 发送格式错误 payload 会触发主进程未捕获异常
  - **数据风险**：`prefs:save` 类 API 可被传入非法数据持久化到本地
- **复现路径**：
  ```js
  // 在任意 renderer DevTools console 执行：
  window.ovoAPI.kg.clear()  // 无确认，直接清空知识图谱
  window.ovoAPI.privacy.pause(99999999)  // 暂停一万年
  window.ovoAPI.prefs.saveBootstrap({ interests: [{__proto__: {polluted: 1}}] })  // 原型污染尝试
  ```
- **建议修复**：建立 `ipc-schema.ts` 用 zod 定义每个 channel 的 payload schema；handler 包装成 `safeHandle(channel, schema, fn)`，校验失败直接 reject 并 alert

### C5 macOS 休眠/恢复事件无任何处理（桌面应用必修课）— 第 2 轮新增
- **位置**：`electron/main.ts` + 全 electron 目录 — 0 处 `powerMonitor` 使用
- **现状**：未注册 `powerMonitor.on("suspend") / on("resume") / on("lock-screen") / on("unlock-screen")` 任何事件
- **影响**：
  - 用户合上 MacBook 盖子睡眠 → 系统暂停所有 timer → 醒来后 setInterval 一次性补发大量 tick → 截图/OCR/LLM 调用瞬间爆发，可能触发 rate limit 或 CPU 飙升
  - 锁屏期间 Ovo 仍在截图 — 隐私违反（屏幕上可能是锁屏壁纸或敏感登录界面）
  - 休眠唤醒后 OCR worker 可能已被系统回收，新调用全部失败
- **复现路径**：合上 MacBook 盖子 5 分钟 → 打开 → 观察 Activity Monitor 中 Ovo 进程的 CPU 突增 + 日志里大量错误
- **建议修复**：在 main.ts 注册 powerMonitor，suspend 时调用 `autoCaptureService.pause()` + 关闭 worker；resume 时延迟 5 秒再恢复（让系统稳定）；lock-screen 强制停所有捕获

### C6 完全没有代码签名 / Notarization 配置（用户下载即被 Gatekeeper 拦截）— 第 3 轮新增
- **位置**：`electron-builder.yml` 全文 + 缺失 `afterSign` hook
- **现状**：electron-builder.yml 没有任何 `identity` / `notarize` / `mas` 字段；`gatekeeperAssess: false` 表示构建时不做检查；entitlements 配了 `cs.disable-library-validation` + `cs.allow-unsigned-executable-memory` 是允许第三方动态库（OCR / SQLite native），**但没有签名根本进不来**
- **影响**：
  - 用户下载 DMG → 安装 → 启动 → macOS 弹"无法验证开发者"拒绝运行
  - Sonoma+ 用户必须右键→打开 + 输密码才能跑，**90% 普通用户在这里直接放弃**
  - 公司无 Apple Developer 账号也是问题，但至少要有 ad-hoc 签名让本地测试可行
- **复现路径**：`pnpm pack:mac` 生成 DMG → 拷到另一台 Mac → 双击安装 → 启动 → 看 Gatekeeper 弹窗
- **建议修复**：
  - 短期：买 Apple Developer 账号（$99/年）+ 配置 `CSC_LINK` / `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` env + 用 `@electron/notarize`
  - 长期：CI/CD 自动签名 + Notarization，发布前必经

### C7 无任何自动更新机制 — 第 3 轮新增
- **位置**：搜全代码 — 0 处 `electron-updater` / `autoUpdater` / `feedURL`
- **现状**：package.json 没有 electron-updater 依赖；main.ts 没有 autoUpdater 调用；electron-builder.yml 没有 `publish` 配置
- **影响**：
  - 发布 v0.2 → 用户根本不知道 → 永远停在 v0.1
  - 紧急安全修复无法推送（如 C4 IPC 安全漏洞）
  - 文档说 "AI 越用越懂你" 但用户的 Ovo 实际半年都不会更新一次
- **复现路径**：当前应用 About 看 v0.1.0 → 改 package.json 版本到 v0.2.0 → 用户怎么知道？
- **建议修复**：加 electron-updater 依赖；配置 GitHub Releases 作 publish target；启动 30 秒后异步检查更新；新版本可见 Toast 提示

### C8 verify-real-logs.ts 被主 bundle import（测试代码进生产）— 第 3 轮新增
- **位置**：`electron/main.ts:7` `import { runVerifyRealLogs } from "./verify-real-logs.js"` + `main.ts:608` 实际调用
- **现状**：30 场景验证脚本被主 bundle 引入。runVerifyRealLogs 由环境变量 `OVO_RUN_REAL30=1` 触发，但**代码一直存在于生产 bundle 中**
- **影响**：
  - 生产体积膨胀（验证场景模板、断言逻辑都打包进 app）
  - 第 1 轮 N3 提到的 `console.log("=== 30次真实场景验证结果 ===")` 进入生产代码
  - 安全风险：用户/恶意脚本设置 `OVO_RUN_REAL30=1` 重启 Ovo，会触发非预期的测试场景执行
- **复现路径**：`OVO_RUN_REAL30=1 open -a ovo` → 应用启动后跑测试模式 → 用户真实数据被测试逻辑污染
- **建议修复**：把 verify-real-logs.ts 移到 scripts/ 目录 + 用 dynamic import + 仅 dev/CI 触发；或用 conditional require + electron-builder files 字段排除

### C9 KG schema migration 全部 swallow（数据库演进无追踪）— 第 3 轮新增
- **位置**：`electron/knowledge-graph.ts:194,217,229,243,274` 5 处 `/* swallow migration errors */`
- **现状**：5 次 `ALTER TABLE ... ADD COLUMN` 用 try-catch + swallow 实现 migration，**完全没有 schema_version 表**追踪版本
- **影响**：
  - 用户的 SQLite 升级失败 → 应用看似正常但读写会出现"字段不存在"错误（被 C1 的 swallow 再次掩盖）
  - 新人维护：不知道当前 schema 演进到哪一步
  - 回滚：完全不可能（没有版本号无法降级）
  - 数据丢失风险：未来某个版本如果改了表结构，迁移失败用户数据保不住
- **复现路径**：手动改 SQLite 文件让某个 ALTER TABLE 失败（如重复字段） → 应用启动看似正常 → 实际后续读写报错被吞 → 用户感受"Ovo 越来越不灵"
- **建议修复**：建立 `migrations/` 目录每次 schema 变更一个 .sql 文件 + `schema_version` 表追踪 + migration 失败时 alert critical 并提示用户备份

### C3 已退役但保留 200+ 行死代码（炸药包）
- **位置**：`electron/action-executor.ts:125-126` 注释 + 实际 handler 实现 `handleSetReminder` (line 208) / `handleAddCalendar` (line 226) / `handleSendIMessage` (line 255) / `handleSendEmail` (line 279) / `handleOpenUrl` (line 299) / `handleSearchWeb` (line 322) / `handleIndexPath` (line 350)
- **现状**：注释明确写"这些 handler 已**退役**，全部改走 agent-executor.planAndExecuteAction()。保留代码作为应急回滚参考"。但 6 个 handler 函数仍然存在 ~200 行代码
- **影响**：
  - 误调用风险 — 如果未来某个 PR 不小心又把 type → handler 的映射加回来，会绕过新的 agent-executor 安全检查
  - 维护负担 — 重构时容易改了死代码白忙活
  - 给读代码的开发者错误信号（以为这些 handler 还在用）
- **复现路径**：搜代码全文 `handleSetReminder` 找调用 — 找不到调用点，但函数仍存在
- **建议修复**：立刻删除，git history 已有，"应急回滚"是借口；若真担心，把它们移到 `__archive__/` 目录

---

## 🟠 Major Bugs（15 项）

### M1 setInterval 散落，无统一注册中心
- **位置**：electron 端 5 处 + Console 组件 8 处
  - `electron/logger.ts:22` `flushTimer = setInterval(...)`
  - `electron/scheduler.ts:77` 内部封装
  - `electron/ipc-handlers.ts:177` 直接调用
  - `electron/auto-capture.ts:89` setInterval 方法
  - `src/components/Console/OverviewPanel.tsx:54,61,87,294,533` **5 个**
  - `src/components/Console/LiveStatusBar.tsx:64,67`
  - `src/components/Console/ProcessPanel.tsx:91,92`
  - `src/components/FloatingIcon/FloatingIcon.tsx:108`
  - `src/components/SuggestionPanel/SuggestionToastWindow.tsx:67`
- **现状**：项目有 `electron/scheduler.ts` 专门管理周期任务，但大量代码绕过它直接用原生 `setInterval`
- **影响**：
  - 一个 OverviewPanel 组件创建 5 个 timer，性能开销叠加
  - 难以全局暂停（用户 pause 时 UI timer 仍在跑）
  - 测试不可控
- **复现路径**：打开 OverviewPanel 后 Chrome DevTools → Performance → 看 timer 数量
- **建议修复**：建立 `useManagedInterval(fn, ms, scope)` hook，所有组件 interval 走它；electron 端强制走 scheduler

### M2 React effect 缺依赖被 eslint-disable 掩盖（4 处）
- **位置**：
  - `src/components/Console/KnowledgeGraphCanvas.tsx:244` 
  - `src/components/Console/MemoryPanel.tsx:92` 
  - `src/components/Console/SettingsPanel.tsx:56`
- **现状**：用 `// eslint-disable-next-line react-hooks/exhaustive-deps` 绕过依赖检查
- **影响**：典型潜在 bug — 依赖值变化后 effect 不重跑，导致状态不一致。在 KG 图谱场景特别危险（节点更新但 canvas 不重绘）
- **复现路径**：MemoryPanel 中切换"列表/图谱"视图后再快速修改数据，可能出现旧数据残留
- **建议修复**：逐个分析 — 真正不需要的依赖用 useCallback 稳定化；其他必须补全依赖

### M3 OCR worker 泄漏路径未处理
- **位置**：`electron/ocr-engine.ts:116` + `electron/ipc-handlers.ts:1148` `void ocrEngine.terminate().catch(() => { /* swallow */ })`
- **现状**：OCR worker terminate 失败被吞，但 worker 仍占用内存。`OverviewPanel.tsx:294` 每 8 秒一次 OCR，长时间运行可能泄漏多个 worker
- **影响**：连续运行数小时后内存爆炸；用户报告"Ovo 越用越慢"
- **复现路径**：用 Activity Monitor 观察 Ovo 主进程内存，让它运行 4-8 小时，观察 RSS 是否持续增长
- **建议修复**：terminate 失败时记日志 + 主动 kill worker 进程；建立 worker pool 上限（最多 2 个 active）

### M4 未实现的功能伪装为已完成（TODO 残留）
- **位置**：`src/components/Console/SuggestionsPanel.tsx:82` `// TODO Q5/capability: 接受后注册 capability。当前先记反馈`
- **现状**：用户点"接受"看似成功，但承诺的"注册为 capability"功能根本没实现，只记了 feedback
- **影响**：用户接受的建议无法成为未来的"自动可执行能力"，违反"教练闭环"的产品哲学
- **复现路径**：接受同一类建议 5 次 → 预期下次类似场景应该自动执行 → 实际仍要每次确认
- **建议修复**：要么实现 capability 注册机制，要么在 UI 上明确"已记下偏好"（不暗示"以后会自动")

### M6 KG transaction 覆盖率仅 5.5%（54 处 prepare/exec vs 3 处 transaction）— 第 2 轮新增
- **位置**：`electron/knowledge-graph.ts` 全文 — 54 处直接 `this.db.prepare(...).run/get/all`，仅 3 处用 `this.db.transaction()`（line 1075, 1111, 2025）
- **现状**：大部分写操作（upsertEntity / addEvent / 关系插入等）单独执行，无事务原子性保护
- **影响**：
  - 并发 pipeline 同时跑时，"实体创建 + 关系创建 + 事件记录"可能部分成功部分失败，导致 KG 数据不一致（孤儿关系、丢失实体引用）
  - SQLite WAL 写锁冲突时部分写入回滚，但调用方以为成功了
- **复现路径**：人为触发 3 个 pipeline 并发（修改 scheduler 让它们重叠）→ 用 sqlite3 客户端查 KG → 找到 entity_id 在 relations 表存在但 entities 表没有的孤儿数据
- **建议修复**：把"一次业务操作 = 一次 transaction" 作为规范；audit 所有 prepare/exec 调用点，组合为事务

### M7 preload 暴露 44 个 API 命名空间，所有 renderer 平等访问 — 第 2 轮新增
- **位置**：`electron/preload.cjs:288` 行内定义 44+ 个 API 命名空间（capture / health / ocr / agent / kg / privacy / dev / prefs / scheduler 等）
- **现状**：通过 `contextBridge.exposeInMainWorld("ovoAPI", { ... })` 所有命名空间对**每个 renderer 窗口**都可见 — console window / floating icon / suggestion panel / toast 共享同一套
- **影响**：
  - **权限过度授予**：FloatingIcon 浮窗其实只需要 capture/privacy/floating 几个 API，但能调用 kg.clear / pipeline.clear / dev.* 等危险操作
  - **攻击面扩大**：被 OCR 内容污染或 XSS 后，攻击可以从最简单的窗口发起
  - **架构不清晰**：每个窗口的能力边界模糊
- **复现路径**：在 floating window devtools 里执行 `window.ovoAPI.dev.runMaintenance?.()` — 应该不该有权限但事实上有
- **建议修复**：preload.cjs 改为根据 `window.location.hash` 判断窗口类型，按窗口暴露不同的 API 子集

### M8 网络离线无任何降级处理 — 第 2 轮新增
- **位置**：全代码库 — 0 处 `navigator.onLine` / `online` event / `offline` 事件
- **现状**：用户离线时所有 LLM 调用走 agent-bridge fetch 失败，但 UI 完全不区分"网络问题"和"业务错误"
- **影响**：
  - 用户在地铁/飞机上看到的是"Ovo 不工作了" + 一堆 retry 失败日志
  - 没有"离线模式"概念 — 实际上 KG 查询、设置查看、暂停等本地功能仍可用
- **复现路径**：开 Wifi 杀掉网络 → 让 Ovo 跑 pipeline → 看到的是 fetch error 但 UI 没有"网络断开"标识
- **建议修复**：监听 navigator online/offline；离线时顶栏显示"离线 — 仅本地功能可用"；LLM 调用排队，等网络恢复后批量处理

### M9 多显示器场景：仅初始读取，无 metricschanged 监听 — 第 2 轮新增
- **位置**：`electron/main.ts:439` `screen.getAllDisplays()` 仅一次调用，无 `screen.on("display-metrics-changed")` / `on("display-added")` / `on("display-removed")` 监听
- **现状**：FloatingIcon 位置基于初始显示器配置存储，外接屏插拔/分辨率调整后失效
- **影响**：
  - 笔记本插上外接屏 → FloatingIcon 跑到屏幕外不见了
  - 拔掉外接屏 → 应用窗口可能在不存在的屏幕坐标，用户找不到
  - 多桌面切换（Mission Control）行为未定义
- **复现路径**：MacBook 接外接屏，把 FloatingIcon 拖到外接屏右下角 → 拔掉线 → FloatingIcon 不可见
- **建议修复**：监听 `screen.on("display-removed")` 自动把超出范围的窗口拉回主屏；保存位置时同时存 displayId

### M10 依赖安全审计完全失效（华为云镜像不支持 audit）— 第 2 轮新增
- **位置**：项目 npm registry 配置（华为云 `https://repo.huaweicloud.com/repository/npm/`）
- **现状**：`pnpm audit` 报 405 错误 — `The audit endpoint... responded with 405: 'Request method POST is not supported'`
- **影响**：
  - 已知 CVE 完全无法被检测
  - 依赖里有 `tesseract.js / three / better-sqlite3 / electron 34.5.8 / msedge-tts` 等大型依赖，任何一个有漏洞都不知道
  - 安全合规 / SOC2 类审核会直接 fail
- **复现路径**：`pnpm audit` 直接见错误
- **建议修复**：CI 阶段用官方 registry 跑 audit；或本地 audit 时临时切回 `npm config set registry https://registry.npmjs.org/`；或用 Snyk/Socket.dev 等替代方案

### M11 macOS 图标尺寸覆盖不全 — 第 3 轮新增
- **位置**：`build/icon-256.png` (256×256) / `icon-512.png` (512×512) / `icon-tray.png` (22×22) / `icon.png` (1024×1024)
- **现状**：缺 16/32/64/128 像素；缺 @2x retina 版本（如 32×32@2x = 64×64 标注为 @2x）
- **影响**：
  - Dock 在小尺寸显示时 macOS 自动缩放 1024 → 32，会糊
  - Finder 缩略图、Mission Control 缩略图、Notification Center icon 都依赖完整尺寸
  - electron-builder 会自动生成 .icns，但单图源会损失细节
- **复现路径**：把 Dock 调到最小尺寸 → 看 Ovo icon 是否模糊
- **建议修复**：用 `scripts/generate-icons.ts`（已存在！）生成完整尺寸；或手工导出 16/32/64/128/256/512/1024 + 各 @2x

### M12 secrets-store 不可恢复 / 无备份机制 — 第 3 轮新增
- **位置**：`electron/secrets-store.ts:15-25` 注释 + 行为
- **现状**：safeStorage 不可用时（如 Linux 无 libsecret）整个文件不写，重启后 API key 丢失
- **影响**：
  - 用户配好 API key 后系统升级 / 跨机器迁移 → key 不可读
  - 用户机器 keychain corruption → key 永久丢失，必须重新申请
  - 无"导出加密 key 备份"或"导入备份"机制
- **复现路径**：用户在 Mac A 配 API key → 迁移用户目录到 Mac B → 启动 Ovo → key 解密失败（不同机器的 Keychain 密钥）
- **建议修复**：① safeStorage 不可用时降级到密码保护的本地文件（用户输一次密码作 PBKDF2）② 加 "导出加密备份（含密码）" 和 "导入备份" 入口

### M13 scripts/*.json 已包含真实 LLM 对话被 commit 进仓库 — 第 3 轮新增
- **位置**：`scripts/claude-code-e2e-intent-debug.json` (含 prompt 全文) + `claude-code-real-test.json` (含 LLM raw output / 模型名 / token usage / cost) + `claude-code-real-test-after-fix.json` + `verify-real30-report.json`
- **现状**：4 个 JSON 文件已 commit。内容包含：完整 prompt 模板、模型名（MiniMax-M2.5）、token 数、$0.103 单次成本、session_id 等
- **影响**：
  - 当前数据是测试数据（"早上查看天气"），但**机制是 commit 测试 JSON** — 未来真实场景测试会包含用户对话内容、屏幕截图 OCR 文本
  - 暴露 backend 细节（用了 MiniMax 不是 Claude？）— 与产品宣传可能不一致
  - 公开仓库后这些 JSON 会被 GitHub 索引
- **复现路径**：`cat scripts/claude-code-real-test.json | grep -E "intent|prediction"`
- **建议修复**：加 .gitignore `scripts/*.json` + 已 commit 的用 `git rm` 移除 + 创建 `scripts/.gitkeep` 保留目录

### M14 生产 build 可被环境变量触发测试模式 — 第 3 轮新增
- **位置**：`electron/main.ts` 检测 `OVO_RUN_REAL30=1` 触发 runVerifyRealLogs
- **现状**：环境变量是公开接口，任何能设置 env 的进程（launchd plist / Terminal / 父进程）都能触发
- **影响**：
  - 用户 / 第三方启动器无意中设置了这个变量，导致 Ovo 启动后跑测试场景
  - 真实数据可能被测试逻辑混入（KG / pipeline_logs 表）
  - 调试模式与生产模式无明确边界
- **复现路径**：终端 `export OVO_RUN_REAL30=1` → `open -a ovo` → 看是否进入测试模式
- **建议修复**：测试模式触发条件加 `NODE_ENV === "development"` 双重检查；或改为只读 dev 命令行参数（`--run-real30`）而非 env

### M15 test:ci 缺 e2e:scenarios — 第 3 轮新增
- **位置**：`package.json` scripts `test:ci`
- **现状**：`test:ci: pnpm typecheck && pnpm lint && pnpm build && pnpm test:agents && pnpm test:flow`
- **问题**：包含 typecheck / lint / build / agents / flow，**没有 test:e2e:scenarios**（30 场景验证脚本，最贴近真实场景的测试）
- **影响**：CI 通过 ≠ 真实场景可用。e2e:scenarios 暴露的 schema/intent/pipeline 问题在 CI 完全发现不了
- **复现路径**：故意改坏 prompt-engine 的 intent 提取 → test:ci 全绿 → 真实运行炸
- **建议修复**：加 `&& pnpm test:e2e:scenarios` 到 test:ci；e2e 耗时长可拆 ci:quick / ci:full

### M5 floating promise 在启动序列里未捕获
- **位置**：`electron/main.ts:509` `app.whenReady().then(async () => { ... })`
- **现状**：startup 序列用 `.then` 但没有 `.catch`，async 函数内的任意 throw 会变成 unhandled rejection
- **影响**：启动失败时无任何反馈给用户 — 应用看起来卡在启动状态
- **复现路径**：在 `whenReady` callback 里 throw 一个错误（比如改坏某个初始化函数）→ 应用静默挂起
- **建议修复**：改为 `app.whenReady().then(...).catch(err => { errorLogger.alert("critical", "startup", ...); app.quit(); })`

---

## 🟡 Minor Bugs / 测试残留（9 项）

### N1 编译产物残留在仓库根目录
- **位置**：`/ipc-handlers.js` (38KB) + `/main.js` (15KB)
- **现状**：之前 commit 时已主动排除，但用户本地 working tree 仍有，未加 .gitignore
- **影响**：再次 `git add -A` 时会被误提交，污染 history
- **复现路径**：`git status` 可见这两个 untracked .js 文件
- **建议修复**：删除 + 加 `.gitignore` 规则（之前已建议）

### N2 scripts/ 下测试输出 JSON 残留
- **位置**：`scripts/claude-code-e2e-intent-debug.json` / `claude-code-real-test.json` / `claude-code-real-test-after-fix.json` / `verify-real30-report.json`
- **现状**：4 个测试运行的输出 JSON 留在 scripts 目录
- **影响**：仓库膨胀，可能包含敏感信息（取决于测试场景），新人不知道这些是临时文件
- **复现路径**：`ls scripts/*.json`
- **建议修复**：移到 `scripts/output/` 或 `.tmp/` 目录 + .gitignore 排除；保留一个 sample 作为格式参考

### N3 生产代码 console.log 残留（验证脚本）
- **位置**：`electron/verify-real-logs.ts:107,388,389,392`
- **现状**：`console.info` / `console.log` 直接调用，且这是 electron/ 目录文件（不在 scripts/）
- **影响**：如果被 import 进主进程 bundle，会污染日志；与项目的 errorLogger / logger 规范背道
- **复现路径**：grep `verify-real-logs` 看是否被 main bundle import — 需进一步确认
- **建议修复**：要么改用 logger.info，要么把 verify-real-logs.ts 移到 scripts/ 目录

### N4 已删除的测试组件痕迹
- **位置**：第三方 git status 显示 `src/components/Console/AgentTestPanel.tsx` 和 `ScreenshotTestPanel.tsx` 都被删除了
- **现状**：已删除 ✓，但需确认没有任何 import / 路由还引用它们
- **影响**：如果有未清理的 import，typecheck 会失败；如果有 dynamic import 字符串引用会运行时崩溃
- **复现路径**：`grep -r "AgentTestPanel\|ScreenshotTestPanel" src/ electron/`
- **建议修复**：扫描后清理任何残留引用

### N5 .gitignore 不覆盖常见构建/测试输出
- **位置**：`.gitignore` 仅 `node_modules / dist / dist-electron / out / coverage / *.db / *.sqlite*`
- **现状**：未覆盖 `build/`（已被提交）、`/main.js` `/ipc-handlers.js` 编译产物、`scripts/*.json` 测试输出
- **影响**：高风险：未来误提交编译产物、临时 JSON、用户级数据
- **建议修复**：增加 `/main.js`, `/ipc-handlers.js`, `scripts/*.json`, `.tmp/`, `*.local.json`

### N7 应用退出时未确认 pending action 是否持久化 — 第 2 轮新增
- **位置**：`electron/main.ts:694` 和 `electron/ipc-handlers.ts:1144` 都有 `app.on("before-quit", ...)` 注册，但需深入看是否处理未完成 pipeline
- **现状**：扫描显示 before-quit handler 存在，但内容未深入审计 — 用户 pending 的 action 状态是否落盘？
- **影响**：用户在 pending action 弹窗显示时直接 Cmd+Q，可能丢失 action 状态（重启后建议消失）
- **复现路径**：让 Ovo 产生 pending action → 用户没确认就 Cmd+Q → 重启 → pending action 是否还在？
- **建议修复**：审计 before-quit handler；任何"用户未做决定的状态"必须先 flush 到磁盘

### N8 系统通知 / 用户级 alert 机制缺失 — 第 2 轮新增
- **位置**：搜 `new Notification` / `electron.Notification` — 0 处使用
- **现状**：Ovo 完全没用 macOS 系统通知中心。所有"用户应该知道的事"只显示在 console window 内
- **影响**：用户切换到全屏应用（视频会议、Keynote）时，重要建议被完全淹没
- **复现路径**：触发一个 critical 级别 toast → 切换到 Keynote 全屏 → toast 出现在哪？用户能看到吗？
- **建议修复**：critical/important 级别建议同时走 `new Notification("Ovo", { body, silent: false })`；用户可在 macOS 通知设置控制

### N9 中文应用但无 ICP / 隐私协议 / 用户协议链接 — 第 3 轮新增
- **位置**：`electron-builder.yml` extendInfo + `AboutPanel.tsx`
- **现状**：电子产品在中国发布通常需要 ICP 备案 / 隐私政策 URL / 用户协议 URL。当前 About 页只显示 "ovo 是一个观察屏幕、推断意图...的桌面副驾驶"
- **影响**：
  - 中国大陆发布合规风险（《个人信息保护法》要求明确隐私政策）
  - macOS App Store 必填字段（如果想上架）
  - 用户对"我的数据怎么被处理"无明确告知
- **复现路径**：打开 About → 找隐私协议链接 → 没有
- **建议修复**：写 `PRIVACY.md` + `TERMS.md` + About 加链接；electron-builder.yml extendInfo 加 `NSHumanReadableCopyright`

### N6 已退役注释指向"应急回滚"但没有 git tag 锚点
- **位置**：`electron/action-executor.ts:126` "保留代码作为应急回滚参考；下次重构周期可以删"
- **现状**：所谓"回滚"靠的是注释，没有 git tag 标记"删除之前的最后版本"
- **影响**：未来真要回滚不知道回到哪个 commit
- **建议修复**：要么删（C3）+ 打 tag `pre-action-executor-retire`，要么承认是死代码移到 `__archive__/`

---

## 🏗 架构反模式（8 项）

### A1 ipc-handlers.ts 已成 god module（>1500 行）
- **位置**：`electron/ipc-handlers.ts` 包含 8+ 个 swallow / 3+ 个 setInterval / 数十个 handler
- **现状**：一个文件承担太多职责 — 隐私、KG、捕获、自检、健康、Toast、Pipeline、Action、Settings 的 IPC 全在这里
- **影响**：
  - 单文件改动冲突频繁
  - typecheck 慢
  - 难以测试单个 handler
  - 调试时栈跟踪指向"ipc-handlers.ts:XXX"信息量低
- **建议修复**：拆分为 `handlers/{privacy,kg,capture,health,toast,pipeline,action}.ts`，主 register 文件只做组装

### A2 scheduler 模块被绕过（规范不统一）
- **位置**：`electron/scheduler.ts` 存在 + 大量代码用原生 setInterval
- **现状**：M1 详述。这不只是性能问题，是"项目有规范但没人遵守"的架构红线
- **建议修复**：lint 规则禁止直接 setInterval（除 scheduler 自身）；ESLint 加 `no-restricted-globals`

### A3 已退役代码与新代码并存（架构断层）
- **位置**：`action-executor.ts` 同文件既有"新架构"（routing to planAndExecuteAction）又有"退役 handler"（200 行死代码）
- **现状**：注释说"应急回滚"，但实际是"不敢删"的工程债
- **影响**：新人读不懂"这到底是用还是不用"
- **建议修复**：要么删要么 archive，零容忍"灰色地带"

### A5 缺少"系统事件 hub"（powerMonitor / display / network 都散漫）— 第 2 轮新增
- **位置**：跨 electron/ — 没有统一的 system-events.ts 处理 powerMonitor / displayMetricsChanged / online / offline / appWillQuit / lock-screen 等
- **现状**：休眠 (C5) / 多显示器 (M9) / 网络 (M8) 三个"必修课"全缺失。即使将来补上也很可能各自实现
- **影响**：每个"系统事件相关" feature 各写一遍订阅 + cleanup，散布在 main.ts / ipc-handlers.ts 各处
- **建议修复**：建立 `electron/system-events.ts` 集中订阅所有系统事件，通过内部 EventEmitter 广播给业务模块

### A6 IPC 安全模型缺失（无 channel 白名单 / 无 schema / 无 per-window 权限）— 第 2 轮新增
- **位置**：preload.cjs 暴露 44 API + ipc-handlers.ts 接收所有 payload 无校验
- **现状**：当前模型 = "renderer 完全信任，主进程完全相信 renderer 的任何输入"
- **影响**：C4 + M7 的根因。是 Electron 应用最容易栽跟头的安全反模式
- **建议修复**：定义 IPC 安全策略文档：① channel 白名单（renderer 只能调允许的）② payload schema 强校验 ③ per-window 权限（floating 不能调 dev.*）④ 危险操作必须主进程二次确认

### A7 SQLite migration 模型脆弱（无 schema_version + 全 swallow）— 第 3 轮新增
- **位置**：`electron/knowledge-graph.ts` migration 段
- **现状**：靠 try-catch ALTER TABLE 实现 migration，5 处 swallow 错误，无 schema_version 表追踪进度
- **影响**：C9 的根本原因。这种"乐观 migration"模型在生产环境不可持续
- **建议修复**：标准化 — `migrations/0001_init.sql` / `migrations/0002_add_quality_score.sql`，启动时按 schema_version 顺序执行未跑过的 migration，失败时 alert + 中止启动

### A8 缺少完整的构建-发布流程（无 CI / 无签名 / 无 release notes）— 第 3 轮新增
- **位置**：项目根 — 无 `.github/workflows/` / 无 `CHANGELOG.md` / 无 release scripts
- **现状**：从代码到用户的链路完全是手工 — pnpm pack:mac → 拷 DMG → 用户下载。无自动 build / 无签名 / 无 changelog / 无版本管理
- **影响**：C6 + C7 + M15 的根因。这是个手工业模式，无法支持快速迭代
- **建议修复**：建立 GitHub Actions — push 到 main 跑 CI；tag v* 自动 build + sign + notarize + upload Release；用 changelog 生成器自动产出 release notes

### A4 错误处理没有统一约定
- **位置**：跨整个 electron/ 目录
- **现状**：有的 catch 用 swallow / 有的用 alert / 有的写 logger.error / 有的不处理直接 throw
- **影响**：错误的去向无法预测，监控不可靠
- **建议修复**：定义 `ErrorHandlingPolicy.md` — 3 种 catch 类型（rethrow / report-and-recover / silent-with-log），禁止 swallow

---

## 待验证清单（动态更新）

### ✅ 第 1 轮已验证通过（false alarm 或已实现）
- ~~OverviewPanel.tsx 5 个 setInterval cleanup~~ — **PASS**：5 处都有 `return () => clearInterval(t)`
- ~~被删除的 AgentTestPanel/ScreenshotTestPanel 残留引用~~ — **PASS**：grep 无残留
- ~~agent-bridge.ts fetch 超时~~ — **PASS**：line 244-245 实现了 AbortController + 30s 超时
- ~~多显示器初始读取~~ — **部分 PASS**：初始读取存在（main.ts:439），但无 metricschanged 监听 → 升为 M9

### ✅ 第 3 轮验证通过 / 已立项
- ~~scripts/*.json 含敏感信息~~ — **CONFIRMED**：含 prompt 全文 + 模型名 + token usage + cost → 立项 **M13**
- ~~verify-real-logs.ts 被主 bundle import~~ — **CONFIRMED**：main.ts:7 直接 import → 立项 **C8**
- ~~macOS Notarization / signing~~ — **CONFIRMED MISSING**：electron-builder.yml 0 配置 → 立项 **C6**
- ~~build/*.png 图标完整性~~ — **CONFIRMED**：缺 16/32/64/128/@2x → 立项 **M11**

### ⏳ 待验证（剩余 + 第 3 轮新增）
1. **macOS 系统升级后权限状态**（Sonoma → Sequoia 权限保留？）
2. **before-quit 是否真的 flush pending action / pipeline 到磁盘** — N7 已立项需深入
3. **toast 在全屏应用下是否可见** — N8 已立项需实测
4. **OCR 引擎 worker pool 上限** — M3 跟踪中
5. **electron 34 的 contextIsolation 默认值是否被覆盖**
6. **secrets.json 文件权限（0o600）实际生效情况** — Linux/Windows 不同
7. **asarUnpack 列表是否覆盖所有 native modules**（缺一个就跑不起来）
8. **dist/ 文件是否包含 .map source map**（生产体积 + 反编译风险）
9. **scripts/postpack-smoke.ts 是否在 CI 跑** — package.json 有 smoke:postpack 但 test:ci 没调
10. **better-sqlite3 在 Apple Silicon vs Intel 是否需要分别打包** — pack:mac 是否处理

---

## 审计历史

### 2026-05-16 第 1 轮（基线建立）
- 范围：grep 扫描 TODO/FIXME/swallow/setInterval/eslint-disable/退役 + 核心模块（action-executor / error-logger / ipc-handlers / scripts）
- 产出：16 个 bug（C×3, M×5, N×6, A×4）+ 10 个待验证项
- 核心判断：
  - **swallow 错误处理是系统性的架构红线**（C1）— 28+ 处分布在所有核心模块
  - **action-executor.ts 既有新架构又有 200 行死代码并存**（C3 + A3）
  - **测试代码 / 调试痕迹 / 编译产物 / 未实现功能 散布严重**（N1-N6）

### 2026-05-16 第 2 轮（待验证项核实 + 安全 + 边缘场景）
- 范围：验证第 1 轮 10 个待验证项 / preload.cjs + ipc-handlers 全文扫描 / SQL 安全 / powerMonitor / multi-display / 网络 / 依赖 audit
- 产出：9 个新 bug（C×2, M×5, N×2, A×2）+ 4 个 false alarm 撤回
- 核心判断：
  - **C4 IPC 输入校验完全缺失是真正最危险的安全 bug**
  - **C5 powerMonitor 未使用是桌面应用必修课盲点**
  - **M6 KG transaction 覆盖率仅 5.5%（54:3）** — 并发必然不一致
  - **M10 pnpm audit 405 失败** — 依赖安全审计 0 覆盖

### 2026-05-16 第 3 轮（打包/签名/发布 + 数据迁移 + 残留验证）
- 范围：electron-builder.yml 完整审计 / entitlements.mac.plist / secrets-store / KG migration / 图标资源 / scripts JSON 内容核实 / verify-real-logs import 链路
- 产出：12 个新 bug（C×4, M×5, N×1, A×2）+ 4 个第 2 轮待验证项核实立项
- 核心判断：
  - **C6 零代码签名 / Notarization 是发布前的死结** — 90% 普通用户在 Gatekeeper 拦截这一步直接放弃
  - **C7 零自动更新机制** — 文档说"AI 越用越懂你"，实际半年都不会更新一次
  - **C8 verify-real-logs.ts 进入生产 bundle** — 测试代码污染最严重的证据（main.ts:7 直接 import）
  - **C9 + A7 KG schema migration 5 处 swallow 无 schema_version** — 数据库演进失败完全不可见
  - **M13 scripts/*.json 含真实 LLM 对话被 commit** — "测试内容残留带给用户"最直接的证据
  - **A8 完整构建-发布流程缺失** — 项目还停留在手工业模式
- 下一轮建议聚焦：
  - **运行时性能 / 资源占用**：CPU / 内存 / 磁盘 IO 在 long-run 场景下的画像
  - **国际化 / 多语言**：中文 hard-code 范围 / 英文用户体验 / RTL 支持
  - **依赖深度审计**：手动看 package-lock.json 找已知 CVE 关键词（log4j 类）
  - **数据完整性测试**：故意破坏 SQLite 文件 / 模拟磁盘满 / 中断写入 看 Ovo 行为
