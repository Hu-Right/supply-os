/**
 * Hero 区 — 100% 还原设计图
 * Hero Section — 100% Design Mockup
 *
 * @module features/home/components/HeroSection
 * @description 深蓝科技风 Hero，双搜索入口在同一面板内，中间"或"字分隔。
 *              背景与导航栏连为一体，地球装饰在右侧。
 */
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/core/i18n";
import { api } from "@/core/http";
import { getCountryDisplayName } from "@/shared/data/countryNames";
import { Search, Building2 } from "lucide-react";

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

  useEffect(() => {
    api<HotTags>("/api/notices/hot-topics")
      .then(setHotTags)
      .catch(() => {});
  }, []);

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
    <section className="relative bg-[#0c1929] py-12 px-4 overflow-hidden">
      {/* 地球装饰背景图 */}
      <img
        src="/earth.png?v=2"
        alt=""
        aria-hidden
        className="pointer-events-none absolute -right-[5%] top-1/2 -translate-y-1/2 h-[160%] w-auto object-contain opacity-30 hidden lg:block"
        style={{
          maskImage: "linear-gradient(to right, transparent 0%, rgba(0,0,0,0.2) 15%, black 40%)",
          WebkitMaskImage: "linear-gradient(to right, transparent 0%, rgba(0,0,0,0.2) 15%, black 40%)",
        }}
      />

      <div className="relative max-w-7xl mx-auto">
        {/* 标题区 */}
        <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-2">
          全球公共采购与跨境供应链机会平台
        </h1>
        <p className="text-slate-400 text-sm mb-8 max-w-2xl">
          第一屏必须同时回答：这里有多少订单、多少供应商，我能立刻做什么。
        </p>

        {/* 双搜索入口 — 同一面板 */}
        <div className="bg-[#162236] rounded-xl border border-[#1e3a5f] p-6 max-w-5xl">
          <div className="flex flex-col lg:flex-row items-stretch gap-6 lg:gap-10">
            {/* 左侧：采购机会搜索 */}
            <div className="flex-1">
              <div className="mb-3">
                <span className="text-white font-bold text-sm">搜索采购机会</span>
                <span className="text-slate-500 text-xs ml-1">（招标 / 采购 / 项目）</span>
              </div>
              <div className="flex mb-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={procurementQuery}
                    onChange={(e) => setProcurementQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleProcurementSearch()}
                    placeholder="搜索采购主题 / 产品关键词 / UNSPSC / 地区 / 采购机构"
                    className="w-full bg-white border border-r-0 border-slate-200 rounded-l-lg pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                </div>
                <button
                  onClick={handleProcurementSearch}
                  className="bg-teal-600 hover:bg-teal-700 text-white px-5 py-2.5 rounded-r-lg text-sm font-bold transition-colors whitespace-nowrap border border-teal-600"
                >
                  搜索商机
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-slate-500 text-xs">热门搜索：</span>
                {dynamicProcurementTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => {
                      setProcurementQuery(tag);
                      router.push(`/procurement?q=${encodeURIComponent(tag)}`);
                    }}
                    className="text-xs text-teal-400 hover:text-teal-300 transition-colors"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            {/* 右侧：供应商搜索 */}
            <div className="flex-1">
              <div className="mb-3">
                <span className="text-white font-bold text-sm">查找供应商与产品</span>
              </div>
              <div className="flex mb-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={supplierQuery}
                    onChange={(e) => setSupplierQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSupplierSearch()}
                    placeholder="搜索产品 / 公司名称 / 资质 / 国家 / 认证"
                    className="w-full bg-white border border-r-0 border-slate-200 rounded-l-lg pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                </div>
                <button
                  onClick={handleSupplierSearch}
                  className="bg-teal-600 hover:bg-teal-700 text-white px-5 py-2.5 rounded-r-lg text-sm font-bold transition-colors whitespace-nowrap border border-teal-600"
                >
                  找供应商
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-slate-500 text-xs">热门产品：</span>
                {hotSupplierTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => {
                      setSupplierQuery(tag);
                      router.push(`/supplier?q=${encodeURIComponent(tag)}`);
                    }}
                    className="text-xs text-teal-400 hover:text-teal-300 transition-colors"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
