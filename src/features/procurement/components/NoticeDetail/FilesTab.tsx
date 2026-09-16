/**
 * 原始文件 Tab 内容
 * Files Tab Content
 *
 * @module features/procurement/components/NoticeDetail/FilesTab
 * @description 展示采购文件下载列表与外部参考链接。
 *              数据来自 notice.documents / notice.external_links。
 */
import { Download, ExternalLink, FileText, Link } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { downloadFile } from "@/core/http";
import type { NoticeAttachment, NoticeDetailItem } from "../../types";

interface FilesTabProps {
  notice: NoticeDetailItem;
  /** 是否已解锁核心信息 */
  coreUnlocked: boolean;
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

export function FilesTab({ notice, coreUnlocked }: FilesTabProps) {
  const { t } = useLocale();

  const documents = ((notice.documents as RawAttachment[] | undefined) || []);
  const externalLinks = ((notice.external_links as RawAttachment[] | undefined) || []);
  const hasFiles = documents.length > 0 || externalLinks.length > 0;

  // 未解锁：展示锁定提示
  if (!coreUnlocked) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50/50 p-6 text-center">
        <p className="text-sm font-bold text-amber-700">
          {t("procurement_unlockToViewFull") || "解锁后查看完整招标文件"}
        </p>
      </section>
    );
  }

  if (!hasFiles) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
        <FileText className="w-8 h-8 text-slate-300 mx-auto mb-3" />
        <p className="text-sm text-slate-500">
          {t("procurement_noFiles") || "本公告暂无可下载的招标文件"}
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <h3 className="text-base font-extrabold text-slate-900">
        {t("detail_tabOriginalFiles") || "原始文件"}
      </h3>

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
              return url ? (
                <button
                  key={`doc-${index}`}
                  type="button"
                  onClick={() => {
                    void downloadFile(url, name).catch(() => {
                      window.open(url, "_blank", "noopener,noreferrer");
                    });
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 hover:border-blue-200 hover:bg-blue-50/30 cursor-pointer text-left transition-colors"
                >
                  <span dir="auto" className="text-sm font-bold text-slate-700 truncate">
                    {name}
                  </span>
                  <Download className="w-4 h-4 shrink-0 text-blue-600" />
                </button>
              ) : (
                <span
                  key={`doc-${index}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5"
                >
                  <span dir="auto" className="text-sm font-bold text-slate-500 truncate">
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
                  className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 hover:border-teal-200 hover:bg-teal-50/30 transition-colors"
                >
                  <ExternalLink className="w-4 h-4 shrink-0 text-teal-600" />
                  <span dir="auto" className="text-sm font-bold text-teal-700 truncate">
                    {name}
                  </span>
                </a>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
