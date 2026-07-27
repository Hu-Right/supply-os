import {
  ArrowLeft,
  Bell,
  Crown,
  ExternalLink,
  Heart,
  Lock,
  WalletCards,
} from "lucide-react";
import { useLocale } from "@/core/i18n";
import type { NoticeItem, MembershipStatus, MembershipPlan, PaymentOrder } from "../types";
import { useNoticeTranslation } from "../hooks/useNoticeTranslation";
import { noticeTypeKey } from "../notice-type";
import { NoticeUnlockedDetails } from "./NoticeUnlockedDetails";
import { NoticePaymentPanel } from "./NoticePaymentPanel";

interface NoticeDetailProps {
  notice: NoticeItem;
  actionMessage: string;
  membership: MembershipStatus | null;
  freeRemaining: number;
  freeQuota: number;
  canUsePaidQuota: boolean;
  isVip: boolean;
  onBack: () => void;
  onExpressInterest: (notice: NoticeItem, type: "interested" | "subscribed") => void;
  onUnlock: (notice: NoticeItem) => void;
  onPayUnlock: (notice: NoticeItem) => void;
  /** 已解锁公告的拓展详情加载中：以骨架屏替代锁定面板，避免闪烁 */
  detailLoading?: boolean;
  /** 内嵌多套餐付费面板（付费墙）状态与回调；paywallNotice 存在时在 aside 渲染面板 */
  payment?: {
    plans: MembershipPlan[];
    paywallNotice: NoticeItem | null;
    order: PaymentOrder | null;
    provider: "alipay" | "wechat";
    busyPlanCode: string;
    message: string;
    onProviderChange: (provider: "alipay" | "wechat") => void;
    onCreateOrder: (planCode: string) => void;
    onMockPaid: () => void;
    onClose: () => void;
  };
}

export function NoticeDetail({
  notice,
  actionMessage,
  membership,
  freeRemaining,
  freeQuota,
  canUsePaidQuota,
  isVip,
  onBack,
  onExpressInterest,
  onUnlock,
  onPayUnlock,
  detailLoading,
  payment,
}: NoticeDetailProps) {
  const { t, locale } = useLocale();
  const { translation, translating, showOriginal, toggleOriginal } = useNoticeTranslation(
    (notice as { id?: number }).id,
    locale
  );
  const showTranslated = !showOriginal && !!translation;
  const displayTitle = showTranslated && translation?.title ? translation.title : notice.title;
  const displayDescription =
    showTranslated && translation?.description ? translation.description : notice.description;
  const coreUnlocked = notice.core_locked === false;
  // 已知采购类型走 i18n 本地化，未识别的长尾值原样回退
  const typeKey = noticeTypeKey(notice.notice_type);
  const showSkeleton = !coreUnlocked && !!detailLoading;
  const visibleAgency = coreUnlocked
    ? notice.agency_full || notice.agency || notice.organization || t("procurement_unknownAgency")
    : showSkeleton
      ? t("procurement_loading")
      : t("procurement_lockedCoreTitle");

  return (
    <div className="space-y-5">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-bold text-slate-600 hover:bg-slate-50"
      >
        <ArrowLeft className="w-4 h-4" />
        {t("procurement_back")}
      </button>

      <article className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
        <div className="grid grid-cols-[minmax(0,1fr)_340px] gap-6 max-[900px]:grid-cols-1">
          <main className="min-w-0 space-y-5">
            <div className="border-b border-slate-100 pb-5">
              <p className="text-xs font-black text-teal-600 uppercase tracking-wider">
                {typeKey ? t(typeKey) : notice.notice_type || "Procurement Notice"}
              </p>
              <h3 className="text-2xl md:text-3xl font-extrabold text-slate-950 mt-2 leading-tight">
                {displayTitle}
              </h3>
              <p className="text-sm text-slate-500 mt-3">
                {visibleAgency} ·{" "}
                {notice.country || t("procurement_global")} ·{" "}
                {notice.deadline || t("procurement_noDeadline")}
              </p>
            </div>

            {actionMessage && (
              <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800">
                {actionMessage}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
              {[
                [t("procurement_metaNo"), notice.reference || notice.notice_id || "-"],
                [t("procurement_agency"), visibleAgency],
                [t("procurement_country"), notice.country || "-"],
                [t("procurement_budget"), notice.estimated_value || t("procurement_budgetPending")],
              ].map(([label, value]) => (
                <div key={label} className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                  <p className="font-black text-slate-400 uppercase">{label}</p>
                  <p className="font-bold text-slate-800 mt-1 break-words">{value}</p>
                </div>
              ))}
            </div>

            <div>
              <div className="flex items-center gap-3 mb-2">
                <h4 className="text-sm font-extrabold text-slate-900">{t("procurement_description")}</h4>
                {translating && (
                  <span className="text-xs font-bold text-blue-600 animate-pulse">
                    {t("procurement_translating")}
                  </span>
                )}
                {translation && (
                  <button
                    onClick={toggleOriginal}
                    className="text-xs font-bold text-blue-700 hover:underline"
                  >
                    {showOriginal ? t("procurement_viewTranslation") : t("procurement_viewOriginal")}
                  </button>
                )}
              </div>
              <p className="text-sm text-slate-600 leading-7 whitespace-pre-line break-words">
                {displayDescription || t("procurement_noDesc")}
              </p>
              {showTranslated && (
                <p className="text-[11px] text-slate-400 mt-2">{t("procurement_translateNote")}</p>
              )}
            </div>

            {coreUnlocked ? (
              <>
                <div>
                  <h4 className="text-sm font-extrabold text-slate-900 mb-2">{t("procurement_tags")}</h4>
                  <div className="flex flex-wrap gap-2">
                    {(notice.unspsc_codes || []).slice(0, 16).map((code, index) => (
                      <span
                        key={`${code.code || index}`}
                        className="px-2 py-1 rounded-md border border-slate-200 bg-slate-50 text-xs font-mono text-slate-600"
                      >
                        {code.code || code.name || code.description}
                      </span>
                    ))}
                  </div>
                </div>

                {notice.source_url && (
                  <a
                    href={notice.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 text-sm font-bold text-blue-700 hover:underline"
                  >
                    {t("procurement_source")}
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}

                <NoticeUnlockedDetails notice={notice} />
              </>
            ) : showSkeleton ? (
              <div data-testid="detail-skeleton" className="space-y-5 animate-pulse">
                {/* 标签区占位（标题 + UNSPSC chips，与真实 chip 同款底色/边框） */}
                <div>
                  <div className="h-5 w-24 bg-slate-200 rounded mb-2" />
                  <div className="flex flex-wrap gap-2">
                    {[56, 72, 64, 80, 60, 68].map((width, index) => (
                      <div
                        key={index}
                        className="h-6 rounded-md border border-slate-200 bg-slate-50"
                        style={{ width }}
                      />
                    ))}
                  </div>
                </div>

                {/* 来源链接占位（text-sm 行高） */}
                <div className="h-5 w-40 bg-slate-200 rounded" />

                {/* 解锁详情面板占位（对齐 NoticeUnlockedDetails：teal-200 边框 + 章节结构） */}
                <div className="rounded-xl border border-teal-200 bg-teal-50/40 p-4 space-y-4">
                  {/* 面板标题：图标 + 文本 */}
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded bg-teal-200/80" />
                    <div className="h-4 w-32 bg-teal-100 rounded" />
                  </div>

                  {/* 元信息三列白卡（label + value） */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {[0, 1, 2].map((index) => (
                      <div key={index} className="bg-white border border-slate-100 rounded-lg p-3">
                        <div className="h-3 w-16 bg-slate-200 rounded" />
                        <div className="h-3.5 w-24 bg-slate-200 rounded mt-2" />
                      </div>
                    ))}
                  </div>

                  {/* 原始链接：小节标题 + 链接行 */}
                  <div>
                    <div className="h-3 w-20 bg-slate-200 rounded mb-2" />
                    <div className="h-3.5 w-36 bg-slate-100 rounded" />
                  </div>

                  {/* 联系人：小节标题 + 白卡（姓名/邮箱/电话三行） */}
                  <div>
                    <div className="h-3 w-20 bg-slate-200 rounded mb-2" />
                    <div className="space-y-2">
                      {[0, 1].map((index) => (
                        <div key={index} className="bg-white border border-slate-100 rounded-lg p-3 space-y-1.5">
                          <div className="h-3.5 w-32 bg-slate-200 rounded" />
                          <div className="h-3 w-48 max-w-full bg-slate-100 rounded" />
                          <div className="h-3 w-28 bg-slate-100 rounded" />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 投标拆解框：图标标题 + 四行列表 */}
                  <div className="rounded-lg border border-teal-100 bg-white p-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <div className="w-3.5 h-3.5 rounded bg-teal-100" />
                      <div className="h-3.5 w-28 bg-slate-200 rounded" />
                    </div>
                    <div className="space-y-2 pl-4">
                      <div className="h-3 w-full bg-slate-100 rounded" />
                      <div className="h-3 w-11/12 bg-slate-100 rounded" />
                      <div className="h-3 w-4/5 bg-slate-100 rounded" />
                      <div className="h-3 w-2/3 bg-slate-100 rounded" />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
                <h4 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-amber-700" />
                  {t("procurement_lockedCoreTitle")}
                </h4>
                <p className="text-sm text-amber-900 leading-7 mt-2">{t("procurement_lockedCoreDesc")}</p>
              </div>
            )}
          </main>

          <aside className="sticky top-24 h-fit space-y-4 max-[900px]:static">
            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-3">
              <button
                onClick={() => onExpressInterest(notice, "interested")}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-black hover:bg-blue-700"
              >
                <Heart className="w-4 h-4" />
                {t("procurement_interested")}
              </button>
              <button
                onClick={() => onExpressInterest(notice, "subscribed")}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-black hover:bg-slate-800"
              >
                <Bell className="w-4 h-4 text-amber-300" />
                {t("procurement_subscribeNotice")}
              </button>
              <button
                onClick={() => onUnlock(notice)}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-teal-100 text-teal-800 text-sm font-black hover:bg-teal-200"
              >
                <Lock className="w-4 h-4" />
                {canUsePaidQuota
                  ? t("procurement_memberUnlock")
                  : freeRemaining > 0
                    ? `${t("procurement_freeUnlock")} (${t("procurement_remaining")} ${freeRemaining})`
                    : t("procurement_freeUsedUp")}
              </button>

              {notice.core_locked !== false && !showSkeleton && (
                <button
                  onClick={() => onPayUnlock(notice)}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-teal-600 text-white text-sm font-black hover:bg-teal-700"
                >
                  <WalletCards className="w-4 h-4" />
                  {t("procurement_singleUnlock")}
                </button>
              )}

              <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600 space-y-2">
                <p className="font-black text-slate-800 flex items-center gap-2">
                  <WalletCards className="w-4 h-4 text-teal-600" />
                  {t("procurement_quotaTitle")}
                </p>
                <p>
                  {t("procurement_freeQuota")}: {t("procurement_used")} {membership?.free_used ?? 0}/{freeQuota},{" "}
                  {t("procurement_remaining")} {freeRemaining}
                </p>
                <p>
                  {t("procurement_paidQuota")}: {t("procurement_used")} {membership?.paid_quota_used ?? 0}/
                  {membership?.paid_quota_total ?? 0}, {t("procurement_remaining")}{" "}
                  {membership?.paid_quota_remaining ?? 0}
                </p>
              </div>

              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-2">
                <p className="font-black text-slate-900 flex items-center gap-2">
                  <Crown className="w-4 h-4 text-amber-600" />
                  {t("procurement_paidServiceTitle")}
                </p>
                <ul className="space-y-1 leading-5 list-disc pl-4">
                  <li>{t("procurement_paidServiceContact")}</li>
                  <li>{t("procurement_paidServiceAnalysis")}</li>
                  <li>{t("procurement_paidServiceProcess")}</li>
                </ul>
                <p className="text-[11px] text-amber-800">{t("procurement_paidServiceManualNote")}</p>
              </div>

              <p className="text-[11px] leading-5 text-slate-500">{t("procurement_actionTip")}</p>
            </div>

            {payment?.paywallNotice && (
              <NoticePaymentPanel
                plans={payment.plans}
                provider={payment.provider}
                order={payment.order}
                busyPlanCode={payment.busyPlanCode}
                message={payment.message}
                onProviderChange={payment.onProviderChange}
                onCreateOrder={payment.onCreateOrder}
                onMockPaid={payment.onMockPaid}
                onClose={payment.onClose}
              />
            )}
          </aside>
        </div>
      </article>
    </div>
  );
}
