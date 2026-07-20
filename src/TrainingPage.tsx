import React, { useEffect, useState } from "react";
import { CheckCircle2, GraduationCap, Send } from "lucide-react";

type DictionaryItem = {
  id: number;
  code?: string;
  title_zh?: string;
  title_en?: string;
  name?: string;
};

const EXPORT_EXPERIENCE_OPTIONS = ["3年以内", "3-5年", "5-10年", "10年以上"];

export default function TrainingPage() {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [certifications, setCertifications] = useState<DictionaryItem[]>([]);
  const [level1Industries, setLevel1Industries] = useState<DictionaryItem[]>([]);
  const [level2Industries, setLevel2Industries] = useState<DictionaryItem[]>([]);
  const [level3Industries, setLevel3Industries] = useState<DictionaryItem[]>([]);

  const [form, setForm] = useState({
    company_name: "",
    industry_id: "",
    industry_level2_id: "",
    industry_level3_id: "",
    main_product: "",
    export_experience: "",
    certification: [] as string[],
    other_certification: "",
    contact_name: "",
    position: "",
    telephone: "",
    email: "",
    remark: ""
  });

  useEffect(() => {
    fetch("/api/certifications")
      .then((res) => res.json())
      .then((items) => setCertifications(Array.isArray(items) ? items : []))
      .catch(() => setCertifications([]));

    fetch("/api/unspsc/industries")
      .then((res) => res.json())
      .then((items) => setLevel1Industries(Array.isArray(items) ? items : []))
      .catch(() => setLevel1Industries([]));
  }, []);

  useEffect(() => {
    if (!form.industry_id) {
      setLevel2Industries([]);
      setLevel3Industries([]);
      return;
    }
    fetch(`/api/unspsc/children?parent_id=${encodeURIComponent(form.industry_id)}`)
      .then((res) => res.json())
      .then((items) => setLevel2Industries(Array.isArray(items) ? items : []))
      .catch(() => setLevel2Industries([]));
    setForm((prev) => ({ ...prev, industry_level2_id: "", industry_level3_id: "" }));
  }, [form.industry_id]);

  useEffect(() => {
    if (!form.industry_level2_id) {
      setLevel3Industries([]);
      return;
    }
    fetch(`/api/unspsc/children?parent_id=${encodeURIComponent(form.industry_level2_id)}`)
      .then((res) => res.json())
      .then((items) => setLevel3Industries(Array.isArray(items) ? items : []))
      .catch(() => setLevel3Industries([]));
    setForm((prev) => ({ ...prev, industry_level3_id: "" }));
  }, [form.industry_level2_id]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const toggleCertification = (name: string) => {
    setForm((prev) => ({
      ...prev,
      certification: prev.certification.includes(name)
        ? prev.certification.filter((item) => item !== name)
        : [...prev.certification, name]
    }));
  };

  const resetForm = () => {
    setForm({
      company_name: "",
      industry_id: "",
      industry_level2_id: "",
      industry_level3_id: "",
      main_product: "",
      export_experience: "",
      certification: [],
      other_certification: "",
      contact_name: "",
      position: "",
      telephone: "",
      email: "",
      remark: ""
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    if (!form.company_name || !form.industry_id || !form.contact_name || !form.telephone) {
      setError("请填写企业名称、一级行业、参会人姓名和手机号码。");
      return;
    }

    const certification = [form.certification.join(", "), form.other_certification.trim()].filter(Boolean).join("\n");
    const selectedIndustryId = Number(form.industry_level3_id || form.industry_level2_id || form.industry_id);

    setLoading(true);
    try {
      const res = await fetch("/api/training/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: form.company_name,
          industry_id: selectedIndustryId,
          main_product: form.main_product,
          export_experience: form.export_experience,
          certification,
          contact_name: form.contact_name,
          position: form.position,
          telephone: form.telephone,
          email: form.email,
          remark: form.remark
        })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "提交失败");
      }

      setSubmitted(true);
      resetForm();
      setTimeout(() => setSubmitted(false), 4000);
    } catch (err: any) {
      setError(err.message || "网络错误，请稍后重试。");
    } finally {
      setLoading(false);
    }
  };

  const labelOf = (item: DictionaryItem) =>
    `${item.code || ""}${item.code ? " - " : ""}${item.title_zh || item.title_en || item.name || "未命名"}`;

  return (
    <div className="space-y-6">
      <section className="bg-slate-900 text-white rounded-2xl p-6 border border-slate-800">
        <div className="flex items-center gap-3">
          <GraduationCap className="w-7 h-7 text-amber-300" />
          <div>
            <h2 className="text-xl font-extrabold">联合国采购投标实操与能力建设研修班</h2>
            <p className="text-xs text-slate-400 mt-1">填写报名信息后，系统会同步写入供应商报名表并沉淀 UNSPSC 行业画像。</p>
          </div>
        </div>
      </section>

      {submitted && (
        <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-teal-600" />
          <div>
            <p className="text-sm font-bold text-teal-800">报名信息已提交。</p>
            <p className="text-xs text-teal-600">我们将在开班前通过电话或邮件确认参会细节。</p>
          </div>
        </div>
      )}

      {error && <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-sm font-bold text-rose-700">{error}</div>}

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 p-5 md:p-6 shadow-xs space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block">
            <span className="block text-xs font-extrabold text-slate-700 mb-1">企业名称 *</span>
            <input
              name="company_name"
              value={form.company_name}
              onChange={handleChange}
              placeholder="如：浙江某医疗器械有限公司"
              className="w-full px-3 py-2.5 text-sm bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </label>

          <label className="block">
            <span className="block text-xs font-extrabold text-slate-700 mb-1">一级行业（UNSPSC）*</span>
            <select
              name="industry_id"
              value={form.industry_id}
              onChange={handleChange}
              className="w-full px-3 py-2.5 text-sm bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
            >
              <option value="">请选择一级行业</option>
              {level1Industries.map((item) => (
                <option key={item.id} value={item.id}>{labelOf(item)}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="block text-xs font-extrabold text-slate-700 mb-1">可选二级行业</span>
            <select
              name="industry_level2_id"
              value={form.industry_level2_id}
              onChange={handleChange}
              disabled={!level2Industries.length}
              className="w-full px-3 py-2.5 text-sm bg-slate-50 rounded-lg border border-slate-200 disabled:opacity-60 focus:outline-none focus:ring-1 focus:ring-teal-500"
            >
              <option value="">可选二级行业</option>
              {level2Industries.map((item) => (
                <option key={item.id} value={item.id}>{labelOf(item)}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="block text-xs font-extrabold text-slate-700 mb-1">可选三级行业</span>
            <select
              name="industry_level3_id"
              value={form.industry_level3_id}
              onChange={handleChange}
              disabled={!level3Industries.length}
              className="w-full px-3 py-2.5 text-sm bg-slate-50 rounded-lg border border-slate-200 disabled:opacity-60 focus:outline-none focus:ring-1 focus:ring-teal-500"
            >
              <option value="">可选三级行业</option>
              {level3Industries.map((item) => (
                <option key={item.id} value={item.id}>{labelOf(item)}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="block text-xs font-extrabold text-slate-700 mb-1">主营产品 *</span>
            <input
              name="main_product"
              value={form.main_product}
              onChange={handleChange}
              placeholder="如：医用耗材与器械"
              className="w-full px-3 py-2.5 text-sm bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </label>

          <label className="block">
            <span className="block text-xs font-extrabold text-slate-700 mb-1">出口贸易经验</span>
            <select
              name="export_experience"
              value={form.export_experience}
              onChange={handleChange}
              className="w-full px-3 py-2.5 text-sm bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
            >
              <option value="">请选择经验年限</option>
              {EXPORT_EXPERIENCE_OPTIONS.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
        </div>

        <section>
          <p className="text-xs font-extrabold text-slate-700 mb-2">持有资质证书（可多选）</p>
          <div className="border border-slate-200 rounded-xl p-3 flex flex-wrap gap-2 bg-slate-50">
            {certifications.map((item) => {
              const name = item.name || item.title_zh || item.title_en || String(item.id);
              const active = form.certification.includes(name);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggleCertification(name)}
                  className={`px-2.5 py-1 rounded-md border text-xs ${active ? "bg-teal-600 border-teal-600 text-white" : "bg-white border-slate-200 text-slate-600"}`}
                >
                  {name}
                </button>
              );
            })}
          </div>
          <input
            name="other_certification"
            value={form.other_certification}
            onChange={handleChange}
            placeholder="其他资质证书，如 BSCI-A level、SLCP、GRS、TCCC"
            className="mt-3 w-full px-3 py-2.5 text-sm bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        </section>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block">
            <span className="block text-xs font-extrabold text-slate-700 mb-1">参会人姓名 *</span>
            <input name="contact_name" value={form.contact_name} onChange={handleChange} className="w-full px-3 py-2.5 text-sm bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500" />
          </label>
          <label className="block">
            <span className="block text-xs font-extrabold text-slate-700 mb-1">职务 / 岗位</span>
            <input name="position" value={form.position} onChange={handleChange} className="w-full px-3 py-2.5 text-sm bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500" />
          </label>
          <label className="block">
            <span className="block text-xs font-extrabold text-slate-700 mb-1">手机号码 *</span>
            <input name="telephone" value={form.telephone} onChange={handleChange} className="w-full px-3 py-2.5 text-sm bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500" />
          </label>
          <label className="block">
            <span className="block text-xs font-extrabold text-slate-700 mb-1">邮箱</span>
            <input name="email" value={form.email} onChange={handleChange} className="w-full px-3 py-2.5 text-sm bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500" />
          </label>
        </div>

        <label className="block">
          <span className="block text-xs font-extrabold text-slate-700 mb-1">备注</span>
          <textarea
            name="remark"
            value={form.remark}
            onChange={handleChange}
            rows={3}
            placeholder="可填写参训诉求、目标采购市场、已关注的 国际公共采购 机构等"
            className="w-full px-3 py-2.5 text-sm bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        </label>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-orange-600 text-white text-sm font-black hover:bg-orange-700 disabled:opacity-60"
          >
            <Send className="w-4 h-4" />
            {loading ? "提交中..." : "提交研修班报名"}
          </button>
        </div>
      </form>
    </div>
  );
}
