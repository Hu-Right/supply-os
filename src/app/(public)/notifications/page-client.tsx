"use client";

/**
 * /notifications — 站内通知收件箱（列表）
 *
 * @module app/(public)/notifications/page-client
 * @description 2026-11 样式重构（参照阿里云消息中心的信息架构，皮肤仍用本站 token）：
 *              ① 单行高密度表格：未读点 | 分类 | 标题 + 灰字摘要 | 时间右对齐（一屏 15+ 条）；
 *              ② 分类 tab 用下划线激活态（分类筛选，不是模式切换）；
 *              ③ 工具条：左「全部/未读 + 搜索」，右「标记已读 / 删除 / 全部已读 / 全部删除」；
 *              ④ 复选框批量操作，危险动作走 ConfirmDialog；
 *              ⑤ 搜索在前端过滤（通知正文由 type 渲染，服务端库里没有可搜的中文），
 *                 有输入时按 100 条拉取后再筛，并明示搜索范围。
 *
 *              不做：阿里云的左侧「消息接收管理」（无短信/语音/机器人渠道，做出来是空壳）。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLocale } from "@/core/i18n";
import {
  deleteNotifications,
  fetchNotifications,
  markNotificationsRead,
  type NotificationItem,
} from "@/core/api/notifications";
import { ConfirmDialog } from "@/shared/ui";
import { renderNotification } from "@/shared/notifications/renderNotification";
import { formatNotificationTime } from "@/shared/notifications/formatNotificationTime";

const PAGE_SIZE = 20;
/** 搜索模式一次拉取的条数（前端过滤，覆盖绝大多数场景） */
const SEARCH_SIZE = 100;

type CategoryKey = "all" | "procurement" | "matched" | "account";

const CATEGORIES: Array<{ key: CategoryKey; labelKey: string; types: string[] | null }> = [
  { key: "all", labelKey: "notifFilterAll", types: null },
  {
    key: "procurement",
    labelKey: "notifFilterProcurement",
    types: [
      "procurement.published",
      "procurement.need_info",
      "procurement.expired",
      // 后台审核类（2026-11 统一收口进通知模块）
      "procurement.auto_review",
      "procurement.authorization_verified",
      "procurement.authorization_rejected",
    ],
  },
  { key: "matched", labelKey: "notifCategoryMatched", types: ["procurement.matched"] },
  { key: "account", labelKey: "notifFilterAccount", types: ["buyer.verified", "buyer.need_info", "buyer.restricted"] },
];

export default function NotificationsPageClient() {
  const { t } = useLocale();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [unread, setUnread] = useState(0);
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [category, setCategory] = useState<CategoryKey>("all");
  const [keyword, setKeyword] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  /** 删除确认：null=未打开；{all:true}=全部删除 */
  const [confirm, setConfirm] = useState<{ all: boolean } | null>(null);

  const searching = keyword.trim().length > 0;
  const activeTypes = useMemo(
    () => CATEGORIES.find((c) => c.key === category)?.types ?? null,
    [category],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetchNotifications({
        page: searching ? 1 : page,
        pageSize: searching ? SEARCH_SIZE : PAGE_SIZE,
        unreadOnly,
        types: activeTypes,
      });
      setItems(d.items);
      setTotal(d.total);
      setUnread(d.unread);
      setSelected([]);
      setError("");
    } catch (err) {
      setError((err as Error).message || t("errSystemBusy"));
    } finally {
      setLoading(false);
    }
  }, [page, unreadOnly, activeTypes, searching, t]);

  useEffect(() => {
    void load();
  }, [load]);

  /** 搜索：前端过滤（标题/摘要按当前语言渲染后再匹配） */
  const visible = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return items;
    return items.filter((n) => {
      const r = renderNotification(t, n);
      return `${r.title} ${r.body} ${n.type}`.toLowerCase().includes(kw);
    });
  }, [items, keyword, t]);

  const runBatch = async (fn: () => Promise<number>, doneKey: "notifMarkedCount" | "notifDeleteDone") => {
    setBusy(true);
    setNotice("");
    try {
      const count = await fn();
      setNotice(t(doneKey, { count }));
      await load();
    } catch (err) {
      setError((err as Error).message || t("errSystemBusy"));
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const toggleOne = (id: number) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const allChecked = visible.length > 0 && selected.length === visible.length;
  const toggleAll = () => setSelected(allChecked ? [] : visible.map((n) => n.id));

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="-mx-4 -my-6 sm:-mx-6 lg:-mx-8 bg-[#F5F8FB] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-4">
        {/* 页头：标题 + 分类 tab（下划线激活态） */}
        <div className="rounded-2xl border border-secondary-200 bg-white shadow-xs">
          <div className="px-5 pt-5">
            <h1 className="text-lg font-extrabold text-secondary-900">{t("notifPageTitle")}</h1>
            <p className="mt-1 text-xs text-secondary-500">{t("notifPageHint")}</p>
          </div>

          <nav className="mt-4 flex gap-5 overflow-x-auto border-b border-secondary-200 px-5 text-sm">
            {CATEGORIES.map((c) => {
              const active = category === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => {
                    setCategory(c.key);
                    setPage(1);
                  }}
                  className={
                    active
                      ? "-mb-px whitespace-nowrap border-b-2 border-teal-600 pb-2 font-semibold text-teal-700"
                      : "-mb-px whitespace-nowrap border-b-2 border-transparent pb-2 text-secondary-500 hover:text-secondary-800"
                  }
                >
                  {t(c.labelKey)}
                </button>
              );
            })}
          </nav>

          {/* 工具条：左筛选 + 搜索，右批量动作 */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={unreadOnly ? "unread" : "all"}
                onChange={(e) => {
                  setUnreadOnly(e.target.value === "unread");
                  setPage(1);
                }}
                className="rounded-lg border border-secondary-300 px-3 py-1.5 text-xs text-secondary-700"
              >
                <option value="all">{t("notifFilterAll")}</option>
                <option value="unread">
                  {t("notifFilterUnread")}
                  {unread > 0 ? ` (${unread})` : ""}
                </option>
              </select>
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder={t("notifSearchPh")}
                className="w-56 rounded-lg border border-secondary-300 px-3 py-1.5 text-xs"
              />
              {searching && (
                <span className="text-[11px] text-secondary-400">{t("notifSearchHint", { count: SEARCH_SIZE })}</span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              {selected.length > 0 && (
                <span className="font-semibold text-secondary-600">{t("notifSelected", { count: selected.length })}</span>
              )}
              <button
                type="button"
                disabled={busy || selected.length === 0}
                onClick={() => void runBatch(() => markNotificationsRead({ ids: selected }), "notifMarkedCount")}
                className="rounded-lg border border-secondary-300 px-3 py-1.5 font-semibold text-secondary-600 hover:bg-secondary-50 disabled:opacity-40"
              >
                {t("notifMarkRead")}
              </button>
              <button
                type="button"
                disabled={busy || selected.length === 0}
                onClick={() => setConfirm({ all: false })}
                className="rounded-lg border border-secondary-300 px-3 py-1.5 font-semibold text-secondary-600 hover:bg-secondary-50 disabled:opacity-40"
              >
                {t("notifDelete")}
              </button>
              <span className="mx-1 h-4 w-px bg-secondary-200" />
              <button
                type="button"
                disabled={busy || unread === 0}
                onClick={() => void runBatch(() => markNotificationsRead({ all: true, types: activeTypes }), "notifMarkedCount")}
                className="rounded-lg border border-secondary-300 px-3 py-1.5 font-semibold text-secondary-600 hover:bg-secondary-50 disabled:opacity-40"
              >
                {t("notifMarkAllRead")}
              </button>
              <button
                type="button"
                disabled={busy || total === 0}
                onClick={() => setConfirm({ all: true })}
                className="rounded-lg border border-red-200 px-3 py-1.5 font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40"
              >
                {t("notifDeleteAll")}
              </button>
            </div>
          </div>

          {(notice || error) && (
            <div className="px-5 pb-3">
              {notice && <p className="rounded-lg bg-teal-50 px-3 py-2 text-xs text-teal-800">{notice}</p>}
              {error && <p className="mt-1 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
            </div>
          )}
        </div>

        {/* 列表：单行表格 */}
        <div className="overflow-hidden rounded-2xl border border-secondary-200 bg-white shadow-xs">
          <div className="flex items-center gap-3 border-b border-secondary-200 bg-secondary-50 px-4 py-2 text-[11px] font-semibold text-secondary-500">
            <input
              type="checkbox"
              checked={allChecked}
              onChange={toggleAll}
              aria-label={t("notifSelectAll")}
              className="h-3.5 w-3.5 accent-teal-600"
            />
            <span className="hidden w-[84px] shrink-0 sm:block">{t("notifTypeLabel")}</span>
            <span className="min-w-0 flex-1">{t("notifPageTitle")}</span>
            <span className="hidden w-[92px] shrink-0 text-right sm:block">{t("notifTimeLabel")}</span>
          </div>

          {loading ? (
            <div className="px-4 py-12 text-center text-sm text-secondary-400">{t("notifLoading")}</div>
          ) : visible.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <p className="text-sm text-secondary-500">{searching ? t("notifNoMatch") : t("notifEmpty")}</p>
              <p className="mt-1 text-xs text-secondary-400">{t("notifEmptyHint")}</p>
            </div>
          ) : (
            <ul>
              {visible.map((n) => {
                const r = renderNotification(t, n);
                const cat = n.type.startsWith("buyer.")
                  ? t("notifFilterAccount")
                  : n.type === "procurement.matched"
                    ? t("notifCategoryMatched")
                    : t("notifFilterProcurement");
                return (
                  <li
                    key={n.id}
                    className={`flex items-center gap-3 border-b border-secondary-100 px-4 py-2.5 last:border-b-0 hover:bg-secondary-50 ${
                      selected.includes(n.id) ? "bg-teal-50/60" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(n.id)}
                      onChange={() => toggleOne(n.id)}
                      aria-label={r.title}
                      className="h-3.5 w-3.5 accent-teal-600"
                    />
                    <Link href={`/notifications/${n.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                      <span className="hidden w-[84px] shrink-0 truncate text-xs text-secondary-500 sm:block">{cat}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${n.isRead ? "bg-transparent" : "bg-danger-500"}`}
                          />
                          <span className={`truncate text-sm ${n.isRead ? "text-secondary-700" : "font-semibold text-secondary-900"}`}>
                            {r.title}
                          </span>
                        </span>
                        {r.body && <span className="mt-0.5 block truncate text-xs text-secondary-500">{r.body}</span>}
                      </span>
                      <span className="hidden w-[92px] shrink-0 text-right text-[11px] text-secondary-400 sm:block">
                        {formatNotificationTime(n.createdAt)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* 分页（搜索模式不翻页） */}
        {!searching && totalPages > 1 && (
          <div className="flex items-center justify-between text-xs text-secondary-500">
            <span>
              {page} / {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-secondary-300 px-3 py-1.5 font-semibold disabled:opacity-50"
              >
                {t("pc_prev")}
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-lg border border-secondary-300 px-3 py-1.5 font-semibold disabled:opacity-50"
              >
                {t("pc_next")}
              </button>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirm != null}
        onClose={() => setConfirm(null)}
        onConfirm={() =>
          void runBatch(
            () =>
              confirm?.all
                ? deleteNotifications({ all: true, types: activeTypes })
                : deleteNotifications({ ids: selected }),
            "notifDeleteDone",
          )
        }
        title={t("notifDeleteConfirmTitle")}
        description={
          confirm?.all
            ? t("notifDeleteAllConfirmBody", { count: total })
            : t("notifDeleteConfirmBody", { count: selected.length })
        }
        confirmLabel={t("notifDelete")}
        variant="danger"
        loading={busy}
      />
    </div>
  );
}
