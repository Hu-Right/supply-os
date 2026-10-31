/**
 * 投标材料 Tab 内容
 * Bid Materials Tab Content
 *
 * @module features/procurement/components/NoticeDetail/FilesTab
 * @description 2026-10-29 信息架构拆分：原「原始文件」Tab 扩容为「投标材料」——
 *              上半部分 = 中文版订单拆解报告（下载 / 暂缺引导），下半部分 = 原始招标文件与外部链接。
 *              未解锁时展示会员专属引导（含报告预览 teaser）。
 */
import { Crown, Download, ExternalLink, FileText, Link, FileArchive, FileSpreadsheet, File } from "lucide-react";
import { useOptionalAuth } from "@/core/auth";
import type { GateState } from "@/types";
import { useLocale } from "@/core/i18n";
import { downloadFile } from "@/core/http";
import type { NoticeAttachment, NoticeDetailItem, NoticeItem } from "../../types";
import { downloadNoticeReport } from "../../api";
import { LockedFeatureCard } from "./LockedFeatureCard";
import { ReportUnavailableBanner } from "../ReportUnavailableBanner";
import { FeasibilityReportPanel } from "./FeasibilityReportPanel";
import { ReportPreviewPanel } from "../ReportPreviewPanel";

interface FilesTabProps {
  notice: NoticeDetailItem;
  /** 是否已解锁核心信息 */
  coreUnlocked: boolean;
  /** 是否 VIP */
  isVip?: boolean;
  /** 当前登录用户（报告预览/下载需要） */
  userId?: number | null;
  /** 解锁回调（报告预览面板用） */
  onUnlock?: (notice: NoticeItem) => void;
  /** 服务端下发的权益门控（报告 = bid_feasibility_report，企业/人工档才可看） */
  gates?: Record<string, GateState> | undefined;
}

type RawAttachment = NoticeAttachment | string;

function attachmentUrl(item: RawAttachment): string | undefined {
  if (typeof item === "string") return item;
  return item.url || item.link || undefined;
}

function attachmentName(item: RawAttachment): string {
  if (typeof item === "string") return item;
  return item.name || item.title || item.label || item.url || item.link || "-";
}

/** 根据文件名/URL 推断文件类型图标 */
function getFileIcon(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes(".pdf")) return { icon: FileText, color: "text-rose-500" };
  if (lower.includes(".doc") || lower.includes(".word")) return { icon: FileText, color: "text-blue-500" };
  if (lower.includes(".xls") || lower.includes(".csv")) return { icon: FileSpreadsheet, color: "text-emerald-500" };
  if (lower.includes(".zip") || lower.includes(".rar") || lower.includes(".7z")) return { icon: FileArchive, color: "text-amber-500" };
  return { icon: File, color: "text-slate-400" };
}

export function FilesTab({ notice, coreUnlocked, isVip, userId, onUnlock, gates }: FilesTabProps) {
  const { t } = useLocale();
  const authContext = useOptionalAuth();
  const authUser = authContext?.authUser ?? null;

  const documents = ((notice.attachments as RawAttachment[] | undefined) || []);
  const externalLinks = ((notice.externalLinks as RawAttachment[] | undefined) || []);
  const hasFiles = documents.length > 0 || externalLinks.length > 0;

  // ─ 报告可用性（与摘要页拆解指示器同口径）──
  const hasReport = coreUnlocked ? notice.reportAvailable === true : Number(notice.isOpportunity) === 1;
  const reportKnown =
    coreUnlocked || typeof notice.reportAvailable === "boolean" || typeof notice.isOpportunity === "boolean";
  const canDownloadReport = Boolean(notice.reportAvailable && notice.reportUrl && authUser);
  // 中文拆解报告属企业级工具：个人档/免费档不渲染报告内容，改为升级企业版引导
  const reportEntitled =
    gates?.bid_feasibility_report === "included" || gates?.bid_feasibility_report === "free";

  const handleDownloadReport = () => {
    if (!notice.reportUrl) return;
    void downloadNoticeReport(notice.reportUrl).catch((e) => {
      console.warn("[NoticeDetails] 报告下载失败:", e);
    });
  };

  // ─ 未解锁：会员专属引导（含报告预览 teaser）──
  if (!coreUnlocked) {
    const fileCount = typeof notice.breakdownFileCount === "number" ? notice.breakdownFileCount : undefined;
    // 库内 99.9% 公告未收录文件链接（仅 UNGM 部分行有）：确认有文件才保留"会员可下载"承诺，
    // 其余一律引导去来源平台，避免付费承诺与实际交付的落差
    const lockedCard =
      (fileCount ?? 0) > 0 ? (
        <LockedFeatureCard
          icon={FileText}
          title={<>{t("detail_tabMaterials") || "投标材料"} — {t("detail_memberExclusive") || "会员专享"}</>}
          intro={t("detail_filesLockedIntro") || "会员可下载本公告的全部招标文件，包括："}
          bullets={
            <>
              <li className="flex items-center gap-2 text-xs text-amber-700">
                <Download className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                {fileCount !== undefined
                  ? t("detail_filesFullDocWithCount", { count: fileCount })
                  : t("detail_filesFullDoc") || "完整招标文件（含附件）"}
              </li>
              <li className="flex items-center gap-2 text-xs text-amber-700">
                <ExternalLink className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                {t("detail_filesExternalDesc") || "外部参考链接与采购平台直达地址"}
              </li>
              <li className="flex items-center gap-2 text-xs text-amber-700">
                <FileText className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                {t("detail_filesReportDesc") || "中文版订单拆解报告（如已生成）"}
              </li>
            </>
          }
          footer={isVip ? (
            <p className="text-xs font-bold text-amber-800 bg-amber-100/60 rounded-lg px-3 py-2 text-center">
              {t("detail_filesVipHint") || "您已是会员，可直接下载全部文件"}
            </p>
          ) : (
            <p className="text-xs text-amber-600 bg-amber-100/40 rounded-lg px-3 py-2 text-center">
              {t("detail_filesUnlockHint") || "升级会员即可获取全部招标文件"}
            </p>
          )}
        />
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
          <FileText className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500 mb-1">
            {t("detail_filesLockedNoneIntro") || "本公告暂未收录可直接下载的招标文件"}
          </p>
          <p className="text-xs text-slate-400 mb-4">
            {t("detail_filesLockedNoneHint") || "原始文件请前往来源平台查看与下载"}
          </p>
          {notice.sourceUrl && (
            <a
              href={notice.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-teal-600 hover:underline"
            >
              <ExternalLink className="w-3 h-3" />
              {t("detail_goToSource") || "前往来源平台查看原始公告"}
            </a>
          )}
        </section>
      );

    return (
      <div className="space-y-4">
        {reportEntitled && userId && reportKnown && hasReport && (
          <ReportPreviewPanel
            noticeId={notice.noticePk}
            userId={userId}
            isVip={!!isVip}
            onUnlock={onUnlock ?? (() => {})}
            coreLocked
          />
        )}
        {lockedCard}
      </div>
    );
  }

  // ── 已解锁：投标材料（报告 + 文件列表）──
  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-extrabold text-slate-900">{t("detail_tabMaterials") || "投标材料"}</h3>
        <span className="text-xs text-slate-400 font-mono">
          {documents.length > 0 && t("detail_attachmentCount", { count: documents.length })}
          {documents.length > 0 && externalLinks.length > 0 && " · "}
          {externalLinks.length > 0 && t("detail_linkCount", { count: externalLinks.length })}
        </span>
      </div>

      {/* ⓪ 投标可行性报告（企业/人工档；规则判定 + 证据） */}
      {notice.noticePk != null && <FeasibilityReportPanel noticePk={notice.noticePk} enabled={reportEntitled} />}

      {/* ① 中文版订单拆解报告 */}
      <div className="rounded-2xl border border-teal-100 bg-white p-4 space-y-2">
        <p className="text-sm font-black text-slate-900">{t("procurement_breakdownModuleTitle") || "中文版订单拆解报告"}</p>
        {!reportEntitled ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2.5 space-y-2">
            <p className="text-xs font-bold text-amber-800">
              {t("detail_reportEnterpriseOnly") || "中文拆解报告为企业版权益"}
            </p>
            <a
              href="/membership"
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-black text-white hover:bg-amber-600"
            >
              <Crown className="w-3.5 h-3.5" />
              {t("detail_reportEnterpriseCta") || "升级企业版解锁"}
            </a>
          </div>
        ) : canDownloadReport ? (
          <button
            type="button"
            onClick={handleDownloadReport}
            className="flex w-full items-center justify-between gap-3 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2.5 text-left hover:border-teal-400"
          >
            <span dir="auto" className="font-black text-teal-800 truncate">
              {t("procurement_reportFileLabel") || "中文版订单拆解报告.docx"}
            </span>
            <Download className="w-4 h-4 shrink-0 text-teal-700" />
          </button>
        ) : !notice.reportAvailable && notice.noticePk != null ? (
          <ReportUnavailableBanner
            noticeId={notice.noticePk}
            isVip={!!isVip}
            isLoggedIn={!!authUser}
          />
        ) : (
          <p className="text-xs text-slate-400">{t("procurement_reportPending") || "中文版拆解报告生成中，请稍后刷新。"}</p>
        )}
      </div>

      {/* ② 原始招标文件 */}
      {documents.length > 0 && (
        <div>
          <p className="text-xs font-black text-slate-500 uppercase mb-2 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" />
            {t("procurement_originalAttachments") || "原始招标附件"}
          </p>
          <div className="space-y-2">
            {documents.map((item, index) => {
              const url = attachmentUrl(item);
              const name = attachmentName(item);
              const { icon: FileIcon, color } = getFileIcon(name);
              return url ? (
                <button
                  key={`doc-${index}`}
                  type="button"
                  onClick={() => {
                    void downloadFile(url, name).catch(() => {
                      window.open(url, "_blank", "noopener,noreferrer");
                    });
                  }}
                  className="flex w-full items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 hover:border-blue-200 hover:bg-blue-50/30 cursor-pointer text-left transition-colors group"
                >
                  <FileIcon className={`w-4 h-4 shrink-0 ${color}`} />
                  <span dir="auto" className="flex-1 text-sm font-bold text-slate-700 truncate group-hover:text-blue-700 transition-colors">
                    {name}
                  </span>
                  <Download className="w-4 h-4 shrink-0 text-blue-600 opacity-60 group-hover:opacity-100 transition-opacity" />
                </button>
              ) : (
                <span
                  key={`doc-${index}`}
                  className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5"
                >
                  <FileIcon className={`w-4 h-4 shrink-0 ${color} opacity-50`} />
                  <span dir="auto" className="flex-1 text-sm font-bold text-slate-400 truncate">
                    {name}
                  </span>
                  <Download className="w-4 h-4 shrink-0 text-slate-300" />
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* ③ 外部链接 */}
      {externalLinks.length > 0 && (
        <div>
          <p className="text-xs font-black text-slate-500 uppercase mb-2 flex items-center gap-1.5">
            <Link className="w-3.5 h-3.5" />
            {t("procurement_externalLinks") || "外部参考链接"}
          </p>
          <div className="space-y-2">
            {externalLinks.map((item, index) => {
              const url = attachmentUrl(item);
              const name = attachmentName(item);
              return (
                <a
                  key={`link-${index}`}
                  href={url || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 hover:border-teal-200 hover:bg-teal-50/30 transition-colors group"
                >
                  <ExternalLink className="w-4 h-4 shrink-0 text-teal-600" />
                  <span dir="auto" className="flex-1 text-sm font-bold text-teal-700 truncate group-hover:text-teal-800 transition-colors">
                    {name}
                  </span>
                  <span className="text-2xs text-slate-400 shrink-0 hidden sm:inline">↗</span>
                </a>
              );
            })}
          </div>
        </div>
      )}

      {/* ④ 已解锁但无文件 */}
      {!hasFiles && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
          <FileText className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500 mb-1">
            {t("procurement_noFiles") || "本公告暂无可下载的招标文件"}
          </p>
          {notice.sourceUrl && (
            <a
              href={notice.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-teal-600 hover:underline mt-2"
            >
              <ExternalLink className="w-3 h-3" />
              {t("detail_goToSource") || "前往来源平台查看原始公告"}
            </a>
          )}
        </section>
      )}
    </section>
  );
}
