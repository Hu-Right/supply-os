"use client";

/**
 * 新首页 — 客户端骨架
 * New Homepage — Client Skeleton
 *
 * @description 按设计图模块01的骨架结构搭建，各区块后续填充真实数据与交互。
 *              Skeleton structure based on design module 01; sections to be filled with real data.
 *
 * 页面结构 / Page structure:
 *   1. Hero 区 — 双搜索入口（找采购机会 / 找供应商）
 *   2. 实时数字墙 — 6 个规模指标
 *   3. 三栏内容 — 今日热门商机 / 优质供应商 / 采购方 RFQ
 *   4. 会员升级横幅
 *   5. 产品路径 — 从找标到中标 4 步
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/core/i18n";
import { Search, Building2, Globe, Users, Crown, TrendingUp } from "lucide-react";

/** Hero 区 — 双搜索入口 + 热门标签 */
function HeroSection() {
  const { t } = useLocale();
  const router = useRouter();
  const [procurementQuery, setProcurementQuery] = useState("");
  const [supplierQuery, setSupplierQuery] = useState("");

  const hotProcurementTags = ["医疗设备", "新能源", "工程机械", "建材", "电力设备", "UN/世行", "非洲", "东南亚"];
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
              {hotProcurementTags.map((tag) => (
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

/** 实时数字墙（占位 — 后续接真实 API） */
function StatsWall() {
  const stats = [
    { label: "采购机会总量", value: "100,587+", sub: "实时更新", icon: Globe },
    { label: "每日新增机会", value: "2,000+", sub: "今日新增", icon: TrendingUp },
    { label: "数据源 / API", value: "20+", sub: "政府 & 国际组织", icon: Search },
    { label: "供应商资源", value: "[实时数]", sub: "实时更新", icon: Users },
    { label: "认证供应商", value: "[实时数]", sub: "企业资质已核验", icon: Building2 },
    { label: "海外展厅 / 履约节点", value: "16+", sub: "全球布局", icon: Building2 },
  ];

  return (
    <section className="bg-white border-b border-slate-200 py-8 px-4">
      <div className="px-4 sm:px-6 lg:px-8 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {stats.map((s, i) => (
          <div key={i} className="text-center">
            <p className="text-2xl md:text-3xl font-extrabold text-slate-900">{s.value}</p>
            <p className="text-xs font-bold text-teal-600 mt-1">{s.label}</p>
            <p className="text-2xs text-slate-400 mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/** 三栏内容区（占位） */
function ContentColumns() {
  const { t } = useLocale();

  const columns = [
    { title: "今日热门商机", icon: Globe, path: "/procurement" },
    { title: "优质供应商推荐", icon: Users, path: "/supplier" },
    { title: "采购方 RFQ 需求", icon: Building2, path: "/rfq" },
  ];

  return (
    <section className="px-4 sm:px-6 lg:px-8 py-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {columns.map((col, i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
                <col.icon className="w-5 h-5 text-teal-600" />
                {col.title}
              </h3>
              <a href={col.path} className="text-xs text-teal-600 font-bold hover:underline">
                更多 →
              </a>
            </div>
            <div className="space-y-3">
              {[1, 2, 3].map((j) => (
                <div key={j} className="h-16 bg-slate-100 rounded-lg animate-pulse" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** 会员升级横幅（占位） */
function UpgradeBanner() {
  return (
    <section className="px-4 sm:px-6 lg:px-8 py-6">
      <div className="bg-gradient-to-r from-amber-50 to-teal-50 rounded-2xl border border-amber-200 p-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Crown className="w-10 h-10 text-amber-500" />
          <div>
            <h3 className="text-lg font-extrabold text-slate-900">升级会员，解锁更多商机与供应商资源</h3>
            <p className="text-sm text-slate-600">更早发现 · 更全数据 · 更高转化</p>
          </div>
        </div>
        <a
          href="/membership"
          className="bg-amber-500 hover:bg-amber-600 text-white px-6 py-3 rounded-xl font-bold text-sm transition-colors whitespace-nowrap"
        >
          立即升级会员
        </a>
      </div>
    </section>
  );
}

/** 产品路径 — 从找标到中标 4 步（占位） */
function ProductPath() {
  const steps = [
    { num: 1, title: "找机会", desc: "全球采购机会库" },
    { num: 2, title: "AI 评估", desc: "智能适配评分" },
    { num: 3, title: "投标服务", desc: "标书/代投/顾问" },
    { num: 4, title: "履约", desc: "海外展厅/物流" },
  ];

  return (
    <section className="px-4 sm:px-6 lg:px-8 py-8">
      <h3 className="text-center text-lg font-extrabold text-slate-800 mb-6">
        从找标到中标 — 4 步产品路径
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {steps.map((s) => (
          <div key={s.num} className="bg-white rounded-xl border border-slate-200 p-5 text-center shadow-xs">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-teal-100 text-teal-700 font-extrabold text-lg mb-3">
              {s.num}
            </div>
            <h4 className="text-sm font-bold text-slate-800">{s.title}</h4>
            <p className="text-xs text-slate-500 mt-1">{s.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function PageClient() {
  return (
    <div className="min-h-screen bg-slate-50">
      <HeroSection />
      <StatsWall />
      <ContentColumns />
      <UpgradeBanner />
      <ProductPath />
    </div>
  );
}
