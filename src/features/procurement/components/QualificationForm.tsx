/**
 * QualificationForm - 供应商资质表单组件
 * 
 * TODO: 此组件为临时 stub，需要实现完整的表单逻辑
 * 原始组件缺失，此处提供最小实现以解除构建阻塞
 */

import { useState } from "react";
import { Building2, MapPin, Globe, Phone, Mail, FileText } from "lucide-react";

export interface QualificationFormData {
  companyName: string;
  contactPerson: string;
  phone: string;
  email: string;
  country: string;
  industry: string;
  description: string;
}

export const INITIAL_QUALIFICATION_FORM: QualificationFormData = {
  companyName: "",
  contactPerson: "",
  phone: "",
  email: "",
  country: "",
  industry: "",
  description: "",
};

interface QualificationFormProps {
  initialData?: Partial<QualificationFormData>;
  onSubmit: (data: QualificationFormData) => Promise<void>;
  isSubmitting?: boolean;
}

export default function QualificationForm({
  initialData,
  onSubmit,
  isSubmitting = false,
}: QualificationFormProps) {
  const [formData, setFormData] = useState<QualificationFormData>({
    ...INITIAL_QUALIFICATION_FORM,
    ...initialData,
  });

  const handleChange = (field: keyof QualificationFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="block text-sm font-medium mb-2">
          <Building2 className="inline w-4 h-4 mr-1" />
          企业名称
        </label>
        <input
          type="text"
          value={formData.companyName}
          onChange={(e) => handleChange("companyName", e.target.value)}
          className="w-full px-3 py-2 border rounded-lg"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">
          <FileText className="inline w-4 h-4 mr-1" />
          联系人
        </label>
        <input
          type="text"
          value={formData.contactPerson}
          onChange={(e) => handleChange("contactPerson", e.target.value)}
          className="w-full px-3 py-2 border rounded-lg"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-2">
            <Phone className="inline w-4 h-4 mr-1" />
            电话
          </label>
          <input
            type="tel"
            value={formData.phone}
            onChange={(e) => handleChange("phone", e.target.value)}
            className="w-full px-3 py-2 border rounded-lg"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            <Mail className="inline w-4 h-4 mr-1" />
            邮箱
          </label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) => handleChange("email", e.target.value)}
            className="w-full px-3 py-2 border rounded-lg"
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-2">
            <Globe className="inline w-4 h-4 mr-1" />
            国家
          </label>
          <input
            type="text"
            value={formData.country}
            onChange={(e) => handleChange("country", e.target.value)}
            className="w-full px-3 py-2 border rounded-lg"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            <MapPin className="inline w-4 h-4 mr-1" />
            行业
          </label>
          <input
            type="text"
            value={formData.industry}
            onChange={(e) => handleChange("industry", e.target.value)}
            className="w-full px-3 py-2 border rounded-lg"
            required
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">
          企业描述
        </label>
        <textarea
          value={formData.description}
          onChange={(e) => handleChange("description", e.target.value)}
          className="w-full px-3 py-2 border rounded-lg"
          rows={4}
        />
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
      >
        {isSubmitting ? "提交中..." : "提交"}
      </button>
    </form>
  );
}
