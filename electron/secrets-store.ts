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
  /** safeStorage.encryptString 输出的 Buffer，base64 编码后落盘 */
  apiKeyCipher?: string;
}

const FILE_NAME = "secrets.json";

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
  /** 系统是否能加密存储（safeStorage 可用） */
  isEncryptionAvailable(): boolean {
    try {
      return safeStorage.isEncryptionAvailable();
    } catch {
      return false;
    }
  },

  /** 拿 API key 明文。**只在主进程内部调用**，绝不能通过 IPC 暴露给 renderer */
  getApiKey(): string | null {
    const data = readRaw();
    if (!data.apiKeyCipher) return null;
    if (!this.isEncryptionAvailable()) return null;
    try {
      const buf = Buffer.from(data.apiKeyCipher, "base64");
      return safeStorage.decryptString(buf);
    } catch {
      return null;
    }
  },

  /** 写入 API key。renderer 可调（一次性 setter）；写入后 cipher 落盘 */
  setApiKey(key: string): boolean {
    if (!this.isEncryptionAvailable()) return false;
    try {
      const buf = safeStorage.encryptString(key);
      const data = readRaw();
      data.apiKeyCipher = buf.toString("base64");
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
    writeRaw(data);
    return true;
  },

  /** 是否已配置 key（不返回明文） */
  hasApiKey(): boolean {
    return !!readRaw().apiKeyCipher;
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
    if (!this.isEncryptionAvailable()) return plain; // 失败兜底：保持原状不入加密
    try {
      const buf = safeStorage.encryptString(plain);
      return `enc:v1:${buf.toString("base64")}`;
    } catch {
      return plain;
    }
  },

  decryptField(stored: string): string {
    if (!stored) return stored;
    if (!stored.startsWith("enc:v1:")) return stored; // 老数据明文，直接返回
    if (!this.isEncryptionAvailable()) return "[无法解密：safeStorage 不可用]";
    try {
      const buf = Buffer.from(stored.slice(7), "base64");
      return safeStorage.decryptString(buf);
    } catch {
      return "[无法解密：密钥已变]";
    }
  }
};
