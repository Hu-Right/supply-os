/**
 * 顶栏通知铃铛 + 收件箱下拉
 *
 * @module shared/layout/NotificationBell
 * @description 仅登录可见。展示未读徽标；点开拉取收件箱首页，点击条目标记已读并跳转 link。
 *              每 60 秒静默刷新未读数；请求失败静默（不打扰主流程）。文案走 i18n（common 命名空间）。
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { useAuth } from "@/core/auth";
import { useLocale } from "@/core/i18n";
import {
  fetchNotifications,
  markNotificationRead,
  type NotificationItem,
} from "@/core/api/notifications";

/** 通知时间展示：后端可能回 Date.toString()/ISO 串，统一归一为本地 yyyy-MM-dd HH:mm；无法解析则原样返回。 */
function formatNotifTime(v: string): string {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function NotificationBell() {
  const { authUser } = useAuth();
  const { t } = useLocale();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetchNotifications();
      setItems(d.items);
      setUnread(d.unread);
    } catch {
      /* 静默：通知不可用不影响主流程 */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authUser) return;
    void reload();
    const id = setInterval(() => void reload(), 60_000);
    return () => clearInterval(id);
  }, [authUser, reload]);

  // 点击外部关闭下拉
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (!authUser) return null;

  const onItemClick = async (n: NotificationItem) => {
    try {
      if (!n.isRead) {
        await markNotificationRead(n.id);
        setUnread((u) => Math.max(0, u - 1));
        setItems((list) => list.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
      }
    } catch {
      /* 标记失败仍允许跳转 */
    } finally {
      setOpen(false);
      if (n.link) router.push(n.link);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => {
          const willOpen = !open;
          setOpen(willOpen);
          if (willOpen) void reload();
        }}
        aria-label={t("notifBellAria")}
        className="relative p-2 rounded-lg text-secondary-500 hover:bg-secondary-100 transition-colors cursor-pointer"
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-danger-500 text-white text-[10px] leading-4 text-center font-bold">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 sm:w-80 rounded-xl border border-secondary-200 bg-white shadow-lg z-50 overflow-hidden">
          <div className="px-3 py-2 text-xs font-bold text-secondary-600 border-b border-secondary-100">
            {t("notifTitle")}
          </div>
          <div className="max-h-80 overflow-y-auto divide-y divide-secondary-100">
            {loading && items.length === 0 && (
              <div className="px-3 py-6 text-center text-xs text-secondary-400">{t("notifLoading")}</div>
            )}
            {!loading && items.length === 0 && (
              <div className="px-3 py-6 text-center text-xs text-secondary-400">{t("notifEmpty")}</div>
            )}
            {items.map((n) => (
              <button
                key={n.id}
                onClick={() => void onItemClick(n)}
                className={`w-full text-left px-3 py-2.5 hover:bg-secondary-100 transition-colors cursor-pointer ${n.isRead ? "" : "font-medium"}`}
              >
                <div className="flex items-start gap-2">
                  <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${n.isRead ? "bg-transparent" : "bg-danger-500"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-slate-800 truncate">{n.title}</div>
                    {n.body && <div className="text-xs text-secondary-500 mt-0.5">{n.body}</div>}
                    <div className="text-[10px] text-secondary-400 mt-1">{formatNotifTime(n.createdAt)}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
