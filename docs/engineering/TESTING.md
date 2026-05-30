# ovo 测试与环境说明

## 一、环境准备

```bash
pnpm install
```

若 `electron` / `better-sqlite3` / `tesseract.js` 报安装或运行异常：

```bash
pnpm approve-builds
```

按提示允许相关依赖执行 build scripts。

## 二、标准验证流程

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm test:agents
```

或者一条命令：

```bash
pnpm test:ci
```

## 三、底层 Agent 全覆盖测试

命令：

```bash
pnpm test:agents
```

覆盖后端：

- `claude-code`
- `openclaw`
- `hermes`
- `api`

结果类型：

- `PASS`：可调用并返回结果
- `FAIL`：可用但调用失败
- `SKIP`：当前机器未满足前置条件（如 CLI 未安装）

## 四、API 后端测试前置环境变量

```bash
export OVO_API_BASE_URL="https://your-api-base"
export OVO_API_KEY="your-api-key"
export OVO_API_MODEL="your-model-id"
```

## 五、macOS 权限前置（真实数据采集）

ovo 的窗口枚举与截图/OCR **不再提供模拟数据回退**。首次运行请确认：

- **屏幕录制**：系统设置 -> 隐私与安全性 -> 屏幕录制 -> 勾选 Electron/ovo
- **自动化/辅助功能**：系统设置 -> 隐私与安全性 -> 辅助功能/自动化（不同 macOS 版本入口略有差异）

修改权限后建议 **完全退出并重启** Electron 应用。

## 六、定期截屏自检

控制台设置中可配置：

- 开关：定期截屏自检
- 间隔：30 / 60 / 120 / 300 秒

状态总览会显示：

- 健康状态
- 自检模式（real）
- OCR 置信度
- 文本长度
- 距离最近捕获时间
- 错误信息（若异常）
