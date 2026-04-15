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

## 五、模拟模式测试（无屏幕权限也可验证）

运行时使用：

```bash
OVO_SIMULATE_CAPTURE=1 pnpm dev
```

或在控制台设置中打开“权限模拟模式”。

## 六、定期截屏自检

控制台设置中可配置：

- 开关：定期截屏自检
- 间隔：30 / 60 / 120 / 300 秒

状态总览会显示：

- 健康状态
- 自检模式（real/simulation）
- OCR 置信度
- 文本长度
- 距离最近捕获时间
- 错误信息（若异常）
