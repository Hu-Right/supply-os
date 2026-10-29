/**
 * 企业信息表格式编辑表单（字段与 supplier 最终表一致）— 容器
 * Enterprise Edit Form (table style)
 *
 * @module features/auth/components/EnterpriseEditForm
 * @description 与展示表格同构的可编辑表格：label 灰底单元格 + 输入框值单元格，
 *              分组（基本信息/联系信息/工商与业务信息）。所见即所填、所填即所显。
 *              面向中国场景：国家/国家代码不填写不入库（提交留空）；
 *              省/市用级联下拉（对标采购需求地址表单）。
 *              提交值为 supplier 列名（snake_case）键值对；保存动作由外层 onSubmit 负责。
 *
 *              2026-10 组件化拆分（455→约 190 行）：字段定义/表格布局/执照上传段/认领引导条
 *              见 ./enterprise-edit/*，JSX 与行为逐字不变；本文件保留表单状态与提交编排。
 */
import { useState, useRef, useCallback } from "react";
import { useLocale } from "@/core/i18n";
import { api } from "@/core/http";
import { SupplierProductsPicker } from "./SupplierProductsPicker";
import type { EnterpriseInfo, CommodityNodeBrief } from "@/shared/hooks/useEnterpriseInfo";
import { toCamelKey } from "@/shared/utils/case-keys";
import {
  BASIC_FIELDS, CONTACT_FIELDS, BUSINESS_FIELDS, REQUIRED_KEYS, ALL_FIELD_GROUPS,
  btnBlue, btnPlain, inputCls,
} from "./enterprise-edit/fields";
import { FieldGrid, GroupTitle } from "./enterprise-edit/FieldGrid";
import { LicenseUploadSection } from "./enterprise-edit/LicenseUploadSection";
import { ClaimSuggestBar, type ClaimSuggestion } from "./enterprise-edit/ClaimSuggestBar";

export type { ClaimSuggestion } from "./enterprise-edit/ClaimSuggestBar";

export interface EnterpriseEditFormProps {
  /** 编辑态初始值（已绑定行）；新建传 null */
  initial: EnterpriseInfo | null;
  /** 已自报的主营品目（回填）；未绑定/新建传空数组 */
  initialCommodityNodes?: CommodityNodeBrief[];
  saving: boolean;
  /** 提交值：supplier 列名为字符串键值；commodity_nodes 为自报品目节点码数组 */
  onSubmit: (values: Record<string, string | string[]>) => void;
  onCancel: () => void;
  /** 当前执照 URL（用于显示已有执照） */
  licenseUrl?: string | null;
  /** 执照上传成功回调 */
  onLicenseUploaded?: (url: string) => void;
  /** 用户点击候选企业「去认领」时上抛（认领弹窗由外层统一挂） */
  onClaimRequest?: (supplier: { id: number; company: string }) => void;
}

export function EnterpriseEditForm({ initial, initialCommodityNodes, saving, onSubmit, onCancel, licenseUrl, onLicenseUploaded, onClaimRequest }: EnterpriseEditFormProps) {
  const { t } = useLocale();
  const [formError, setFormError] = useState<string | null>(null);
  const [localLicenseUrl, setLocalLicenseUrl] = useState(licenseUrl || "");
  const [suggestions, setSuggestions] = useState<ClaimSuggestion[]>([]);
  const [suggestDismissed, setSuggestDismissed] = useState(false);
  const suggestCheckedRef = useRef("");
  // 主营品目自报选中集（受控于本表单，提交时只上抛节点码数组；initialCommodityNodes 为回填初值）
  const [commodityNodes, setCommodityNodes] = useState<CommodityNodeBrief[]>(initialCommodityNodes ?? []);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = { province: "", city: "" };
    // 读写不对称是故意的：响应侧 camelCase（红线②），而表单字段 key / PUT body 仍用 supplier 列名
    // （请求侧允许 snake）。回填就是这里唯一一处换键，不另外维护一张对照表。
    const wire = initial as Record<string, unknown> | null | undefined;
    for (const group of ALL_FIELD_GROUPS) {
      for (const f of group) {
        const v = wire?.[toCamelKey(f.key)];
        init[f.key] = v === null || v === undefined ? "" : String(v);
      }
    }
    // 省市名称从初始行回填
    init.province = initial?.province ? String(initial.province) : "";
    init.city = initial?.city ? String(initial.city) : "";
    // products（产品介绍）已从 BUSINESS_FIELDS 移入独立的「主营产品」板块，不再由循环初始化，这里显式回填
    init.products = initial?.products ? String(initial.products) : "";
    return init;
  });

  const set = useCallback((key: string, v: string) => setValues((s) => ({ ...s, [key]: v })), []);

  // 认领引导：仅未绑定新建时，公司名失焦查库内已认证同名/近似企业（查询失败静默，不阻断填写）
  const checkCompanySuggest = async (raw: string) => {
    if (initial) return;
    const name = raw.trim();
    if (name.length < 2 || name === suggestCheckedRef.current) return;
    suggestCheckedRef.current = name;
    try {
      const res = await api<{ matches: ClaimSuggestion[] }>(
        `/api/user/enterprise/suggest?name=${encodeURIComponent(name)}`,
      );
      setSuggestions(res?.matches ?? []);
      setSuggestDismissed(false);
    } catch {
      /* 建议接口失败不打断填写 */
    }
  };
  const handleCompanyBlur = useCallback(() => { void checkCompanySuggest(values.company); }, [values.company]); // eslint-disable-line react-hooks/exhaustive-deps

  // 执照以保存为单一入口：段组件上抛 → 容器同步 URL 状态与外层回调（与原时机一致）
  const handleLicenseChange = (url: string) => {
    setLocalLicenseUrl(url);
    onLicenseUploaded?.(url);
  };

  const handleSubmit = () => {
    const missing: string[] = [];
    for (const r of REQUIRED_KEYS) {
      if (!(values[r.key] || "").trim()) missing.push(t(r.labelKey) || r.fallback);
    }
    // 营业执照必填
    if (!localLicenseUrl) {
      missing.push(t("authEnterpriseLicense") || "营业执照");
    }
    if (missing.length) {
      setFormError(`${t("authEnterpriseRequiredMissing") || "请填写必填项"}：${missing.join("、")}`);
      return;
    }
    setFormError(null);
    // 国家/国家代码不提交（面向中国场景留空不入库）
    const payload: Record<string, string | string[]> = {};
    for (const [k, v] of Object.entries(values)) {
      if (k === "country" || k === "country_code") continue;
      payload[k] = v;
    }
    // 执照以保存为单一入口：提交当前本地执照 URL（空串 = 移除）
    payload.license_url = localLicenseUrl;
    // 主营品目自报：始终携带当前选中集的节点码（空数组即清空全部自报），服务端按绑定主体写 self_report
    payload.commodity_nodes = commodityNodes.map((n) => n.code);
    onSubmit(payload);
  };

  return (
    <div className="space-y-6">
      {/* 认领引导：库内已有认证同名/近似企业时提示，提示但不阻断 */}
      {!suggestDismissed && (
        <ClaimSuggestBar suggestions={suggestions} onClaim={onClaimRequest} onDismiss={() => setSuggestDismissed(true)} />
      )}

      <LicenseUploadSection value={localLicenseUrl} onChange={handleLicenseChange} />

      <section>
        <GroupTitle>{t("settingsBasicInfo") || "基本信息"}</GroupTitle>
        <FieldGrid fields={BASIC_FIELDS} values={values} onSet={set} onCompanyBlur={handleCompanyBlur} />
      </section>
      <section>
        <GroupTitle>{t("authEnterpriseGroupContact") || "联系信息"}</GroupTitle>
        <FieldGrid fields={CONTACT_FIELDS} values={values} onSet={set} />
      </section>
      <section>
        <GroupTitle>{t("authEnterpriseGroupBusiness") || "工商与业务信息"}</GroupTitle>
        <FieldGrid fields={BUSINESS_FIELDS} values={values} onSet={set} />
      </section>

      {/* 主营产品：展示属性（自由文本）与商品属性（品目树落点）并列展示，同属一个概念的两个侧面 */}
      <section>
        <GroupTitle>{t("authEnterpriseGroupProducts") || "主营产品"}</GroupTitle>
        <div className="border border-border rounded-md overflow-hidden bg-white">
          {/* 展示属性：对外文案（supplier.products） */}
          <div className="grid grid-cols-4 border-b border-border">
            <div className="bg-secondary-50 px-3 py-2 text-xs text-muted-foreground border-r border-border flex items-center">
              {t("authEnterpriseProductIntro") || "产品介绍"}
              <span className="ml-1 text-2xs text-slate-400">{t("authEnterpriseForDisplay") || "（展示用）"}</span>
              <span className="ml-0.5 text-danger-500" aria-hidden="true">*</span>
            </div>
            <div className="px-3 py-2 col-span-3">
              <textarea
                className={`${inputCls} min-h-16 resize-y`}
                value={values.products || ""}
                onChange={(e) => set("products", e.target.value)}
                placeholder={t("authEnterpriseProductIntroPh") || "用一句话描述贵司对外展示的主营产品"}
              />
              <p className="mt-1 text-2xs text-muted-foreground">{t("authEnterpriseProductIntroHint") || "对外展示的产品描述文本。"}</p>
            </div>
          </div>
          {/* 商品属性：品目树落点（supplier_backbone_interests self_report），用于公告/商机匹配 */}
          <div className="grid grid-cols-4">
            <div className="bg-secondary-50 px-3 py-2 text-xs text-muted-foreground border-r border-border pt-3 align-top">
              {t("authEnterpriseCommodityNodes") || "主营品目"}
              <span className="ml-1 text-2xs text-slate-400">{t("authEnterpriseForMatch") || "（匹配用）"}</span>
            </div>
            <div className="px-3 py-2 col-span-3">
              <SupplierProductsPicker value={commodityNodes} onChange={setCommodityNodes} />
            </div>
          </div>
        </div>
      </section>

      {formError && (
        <p className="text-xs font-medium text-danger-600 bg-danger-50 border border-danger-200 rounded-lg p-3">
          {formError}
        </p>
      )}

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
