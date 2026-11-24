/**
 * 应用底部（全站 Footer，桌面 + 移动端）
 * App Footer — site-wide
 *
 * @module shared/layout/AppFooter
 * @description 参考 Stripe / Linear / 阿里云 的多列页脚：左侧品牌 + 一句定位，右侧四列
 *              （产品 / 资源 / 法律 / 公司），底部一条版权与主体信息。
 *              合规要求：法律入口全端常驻；主体信息按 env 展示，未配置不臆造。
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "@/core/i18n";
import { apiCached } from "@/core/http/api-client";
import { Brand } from "./Brand";

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

const COMPANY_NAME = process.env.NEXT_PUBLIC_COMPANY_NAME || "杭州云境智展科技有限公司";
const COMPANY_CREDIT_CODE = process.env.NEXT_PUBLIC_COMPANY_CREDIT_CODE || "";
const COMPANY_ADDRESS = process.env.NEXT_PUBLIC_COMPANY_ADDRESS || "";
const SUPPORT_PHONE = process.env.NEXT_PUBLIC_SUPPORT_PHONE || "";
/** ICP 兜底：接口未返回/JS 未水合时也必须可见（合规 P0），可用 NEXT_PUBLIC_ICP 覆盖 */
const ICP_FALLBACK = process.env.NEXT_PUBLIC_ICP || "浙ICP备2026027779号-3";

type TFn = (key: string) => string;

/** 单列：标题 + 链接列表 */
function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-xs font-bold tracking-wider text-slate-900">{title}</h2>
      <ul className="mt-3 space-y-2">{children}</ul>
    </div>
  );
}

function FooterLinkItem({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="text-xs text-slate-500 transition-colors hover:text-teal-700 hover:underline">
        {children}
      </Link>
    </li>
  );
}

function productLinks(t: TFn) {
  return [
    { href: "/procurement", label: t("navGlobalOpportunities") || "全球商机" },
    { href: "/rfq", label: t("navRFQ") || "采购需求" },
    { href: "/supplier", label: t("navSupplierLibrary") || "供应商库" },
    { href: "/award-intelligence", label: t("navAwardIntelligence") || "中标情报" },
    { href: "/membership", label: t("navMembership") || "会员套餐" },
    { href: "/ecosystem", label: t("navEcosystem") || "第三方服务" },
  ];
}

const LEGAL_LINKS = [
  { href: "/terms", key: "footerTerms", fallback: "服务协议" },
  { href: "/privacy", key: "footerPrivacy", fallback: "隐私政策" },
  { href: "/refund-policy", key: "footerPaidRights", fallback: "付费权益与退款" },
  { href: "/notice-source", key: "footerNoticeSource", fallback: "标讯来源声明" },
  { href: "/copyright", key: "footerCopyrightNotice", fallback: "版权与转载" },
  { href: "/account-cancellation", key: "footerAccountCancellation", fallback: "个人信息与账号" },
] as const;

export function AppFooter({ activeTab: _a, onSwitchTab: _s, onOpenConsult: _c }: AppFooterProps) {
  const { t } = useLocale();
  const [icp, setIcp] = useState(ICP_FALLBACK);
  const [links, setLinks] = useState<FooterLink[]>([]);

  useEffect(() => {
    apiCached<{ bah: string }>("/api/system/icp", 60 * 60 * 1000)
      .then((data) => { if (data.bah) setIcp(data.bah); })
      .catch((e) => console.warn("[AppFooter] ICP 加载失败:", e));
    apiCached<FooterLink[]>("/api/system/links", 30 * 60 * 1000)
      .then((data) => { if (Array.isArray(data)) setLinks(data); })
      .catch((e) => console.warn("[AppFooter] 页脚链接加载失败:", e));
  }, []);

  return (
    <footer className="print:hidden border-t border-slate-200 bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-5">
          {/* 品牌区 */}
          <div className="col-span-2">
            <Brand name={t("brandName") || "云境·国际采购平台"} size="sm" />
            <p className="mt-3 max-w-xs text-xs leading-relaxed text-slate-500">
              {t("footerTagline") || "中国供应链出海 · 全球公共采购商机与投标服务"}
            </p>
            {links.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                {links.map((link) => (
                  <a
                    key={link.id}
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-slate-400 transition-colors hover:text-teal-600"
                    aria-label={link.name}
                  >
                    <i className={`iconfont icon-${link.icon} text-base`} />
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* 产品 */}
          <FooterColumn title={t("footerProduct") || "产品"}>
            {productLinks(t).map((item) => (
              <FooterLinkItem key={item.href} href={item.href}>{item.label}</FooterLinkItem>
            ))}
          </FooterColumn>

          {/* 法律 */}
          <FooterColumn title={t("footerLegalNav") || "法律与关于"}>
            {LEGAL_LINKS.map((item) => (
              <FooterLinkItem key={item.href} href={item.href}>
                {t(item.key) || item.fallback}
              </FooterLinkItem>
            ))}
          </FooterColumn>

          {/* 公司 */}
          <FooterColumn title={t("footerCompany") || "公司"}>
            <FooterLinkItem href="/about">{t("footerAbout") || "关于我们"}</FooterLinkItem>
            <FooterLinkItem href="/faq">{t("footerFaq") || "常见问题"}</FooterLinkItem>
            <FooterLinkItem href="/contact">{t("footerContactUs") || "联系我们"}</FooterLinkItem>
            <FooterLinkItem href="/complaint">{t("footerComplaint") || "投诉与争议"}</FooterLinkItem>
          </FooterColumn>
        </div>

        {/* 底部：版权 + 备案 + 主体信息 */}
        <div className="mt-10 flex flex-col gap-2 border-t border-slate-200 pt-5 text-[11px] text-slate-400 md:flex-row md:items-center md:justify-between">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{t("footerCopyright")}</span>
            {icp && (
              <>
                <span className="text-slate-300">|</span>
                <a
                  href="https://beian.miit.gov.cn/"
                  target="_blank"
                  rel="noreferrer"
                  className="transition-colors hover:text-slate-600 hover:underline"
                >
                  {icp}
                </a>
              </>
            )}
            {COMPANY_CREDIT_CODE && (
              <>
                <span className="text-slate-300">|</span>
                <span>{t("footerCreditCode") || "统一社会信用代码"} {COMPANY_CREDIT_CODE}</span>
              </>
            )}
          </p>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {COMPANY_ADDRESS && <span>{COMPANY_ADDRESS}</span>}
            {SUPPORT_PHONE && <span>{SUPPORT_PHONE}</span>}
            {!COMPANY_ADDRESS && !SUPPORT_PHONE && <span>{COMPANY_NAME} · osneosmart.com</span>}
          </p>
        </div>
      </div>
    </footer>
  );
}
