/**
 * 原始文件 Tab 内容
 * Files Tab Content
 *
 * @module features/procurement/components/NoticeDetail/FilesTab
 * @description 展示采购文件下载列表与外部参考链接。
 *              数据来自 notice.documents / notice.external_links。
 *              区分文件类型（PDF/DOC/ZIP等），展示文件计数与分类统计。
 */
import { Download, ExternalLink, FileText, Link, FileArchive, FileSpreadsheet, File } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { downloadFile } from "@/core/http";
import type { NoticeAttachment, NoticeDetailItem } from "../../types";

interface FilesTabProps {
  notice: NoticeDetailItem;
  /** 是否已解锁核心信息 */
  coreUnlocked: boolean;
  /** 是否 VIP */
  isVip?: boolean;
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

export function FilesTab({ notice, coreUnlocked, isVip }: FilesTabProps) {
  const { t } = useLocale();

  const documents = ((notice.documents as RawAttachment[] | undefined) || []);
  const externalLinks = ((notice.external_links as RawAttachment[] | undefined) || []);
  const hasFiles = documents.length > 0 || externalLinks.length > 0;

  // ─ 未解锁：展示具体锁定提示 ──
  if (!coreUnlocked) {
    const fileCount = typeof notice.breakdown_file_count === "number" ? notice.breakdown_file_count : undefined;
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50/50 p-5">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-4 h-4 text-amber-600" />
          <h3 className="text-sm font-extrabold text-amber-800">
            {t("detail_tabOriginalFiles") || "原始文件"} — 会员专享
          </h3>
        </div>
        <p className="text-xs text-amber-700 mb-3">
          解锁后可下载本公告的全部招标文件，包括：
        </p>
        <ul className="space-y-1.5 mb-4">
          <li className="flex items-center gap-2 text-xs text-amber-700">
            <Download className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            完整招标文件（{fileCount !== undefined ? `${fileCount} 个附件` : "含附件"}）
          </li>
          <li className="flex items-center gap-2 text-xs text-amber-700">
            <ExternalLink className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            外部参考链接与采购平台直达地址
          </li>
          <li className="flex items-center gap-2 text-xs text-amber-700">
            <FileText className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            中文版订单拆解报告（如已生成）
          </li>
        </ul>
        {isVip ? (
          <p className="text-xs font-bold text-amber-800 bg-amber-100/60 rounded-lg px-3 py-2 text-center">
            您已是会员，解锁本公告后即可下载全部文件
          </p>
        ) : (
          <p className="text-xs text-amber-600 bg-amber-100/40 rounded-lg px-3 py-2 text-center">
            升级会员或单次解锁即可获取全部招标文件
          </p>
        )}
      </section>
    );
  }

  // ── 已解锁但无文件 ──
  if (!hasFiles) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
        <FileText className="w-8 h-8 text-slate-300 mx-auto mb-3" />
        <p className="text-sm text-slate-500 mb-1">
          {t("procurement_noFiles") || "本公告暂无可下载的招标文件"}
        </p>
        {notice.source_url && (
          <a
            href={notice.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-teal-600 hover:underline mt-2"
          >
            <ExternalLink className="w-3 h-3" />
            前往来源平台查看原始公告
          </a>
        )}
      </section>
    );
  }

  // ── 已解锁：展示文件列表 ──
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-extrabold text-slate-900">
          {t("detail_tabOriginalFiles") || "原始文件"}
        </h3>
        <span className="text-xs text-slate-400 font-mono">
          {documents.length > 0 && `${documents.length} 个附件`}
          {documents.length > 0 && externalLinks.length > 0 && " · "}
          {externalLinks.length > 0 && `${externalLinks.length} 个外链`}
        </span>
      </div>

      {/* 采购文件 */}
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

      {/* 外部链接 */}
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
    </section>
  );
}
