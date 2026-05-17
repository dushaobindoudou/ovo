import { useEffect, useState } from "react";

const isElectron = typeof window !== "undefined" && !!window.ovoAPI;

/**
 * M8 / T13: 监听 navigator.onLine 并上报到主进程。
 * 主进程的 systemEvents hub 据此决定是否进入离线模式。
 *
 * 在 App 根组件挂一次即可（多 console / floating / panel 任一挂载就 OK）。
 */
export function useNetworkWatcher(): { online: boolean } {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  useEffect(() => {
    const report = (state: boolean) => {
      setOnline(state);
      if (isElectron) {
        void window.ovoAPI.system.reportOnline(state).catch(() => { /* ignore — IPC 失败不阻塞 */ });
      }
    };
    const onOnline = () => report(true);
    const onOffline = () => report(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    // 初始也上报一次（主进程默认 true，但 renderer 实际可能离线启动）
    report(navigator.onLine);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  return { online };
}
