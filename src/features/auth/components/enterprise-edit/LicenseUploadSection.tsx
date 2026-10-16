"use client";

/**
 * 企业信息编辑表单 — 营业执照上传段（自 EnterpriseEditForm.tsx 拆出，JSX 逐字不变）。
 *
 * 半容器：uploading/uploadError/fileInputRef 为上传过程私有状态，内聚到本组件；
 * 执照 URL（提交必需）由容器持有——上传成功/移除均经 onChange 上抛，
 * 与容器 setLocalLicenseUrl + onLicenseUploaded 的原有单一时机保持一致。
 *
 * @module features/auth/components/enterprise-edit/LicenseUploadSection
 */
import { useState, useRef } from "react";
import { Upload, X, Image as ImageIcon } from "lucide-react";
import { api } from "@/core/http";
import { AuthLicenseImage } from "@/shared/ui";
import { compressImage, blobToFile } from "@/shared/utils/image-compress";
import { GroupTitle } from "./FieldGrid";
import { useLocale } from "@/core/i18n";

export function LicenseUploadSection({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  const { t } = useLocale();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

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
      onChange(res.url);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <section>
      <GroupTitle>
        {t("authEnterpriseLicense") || "营业执照"}
        <span className="ml-0.5 text-danger-500" aria-hidden="true">*</span>
      </GroupTitle>
      <div className="border border-border rounded-md overflow-hidden bg-white p-4">
        {value ? (
          <div className="flex items-center gap-4">
            <div className="w-32 h-24 rounded border border-border overflow-hidden bg-secondary-50 flex items-center justify-center">
              <AuthLicenseImage url={value} alt="营业执照" className="w-full h-full object-contain" />
            </div>
            <div className="flex-1 space-y-2">
              <p className="text-xs text-success-600 font-medium">营业执照已上传</p>
              <button
                type="button"
                onClick={() => onChange("")}
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
  );
}
