import { useCallback, useEffect, useRef, useState } from "react";

const isElectron = typeof window !== "undefined" && !!window.ovoAPI;

export type PermissionState = "granted" | "denied" | "not-determined" | "restricted" | "unknown" | "not-available";

export interface PermissionStatus {
  screenRecording: PermissionState;
  camera: PermissionState;
  microphone: PermissionState;
}

export interface RuntimeDiagnostic {
  code: "possible-old-build";
  message: string;
}

const DEFAULT_STATUS: PermissionStatus = {
  screenRecording: "unknown",
  camera: "unknown",
  microphone: "unknown"
};
const NON_ELECTRON_STATUS: PermissionStatus = {
  screenRecording: "not-available",
  camera: "not-available",
  microphone: "not-available"
};

function normalize(raw: Record<string, string> | null | undefined): PermissionStatus {
  if (!raw) return DEFAULT_STATUS;
  const get = (key: string): PermissionState => {
    const v = raw[key];
    if (v === "granted" || v === "denied" || v === "restricted" || v === "not-determined" || v === "not-available") {
      return v;
    }
    return "unknown";
  };
  return {
    screenRecording: get("screenRecording"),
    camera: get("camera"),
    microphone: get("microphone")
  };
}

/**
 * macOS 权限管理 hook。
 * - 启动时查询一次状态
 * - 当"屏幕录制"权限未授予时，每 3 秒轮询一次，方便用户在系统设置打开授权后自动感知
 * - 提供 `openSettings(target)` 直接跳转到系统设置对应分区
 * - 提供 `requestScreenRecording()` 触发一次 desktopCapturer（首次调用时 macOS 会弹原生授权提示）
 */
export function usePermissions() {
  const [status, setStatus] = useState<PermissionStatus>(DEFAULT_STATUS);
  const [loaded, setLoaded] = useState(false);
  const [runtimeDiagnostic, setRuntimeDiagnostic] = useState<RuntimeDiagnostic | null>(null);
  const pollTimer = useRef<number | null>(null);

  const checkStatus = useCallback(async () => {
    if (!isElectron) {
      setStatus(NON_ELECTRON_STATUS);
      setLoaded(true);
      return;
    }
    try {
      const result = await window.ovoAPI.permissions.getStatus();
      setStatus(normalize(result as unknown as Record<string, string>));
    } catch {
      /* ignore */
    } finally {
      setLoaded(true);
    }
  }, []);

  const openSettings = useCallback((target: "screen" | "camera" | "microphone" = "screen") => {
    if (!isElectron) return;
    void window.ovoAPI.permissions.openSettings({ target }).catch(() => {});
  }, []);

  const requestScreenRecording = useCallback(async () => {
    if (!isElectron) return { ok: false, message: "非 Electron 环境" };
    try {
      // 调用一次 capture:take-screenshot，macOS 在第一次请求时会弹出原生授权提示
      await window.ovoAPI.capture.takeScreenshot();
      await checkStatus();
      return { ok: true, message: "" };
    } catch (err) {
      await checkStatus();
      const raw = err instanceof Error ? err.message : "截图失败";
      const isPermissionDenied = /PERMISSION_DENIED|权限未授权/.test(raw);
      if (isPermissionDenied) {
        // 主动跳转系统设置，不再当作"调用失败"显示红框
        try { await window.ovoAPI.permissions.openSettings({ target: "screen" }); } catch { /* ignore */ }
        return { ok: false, message: "屏幕录制权限未授权，已为你打开系统设置" };
      }
      return { ok: false, message: raw };
    }
  }, [checkStatus]);

  useEffect(() => { void checkStatus(); }, [checkStatus]);

  // 主进程在权限变更时会推送 permissions:status；
  // 如果带 screen=granted 就直接强制覆盖（用 desktopCapturer 实证），
  // 避免 systemPreferences cache 旧 "denied" 让 UI 一直显示未授权。
  useEffect(() => {
    if (!isElectron) return;
    const off = window.ovoAPI.on("permissions:status", (payload) => {
      if (payload?.screen === "granted") {
        setStatus((prev) => ({ ...prev, screenRecording: "granted" }));
        setLoaded(true);
      } else {
        void checkStatus();
      }
    });
    return () => { try { off(); } catch { /* ignore */ } };
  }, [checkStatus]);

  // 启动自检：用于识别“renderer 更新了，但启动的是旧版 main 进程”这类问题
  useEffect(() => {
    if (!isElectron) return;
    let cancelled = false;
    void (async () => {
      try {
        const runtime = await window.ovoAPI.app.runtimeCheck();
        if (cancelled) return;
        if (!runtime?.channels?.takeScreenshot) {
          setRuntimeDiagnostic({
            code: "possible-old-build",
            message: "检测到当前应用缺少截图 IPC 能力，可能启动了旧版打包应用。请关闭所有 ovo 后，从最新打包目录重新启动。"
          });
        } else {
          setRuntimeDiagnostic(null);
        }
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes("No handler registered for 'app:runtime-check'")) {
          setRuntimeDiagnostic({
            code: "possible-old-build",
            message: "当前主进程不支持运行时自检接口，可能仍在运行旧版应用。请关闭所有 ovo 后，从最新打包目录重新启动。"
          });
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // 屏幕录制未授权时，每 3 秒轮询一次
  useEffect(() => {
    if (!isElectron) return;
    const isScreenMissing = status.screenRecording !== "granted" && status.screenRecording !== "not-available";
    if (!isScreenMissing) {
      if (pollTimer.current) {
        window.clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
      return;
    }
    if (pollTimer.current) return;
    pollTimer.current = window.setInterval(() => { void checkStatus(); }, 3000);
    return () => {
      if (pollTimer.current) {
        window.clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
    };
  }, [status.screenRecording, checkStatus]);

  const isGranted = useCallback((key: keyof PermissionStatus) => status[key] === "granted", [status]);

  const isNotAvailable = useCallback(
    (key: keyof PermissionStatus) => status[key] === "not-available",
    [status]
  );

  // 只关注屏幕录制，这是这个应用唯一必需的权限
  const screenRecordingMissing = !isGranted("screenRecording") && !isNotAvailable("screenRecording");

  return {
    status,
    loaded,
    isGranted,
    isNotAvailable,
    screenRecordingMissing,
    runtimeDiagnostic,
    // 兼容旧接口
    hasMissing: screenRecordingMissing,
    checkStatus,
    openSettings,
    requestScreenRecording
  };
}
