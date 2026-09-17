/**
 * 企业信息表格式编辑表单（字段与 supplier 最终表一致）
 * Enterprise Edit Form (table style)
 *
 * @module features/auth/components/EnterpriseEditForm
 * @description 与展示表格同构的可编辑表格：label 灰底单元格 + 输入框值单元格，
 *              分组（基本信息/联系信息/工商与业务信息）。所见即所填、所填即所显。
 *              提交值为 supplier 列名（snake_case）的键值对。纯展示+本地状态，
 *              保存动作由外层 onSubmit 回调负责。
 */
import { useState } from "react";
import { useLocale } from "@/core/i18n";
import type { EnterpriseInfo } from "../hooks/useEnterpriseInfo";

const btnBlue = "px-4 py-1.5 rounded-md bg-brand-600 text-white text-xs font-medium hover:bg-brand-700 transition-colors shrink-0 disabled:opacity-50";
const btnPlain = "px-4 py-1.5 rounded-md bg-white border border-border text-xs font-medium text-foreground hover:bg-secondary-50 transition-colors shrink-0";
const inputCls = "w-full px-2 py-1.5 rounded border border-border bg-white text-xs text-foreground focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30 outline-none";

export interface EnterpriseEditFormProps {
  /** 编辑态初始值（已绑定行）；新建传 null */
  initial: EnterpriseInfo | null;
  saving: boolean;
  onSubmit: (values: Record<string, string>) => void;
  onCancel: () => void;
}

/** 可编辑字段定义：key=supplier 列名 */
interface FieldDef {
  key: string;
  labelKey: string;
  fallback: string;
  full?: boolean;
  textarea?: boolean;
}

const BASIC_FIELDS: FieldDef[] = [
  { key: "company", labelKey: "authEnterpriseName", fallback: "企业名称" },
  { key: "country", labelKey: "authEnterpriseCountry", fallback: "国家/地区" },
  { key: "country_code", labelKey: "authEnterpriseCountryCode", fallback: "国家代码" },
  { key: "province", labelKey: "authEnterpriseProvince", fallback: "省份" },
  { key: "city", labelKey: "authEnterpriseCity", fallback: "城市" },
  { key: "address", labelKey: "authEnterpriseBizAddress", fallback: "经营地址", full: true },
  { key: "registered_address", labelKey: "authEnterpriseRegAddress", fallback: "注册地址", full: true },
];
const CONTACT_FIELDS: FieldDef[] = [
  { key: "contact", labelKey: "authEnterpriseContact", fallback: "联系人" },
  { key: "position", labelKey: "authEnterprisePosition", fallback: "职位" },
  { key: "phone", labelKey: "authEnterprisePhone", fallback: "联系电话" },
  { key: "email", labelKey: "authEnterpriseEmail", fallback: "邮箱" },
  { key: "registered_phone", labelKey: "authEnterpriseRegPhone", fallback: "注册电话" },
  { key: "registered_email", labelKey: "authEnterpriseRegEmail", fallback: "注册邮箱" },
  { key: "website", labelKey: "authEnterpriseWebsite", fallback: "官网", full: true },
];
const BUSINESS_FIELDS: FieldDef[] = [
  { key: "legal_rep", labelKey: "authEnterpriseLegalRep", fallback: "法定代表人" },
  { key: "established_at", labelKey: "authEnterpriseEstablished", fallback: "成立日期" },
  { key: "registered_capital", labelKey: "authEnterpriseCapital", fallback: "注册资本" },
  { key: "credit_code", labelKey: "authEnterpriseCreditCode", fallback: "统一社会信用代码" },
  { key: "industry", labelKey: "authEnterpriseIndustry", fallback: "行业" },
  { key: "type", labelKey: "authEnterpriseSupplierType", fallback: "供应商类型" },
  { key: "certification", labelKey: "authEnterpriseCertifications", fallback: "资质认证" },
  { key: "products", labelKey: "authEnterpriseProducts", fallback: "主营产品" },
  { key: "intro", labelKey: "authEnterpriseIntro", fallback: "企业简介", full: true, textarea: true },
];

function GroupTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="w-1 h-4 rounded bg-brand-500" />
      <h3 className="text-sm font-medium text-foreground">{children}</h3>
    </div>
  );
}

export function EnterpriseEditForm({ initial, saving, onSubmit, onCancel }: EnterpriseEditFormProps) {
  const { t } = useLocale();
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const group of [BASIC_FIELDS, CONTACT_FIELDS, BUSINESS_FIELDS]) {
      for (const f of group) {
        const v = initial?.[f.key];
        init[f.key] = v === null || v === undefined ? "" : String(v);
      }
    }
    return init;
  });

  const set = (key: string, v: string) => setValues((s) => ({ ...s, [key]: v }));

  const renderField = (f: FieldDef) => (
    <div key={f.key} className="contents">
      <div className="bg-secondary-50 px-3 py-2 text-xs text-muted-foreground border-r border-border flex items-center">
        {t(f.labelKey) || f.fallback}
      </div>
      <div className={`px-3 py-2 ${f.full ? "col-span-3" : "col-span-1"}`}>
        {f.textarea ? (
          <textarea
            className={`${inputCls} min-h-16 resize-y`}
            value={values[f.key] || ""}
            onChange={(e) => set(f.key, e.target.value)}
          />
        ) : (
          <input
            className={inputCls}
            value={values[f.key] || ""}
            onChange={(e) => set(f.key, e.target.value)}
          />
        )}
      </div>
    </div>
  );

  const renderGroup = (fields: FieldDef[]) => {
    const rows: FieldDef[][] = [];
    let cur: FieldDef[] = [];
    for (const f of fields) {
      if (f.full) {
        if (cur.length) { rows.push(cur); cur = []; }
        rows.push([f]);
      } else {
        cur.push(f);
        if (cur.length === 2) { rows.push(cur); cur = []; }
      }
    }
    if (cur.length) rows.push(cur);
    return (
      <div className="border border-border rounded-md overflow-hidden bg-white">
        {rows.map((row, ri) => (
          <div key={ri} className="grid grid-cols-4 border-b border-border last:border-b-0">
            {row.map(renderField)}
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
  };

  const handleSubmit = () => {
    // 仅提交非空字段（空串交由后端转 null）
    const payload: Record<string, string> = {};
    for (const [k, v] of Object.entries(values)) payload[k] = v;
    onSubmit(payload);
  };

  return (
    <div className="space-y-6">
      <section>
        <GroupTitle>{t("settingsBasicInfo") || "基本信息"}</GroupTitle>
        {renderGroup(BASIC_FIELDS)}
      </section>
      <section>
        <GroupTitle>{t("authEnterpriseGroupContact") || "联系信息"}</GroupTitle>
        {renderGroup(CONTACT_FIELDS)}
      </section>
      <section>
        <GroupTitle>{t("authEnterpriseGroupBusiness") || "工商与业务信息"}</GroupTitle>
        {renderGroup(BUSINESS_FIELDS)}
      </section>

      <div className="flex gap-2">
        <button type="button" className={btnBlue} disabled={saving} onClick={handleSubmit}>
          {saving ? (t("authEnterpriseSaving") || "保存中…") : (t("authEnterpriseSave") || "保存")}
        </button>
        <button type="button" className={btnPlain} onClick={onCancel} disabled={saving}>
          {t("authEnterpriseCancel") || "取消"}
        </button>
      </div>
    </div>
  );
}

EnterpriseEditForm.displayName = "EnterpriseEditForm";
