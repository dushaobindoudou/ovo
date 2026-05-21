/**
 * SEC-4: 加密保存 API key 等敏感凭证。
 *
 * 使用 Electron 的 `safeStorage` API，在 macOS 上走 Keychain，在 Linux 上走
 * libsecret，Windows 上走 DPAPI。Renderer 进程**永远拿不到原始明文**——只能查询
 * 「是否已配置」+ 调用 setApiKey 写入。
 *
 * 落盘位置：userData/secrets.json，文件结构：
 *   { apiBaseUrl: string, apiModel: string, apiKeyCipher: base64 }
 * baseUrl 和 model 不加密（无敏感性），apiKeyCipher 是 safeStorage.encryptString 的输出。
 *
 * 失败兜底：
 *   - safeStorage 不可用（Linux 无 libsecret 等）→ 整个文件不写，renderer setApiKey 返 false
 *     用户会在 UI 看到"系统未提供凭证存储"的提示，可在内存里临时用（重启丢）
 */
import fs from "node:fs";
import path from "node:path";
import { app, safeStorage } from "electron";

interface SecretsFile {
  apiBaseUrl?: string;
  apiModel?: string;
  /** safeStorage.encryptString 输出的 Buffer，base64 编码后落盘（real 加密模式） */
  apiKeyCipher?: string;
  /** 明文模式（dev / 未签名构建）下的 API key。仅在本机 dev 场景使用 */
  apiKeyPlain?: string;
}

const FILE_NAME = "secrets.json";

/**
 * 是否启用真正的钥匙串加密。
 *
 * 背景（用户反馈 2026-05-21）：macOS 上 safeStorage 每次访问 "ovo Safe Storage"
 * 钥匙串项都可能弹窗要密码。dev 构建 / 未签名打包构建的代码签名不稳定，钥匙串的
 * "始终允许" 授权存不住，于是**每次启动反复弹窗**，严重打断开发。
 *
 * 取舍：
 *   - 已签名的正式打包构建 → 用钥匙串加密（弹一次，始终允许后不再弹），at-rest 安全
 *   - dev / 未打包 → 明文模式，完全不碰钥匙串 → 不弹窗（dev 机器是开发者自己的，可接受）
 *   - 逃生开关：OVO_DISABLE_KEYCHAIN=1 强制明文；OVO_FORCE_ENCRYPTION=1 强制加密
 *
 * 结果缓存——一次决策，避免重复 isEncryptionAvailable() 调用。
 */
let cachedRealEncryption: boolean | null = null;
function keychainEncryptionEnabled(): boolean {
  if (cachedRealEncryption !== null) return cachedRealEncryption;
  if (process.env.OVO_DISABLE_KEYCHAIN === "1") { cachedRealEncryption = false; return false; }
  if (process.env.OVO_FORCE_ENCRYPTION === "1") { cachedRealEncryption = true; return true; }
  // A1（2026-05-21）：默认不用钥匙串 = 明文。理由：
  //   当前没有 Apple 代码签名(E2)，**未签名构建每次启动都会重弹钥匙串密码框**
  //   （"始终允许"授权绑定代码签名，未签名时存不住）。这对 dev 和打包安装版都成立。
  //   在签名就绪前，钥匙串加密既扰民又不可靠，故默认关闭。
  //   → 拿到 Apple 证书后：签名构建里设 OVO_FORCE_ENCRYPTION=1（或加签名检测）开回加密。
  cachedRealEncryption = false;
  return false;
}

function filePath() {
  return path.join(app.getPath("userData"), FILE_NAME);
}

function readRaw(): SecretsFile {
  try {
    const buf = fs.readFileSync(filePath(), "utf8");
    return JSON.parse(buf) as SecretsFile;
  } catch {
    return {};
  }
}

function writeRaw(data: SecretsFile) {
  const p = filePath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data), { encoding: "utf8", mode: 0o600 });
}

export const secretsStore = {
  /** 系统是否能加密存储（钥匙串可用且当前为加密模式） */
  isEncryptionAvailable(): boolean {
    return keychainEncryptionEnabled();
  },

  /** 拿 API key 明文。**只在主进程内部调用**，绝不能通过 IPC 暴露给 renderer */
  getApiKey(): string | null {
    const data = readRaw();
    if (!keychainEncryptionEnabled()) {
      // 明文模式：直接读 apiKeyPlain（不碰钥匙串，不弹窗）
      return data.apiKeyPlain ?? null;
    }
    if (!data.apiKeyCipher) return null;
    try {
      const buf = Buffer.from(data.apiKeyCipher, "base64");
      return safeStorage.decryptString(buf);
    } catch {
      return null;
    }
  },

  /** 写入 API key。renderer 可调（一次性 setter）；按当前模式落盘 */
  setApiKey(key: string): boolean {
    const data = readRaw();
    if (!keychainEncryptionEnabled()) {
      // 明文模式：存 apiKeyPlain，清掉残留 cipher 避免歧义
      data.apiKeyPlain = key;
      delete data.apiKeyCipher;
      writeRaw(data);
      return true;
    }
    try {
      const buf = safeStorage.encryptString(key);
      data.apiKeyCipher = buf.toString("base64");
      delete data.apiKeyPlain;
      writeRaw(data);
      return true;
    } catch {
      return false;
    }
  },

  /** 清除 API key */
  clearApiKey(): boolean {
    const data = readRaw();
    delete data.apiKeyCipher;
    delete data.apiKeyPlain;
    writeRaw(data);
    return true;
  },

  /** 是否已配置 key（不返回明文） */
  hasApiKey(): boolean {
    const data = readRaw();
    return !!(data.apiKeyCipher || data.apiKeyPlain);
  },

  /** 给 renderer 的"masked"展示：sk-xxx****abc */
  getMaskedApiKey(): string {
    const key = this.getApiKey();
    if (!key) return "";
    if (key.length <= 8) return "****";
    return `${key.slice(0, 4)}***${key.slice(-3)}`;
  },

  getApiBaseUrl(): string {
    return readRaw().apiBaseUrl ?? "";
  },
  setApiBaseUrl(url: string) {
    const data = readRaw();
    data.apiBaseUrl = url;
    writeRaw(data);
  },

  getApiModel(): string {
    return readRaw().apiModel ?? "";
  },
  setApiModel(model: string) {
    const data = readRaw();
    data.apiModel = model;
    writeRaw(data);
  },

  /**
   * SEC-8 字段级加密：给敏感字段（OCR content）加密。
   * 落盘格式：`enc:v1:<base64-cipher>`，未加密内容直接返回原文（向前兼容老数据）。
   *
   * 选这个方案而不是 SQLCipher 全库加密的原因：
   *   - SQLite multi-ciphers fork 不支持当前 Node 25 ABI，重编麻烦且脆
   *   - 字段级加密能精准保护最高风险字段（OCR 摘要正文），其他字段（entity 名、时间戳）
   *     保持明文以便索引和查询
   *   - 系统重置后 safeStorage 解密失败时，老内容显示为 [无法解密] 但 app 仍可用
   */
  encryptField(plain: string): string {
    if (!plain) return plain;
    if (!keychainEncryptionEnabled()) return plain; // 明文模式：原样落盘，不碰钥匙串
    try {
      const buf = safeStorage.encryptString(plain);
      return `enc:v1:${buf.toString("base64")}`;
    } catch {
      return plain;
    }
  },

  decryptField(stored: string): string {
    if (!stored) return stored;
    if (!stored.startsWith("enc:v1:")) return stored; // 老数据/明文模式写入的原文，直接返回
    // 明文模式下遇到历史 enc:v1: 数据：不调用 safeStorage（否则又弹窗），返回占位。
    // 这些通常是之前在加密模式下写的 OCR 历史，dev 下不可读可接受。
    if (!keychainEncryptionEnabled()) return "[加密历史数据：当前为明文模式，不解密]";
    try {
      const buf = Buffer.from(stored.slice(7), "base64");
      return safeStorage.decryptString(buf);
    } catch {
      return "[无法解密：密钥已变]";
    }
  }
};
