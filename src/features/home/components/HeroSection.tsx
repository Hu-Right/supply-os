/**
 * Hero 区 — 双搜索入口 + 热门标签
 * Hero Section — Dual Search Entry + Hot Tags
 *
 * @module features/home/components/HeroSection
 * @description 深蓝科技风 Hero，左侧采购机会搜索、右侧供应商搜索，
 *              各带热门快捷标签。
 */
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/core/i18n";
import { api } from "@/core/http";
import { getCountryDisplayName } from "@/shared/data/countryNames";
import { Building2, Globe } from "lucide-react";

/** 热门标签数据 */
interface HotTags {
  countries: Array<{ country: string; count: number }>;
  industries: Array<{ id: number; code: string; title_zh: string; title: string; count: number }>;
}

/** Hero 区 — 双搜索入口 + 热门标签 */
export function HeroSection() {
  const router = useRouter();
  const { locale } = useLocale();
  const [procurementQuery, setProcurementQuery] = useState("");
  const [supplierQuery, setSupplierQuery] = useState("");
  const [hotTags, setHotTags] = useState<HotTags | null>(null);

  // 获取热门国家/行业作为动态标签（与 HotTopicsSection 共用同一 API）
  useEffect(() => {
    api<HotTags>("/api/notices/hot-topics")
      .then(setHotTags)
      .catch(() => {});
  }, []);

  // 动态标签：优先取热门国家前 4 + 热门行业前 4，API 未返回时降级为静态
  const fallbackCountries = ["肯尼亚", "美国", "联合国", "菲律宾"];
  const dynamicProcurementTags = hotTags
    ? [
        ...hotTags.countries.slice(0, 4).map((c) => getCountryDisplayName(c.country, locale)),
        ...hotTags.industries.slice(0, 4).map((i) => locale === "zh" ? i.title_zh || i.title : i.title),
      ]
    : fallbackCountries;

  const hotSupplierTags = ["光伏组件", "氧化铝", "发电机组", "医疗耗材", "道路机械", "钢材"];

  const handleProcurementSearch = () => {
    if (procurementQuery.trim()) {
      router.push(`/procurement?q=${encodeURIComponent(procurementQuery.trim())}`);
    } else {
      router.push("/procurement");
    }
  };

  const handleSupplierSearch = () => {
    if (supplierQuery.trim()) {
      router.push(`/supplier?q=${encodeURIComponent(supplierQuery.trim())}`);
    } else {
      router.push("/supplier");
    }
  };

  return (
    <section className="relative bg-gradient-to-br from-slate-900 via-slate-800 to-teal-900 py-16 px-4 overflow-hidden">
      {/* 地球纹理背景占位 */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute right-0 top-0 w-1/2 h-full bg-gradient-to-l from-teal-500/20 to-transparent" />
      </div>

      <div className="relative px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-3">
          全球公共采购与跨境供应链机会平台
        </h1>
        <p className="text-slate-300 text-base mb-8 max-w-2xl">
          聚合全球公共与大型机构采购机会，数据实时更新，助您抢占先机。
        </p>

        {/* 双搜索入口 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-5xl">
          {/* 采购机会搜索 */}
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-5 border border-white/20">
            <div className="flex items-center gap-2 mb-3">
              <Globe className="w-5 h-5 text-teal-400" />
              <span className="text-white font-bold text-sm">搜索采购机会</span>
              <span className="text-slate-400 text-xs">(招标 / 采购 / 项目)</span>
            </div>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={procurementQuery}
                onChange={(e) => setProcurementQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleProcurementSearch()}
                placeholder="搜索采购主题 / 产品关键词 / UNSPSC / 地区 / 采购机构"
                className="flex-1 bg-white/10 border border-white/20 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <button
                onClick={handleProcurementSearch}
                className="bg-teal-600 hover:bg-teal-700 text-white px-5 py-2.5 rounded-lg text-sm font-bold transition-colors whitespace-nowrap"
              >
                搜索商机
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <span className="text-slate-400 text-xs">热门搜索：</span>
              {dynamicProcurementTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => {
                    setProcurementQuery(tag);
                    router.push(`/procurement?q=${encodeURIComponent(tag)}`);
                  }}
                  className="text-xs text-teal-300 hover:text-teal-200 hover:underline transition-colors"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* 供应商搜索 */}
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-5 border border-white/20">
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="w-5 h-5 text-teal-400" />
              <span className="text-white font-bold text-sm">查找供应商与产品</span>
            </div>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={supplierQuery}
                onChange={(e) => setSupplierQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSupplierSearch()}
                placeholder="搜索产品 / 公司名称 / 资质 / 国家 / 认证"
                className="flex-1 bg-white/10 border border-white/20 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <button
                onClick={handleSupplierSearch}
                className="bg-teal-600 hover:bg-teal-700 text-white px-5 py-2.5 rounded-lg text-sm font-bold transition-colors whitespace-nowrap"
              >
                找供应商
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <span className="text-slate-400 text-xs">热门产品：</span>
              {hotSupplierTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => {
                    setSupplierQuery(tag);
                    router.push(`/supplier?q=${encodeURIComponent(tag)}`);
                  }}
                  className="text-xs text-teal-300 hover:text-teal-200 hover:underline transition-colors"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
