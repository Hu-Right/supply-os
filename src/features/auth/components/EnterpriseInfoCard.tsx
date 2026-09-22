/**
 * 企业信息卡 — 供应商详情表格式（数据源 supplier 企业表整行）
 * Enterprise Info Card (table style)
 *
 * @module features/auth/components/EnterpriseInfoCard
 * @description 参考供应商详情弹窗：分组表格（基本信息/联系信息/工商与业务信息），
 *              label 灰底单元格 + value 白底单元格，两列对排、地址/简介通栏。
 *              未绑定显示引导+立即绑定；加载中骨架屏；加载失败错误+重试。
 *              纯展示，数据由 useEnterpriseInfo（GET /api/user/enterprise）提供。
 */
import { Building2 } from "lucide-react";
import { useLocale } from "@/core/i18n";
import type { EnterpriseInfo } from "../hooks/useEnterpriseInfo";

const btnBlue = "px-4 py-1.5 rounded-md bg-brand-600 text-white text-xs font-medium hover:bg-brand-700 transition-colors shrink-0";
const btnPlain = "px-4 py-1.5 rounded-md bg-white border border-border text-xs font-medium text-foreground hover:bg-secondary-50 transition-colors shrink-0";

export interface EnterpriseInfoCardProps {
  enterprise: EnterpriseInfo | null;
  linkStatus?: string;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onBind: () => void;
}

/** 表格单元：label + value；full=true 时 value 通栏 */
interface Cell {
  label: string;
  value: string;
  full?: boolean;
}

/** 取字符串值（空/undefined → "-"） */
function sv(row: EnterpriseInfo, key: string): string {
  const v = row[key];
  if (v === null || v === undefined || v === "") return "-";
  return String(v);
}

/** 录入时间 addtime（epoch 秒）→ YYYY-MM-DD HH:mm */
function fmtAddtime(row: EnterpriseInfo): string {
  const t = Number(row.addtime || 0);
  if (!t) return "-";
  const d = new Date(t * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 资料完整度 → 百分比 */
function fmtScore(row: EnterpriseInfo): string {
  const s = row.data_quality_score;
  if (s === null || s === undefined || s === "") return "-";
  return `${s}%`;
}

/** 分组标题（左侧色条） */
function GroupTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="w-1 h-4 rounded bg-brand-500" />
      <h3 className="text-sm font-medium text-foreground">{children}</h3>
    </div>
  );
}

/** 分组表格：将 cells 打包为每行 2 组（full 通栏独占一行） */
function InfoTable({ cells }: { cells: Cell[] }) {
  const rows: Cell[][] = [];
  let cur: Cell[] = [];
  for (const c of cells) {
    if (c.full) {
      if (cur.length) { rows.push(cur); cur = []; }
      rows.push([c]);
    } else {
      cur.push(c);
      if (cur.length === 2) { rows.push(cur); cur = []; }
    }
  }
  if (cur.length) rows.push(cur);

  return (
    <div className="border border-border rounded-md overflow-hidden bg-white">
      {rows.map((row, ri) => (
        <div key={ri} className="grid grid-cols-4 border-b border-border last:border-b-0">
          {row.map((cell, ci) => (
            <div key={ci} className={`contents`}>
              <div className="bg-secondary-50 px-3 py-2 text-xs text-muted-foreground border-r border-border">
                {cell.label}
              </div>
              <div
                className={`px-3 py-2 text-xs text-foreground break-words ${cell.full ? "col-span-3" : "col-span-1"} ${ci === 0 ? "" : "border-l border-border"}`}
              >
                {cell.value}
              </div>
            </div>
          ))}
          {/* 单 cell 行补齐空位保持 4 列对齐 */}
          {row.length === 1 && !row[0].full && (
            <>
              <div className="bg-secondary-50 px-3 py-2 border-r border-border" />
              <div className="px-3 py-2" />
            </>
          )}
        </div>
      ))}
    </div>
  );
}

export function EnterpriseInfoCard({
  enterprise, linkStatus, loading, error, onRetry, onBind,
}: EnterpriseInfoCardProps) {
  const { t } = useLocale();

  if (loading) {
    return (
      <div className="bg-secondary-50 border border-border rounded-lg px-6 py-5 animate-pulse">
        <div className="h-4 bg-secondary-200 rounded w-1/4 mb-3" />
        <div className="h-24 bg-secondary-200 rounded" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-secondary-50 border border-border rounded-lg px-6 py-5 flex items-center gap-4">
        <span className="w-10 h-10 rounded-full bg-secondary-200 text-secondary-500 flex items-center justify-center shrink-0">
          <Building2 className="w-4 h-4" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">{t("authEnterpriseTitle") || "企业信息"}</p>
          <p className="text-xs text-danger-600 mt-1">{t("authEnterpriseLoadError") || "企业信息加载失败"}</p>
        </div>
        <button type="button" onClick={onRetry} className={btnPlain}>
          {t("authEnterpriseRetry") || "重试"}
        </button>
      </div>
    );
  }

  if (!enterprise) {
    return (
      <div className="bg-secondary-50 border border-border rounded-lg px-6 py-5 flex items-center gap-4">
        <span className="w-10 h-10 rounded-full bg-secondary-200 text-secondary-500 flex items-center justify-center shrink-0">
          <Building2 className="w-4 h-4" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">{t("authEnterpriseTitle") || "企业信息"}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {t("authEnterpriseNotBoundDesc") || "绑定企业后即可展示企业信息并参与国际采购撮合"}
          </p>
        </div>
        <button type="button" onClick={onBind} className={btnBlue}>
          {t("authEnterpriseBindNow") || "立即绑定"}
        </button>
      </div>
    );
  }

  // ── 已绑定：分组表格 ──
  const row = enterprise;
  const companyName = sv(row, "name_confirmed") !== "-" ? sv(row, "name_confirmed") : sv(row, "company");
  const isIntl = String(row.country_code || "") !== "" && String(row.country_code) !== "CN";
  const coop = Number(row.coop_status || 0) === 1;
  const verifyStatus = String(row.verify_status || "");
  const checkNote = String(row.check_note || "");

  const basicCells: Cell[] = [
    { label: t("authEnterpriseId") || "ID", value: sv(row, "id") },
    { label: t("authEnterpriseNameConfirmed") || "确认后公司名", value: companyName },
    { label: t("authEnterpriseEnglishName") || "企业英文法务名", value: sv(row, "english_name") },
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
    { label: t("authEnterpriseIndustry") || "行业", value: sv(row, "industry") },
    { label: t("authEnterpriseSupplierType") || "供应商类型", value: sv(row, "type") || sv(row, "business_type") },
    { label: t("authEnterpriseCertifications") || "资质认证", value: sv(row, "certification") },
    { label: t("authEnterpriseProducts") || "主营产品", value: sv(row, "products") },
    { label: t("authEnterpriseIntro") || "企业简介", value: sv(row, "intro"), full: true },
  ];

  return (
    <div className="space-y-6">
      {/* 头部：公司名 + 标签 */}
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-foreground">{companyName}</h3>
        <div className="flex gap-2 shrink-0 flex-wrap justify-end">
          {verifyStatus === "done" && (
            <span className="px-2 py-0.5 rounded border border-success-200 bg-success-50 text-success-700 text-2xs">
              {t("authEnterpriseVerifyApproved") || "已认证"}
            </span>
          )}
          {verifyStatus === "pending" && (
            <span className="px-2 py-0.5 rounded border border-accent-200 bg-accent-50 text-accent-700 text-2xs">
              {t("authEnterpriseVerifyProcessing") || "审核中"}
            </span>
          )}
          {verifyStatus === "rejected" && (
            <span
              className="px-2 py-0.5 rounded border border-danger-200 bg-danger-50 text-danger-700 text-2xs"
              title={checkNote || undefined}
            >
              {t("authEnterpriseVerifyRejected") || "已驳回"}
            </span>
          )}
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

      {verifyStatus === "rejected" && checkNote && (
        <p className="text-xs text-danger-600 bg-danger-50 border border-danger-200 rounded-lg p-3">
          {t("authEnterpriseRejectReason") || "驳回原因"}：{checkNote}
        </p>
      )}

      {/* 营业执照 */}
      <section>
        <GroupTitle>{t("authEnterpriseLicense") || "营业执照"}</GroupTitle>
        <div className="border border-border rounded-md overflow-hidden bg-white p-4">
          {(() => {
            const licenseUrl = row.license_url ? String(row.license_url) : "";
            if (licenseUrl) {
              return (
                <div className="flex items-center gap-4">
                  <div className="w-40 h-28 rounded border border-border overflow-hidden bg-secondary-50 flex items-center justify-center">
                    <img src={licenseUrl} alt="营业执照" className="w-full h-full object-contain" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-success-600 font-medium">营业执照已上传</p>
                    <p className="text-xs text-muted-foreground mt-1">点击图片可查看大图</p>
                  </div>
                </div>
              );
            }
            return (
              <div className="flex items-center gap-4">
                <div className="w-40 h-28 rounded border border-dashed border-border bg-secondary-50 flex items-center justify-center">
                  <span className="text-xs text-muted-foreground">暂无</span>
                </div>
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">尚未上传营业执照</p>
                </div>
              </div>
            );
          })()}
        </div>
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
    </div>
  );
}

EnterpriseInfoCard.displayName = "EnterpriseInfoCard";
