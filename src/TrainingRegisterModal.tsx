import React, { useState, useEffect } from "react";
import { X, CheckCircle2, GraduationCap, Send } from "lucide-react";

interface TrainingRegisterModalProps {
  onClose: () => void;
}

interface Certification {
  id: number;
  name: string;
}

interface Industry {
  id: number;
  title_zh: string;
  code: string;
}

const EXPORT_EXPERIENCE_OPTIONS = ["3年以下", "3~5年", "5~10年", "10年以上"];

export default function TrainingRegisterModal({ onClose }: TrainingRegisterModalProps) {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [certifications, setCertifications] = useState<Certification[]>([]);
  const [industries, setIndustries] = useState<Industry[]>([]);

  const [form, setForm] = useState({
    company_name: "",
    industry_id: "",
    main_product: "",
    export_experience: "",
    certification: [] as string[],
    other_certification: "",
    contact_name: "",
    position: "",
    telephone: "",
    email: "",
    remark: "",
  });

  useEffect(() => {
    fetch("/api/certifications")
      .then(res => res.json())
      .then(data => setCertifications(Array.isArray(data) ? data : []))
      .catch(() => {});

    fetch("/api/unspsc/industries")
      .then(res => res.json())
      .then(data => setIndustries(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const toggleCertification = (cert: string) => {
    setForm((prev) => {
      const has = prev.certification.includes(cert);
      return {
        ...prev,
        certification: has
          ? prev.certification.filter((c) => c !== cert)
          : [...prev.certification, cert],
      };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!form.company_name || !form.contact_name || !form.telephone) {
      setError("企业名称、参会人姓名、手机号码为必填项");
      return;
    }

    let certificationStr = form.certification.join("\n");
    if (form.other_certification.trim()) {
      certificationStr += "\n" + form.other_certification.trim();
    }

    setLoading(true);
    try {
      const res = await fetch("/api/training/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: form.company_name,
          industry_id: form.industry_id ? parseInt(form.industry_id) : null,
          main_product: form.main_product,
          export_experience: form.export_experience,
          certification: certificationStr,
          contact_name: form.contact_name,
          position: form.position,
          telephone: form.telephone,
          email: form.email,
          remark: form.remark,
        }),
      });

      if (res.ok) {
        setSubmitted(true);
        setTimeout(() => onClose(), 2500);
      } else {
        const data = await res.json();
        setError(data.error || "提交失败");
      }
    } catch (err) {
      setError("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex justify-center items-center p-2 sm:p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-hidden shadow-2xl border border-slate-200 flex flex-col">
        <div className="bg-slate-900 text-white p-4 flex justify-between items-center shrink-0 bg-gradient-to-r from-slate-950 to-slate-850">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <GraduationCap className="w-5 h-5 text-teal-400" />
              <h3 className="text-base font-extrabold">联合国采购投标实操与能力建设研修班</h3>
            </div>
            <p className="text-[10px] text-slate-400">填写企业信息完成报名，信息将加密录入供应商数据库</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white ml-2">
            <X className="w-5 h-5" />
          </button>
        </div>

        {submitted ? (
          <div className="p-8 text-center space-y-4 flex-1 flex flex-col justify-center items-center">
            <div className="w-16 h-16 bg-teal-50 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10 text-teal-600" />
            </div>
            <h4 className="text-lg font-bold text-slate-800">报名信息已成功提交！</h4>
            <p className="text-xs text-slate-500 max-w-md">
              您的企业信息已录入全球供应商数据库，我们将在研修班开班前通过邮件/电话与您确认参会细节。
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
            {error && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1">企业名称 <span className="text-rose-500">*</span></label>
                <input type="text" name="company_name" value={form.company_name} onChange={handleChange}
                  placeholder="如：浙江利得森医疗器械有限公司"
                  className="w-full px-3 py-2 text-xs bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500" required />
              </div>
              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1">所属行业（UNSPSC分类）<span className="text-rose-500">*</span></label>
                <select name="industry_id" value={form.industry_id} onChange={handleChange}
                  className="w-full px-3 py-2 text-xs bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500" required>
                  <option value="">请选择行业</option>
                  {industries.map((ind) => (
                    <option key={ind.id} value={ind.id}>{ind.code} - {ind.title_zh}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1">主营产品 <span className="text-rose-500">*</span></label>
                <input type="text" name="main_product" value={form.main_product} onChange={handleChange}
                  placeholder="如：医用耗材与器械"
                  className="w-full px-3 py-2 text-xs bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500" required />
              </div>
              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1">出口贸易经验 <span className="text-rose-500">*</span></label>
                <select name="export_experience" value={form.export_experience} onChange={handleChange}
                  className="w-full px-3 py-2 text-xs bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500" required>
                  <option value="">请选择经验年限</option>
                  {EXPORT_EXPERIENCE_OPTIONS.map((opt) => (<option key={opt} value={opt}>{opt}</option>))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-extrabold text-slate-700 mb-2">持有资质证书（可多选）</label>
              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2 bg-slate-50 rounded-lg border border-slate-200">
                {certifications.map((cert) => {
                  const isSelected = form.certification.includes(cert.name);
                  return (
                    <button type="button" key={cert.id}
                      onClick={() => toggleCertification(cert.name)}
                      className={`text-[11px] px-2.5 py-1 rounded-md border transition-colors cursor-pointer ${
                        isSelected
                          ? "bg-teal-100 text-teal-800 border-teal-300 font-semibold"
                          : "bg-white text-slate-600 border-slate-200 hover:border-teal-300"
                      }`}>
                      {cert.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-extrabold text-slate-700 mb-1">其他资质证书</label>
              <input type="text" name="other_certification" value={form.other_certification} onChange={handleChange}
                placeholder="如：BSCI-A level, SLCP, GRS, TCCC"
                className="w-full px-3 py-2 text-xs bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1">参会人姓名 <span className="text-rose-500">*</span></label>
                <input type="text" name="contact_name" value={form.contact_name} onChange={handleChange}
                  placeholder="如：高百红"
                  className="w-full px-3 py-2 text-xs bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500" required />
              </div>
              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1">职务/岗位</label>
                <input type="text" name="position" value={form.position} onChange={handleChange}
                  placeholder="如：总经理"
                  className="w-full px-3 py-2 text-xs bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1">手机号码 <span className="text-rose-500">*</span></label>
                <input type="text" name="telephone" value={form.telephone} onChange={handleChange}
                  placeholder="如：13515727150"
                  className="w-full px-3 py-2 text-xs bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500" required />
              </div>
              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1">电子邮箱</label>
                <input type="email" name="email" value={form.email} onChange={handleChange}
                  placeholder="如：James@liderson.com"
                  className="w-full px-3 py-2 text-xs bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-extrabold text-slate-700 mb-1">其他需说明事项</label>
              <textarea name="remark" value={form.remark} onChange={handleChange} rows={2}
                placeholder="如：多人参会请备注姓名+职务+手机"
                className="w-full px-3 py-2 text-xs bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500" />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button type="button" onClick={onClose}
                className="px-4 py-2 border border-slate-200 text-slate-500 rounded-lg text-xs hover:bg-slate-50 cursor-pointer">
                取消
              </button>
              <button type="submit" disabled={loading}
                className={`px-5 py-2 rounded-lg text-xs font-bold text-white flex items-center gap-2 cursor-pointer ${
                  loading ? "bg-slate-400" : "bg-slate-900 hover:bg-teal-600"
                }`}>
                <Send className="w-3.5 h-3.5" />
                {loading ? "提交中..." : "提交报名"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
