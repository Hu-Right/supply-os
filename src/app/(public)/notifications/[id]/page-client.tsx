"use client";

/**
 * /notifications/[id] — 通知详情（完整信息）
 *
 * @module app/(public)/notifications/[id]/page-client
 * @description 列表只给标题 + 摘要，完整正文在这里：正文按 type + payload 渲染多语言，
 *              底部给「前往处理」直达业务页（发布页 / 认证页）。
 *              打开即标记已读（幂等），不阻断渲染。
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale } from "@/core/i18n";
import { fetchNotification, markNotificationRead, type NotificationItem } from "@/core/api/notifications";
import { groupOf, renderNotification } from "@/shared/notifications/renderNotification";
import { formatNotificationTime } from "@/shared/notifications/formatNotificationTime";

export default function NotificationDetailPageClient({ id }: { id: number }) {
  const { t } = useLocale();
  const router = useRouter();
  const [item, setItem] = useState<NotificationItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const n = await fetchNotification(id);
        if (cancelled) return;
        setItem(n);
        if (!n.isRead) {
          // 打开即已读；失败不影响阅读
          void markNotificationRead(id).catch(() => undefined);
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message || t("errSystemBusy"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, t]);

  if (loading) {
    return <div className="mx-auto max-w-3xl px-4 py-16 text-center text-sm text-secondary-400">{t("notifLoading")}</div>;
  }

  if (error || !item) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-sm text-secondary-600">{error || t("notifEmpty")}</p>
        <Link href="/notifications" className="mt-4 inline-block text-sm font-semibold text-teal-700 underline">
          {t("notifBackList")}
        </Link>
      </div>
    );
  }

  const rendered = renderNotification(t, item);
  const g = groupOf(item.type);
  const typeLabel =
    g === "procurement" ? t("notifFilterProcurement") : g === "account" ? t("notifFilterAccount") : t("notifSystemLabel");

  return (
    <div className="-mx-4 -my-6 sm:-mx-6 lg:-mx-8 bg-[#F5F8FB] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl space-y-4">
        <Link href="/notifications" className="inline-block text-sm font-semibold text-teal-700 hover:underline">
          ← {t("notifBackList")}
        </Link>

        <article className="rounded-2xl border border-secondary-200 bg-white p-6 shadow-xs">
          <h1 className="text-lg font-extrabold text-secondary-900">{rendered.title}</h1>

          <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-secondary-400">
            <div className="flex gap-1">
              <dt>{t("notifTimeLabel")}：</dt>
              <dd>{formatNotificationTime(item.createdAt)}</dd>
            </div>
            <div className="flex gap-1">
              <dt>{t("notifTypeLabel")}：</dt>
              <dd>{typeLabel}</dd>
            </div>
          </dl>

          <div className="mt-5 whitespace-pre-wrap border-t border-secondary-100 pt-5 text-sm leading-relaxed text-secondary-800">
            {rendered.body}
          </div>

          {item.link && (
            <div className="mt-6">
              <button
                type="button"
                onClick={() => router.push(item.link)}
                className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
              >
                {t("notifGoAction")}
              </button>
            </div>
          )}
        </article>
      </div>
    </div>
  );
}
