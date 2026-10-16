/**
 * 企业信息卡 — 容器（供应商详情表格式，数据源 supplier 企业表整行）
 * Enterprise Info Card (table style)
 *
 * @module features/auth/components/EnterpriseInfoCard
 * @description 参考供应商详情弹窗：分组表格（基本信息/联系信息/工商与业务信息），
 *              label 灰底单元格 + value 白底单元格，两列对排、地址/简介通栏。
 *              未绑定显示引导+立即绑定；加载中骨架屏；加载失败错误+重试。
 *              纯展示，数据由 useEnterpriseInfo（GET /api/user/enterprise）提供。
 *
 *              2026-10 组件化拆分（334→约 180 行）：状态屏/表格/执照格见 ./enterprise-info/parts，
 *              值格式化纯函数见 ./enterprise-info/formatters；本文件保留绑定态判定与单元格装配。
 */
import { useLocale } from "@/core/i18n";
import {
  classifyEnterpriseBindState,
  enterpriseBindStateText,
  type EnterpriseBindState,
} from "@/shared/utils/enterprise-status";
import type { EnterpriseInfo, LicenseChangeBrief, CommodityNodeBrief } from "@/shared/hooks/useEnterpriseInfo";
import { sv, fmtAddtime, fmtScore, type Cell } from "./enterprise-info/formatters";
import { GroupTitle, InfoTable, LoadingState, ErrorState, NotBoundState, LicenseView } from "./enterprise-info/parts";

export interface EnterpriseInfoCardProps {
  enterprise: EnterpriseInfo | null;
  linkStatus?: string;
  /** 已自报的主营品目（匹配用，与“产品介绍”展示文本并列） */
  commodityNodes?: CommodityNodeBrief[];
  /** 该企业最近一条换照变更（闭环状态源）：pending/rejected 在执照区上方挂进展横幅 */
  licenseChange?: LicenseChangeBrief | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onBind: () => void;
}

/** 状态徽章配色：审核中/已认证/已驳回 各一色，无审核状态（复用历史档案行）走中性色 */
const BADGE_TONE: Record<EnterpriseBindState, string> = {
  verified: "border-success-200 bg-success-50 text-success-700",
  pending: "border-accent-200 bg-accent-50 text-accent-700",
  rejected: "border-danger-200 bg-danger-50 text-danger-700",
  linked: "border-border bg-secondary-50 text-secondary-600",
  none: "border-border bg-secondary-50 text-secondary-600",
};

export function EnterpriseInfoCard({
  enterprise, commodityNodes, licenseChange, loading, error, onRetry, onBind,
}: EnterpriseInfoCardProps) {
  const { t } = useLocale();

  if (loading) return <LoadingState />;
  if (error) return <ErrorState onRetry={onRetry} />;
  if (!enterprise) return <NotBoundState onBind={onBind} />;

  // ── 已绑定：分组表格 ──
  const row = enterprise;
  const companyName = sv(row, "company");
  const isIntl = String(row.country_code || "") !== "" && String(row.country_code) !== "CN";
  const coop = Number(row.coop_status || 0) === 1;
  // 认证状态与账户设置页、后端排他闸口同一口径（verify_status=资质 / claim_status=归属）
  const bindState = classifyEnterpriseBindState(row);
  const bindText = enterpriseBindStateText(bindState);
  const checkNote = String(row.check_note || "");

  const basicCells: Cell[] = [
    { label: t("authEnterpriseId") || "ID", value: sv(row, "id") },
    { label: t("authEnterpriseNameConfirmed") || "确认后公司名", value: companyName },
    // 企业英文法务名格子已于 2026-09-26 撤下；2026-09-28 影子表重建时列已物理删除，
    // 接口不再返回该键，要恢复须先走一次加列迁移。
    { label: t("authEnterpriseProvince") || "省份", value: sv(row, "province") },
    { label: t("authEnterpriseCity") || "城市", value: sv(row, "city") },
    { label: t("authEnterpriseBizAddress") || "经营地址", value: sv(row, "address"), full: true },
    { label: t("authEnterpriseRegAddress") || "注册地址", value: sv(row, "registered_address"), full: true },
    { label: t("authEnterpriseAddTime") || "录入时间", value: fmtAddtime(row) },
    { label: t("authEnterpriseCompleteness") || "资料完整度", value: fmtScore(row) },
  ];

  const contactCells: Cell[] = [
    { label: t("authEnterpriseContact") || "联系人", value: sv(row, "contact") },
    { label: t("authEnterprisePosition") || "职位", value: sv(row, "position") },
    { label: t("authEnterprisePhone") || "联系电话", value: sv(row, "phone") },
    { label: t("authEnterpriseEmail") || "邮箱", value: sv(row, "email") },
    { label: t("authEnterpriseWebsite") || "官网", value: sv(row, "website"), full: true },
  ];

  const businessCells: Cell[] = [
    { label: t("authEnterpriseLegalRep") || "法定代表人", value: sv(row, "legal_rep") },
    { label: t("authEnterpriseEstablished") || "成立日期", value: sv(row, "established_at") },
    { label: t("authEnterpriseCapital") || "注册资本", value: sv(row, "registered_capital") },
    { label: t("authEnterpriseCreditCode") || "统一社会信用代码", value: sv(row, "credit_code") },
    { label: t("authEnterpriseSupplierType") || "供应商类型", value: sv(row, "business_type") },
    { label: t("authEnterpriseCertifications") || "资质认证", value: sv(row, "certification") },
    { label: t("authEnterpriseIntro") || "企业简介", value: sv(row, "intro"), full: true },
  ];

  // 主营产品：展示属性（自由文本）与商品属性（品目树落点）并列，与编辑表单同一分组口径
  const productsCells: Cell[] = [
    { label: t("authEnterpriseProductIntro") || "产品介绍", value: sv(row, "products"), full: true },
    {
      label: t("authEnterpriseCommodityNodes") || "主营品目",
      value: commodityNodes && commodityNodes.length > 0
        ? commodityNodes.map((n) => n.nameZh || n.code).join("、")
        : "-",
      full: true,
    },
  ];

  return (
    <div className="space-y-6">
      {/* 头部：公司名 + 标签 */}
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-foreground">{companyName}</h3>
        <div className="flex gap-2 shrink-0 flex-wrap justify-end">
          {/* 走到这里 enterprise 必非空，绑定状态最少是 linked，无需再分情况判空 */}
          <span
            className={`px-2 py-0.5 rounded border text-2xs ${BADGE_TONE[bindState]}`}
            title={bindState === "rejected" ? (checkNote || undefined) : undefined}
          >
            {t(bindText.key) || bindText.fallback}
          </span>
          <span className="px-2 py-0.5 rounded border border-success-200 bg-success-50 text-success-700 text-2xs">
            {isIntl ? (t("authEnterpriseInternational") || "国际") : (t("authEnterpriseDomestic") || "国内")}
          </span>
          {coop && (
            <span className="px-2 py-0.5 rounded border border-success-200 bg-success-50 text-success-700 text-2xs">
              {t("authEnterpriseCoop") || "已合作"}
            </span>
          )}
        </div>
      </div>

      {bindState === "rejected" && checkNote && (
        <p className="text-xs text-danger-600 bg-danger-50 border border-danger-200 rounded-lg p-3">
          {t("authEnterpriseRejectReason") || "驳回原因"}：{checkNote}
        </p>
      )}

      {/* 换照审核进展（先审后生效闭环）：pending/rejected 持续展示，通过后随 GET 刷新消失。
          认证徽章不因换照进入审核中——换照审的是新图，主体认证状态不变。 */}
      {licenseChange?.status === "pending" && (
        <p className="text-xs text-accent-700 bg-accent-50 border border-accent-200 rounded-lg p-3">
          {t("authEnterpriseLicenseUnderReview") || "新营业执照已提交人工审核（先审后生效），审核通过前门户仍展示原执照"}
        </p>
      )}
      {licenseChange?.status === "rejected" && (
        <p className="text-xs text-danger-600 bg-danger-50 border border-danger-200 rounded-lg p-3">
          {t("authEnterpriseLicenseChangeRejected") || "上次提交的新营业执照未通过审核，门户仍展示原执照，请重新上传"}
          {licenseChange.rejectReason ? `：${licenseChange.rejectReason}` : ""}
        </p>
      )}

      {/* 营业执照 */}
      <section>
        <GroupTitle>{t("authEnterpriseLicense") || "营业执照"}</GroupTitle>
        <LicenseView licenseUrl={row.license_url ? String(row.license_url) : ""} />
      </section>

      <section>
        <GroupTitle>{t("settingsBasicInfo") || "基本信息"}</GroupTitle>
        <InfoTable cells={basicCells} />
      </section>

      <section>
        <GroupTitle>{t("authEnterpriseGroupContact") || "联系信息"}</GroupTitle>
        <InfoTable cells={contactCells} />
      </section>

      <section>
        <GroupTitle>{t("authEnterpriseGroupBusiness") || "工商与业务信息"}</GroupTitle>
        <InfoTable cells={businessCells} />
      </section>

      <section>
        <GroupTitle>{t("authEnterpriseGroupProducts") || "主营产品"}</GroupTitle>
        <InfoTable cells={productsCells} />
      </section>
    </div>
  );
}

EnterpriseInfoCard.displayName = "EnterpriseInfoCard";
