/**
 * 顶栏通知铃铛 + 收件箱下拉
 *
 * @module shared/layout/NotificationBell
 * @description 未读徽标 + 最近 5 条预览 + 「查看全部通知」进收件箱页。
 *              2026-11 改造：
 *              ① 文案按 `type + payload` 渲染多语言（此前直接显示后端字符串，后端一旦写中文
 *                 就锁死成单语）；`renderNotification` 统一兜底未知类型。
 *              ② 点击条目 → 通知详情页（完整信息），不再直接跳业务页：业务动作在详情里给按钮，
 *                 避免"点了通知就直接离开、看不到结论原文"。
 *              ③ 窗口重新聚焦 / 标签页切回时刷新未读（此前只有 60s 定时器，切回来要干等）。
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useAuth } from "@/core/auth";
import { useLocale } from "@/core/i18n";
import { fetchNotifications, type NotificationItem } from "@/core/api/notifications";
import { renderNotification } from "@/shared/notifications/renderNotification";
import { formatNotificationTime } from "@/shared/notifications/formatNotificationTime";

/** 下拉预览条数 */
const PREVIEW_SIZE = 5;

export function NotificationBell() {
  const { authUser } = useAuth();
  const { t } = useLocale();

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetchNotifications({ pageSize: PREVIEW_SIZE });
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
    // 切回标签页/窗口聚焦时立刻对一次未读，不必等定时器
    const onVisible = () => {
      if (document.visibilityState === "visible") void reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
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
          <div className="flex items-center justify-between px-3 py-2 text-xs font-bold text-secondary-600 border-b border-secondary-100">
            <span>{t("notifTitle")}</span>
            {unread > 0 && <span className="font-semibold text-danger-500">{unread}</span>}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-secondary-100">
            {loading && items.length === 0 && (
              <div className="px-3 py-6 text-center text-xs text-secondary-400">{t("notifLoading")}</div>
            )}
            {!loading && items.length === 0 && (
              <div className="px-3 py-6 text-center text-xs text-secondary-400">{t("notifEmpty")}</div>
            )}
            {items.map((n) => {
              const rendered = renderNotification(t, n);
              return (
                <Link
                  key={n.id}
                  href={`/notifications/${n.id}`}
                  onClick={() => setOpen(false)}
                  className={`block px-3 py-2.5 hover:bg-secondary-100 transition-colors ${n.isRead ? "" : "font-medium"}`}
                >
                  <div className="flex items-start gap-2">
                    <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${n.isRead ? "bg-transparent" : "bg-danger-500"}`} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-slate-800 truncate">{rendered.title}</div>
                      {rendered.body && <div className="text-xs text-secondary-500 mt-0.5 line-clamp-2">{rendered.body}</div>}
                      <div className="text-[10px] text-secondary-400 mt-1">{formatNotificationTime(n.createdAt)}</div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-secondary-100 px-3 py-2 text-center text-xs font-semibold text-teal-700 hover:bg-secondary-50"
          >
            {t("notifViewAll")}
          </Link>
        </div>
      )}
    </div>
  );
}
