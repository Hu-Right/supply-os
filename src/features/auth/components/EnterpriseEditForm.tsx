/**
 * 企业信息表格式编辑表单（字段与 supplier 最终表一致）
 * Enterprise Edit Form (table style)
 *
 * @module features/auth/components/EnterpriseEditForm
 * @description 与展示表格同构的可编辑表格：label 灰底单元格 + 输入框值单元格，
 *              分组（基本信息/联系信息/工商与业务信息）。所见即所填、所填即所显。
 *              面向中国场景：国家/国家代码不填写不入库（提交留空）；
 *              省/市用级联下拉（对标采购需求地址表单）；供应商类型为下拉选择。
 *              提交值为 supplier 列名（snake_case）键值对；保存动作由外层 onSubmit 负责。
 */
import { useState, useRef } from "react";
import { Upload, X, Image as ImageIcon } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { api } from "@/core/http";
import { compressImage, blobToFile } from "@/lib/utils/image-compress";
import type { EnterpriseInfo } from "@/shared/hooks/useEnterpriseInfo";

const btnBlue = "px-4 py-1.5 rounded-md bg-brand-600 text-white text-xs font-medium hover:bg-brand-700 transition-colors shrink-0 disabled:opacity-50";
const btnPlain = "px-4 py-1.5 rounded-md bg-white border border-border text-xs font-medium text-foreground hover:bg-secondary-50 transition-colors shrink-0";
const inputCls = "w-full px-2 py-1.5 rounded border border-border bg-white text-xs text-foreground focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30 outline-none";

export interface EnterpriseEditFormProps {
  /** 编辑态初始值（已绑定行）；新建传 null */
  initial: EnterpriseInfo | null;
  saving: boolean;
  onSubmit: (values: Record<string, string>) => void;
  onCancel: () => void;
  /** 当前执照 URL（用于显示已有执照） */
  licenseUrl?: string | null;
  /** 执照上传成功回调 */
  onLicenseUploaded?: (url: string) => void;
}

interface OptionDef { value: string; labelKey: string; fallback: string }
interface FieldDef {
  key: string;
  labelKey: string;
  fallback: string;
  full?: boolean;
  textarea?: boolean;
  options?: OptionDef[];
  placeholderKey?: string;
  placeholder?: string;
}

/** 供应商类型下拉选项 */
const SUPPLIER_TYPE_OPTIONS: OptionDef[] = [
  { value: "factory", labelKey: "authEnterpriseTypeFactory", fallback: "工厂" },
  { value: "trader", labelKey: "authEnterpriseTypeTrader", fallback: "贸易商" },
  { value: "factory_trader", labelKey: "authEnterpriseTypeFactoryTrader", fallback: "工贸一体" },
];

const BASIC_FIELDS: FieldDef[] = [
  { key: "company", labelKey: "authEnterpriseName", fallback: "企业名称", placeholderKey: "authEnterpriseNamePh" },
  { key: "english_name", labelKey: "authEnterpriseEnglishName", fallback: "企业英文法务名", placeholderKey: "authEnterpriseEnglishNamePh" },
  { key: "province", labelKey: "authEnterpriseProvince", fallback: "省份", placeholderKey: "authEnterpriseProvincePh" },
  { key: "city", labelKey: "authEnterpriseCity", fallback: "城市", placeholderKey: "authEnterpriseCityPh" },
  { key: "address", labelKey: "authEnterpriseBizAddress", fallback: "经营地址", full: true, placeholderKey: "authEnterpriseBizAddressPh" },
  { key: "registered_address", labelKey: "authEnterpriseRegAddress", fallback: "注册地址", full: true, placeholderKey: "authEnterpriseRegAddressPh" },
];
const CONTACT_FIELDS: FieldDef[] = [
  { key: "contact", labelKey: "authEnterpriseContact", fallback: "联系人", placeholderKey: "authEnterpriseContactPh" },
  { key: "position", labelKey: "authEnterprisePosition", fallback: "职位", placeholderKey: "authEnterprisePositionPh" },
  { key: "phone", labelKey: "authEnterprisePhone", fallback: "联系电话", placeholderKey: "authEnterprisePhonePh" },
  { key: "email", labelKey: "authEnterpriseEmail", fallback: "邮箱", placeholderKey: "authEnterpriseEmailPh" },
  { key: "website", labelKey: "authEnterpriseWebsite", fallback: "官网", full: true, placeholderKey: "authEnterpriseWebsitePh" },
];
const BUSINESS_FIELDS: FieldDef[] = [
  { key: "legal_rep", labelKey: "authEnterpriseLegalRep", fallback: "法定代表人", placeholderKey: "authEnterpriseLegalRepPh" },
  { key: "established_at", labelKey: "authEnterpriseEstablished", fallback: "成立日期", placeholderKey: "authEnterpriseEstablishedPh" },
  { key: "registered_capital", labelKey: "authEnterpriseCapital", fallback: "注册资本", placeholderKey: "authEnterpriseCapitalPh" },
  { key: "credit_code", labelKey: "authEnterpriseCreditCode", fallback: "统一社会信用代码", placeholderKey: "authEnterpriseCreditCodePh" },
  { key: "industry", labelKey: "authEnterpriseIndustry", fallback: "所属行业", placeholderKey: "authEnterpriseIndustryPh" },
  { key: "type", labelKey: "authEnterpriseSupplierType", fallback: "供应商类型", options: SUPPLIER_TYPE_OPTIONS },
  { key: "certification", labelKey: "authEnterpriseCertifications", fallback: "资质认证", placeholderKey: "authEnterpriseCertificationsPh" },
  { key: "products", labelKey: "authEnterpriseProducts", fallback: "主营产品", placeholderKey: "authEnterpriseProductsPh" },
  { key: "intro", labelKey: "authEnterpriseIntro", fallback: "企业简介", full: true, textarea: true, placeholderKey: "authEnterpriseIntroPh" },
];

/** 必填字段（预提交阻断校验点名用） */
const REQUIRED_KEYS: { key: string; labelKey: string; fallback: string }[] = [
  { key: "company", labelKey: "authEnterpriseName", fallback: "企业名称" },
  { key: "credit_code", labelKey: "authEnterpriseCreditCode", fallback: "统一社会信用代码" },
  { key: "legal_rep", labelKey: "authEnterpriseLegalRep", fallback: "法定代表人" },
  { key: "province", labelKey: "authEnterpriseProvince", fallback: "省份" },
  { key: "city", labelKey: "authEnterpriseCity", fallback: "城市" },
  { key: "address", labelKey: "authEnterpriseBizAddress", fallback: "经营地址" },
  { key: "contact", labelKey: "authEnterpriseContact", fallback: "联系人" },
  { key: "phone", labelKey: "authEnterprisePhone", fallback: "联系电话" },
  { key: "industry", labelKey: "authEnterpriseIndustry", fallback: "所属行业" },
  { key: "products", labelKey: "authEnterpriseProducts", fallback: "主营产品" },
  { key: "type", labelKey: "authEnterpriseSupplierType", fallback: "供应商类型" },
];

function GroupTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="w-1 h-4 rounded bg-brand-500" />
      <h3 className="text-sm font-medium text-foreground">{children}</h3>
    </div>
  );
}

export function EnterpriseEditForm({ initial, saving, onSubmit, onCancel, licenseUrl, onLicenseUploaded }: EnterpriseEditFormProps) {
  const { t } = useLocale();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [localLicenseUrl, setLocalLicenseUrl] = useState(licenseUrl || "");
  const [formError, setFormError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = { province: "", city: "" };
    for (const group of [BASIC_FIELDS, CONTACT_FIELDS, BUSINESS_FIELDS]) {
      for (const f of group) {
        const v = initial?.[f.key];
        init[f.key] = v === null || v === undefined ? "" : String(v);
      }
    }
    // 省市名称从初始行回填
    init.province = initial?.province ? String(initial.province) : "";
    init.city = initial?.city ? String(initial.city) : "";
    return init;
  });

  const set = (key: string, v: string) => setValues((s) => ({ ...s, [key]: v }));

  // 必填字段 Set（用于 label 星号标识）
  const requiredKeys = new Set(REQUIRED_KEYS.map((r) => r.key));

  const renderField = (f: FieldDef) => {
    const ph = f.placeholderKey ? (t(f.placeholderKey) || f.placeholder || "") : (f.placeholder || "");
    const isRequired = requiredKeys.has(f.key);
    return (
      <div key={f.key} className="contents">
        <div className="bg-secondary-50 px-3 py-2 text-xs text-muted-foreground border-r border-border flex items-center">
          {t(f.labelKey) || f.fallback}
          {isRequired && <span className="ml-0.5 text-danger-500" aria-hidden="true">*</span>}
        </div>
        <div className={`px-3 py-2 ${f.full ? "col-span-3" : "col-span-1"}`}>
          {f.textarea ? (
            <textarea
              className={`${inputCls} min-h-16 resize-y`}
              value={values[f.key] || ""}
              onChange={(e) => set(f.key, e.target.value)}
              placeholder={ph}
            />
          ) : f.options ? (
            <select
              className={inputCls}
              value={values[f.key] || ""}
              onChange={(e) => set(f.key, e.target.value)}
            >
              <option value="">{t("authEnterpriseSelectPlaceholder") || "请选择"}</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>{t(o.labelKey) || o.fallback}</option>
              ))}
            </select>
          ) : (
            <input
              className={inputCls}
              value={values[f.key] || ""}
              onChange={(e) => set(f.key, e.target.value)}
              placeholder={ph}
            />
          )}
        </div>
      </div>
    );
  };

  const renderGroup = (fields: FieldDef[]) => {
    const rows: React.ReactNode[] = [];
    let cur: FieldDef[] = [];
    const flush = () => {
      if (!cur.length) return;
      const rowFields = cur;
      rows.push(
        <div key={`r-${rowFields[0].key}`} className="grid grid-cols-4 border-b border-border">
          {rowFields.map(renderField)}
          {rowFields.length === 1 && !rowFields[0].full && (
            <>
              <div className="bg-secondary-50 px-3 py-2 border-r border-border" />
              <div className="px-3 py-2" />
            </>
          )}
        </div>,
      );
      cur = [];
    };
    for (const f of fields) {
      if (f.full) { flush(); rows.push(<div key={`f-${f.key}`} className="grid grid-cols-4 border-b border-border">{renderField(f)}</div>); }
      else { cur.push(f); if (cur.length === 2) flush(); }
    }
    flush();
    return (
      <div className="border border-border rounded-md overflow-hidden bg-white">
        {rows}
      </div>
    );
  };

  const handleLicenseUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setUploadError("文件大小不能超过 5MB");
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setUploadError("仅支持 JPG、PNG、WebP 格式");
      return;
    }
    setUploadError("");
    setUploading(true);
    try {
      // 客户端压缩（减少上传体积和存储成本）
      const compressedBlob = await compressImage(file, {
        maxWidth: 2560,
        maxHeight: 2560,
        quality: 0.9,
        targetType: "image/jpeg", // 统一转为 JPEG 以获得更好压缩率
      });
      const compressedFile = blobToFile(compressedBlob, file.name);

      const formData = new FormData();
      formData.append("file", compressedFile);
      const res: { url: string } = await api("/api/user/enterprise/license-upload", {
        method: "POST",
        body: formData,
      });
      setLocalLicenseUrl(res.url);
      onLicenseUploaded?.(res.url);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
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
    const payload: Record<string, string> = {};
    for (const [k, v] of Object.entries(values)) {
      if (k === "country" || k === "country_code") continue;
      payload[k] = v;
    }
    onSubmit(payload);
  };

  return (
    <div className="space-y-6">
      {/* 营业执照上传 */}
      <section>
        <GroupTitle>
          {t("authEnterpriseLicense") || "营业执照"}
          <span className="ml-0.5 text-danger-500" aria-hidden="true">*</span>
        </GroupTitle>
        <div className="border border-border rounded-md overflow-hidden bg-white p-4">
          {localLicenseUrl ? (
            <div className="flex items-center gap-4">
              <div className="w-32 h-24 rounded border border-border overflow-hidden bg-secondary-50 flex items-center justify-center">
                <img src={localLicenseUrl} alt="营业执照" className="w-full h-full object-contain" />
              </div>
              <div className="flex-1 space-y-2">
                <p className="text-xs text-success-600 font-medium">营业执照已上传</p>
                <button
                  type="button"
                  onClick={() => { setLocalLicenseUrl(""); onLicenseUploaded?.(""); }}
                  className="text-xs text-danger-500 hover:text-danger-700 flex items-center gap-1"
                >
                  <X className="w-3 h-3" /> 移除执照
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <div className="w-32 h-24 rounded border border-dashed border-border bg-secondary-50 flex items-center justify-center">
                <ImageIcon className="w-8 h-8 text-muted-foreground" />
              </div>
              <div className="flex-1 space-y-2">
                <p className="text-xs text-muted-foreground">请上传营业执照（JPG/PNG/WebP，最大 5MB）</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleLicenseUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-brand-600 text-white text-xs font-medium hover:bg-brand-700 transition-colors disabled:opacity-50"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {uploading ? "上传中…" : "选择文件上传"}
                </button>
              </div>
            </div>
          )}
          {uploadError && (
            <p className="text-xs text-danger-600 mt-2">{uploadError}</p>
          )}
        </div>
      </section>

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
