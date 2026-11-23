/**
 * 应用底部（全站 Footer，桌面 + 移动端）
 * App Footer — site-wide (desktop + mobile)
 *
 * @module shared/layout/AppFooter
 * @description 合规布点 P0：页脚是「随时找得到」的常驻入口。
 *              - 版权 + ICP 备案（点跳工信部查询）；
 *              - 法律与关于链接组（集中配置在 shared/layout/LegalLinks）；
 *              - 运营主体信息行（统一社会信用代码/地址/客服联系方式，按 env 展示，未配置不臆造）。
 *              2026-11-23：此前 `hidden md:block` 只在桌面显示，移动端无任何法律入口；现改为全端可见。
 */
import { useEffect, useState } from "react";
import { useLocale } from "@/core/i18n";
import { apiCached } from "@/core/http/api-client";
import { LegalLinks } from "./LegalLinks";

/** crm.link 表返回的链接数据结构 */
interface FooterLink {
  id: number;
  name: string;
  url: string;
  icon: string;
}

export interface AppFooterProps {
  activeTab: string;
  onSwitchTab: (path: string) => void;
  onOpenConsult: () => void;
}

/** 主体信息：优先 env 配置，未配置则不展示该字段（避免公示错误信息） */
const COMPANY_NAME = process.env.NEXT_PUBLIC_COMPANY_NAME || "杭州云境智展科技有限公司";
const COMPANY_CREDIT_CODE = process.env.NEXT_PUBLIC_COMPANY_CREDIT_CODE || "";
const COMPANY_ADDRESS = process.env.NEXT_PUBLIC_COMPANY_ADDRESS || "";
const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "";
const SUPPORT_PHONE = process.env.NEXT_PUBLIC_SUPPORT_PHONE || "";

export function AppFooter({ activeTab: _a, onSwitchTab: _s, onOpenConsult: _c }: AppFooterProps) {
  const { t } = useLocale();
  const [icp, setIcp] = useState("");
  const [links, setLinks] = useState<FooterLink[]>([]);

  useEffect(() => {
    apiCached<{ bah: string }>("/api/system/icp", 60 * 60 * 1000)
      .then((data) => { if (data.bah) setIcp(data.bah); })
      .catch((e) => console.warn("[AppFooter] ICP 加载失败:", e));
    apiCached<FooterLink[]>("/api/system/links", 30 * 60 * 1000)
      .then((data) => { if (Array.isArray(data)) setLinks(data); })
      .catch((e) => console.warn("[AppFooter] 页脚链接加载失败:", e));
  }, []);

  const entityBits = [
    COMPANY_CREDIT_CODE ? `${t("footerCreditCode") || "统一社会信用代码"} ${COMPANY_CREDIT_CODE}` : "",
    COMPANY_ADDRESS,
    SUPPORT_EMAIL ? `${t("footerSupportEmail") || "客服邮箱"} ${SUPPORT_EMAIL}` : "",
    SUPPORT_PHONE ? `${t("footerSupportPhone") || "客服电话"} ${SUPPORT_PHONE}` : "",
  ].filter(Boolean);

  return (
    <footer className="print:hidden bg-slate-100 border-t border-slate-200 pt-5 pb-6 text-xs text-slate-400">
      <div className="mx-auto max-w-7xl px-4 flex flex-col gap-3">
        {/* 版权 + 备案 + 社交 */}
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{t("footerCopyright")}</span>
            {icp && (
              <>
                <span className="text-slate-300">|</span>
                <a
                  href="https://beian.miit.gov.cn/"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:underline hover:text-slate-600 transition-colors"
                >
                  {icp}
                </a>
              </>
            )}
          </p>

          {links.length > 0 && (
            <div className="flex items-center gap-4">
              {links.map((link) => (
                <a
                  key={link.id}
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-slate-400 hover:text-teal-600 transition-colors"
                  aria-label={link.name}
                >
                  <i className={`iconfont icon-${link.icon} text-lg`} />
                </a>
              ))}
            </div>
          )}
        </div>

        {/* 法律与关于：全端可见（合规 P0） */}
        <LegalLinks className="flex flex-wrap gap-x-4 gap-y-1.5" />

        {/* 运营主体信息 */}
        <p className="text-[11px] leading-relaxed text-slate-400">
          {COMPANY_NAME}
          {entityBits.length > 0 && (
            <>
              <span className="mx-1 text-slate-300">·</span>
              {entityBits.join(" · ")}
            </>
          )}
        </p>
      </div>
    </footer>
  );
}
