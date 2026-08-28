/**
 * 网络状态检测 Hook + 离线横幅组件
 * Network Status Detection Hook + Offline Banner
 *
 * @module shared/layout/NetworkBanner
 * @description 监听 navigator.onLine 状态，网络断开时在页面顶部显示横幅提示。
 *              Monitors navigator.onLine; shows a banner at the top when offline.
 */
import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { useLocale } from "@/core/i18n";

/** 网络状态 Hook：返回当前是否在线 */
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    // 客户端挂载后同步真实网络状态，避免 SSR/客户端水合不匹配
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return isOnline;
}

/** 离线提示横幅组件 */
export function NetworkBanner() {
  const isOnline = useNetworkStatus();
  const { t } = useLocale();

  if (isOnline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[60] bg-rose-600 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-bold shadow-lg">
      <WifiOff className="w-4 h-4" />
      <span>{t("networkOffline")}</span>
    </div>
  );
}
