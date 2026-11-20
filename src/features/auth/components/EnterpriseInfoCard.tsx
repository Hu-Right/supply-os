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
import { Badge, type BadgeVariant } from "@/shared/ui";
import {
  classifyEnterpriseBindState,
  enterpriseBindStateText,
  type EnterpriseBindState,
} from "@/shared/utils/enterprise-status";
import type { EnterpriseInfo, LicenseChangeBrief, CommodityNodeBrief } from "@/shared/hooks/useEnterpriseInfo";
import type { IndustryBrief } from "@/core/api/industryInfer";
import { sv, fmtAddtime, fmtScore, type Cell } from "./enterprise-info/formatters";
import { formatEstablishedAtForInput } from "@/shared/utils/enterprise-fields";
import {
  DEFAULT_REGISTRATION_ID_TYPE,
  REGISTRATION_ID_FIELD_LABELS,
  isRegistrationIdType,
} from "@/shared/constants/registration-id";
import { GroupTitle, InfoTable, LoadingState, ErrorState, NotBoundState, LicenseView } from "./enterprise-info/parts";

export interface EnterpriseInfoCardProps {
  enterprise: EnterpriseInfo | null;
  linkStatus?: string;
  /** 已自报的主营品目（匹配用，与“产品介绍”展示文本并列） */
  commodityNodes?: CommodityNodeBrief[];
  /** 所属行业（UGT-I 行业树；与品目无关） */
  industry?: IndustryBrief | null;
  /** 证书展示名（单一事实源=能力档案）；企业信息页的「认证资质」只读聚合 */
  certificationNames?: string[];
  /** 该企业最近一条换照变更（闭环状态源）：pending/rejected 在执照区上方挂进展横幅 */
  licenseChange?: LicenseChangeBrief | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onBind: () => void;
}

/** 状态徽章配色：审核中/已认证/已驳回 各一色，无审核状态（复用历史档案行）走中性色。
 *  2026-10-31 徽章统一：值改 shared Badge soft 变体，渲染走 <Badge shape="tag">。 */
const BADGE_TONE: Record<EnterpriseBindState, BadgeVariant> = {
  verified: "soft-success",
  pending: "soft-warning",
  rejected: "soft-danger",
  linked: "soft-neutral",
  none: "soft-neutral",
};

export function EnterpriseInfoCard({
  enterprise, commodityNodes, industry, certificationNames, licenseChange, loading, error, onRetry, onBind,
}: EnterpriseInfoCardProps) {
  const { t } = useLocale();

  if (loading) return <LoadingState />;
  if (error) return <ErrorState onRetry={onRetry} />;
  if (!enterprise) return <NotBoundState onBind={onBind} />;

  // ── 已绑定：分组表格 ──
  const row = enterprise;
  const creditField = REGISTRATION_ID_FIELD_LABELS[
    isRegistrationIdType(row.creditCodeType) ? row.creditCodeType : DEFAULT_REGISTRATION_ID_TYPE
  ];
  const companyName = sv(row, "company");
  const isIntl = String(row.countryCode || "") !== "" && String(row.countryCode) !== "CN";
  // 认证状态与账户设置页、后端排他闸口同一口径（verify_status=资质 / hasPendingClaim=认领待核；
  // 供应商行上的 claim_status 已退役，认领状态由 supplier_claims 派生）
  const bindState = classifyEnterpriseBindState(row);
  const bindText = enterpriseBindStateText(bindState);
  const checkNote = String(row.checkNote || "");

  // 关键字段缺失清单：只服务于「待补资料」提示，不重算 dataQualityScore 的加权分（那是服务端口径）
  const isEmptyValue = (key: keyof EnterpriseInfo): boolean => {
    const v = row[key];
    const s = v === null || v === undefined ? "" : String(v).trim();
    return s === "" || s === "-";
  };
  const missingFields: string[] = [];
  if (isEmptyValue("legalRep")) missingFields.push(t("authEnterpriseLegalRep") || "法定代表人");
  if (isEmptyValue("registeredCapital")) missingFields.push(t("authEnterpriseCapital") || "注册资本");
  if (isEmptyValue("creditCode")) missingFields.push(t(creditField.labelKey) || creditField.fallback);
  if (isEmptyValue("establishedAt")) missingFields.push(t("authEnterpriseEstablished") || "成立日期");
  if (!(certificationNames ?? []).length) missingFields.push(t("authEnterpriseCertifications") || "认证资质");
  if (isEmptyValue("products")) missingFields.push(t("authEnterpriseProductIntro") || "产品介绍");

  // 基本信息：去掉内部主键「ID」与「确认后公司名」（页面标题已是公司名）；
  // 省市合并为「所在地区」，国际企业直接显示国家/地区（省市对海外主体常为空）。
  const regionValue = isIntl
    ? sv(row, "country")
    : [row.province, row.city]
        .map((v) => (v === null || v === undefined ? "" : String(v).trim()))
        .filter(Boolean)
        .join(" · ") || "-";

  const basicCells: Cell[] = [
    {
      label: isIntl ? (t("authEnterpriseCountry") || "国家/地区") : (t("authEnterpriseRegion") || "所在地区"),
      value: regionValue,
      // 与经营地址同为「地域信息」块，通栏排列，避免半格留空
      full: true,
    },
    { label: t("authEnterpriseBizAddress") || "经营地址", value: sv(row, "address"), full: true },
    { label: t("authEnterpriseAddTime") || "录入时间", value: fmtAddtime(row) },
    { label: t("authEnterpriseCompleteness") || "资料完整度", value: fmtScore(row) },
  ];
  if (missingFields.length > 0) {
    basicCells.push({
      label: t("authEnterpriseMissingLabel") || "待补资料",
      value:
        t("authEnterpriseMissingItems", { count: missingFields.length, items: missingFields.join("、") }) ||
        `还缺 ${missingFields.length} 项：${missingFields.join("、")}`,
      full: true,
    });
  }

  const contactCells: Cell[] = [
    { label: t("authEnterpriseContact") || "联系人", value: sv(row, "contact") },
    { label: t("authEnterprisePosition") || "职位", value: sv(row, "position") },
    // 企业联系电话/邮箱是「对外联系资料」，与账号的手机号/邮箱是两套东西，标签必须区分
    { label: t("authEnterprisePhone") || "企业联系电话", value: sv(row, "phone") },
    { label: t("authEnterpriseEmail") || "企业邮箱", value: sv(row, "email") },
    { label: t("authEnterpriseWebsite") || "官网", value: sv(row, "website"), full: true },
  ];

  const businessCells: Cell[] = [
    { label: t("authEnterpriseLegalRep") || "法定代表人", value: sv(row, "legalRep") },
    { label: t("authEnterpriseEstablished") || "成立日期", value: formatEstablishedAtForInput(row.establishedAt) || "-" },
    { label: t("authEnterpriseCapital") || "注册资本", value: sv(row, "registeredCapital") },
    // 注册标识：标签随证件类型变化（中国 USCC / 香港 BR·CR / 海外注册号 / 税号 / 其他）
    { label: t(creditField.labelKey) || creditField.fallback, value: sv(row, "creditCode") },
    // 认证资质：只读聚合，来源=能力档案（supplier.certification 已于 2026-11-19 停写）
    { label: t("authEnterpriseCertifications") || "资质认证", value: (certificationNames ?? []).join("、") || "-" },
    // 所属行业：UGT-I 行业树（与主营品目的 UGT 骨架树无推导关系），展示路径便于判断归类层级
    {
      label: t("authEnterpriseIndustry") || "所属行业",
      value: industry ? industry.path?.join(" / ") || industry.nameZh || industry.code : "-",
      full: true,
    },
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
          <Badge
            shape="tag"
            variant={BADGE_TONE[bindState]}
            className="text-2xs"
            title={bindState === "rejected" ? (checkNote || undefined) : undefined}
          >
            {t(bindText.key) || bindText.fallback}
          </Badge>
          <Badge shape="tag" variant="soft-success" className="text-2xs">
            {isIntl ? (t("authEnterpriseInternational") || "国际") : (t("authEnterpriseDomestic") || "国内")}
          </Badge>
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
        <LicenseView licenseUrl={row.licenseUrl ? String(row.licenseUrl) : ""} />
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
